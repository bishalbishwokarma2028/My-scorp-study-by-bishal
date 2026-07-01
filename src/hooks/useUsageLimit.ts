import { useCallback, useEffect, useState } from "react";
import { getUsageServer, bumpUsageServer } from "@/lib/usageLimit.functions";
import { DAILY_CREDIT_LIMIT } from "@/lib/usageLimit.config";

export type QuotaState = {
  used: number;
  limit: number;
  remaining: number;
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function localKey(userId: string): string {
  return `scorp_quota_${userId}_global`;
}

function readLocal(userId: string): QuotaState {
  try {
    const raw = localStorage.getItem(localKey(userId));
    if (!raw) return { used: 0, limit: DAILY_CREDIT_LIMIT, remaining: DAILY_CREDIT_LIMIT };
    const parsed = JSON.parse(raw) as { date: string; used: number };
    if (parsed.date !== todayKey()) return { used: 0, limit: DAILY_CREDIT_LIMIT, remaining: DAILY_CREDIT_LIMIT };
    const used = parsed.used ?? 0;
    return { used, limit: DAILY_CREDIT_LIMIT, remaining: Math.max(0, DAILY_CREDIT_LIMIT - used) };
  } catch {
    return { used: 0, limit: DAILY_CREDIT_LIMIT, remaining: DAILY_CREDIT_LIMIT };
  }
}

function writeLocal(userId: string, used: number): QuotaState {
  try {
    localStorage.setItem(localKey(userId), JSON.stringify({ date: todayKey(), used }));
  } catch { /* storage full */ }
  return { used, limit: DAILY_CREDIT_LIMIT, remaining: Math.max(0, DAILY_CREDIT_LIMIT - used) };
}

/**
 * Shared daily credit pool — all features share the same 30-credit balance.
 * The `feature` param is accepted for call-site backward-compat but is ignored.
 */
export function useUsageLimit(userId: string, feature?: string) {
  void feature; // accepted but unused — server uses the global pool
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(true);

  useEffect(() => {
    setQuotaLoading(true);
    const local = readLocal(userId);
    setQuota(local);

    getUsageServer({ data: { userId } })
      .then((serverQuota) => {
        const used = Math.max(serverQuota.used, local.used);
        const synced: QuotaState = {
          used,
          limit: serverQuota.limit,
          remaining: Math.max(0, serverQuota.limit - used),
        };
        setQuota(synced);
        writeLocal(userId, used);
      })
      .catch(() => { /* keep local value on network error */ })
      .finally(() => setQuotaLoading(false));
  }, [userId]);

  const bump = useCallback(async (): Promise<{ allowed: boolean }> => {
    const current = readLocal(userId);
    if (current.remaining <= 0) return { allowed: false };

    const optimistic = writeLocal(userId, current.used + 1);
    setQuota(optimistic);

    try {
      const result = await bumpUsageServer({ data: { userId } });
      const synced: QuotaState = {
        used: result.used,
        limit: result.limit,
        remaining: result.remaining,
      };
      setQuota(synced);
      writeLocal(userId, result.used);
      return { allowed: result.allowed };
    } catch {
      return { allowed: true };
    }
  }, [userId]);

  return { quota, quotaLoading, bump };
}
