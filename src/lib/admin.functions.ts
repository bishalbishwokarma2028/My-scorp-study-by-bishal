import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin, getAdminClient } from "./adminAuth.functions";
import { serverConfig } from "./config";
import { CEREBRAS_DAILY_LIMIT, GROQ_DAILY_LIMIT } from "./usageLimit.config";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Overview stats for the admin dashboard home. */
export const adminOverviewServer = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const admin = getAdminClient();
  const today = todayUTC();

  const [{ count: totalUsers }, { count: bannedUsers }, { count: unlimitedUsers }, { data: poolLimits }, { data: usageRows }] =
    await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("profiles").select("id", { count: "exact", head: true }).eq("is_banned", true),
      admin.from("profiles").select("id", { count: "exact", head: true }).eq("unlimited_credits", true),
      admin.from("pool_limits").select("pool, daily_limit"),
      admin.from("feature_usage").select("feature, count").eq("usage_date", today),
    ]);

  const usageToday: Record<string, number> = { cerebras: 0, groq: 0 };
  for (const row of (usageRows ?? []) as { feature: string; count: number }[]) {
    if (row.feature === "cerebras" || row.feature === "groq") {
      usageToday[row.feature] += row.count;
    }
  }

  return {
    totalUsers: totalUsers ?? 0,
    bannedUsers: bannedUsers ?? 0,
    unlimitedUsers: unlimitedUsers ?? 0,
    poolLimits: (poolLimits ?? []) as { pool: string; daily_limit: number }[],
    usageToday,
  };
});

/** Read the current per-pool daily credit limits. */
export const adminGetPoolLimitsServer = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const admin = getAdminClient();
  const { data, error } = await admin.from("pool_limits").select("pool, daily_limit, updated_at");
  if (error) throw new Error(error.message);

  // Guarantee both pools are always present, even if a row is missing.
  const byPool = new Map((data ?? []).map((r) => [r.pool, r]));
  return [
    byPool.get("cerebras") ?? { pool: "cerebras", daily_limit: CEREBRAS_DAILY_LIMIT, updated_at: null },
    byPool.get("groq") ?? { pool: "groq", daily_limit: GROQ_DAILY_LIMIT, updated_at: null },
  ];
});

const SetPoolLimitInput = z.object({
  pool: z.enum(["cerebras", "groq"]),
  dailyLimit: z.number().int().min(0).max(2000),
});

/** Update the daily credit limit for a pool (Deep Engine = cerebras, Rapid Engine = groq). */
export const adminSetPoolLimitServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SetPoolLimitInput.parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const admin = getAdminClient();
    const { error } = await admin
      .from("pool_limits")
      .upsert({ pool: data.pool, daily_limit: data.dailyLimit, updated_at: new Date().toISOString() }, { onConflict: "pool" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ListUsersInput = z.object({
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(200).default(50),
});

/** List users (merges Supabase Auth users with their profile flags). */
export const adminListUsersServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListUsersInput.parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const cfg = serverConfig.supabase;
    const admin = getAdminClient();

    const res = await fetch(`${cfg.url}/auth/v1/admin/users?page=${data.page}&per_page=${data.perPage}`, {
      headers: { apikey: cfg.serviceRoleKey, Authorization: `Bearer ${cfg.serviceRoleKey}` },
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.msg || "Failed to list users");

    const authUsers = (body.users ?? []) as { id: string; email: string; created_at: string; last_sign_in_at: string | null }[];
    const ids = authUsers.map((u) => u.id);

    // The *_limit_override columns are only present once the per-user credit
    // migration has been run; fall back gracefully if they don't exist yet
    // so the Users page keeps working either way.
    let profiles: Record<string, unknown>[] | null = null;
    if (ids.length) {
      const withOverrides = await admin
        .from("profiles")
        .select("id, full_name, is_admin, is_banned, unlimited_credits, cerebras_limit_override, groq_limit_override")
        .in("id", ids);
      if (!withOverrides.error) {
        profiles = withOverrides.data;
      } else {
        const fallback = await admin.from("profiles").select("id, full_name, is_admin, is_banned, unlimited_credits").in("id", ids);
        profiles = fallback.data;
      }
    } else {
      profiles = [];
    }

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    let merged = authUsers.map((u) => {
      const p = profileById.get(u.id) as
        | {
            full_name: string | null;
            is_admin: boolean;
            is_banned: boolean;
            unlimited_credits: boolean;
            cerebras_limit_override: number | null;
            groq_limit_override: number | null;
          }
        | undefined;
      return {
        id: u.id,
        email: u.email,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
        fullName: p?.full_name ?? null,
        isAdmin: p?.is_admin ?? false,
        isBanned: p?.is_banned ?? false,
        unlimitedCredits: p?.unlimited_credits ?? false,
        cerebrasLimitOverride: p?.cerebras_limit_override ?? null,
        groqLimitOverride: p?.groq_limit_override ?? null,
      };
    });

    if (data.search) {
      const q = data.search.toLowerCase();
      merged = merged.filter((u) => u.email?.toLowerCase().includes(q) || u.fullName?.toLowerCase().includes(q));
    }

    return { users: merged, total: body.total ?? merged.length };
  });

const UserFlagInput = z.object({
  userId: z.string().uuid(),
  value: z.boolean(),
});

/** Ban / unban a user (blocks nothing yet unless enforced in the auth guard — flag only). */
export const adminSetBannedServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UserFlagInput.parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const admin = getAdminClient();
    const { error } = await admin.from("profiles").update({ is_banned: data.value }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Grant / revoke unlimited credits for a user. */
export const adminSetUnlimitedServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UserFlagInput.parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const admin = getAdminClient();
    const { error } = await admin.from("profiles").update({ unlimited_credits: data.value }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SetUserLimitInput = z.object({
  userId: z.string().uuid(),
  pool: z.enum(["cerebras", "groq"]),
  /** null clears the override and falls back to the global pool limit. */
  dailyLimit: z.number().int().min(0).max(2000).nullable(),
});

/** Set (or clear) a per-user custom daily credit limit for one pool. */
export const adminSetUserLimitServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SetUserLimitInput.parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const admin = getAdminClient();
    const column = data.pool === "cerebras" ? "cerebras_limit_override" : "groq_limit_override";
    const { error } = await admin.from("profiles").update({ [column]: data.dailyLimit }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Usage stats for the last 14 days, aggregated per pool per day. */
export const adminUsageStatsServer = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const admin = getAdminClient();

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 13);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("feature_usage")
    .select("feature, usage_date, count")
    .gte("usage_date", sinceStr)
    .order("usage_date", { ascending: true });
  if (error) throw new Error(error.message);

  const byDay = new Map<string, { date: string; cerebras: number; groq: number; other: number }>();
  for (const row of (data ?? []) as { feature: string; usage_date: string; count: number }[]) {
    if (!byDay.has(row.usage_date)) {
      byDay.set(row.usage_date, { date: row.usage_date, cerebras: 0, groq: 0, other: 0 });
    }
    const entry = byDay.get(row.usage_date)!;
    if (row.feature === "cerebras") entry.cerebras += row.count;
    else if (row.feature === "groq") entry.groq += row.count;
    else entry.other += row.count;
  }

  return Array.from(byDay.values());
});

/** Most recent raw API call log rows (populates once/if request logging is wired in). */
export const adminApiCallLogServer = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("api_call_log")
    .select("id, user_id, user_email, pool, feature, provider, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return data ?? [];
});

/** Top users by total requests over the last 14 days, split by pool. Used for the Usage Analytics leaderboard. */
export const adminTopUsersServer = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const admin = getAdminClient();

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 13);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await admin.from("feature_usage").select("user_id, feature, count").gte("usage_date", sinceStr);
  if (error) throw new Error(error.message);

  const byUser = new Map<string, { userId: string; cerebras: number; groq: number; total: number }>();
  for (const row of (data ?? []) as { user_id: string; feature: string; count: number }[]) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, { userId: row.user_id, cerebras: 0, groq: 0, total: 0 });
    const entry = byUser.get(row.user_id)!;
    if (row.feature === "cerebras") entry.cerebras += row.count;
    else if (row.feature === "groq") entry.groq += row.count;
  }
  for (const entry of byUser.values()) {
    entry.total = entry.cerebras + entry.groq;
  }

  const top = Array.from(byUser.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  if (top.length === 0) return [];

  const { data: profiles } = await admin.from("profiles").select("id, full_name").in(
    "id",
    top.map((t) => t.userId),
  );
  const nameById = new Map((profiles ?? []).map((p) => [(p as { id: string }).id, (p as { full_name: string | null }).full_name]));

  return top.map((t) => ({ ...t, fullName: nameById.get(t.userId) ?? null }));
});
