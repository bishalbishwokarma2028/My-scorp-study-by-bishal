import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { serverConfig } from "./config";
import { FEATURE_LIMITS } from "./usageLimit.config";

const FEATURE_KEYS = Object.keys(FEATURE_LIMITS) as [
  "chat", "summarizer", "quiz", "flashcards", "notes", "translator", "formula"
];

const Input = z.object({
  userId: z.string().uuid(),
  feature: z.enum(FEATURE_KEYS),
});

function getAdminClient() {
  const cfg = serverConfig.supabase;
  return createClient(cfg.url, cfg.serviceRoleKey);
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Read the current usage for a feature without modifying it */
export const getUsageServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const limit = FEATURE_LIMITS[data.feature];
    const today = todayUTC();

    const { data: row } = await getAdminClient()
      .from("daily_usage")
      .select("count")
      .eq("user_id", data.userId)
      .eq("feature", data.feature)
      .eq("usage_date", today)
      .maybeSingle();

    const used = (row as { count: number } | null)?.count ?? 0;
    return { used, limit, remaining: Math.max(0, limit - used) };
  });

/**
 * Atomically increment usage for a feature via a Postgres RPC that does a
 * single conditional UPDATE (count + 1 WHERE count < limit), avoiding the
 * read-then-write race condition of separate SELECT + UPSERT calls.
 *
 * Returns { allowed: true } when the increment succeeded (user was under limit).
 * Returns { allowed: false } when the user was already at the limit — no DB change is made.
 */
export const bumpUsageServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const limit = FEATURE_LIMITS[data.feature];

    const { data: result, error } = await getAdminClient().rpc(
      "increment_daily_usage",
      { p_user_id: data.userId, p_feature: data.feature, p_limit: limit },
    );

    if (error) throw new Error(`Quota RPC error: ${error.message}`);

    const r = result as { allowed: boolean; used: number; limit: number; remaining: number };
    return { allowed: r.allowed, used: r.used, limit: r.limit, remaining: r.remaining };
  });
