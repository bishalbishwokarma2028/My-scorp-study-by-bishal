import { useCallback, useEffect, useState } from "react";
import { getUsageServer, bumpUsageServer } from "@/lib/usageLimit.functions";
import type { FeatureKey } from "@/lib/usageLimit.config";

export type QuotaState = {
  used: number;
  limit: number;
  remaining: number;
};

/**
 * Fetches the current server-side daily quota for `feature` and provides
 * a `bump()` function that atomically increments the count after a
 * successful AI response.
 *
 * The backend is always the single source of truth — no localStorage used.
 */
export function useUsageLimit(userId: string, feature: FeatureKey) {
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(true);

  useEffect(() => {
    setQuotaLoading(true);
    getUsageServer({ data: { userId, feature } })
      .then(setQuota)
      .catch(() => { /* silently degrade — app still works */ })
      .finally(() => setQuotaLoading(false));
  }, [userId, feature]);

  /**
   * Call this after a successful AI response.
   * Returns { allowed: false } if the user was already at their daily limit
   * (edge case: concurrent requests from multiple tabs).
   */
  const bump = useCallback(async (): Promise<{ allowed: boolean }> => {
    try {
      const result = await bumpUsageServer({ data: { userId, feature } });
      setQuota({ used: result.used, limit: result.limit, remaining: result.remaining });
      return { allowed: result.allowed };
    } catch {
      return { allowed: true }; // fail open so a network error doesn't block the UI
    }
  }, [userId, feature]);

  return { quota, quotaLoading, bump };
}
