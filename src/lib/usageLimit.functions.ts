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

/**
 * Resolves the effective daily limit for a pool: prefers the admin-configurable
 * value in `pool_limits`, falling back to the hardcoded default if no row exists
 * (e.g. before the table is seeded). This is what makes the admin panel's
 * credit-limit editor actually take effect for every feature.
 */
async function resolveLimit(admin: ReturnType<typeof getAdminClient>, pool: "cerebras" | "groq"): Promise<number> {
  const { data } = await admin.from("pool_limits").select("daily_limit").eq("pool", pool).maybeSingle();
  const dynamic = (data as { daily_limit: number } | null)?.daily_limit;
  return typeof dynamic === "number" ? dynamic : limitForPool(pool);
}

export const getUsageServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const pool = data.pool ?? GROQ_POOL_KEY;
    const admin = getAdminClient();
    const limit = await resolveLimit(admin, pool);
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
    const limit = await resolveLimit(admin, pool);
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

    return {
      allowed: true,
      used: newCount,
      limit,
      remaining: Math.max(0, limit - newCount),
    };
  });
