import { useCallback, useEffect, useState } from "react";
import { getUsageServer, bumpUsageServer } from "@/lib/usageLimit.functions";
import type { FeatureKey } from "@/lib/usageLimit.config";
import { FEATURE_LIMITS } from "@/lib/usageLimit.config";

export type QuotaState = {
  used: number;
  limit: number;
  remaining: number;
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function localKey(userId: string, feature: FeatureKey): string {
  return `scorp_quota_${userId}_${feature}`;
}

function readLocal(userId: string, feature: FeatureKey): QuotaState {
  const limit = FEATURE_LIMITS[feature];
  try {
    const raw = localStorage.getItem(localKey(userId, feature));
    if (!raw) return { used: 0, limit, remaining: limit };
    const parsed = JSON.parse(raw) as { date: string; used: number };
    if (parsed.date !== todayKey()) return { used: 0, limit, remaining: limit };
    const used = parsed.used ?? 0;
    return { used, limit, remaining: Math.max(0, limit - used) };
  } catch {
    return { used: 0, limit, remaining: limit };
  }
}

function writeLocal(userId: string, feature: FeatureKey, used: number): QuotaState {
  const limit = FEATURE_LIMITS[feature];
  try {
    localStorage.setItem(localKey(userId, feature), JSON.stringify({ date: todayKey(), used }));
  } catch { /* storage full */ }
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export function useUsageLimit(userId: string, feature: FeatureKey) {
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(true);

  useEffect(() => {
    setQuotaLoading(true);
    // Show local value instantly, then sync with server
    const local = readLocal(userId, feature);
    setQuota(local);

    getUsageServer({ data: { userId, feature } })
      .then((serverQuota) => {
        // Use whichever count is higher (server is source of truth across devices)
        const used = Math.max(serverQuota.used, local.used);
        const synced: QuotaState = {
          used,
          limit: serverQuota.limit,
          remaining: Math.max(0, serverQuota.limit - used),
        };
        setQuota(synced);
        writeLocal(userId, feature, used);
      })
      .catch(() => { /* keep local value on network error */ })
      .finally(() => setQuotaLoading(false));
  }, [userId, feature]);

  const bump = useCallback(async (): Promise<{ allowed: boolean }> => {
    const current = readLocal(userId, feature);
    if (current.remaining <= 0) return { allowed: false };

    // Optimistic local update first (instant UI feedback)
    const optimistic = writeLocal(userId, feature, current.used + 1);
    setQuota(optimistic);

    // Then sync with server
    try {
      const result = await bumpUsageServer({ data: { userId, feature } });
      const synced: QuotaState = {
        used: result.used,
        limit: result.limit,
        remaining: result.remaining,
      };
      setQuota(synced);
      writeLocal(userId, feature, result.used);
      return { allowed: result.allowed };
    } catch {
      // Keep optimistic update on server error — feature still worked
      return { allowed: true };
    }
  }, [userId, feature]);

  return { quota, quotaLoading, bump };
}
