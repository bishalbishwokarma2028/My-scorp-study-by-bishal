import { useState, useCallback } from "react";

/**
 * Module-level in-memory cache.
 * Survives route changes within the same session; resets on full page refresh.
 */
const _cache: Record<string, Record<string, unknown>> = {};

/**
 * Wipes all in-memory page state. Call on sign-out so the next
 * user that signs in on the same device sees a clean slate.
 */
export function clearAllPageState(): void {
  for (const key of Object.keys(_cache)) {
    delete _cache[key];
  }
}

/**
 * Drop-in replacement for multiple useState calls on a page.
 * Reads initial state from the in-memory cache (populated on previous visit)
 * and writes back on every update — so switching routes and coming back
 * restores the exact state the user left.
 *
 * @param pageKey  unique key per feature, e.g. "compare" or "code-tutor-analyze"
 * @param defaults initial/default state object
 * @returns [state, setState, clearState]
 */
export function usePageState<T extends object>(
  pageKey: string,
  defaults: T,
): [T, (updates: Partial<T>) => void, () => void] {
  const [state, setRaw] = useState<T>(() => {
    const cached = _cache[pageKey];
    return cached ? { ...defaults, ...(cached as Partial<T>) } : { ...defaults };
  });

  const setState = useCallback(
    (updates: Partial<T>) => {
      setRaw((prev) => {
        const next = { ...prev, ...updates };
        _cache[pageKey] = next as Record<string, unknown>;
        return next;
      });
    },
    [pageKey],
  );

  const clearState = useCallback(() => {
    delete _cache[pageKey];
    setRaw({ ...defaults });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  return [state, setState, clearState];
}
