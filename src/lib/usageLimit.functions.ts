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

export const getUsageServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const pool = data.pool ?? GROQ_POOL_KEY;
    const limit = limitForPool(pool);
    const today = todayUTC();

    const { data: row } = await getAdminClient()
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
    const limit = limitForPool(pool);
    const today = todayUTC();
    const admin = getAdminClient();

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
