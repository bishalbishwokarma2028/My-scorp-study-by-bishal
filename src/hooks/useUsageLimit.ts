import { useCallback, useEffect, useState } from "react";
import { getUsageServer, bumpUsageServer } from "@/lib/usageLimit.functions";
import { limitForPool, type PoolKey, GROQ_POOL_KEY } from "@/lib/usageLimit.config";

export type QuotaState = {
  used: number;
  limit: number;
  remaining: number;
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function localKey(userId: string, pool: PoolKey): string {
  return `scorp_quota_${userId}_${pool}`;
}

function readLocal(userId: string, pool: PoolKey): QuotaState {
  const limit = limitForPool(pool);
  try {
    const raw = localStorage.getItem(localKey(userId, pool));
    if (!raw) return { used: 0, limit, remaining: limit };
    const parsed = JSON.parse(raw) as { date: string; used: number };
    if (parsed.date !== todayKey()) return { used: 0, limit, remaining: limit };
    const used = parsed.used ?? 0;
    return { used, limit, remaining: Math.max(0, limit - used) };
  } catch {
    return { used: 0, limit, remaining: limit };
  }
}

function writeLocal(userId: string, pool: PoolKey, used: number): QuotaState {
  const limit = limitForPool(pool);
  try {
    localStorage.setItem(localKey(userId, pool), JSON.stringify({ date: todayKey(), used }));
  } catch { /* storage full */ }
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/**
 * Per-pool daily credit hook.
 * Pass pool = "cerebras" for all Cerebras features (10 credits/day shared),
 * or pool = "groq" for all Groq features (20 credits/day shared).
 */
export function useUsageLimit(userId: string, pool: PoolKey = GROQ_POOL_KEY) {
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(true);

  useEffect(() => {
    setQuotaLoading(true);
    const local = readLocal(userId, pool);
    setQuota(local);

    getUsageServer({ data: { userId, pool } })
      .then((serverQuota) => {
        const used = Math.max(serverQuota.used, local.used);
        const synced: QuotaState = {
          used,
          limit: serverQuota.limit,
          remaining: Math.max(0, serverQuota.limit - used),
        };
        setQuota(synced);
        writeLocal(userId, pool, used);
      })
      .catch(() => { /* keep local value on network error */ })
      .finally(() => setQuotaLoading(false));
  }, [userId, pool]);

  const bump = useCallback(async (): Promise<{ allowed: boolean }> => {
    const current = readLocal(userId, pool);
    if (current.remaining <= 0) return { allowed: false };

    const optimistic = writeLocal(userId, pool, current.used + 1);
    setQuota(optimistic);

    try {
      const result = await bumpUsageServer({ data: { userId, pool } });
      const synced: QuotaState = {
        used: result.used,
        limit: result.limit,
        remaining: result.remaining,
      };
      setQuota(synced);
      writeLocal(userId, pool, result.used);
      return { allowed: result.allowed };
    } catch {
      return { allowed: true };
    }
  }, [userId, pool]);

  return { quota, quotaLoading, bump };
}
