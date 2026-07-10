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

// Local cache only ever stores a fallback hint for `used` between server
// round-trips; the daily `limit` is authoritative on the server (it can be
// changed live from the Admin Panel), so it is always persisted alongside
// `used` and never re-derived from the hardcoded config constant once we've
// heard from the server at least once.
function readLocal(userId: string, pool: PoolKey): QuotaState {
  const fallbackLimit = limitForPool(pool);
  try {
    const raw = localStorage.getItem(localKey(userId, pool));
    if (!raw) return { used: 0, limit: fallbackLimit, remaining: fallbackLimit };
    const parsed = JSON.parse(raw) as { date: string; used: number; limit?: number };
    if (parsed.date !== todayKey()) return { used: 0, limit: fallbackLimit, remaining: fallbackLimit };
    const used = parsed.used ?? 0;
    const limit = typeof parsed.limit === "number" ? parsed.limit : fallbackLimit;
    return { used, limit, remaining: Math.max(0, limit - used) };
  } catch {
    return { used: 0, limit: fallbackLimit, remaining: fallbackLimit };
  }
}

function writeLocal(userId: string, pool: PoolKey, used: number, limit: number): QuotaState {
  try {
    localStorage.setItem(localKey(userId, pool), JSON.stringify({ date: todayKey(), used, limit }));
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
        writeLocal(userId, pool, used, serverQuota.limit);
      })
      .catch(() => { /* keep local value on network error */ })
      .finally(() => setQuotaLoading(false));
  }, [userId, pool]);

  const bump = useCallback(async (): Promise<{ allowed: boolean }> => {
    // Use the freshest known state (already synced with the server/admin
    // limit) for the quick client-side guard, not a re-derivation from the
    // hardcoded fallback constant — otherwise once `used` hits the fallback
    // number the guard blocks all further requests even though the real
    // (admin-configured) limit is higher, freezing the displayed remainder.
    let current = quota ?? readLocal(userId, pool);

    // If we think the user is exhausted, re-check the server once before
    // refusing — an admin may have just raised the pool/user limit, and that
    // change must take effect immediately without requiring a page reload.
    if (current.remaining <= 0) {
      try {
        const fresh = await getUsageServer({ data: { userId, pool } });
        current = { used: fresh.used, limit: fresh.limit, remaining: fresh.remaining };
        setQuota(current);
        writeLocal(userId, pool, current.used, current.limit);
      } catch { /* keep current (still exhausted) on network error */ }
      if (current.remaining <= 0) return { allowed: false };
    }

    const optimistic = writeLocal(userId, pool, current.used + 1, current.limit);
    setQuota(optimistic);

    try {
      const result = await bumpUsageServer({ data: { userId, pool } });
      const synced: QuotaState = {
        used: result.used,
        limit: result.limit,
        remaining: result.remaining,
      };
      setQuota(synced);
      writeLocal(userId, pool, result.used, result.limit);
      return { allowed: result.allowed };
    } catch {
      // Network/server failure: we can't confirm whether the increment
      // landed, so roll back the optimistic bump and fail closed rather than
      // silently granting a free request.
      setQuota(current);
      writeLocal(userId, pool, current.used, current.limit);
      return { allowed: false };
    }
  }, [userId, pool, quota]);

  return { quota, quotaLoading, bump };
}
