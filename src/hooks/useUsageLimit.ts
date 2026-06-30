import { useCallback, useEffect, useState } from "react";
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

function storageKey(userId: string, feature: FeatureKey): string {
  return `scorp_quota_${userId}_${feature}`;
}

function readLocal(userId: string, feature: FeatureKey): QuotaState {
  const limit = FEATURE_LIMITS[feature];
  try {
    const raw = localStorage.getItem(storageKey(userId, feature));
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
    localStorage.setItem(
      storageKey(userId, feature),
      JSON.stringify({ date: todayKey(), used }),
    );
  } catch {
    /* storage full — ignore */
  }
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export function useUsageLimit(userId: string, feature: FeatureKey) {
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(true);

  useEffect(() => {
    setQuota(readLocal(userId, feature));
    setQuotaLoading(false);
  }, [userId, feature]);

  const bump = useCallback(async (): Promise<{ allowed: boolean }> => {
    const current = readLocal(userId, feature);
    if (current.remaining <= 0) return { allowed: false };
    const newUsed = current.used + 1;
    const newQuota = writeLocal(userId, feature, newUsed);
    setQuota(newQuota);
    return { allowed: true };
  }, [userId, feature]);

  return { quota, quotaLoading, bump };
}
