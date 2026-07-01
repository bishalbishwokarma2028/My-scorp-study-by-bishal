import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { serverConfig } from "./config";
import { DAILY_CREDIT_LIMIT, GLOBAL_POOL_KEY } from "./usageLimit.config";

const Input = z.object({
  userId: z.string().uuid(),
  feature: z.string().optional(), // accepted but ignored — all features share one pool
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
    const today = todayUTC();

    const { data: row } = await getAdminClient()
      .from("feature_usage")
      .select("count")
      .eq("user_id", data.userId)
      .eq("feature", GLOBAL_POOL_KEY)
      .eq("usage_date", today)
      .maybeSingle();

    const used = (row as { count: number } | null)?.count ?? 0;
    return {
      used,
      limit: DAILY_CREDIT_LIMIT,
      remaining: Math.max(0, DAILY_CREDIT_LIMIT - used),
    };
  });

export const bumpUsageServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const today = todayUTC();
    const admin = getAdminClient();

    const { data: row } = await admin
      .from("feature_usage")
      .select("count")
      .eq("user_id", data.userId)
      .eq("feature", GLOBAL_POOL_KEY)
      .eq("usage_date", today)
      .maybeSingle();

    const currentCount = (row as { count: number } | null)?.count ?? 0;

    if (currentCount >= DAILY_CREDIT_LIMIT) {
      return {
        allowed: false,
        used: currentCount,
        limit: DAILY_CREDIT_LIMIT,
        remaining: 0,
      };
    }

    const newCount = currentCount + 1;

    await admin.from("feature_usage").upsert(
      {
        user_id: data.userId,
        feature: GLOBAL_POOL_KEY,
        usage_date: today,
        count: newCount,
      },
      { onConflict: "user_id,feature,usage_date" },
    );

    return {
      allowed: true,
      used: newCount,
      limit: DAILY_CREDIT_LIMIT,
      remaining: Math.max(0, DAILY_CREDIT_LIMIT - newCount),
    };
  });
