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

export const getUsageServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const limit = FEATURE_LIMITS[data.feature];
    const today = todayUTC();

    const { data: row } = await getAdminClient()
      .from("feature_usage")
      .select("count")
      .eq("user_id", data.userId)
      .eq("feature", data.feature)
      .eq("usage_date", today)
      .maybeSingle();

    const used = (row as { count: number } | null)?.count ?? 0;
    return { used, limit, remaining: Math.max(0, limit - used) };
  });

export const bumpUsageServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const limit = FEATURE_LIMITS[data.feature];
    const today = todayUTC();
    const admin = getAdminClient();

    const { data: row } = await admin
      .from("feature_usage")
      .select("count")
      .eq("user_id", data.userId)
      .eq("feature", data.feature)
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
        feature: data.feature,
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
