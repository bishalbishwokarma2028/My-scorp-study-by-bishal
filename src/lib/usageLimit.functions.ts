import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { serverConfig } from "./config";
import { limitForPool, GROQ_POOL_KEY } from "./usageLimit.config";

const Input = z.object({
  userId: z.string().uuid(),
  pool: z.enum(["cerebras", "groq"]).optional(), // defaults to "groq"
});

function getAdminClient() {
  const cfg = serverConfig.supabase;
  return createClient(cfg.url, cfg.serviceRoleKey);
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

const UNLIMITED_EFFECTIVE_LIMIT = 999999;

/**
 * Resolves the effective daily limit for a pool for a given user, in priority order:
 * 1. `profiles.unlimited_credits` — effectively unlimited.
 * 2. `profiles.{pool}_limit_override` — an admin-set custom limit for this specific user.
 * 3. `pool_limits.daily_limit` — the global admin-configurable default for the pool.
 * 4. The hardcoded fallback constant (e.g. before either table/column is seeded).
 * This is what makes both the global credit-limit editor and the per-user override
 * in the admin panel actually take effect for every feature.
 */
async function resolveLimit(admin: ReturnType<typeof getAdminClient>, pool: "cerebras" | "groq", userId?: string): Promise<number> {
  if (userId) {
    const overrideColumn = pool === "cerebras" ? "cerebras_limit_override" : "groq_limit_override";

    // Try the full query (including the per-user override column) first; if that
    // column doesn't exist yet (migration not run), fall back to a query that only
    // reads `unlimited_credits` so that existing behavior never regresses.
    const withOverride = await admin
      .from("profiles")
      .select(`unlimited_credits, ${overrideColumn}`)
      .eq("id", userId)
      .maybeSingle();

    type ProfileRow = { unlimited_credits?: boolean } & Record<string, number | null>;
    let profile: ProfileRow | null = null;
    if (!withOverride.error) {
      profile = withOverride.data as unknown as ProfileRow | null;
    } else {
      const fallback = await admin.from("profiles").select("unlimited_credits").eq("id", userId).maybeSingle();
      profile = fallback.data as unknown as ProfileRow | null;
    }

    if (profile) {
      if (profile.unlimited_credits) return UNLIMITED_EFFECTIVE_LIMIT;
      const override = profile[overrideColumn];
      if (typeof override === "number") return override;
    }
  }

  const { data } = await admin.from("pool_limits").select("daily_limit").eq("pool", pool).maybeSingle();
  const dynamic = (data as { daily_limit: number } | null)?.daily_limit;
  return typeof dynamic === "number" ? dynamic : limitForPool(pool);
}

export const getUsageServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const pool = data.pool ?? GROQ_POOL_KEY;
    const admin = getAdminClient();
    const limit = await resolveLimit(admin, pool, data.userId);
    const today = todayUTC();

    const { data: row } = await admin
      .from("feature_usage")
      .select("count")
      .eq("user_id", data.userId)
      .eq("feature", pool)
      .eq("usage_date", today)
      .maybeSingle();

    const used = (row as { count: number } | null)?.count ?? 0;
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
    };
  });

export const bumpUsageServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const pool = data.pool ?? GROQ_POOL_KEY;
    const admin = getAdminClient();
    const limit = await resolveLimit(admin, pool, data.userId);
    const today = todayUTC();

    const { data: row } = await admin
      .from("feature_usage")
      .select("count")
      .eq("user_id", data.userId)
      .eq("feature", pool)
      .eq("usage_date", today)
      .maybeSingle();

    const currentCount = (row as { count: number } | null)?.count ?? 0;

    if (currentCount >= limit) {
      return { allowed: false, used: currentCount, limit, remaining: 0 };
    }

    const newCount = currentCount + 1;

    await admin.from("feature_usage").upsert(
      {
        user_id: data.userId,
        feature: pool,
        usage_date: today,
        count: newCount,
      },
      { onConflict: "user_id,feature,usage_date" },
    );

    // Best-effort request log for the admin panel — never blocks or fails the request.
    admin.from("api_call_log").insert({
      user_id: data.userId,
      pool,
      provider: pool === "cerebras" ? "Deep Engine" : "Rapid Engine",
    }).then(() => {}, () => {});

    return {
      allowed: true,
      used: newCount,
      limit,
      remaining: Math.max(0, limit - newCount),
    };
  });
