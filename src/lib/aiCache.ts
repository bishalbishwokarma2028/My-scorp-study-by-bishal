const CACHE_MAX_SIZE = 200;
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const MIN_PROMPT_LENGTH = 15;
const MAX_PROMPT_LENGTH = 500;

type CacheEntry = {
  answer: string;
  provider: string;
  ts: number;
  hits: number;
};

const cache = new Map<string, CacheEntry>();

function normalise(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCacheable(prompt: string): boolean {
  const len = prompt.trim().length;
  if (len < MIN_PROMPT_LENGTH || len > MAX_PROMPT_LENGTH) return false;
  const lower = prompt.toLowerCase();
  const nonCacheablePatterns = [
    /translate.*to/i,
    /what (is|are) (today|the date|the time|current)/i,
    /latest news/i,
    /right now/i,
    /generate (an? )?image/i,
  ];
  if (nonCacheablePatterns.some((p) => p.test(lower))) return false;
  const cacheablePatterns = [
    /what (is|are|does|do|was|were)/i,
    /how (does|do|to|can)/i,
    /explain/i,
    /define/i,
    /difference between/i,
    /example of/i,
    /quiz/i,
    /flashcard/i,
    /summarize/i,
    /summarise/i,
    /formula/i,
    /equation/i,
    /theorem/i,
    /law of/i,
    /who (is|was|invented|discovered)/i,
    /when (did|was)/i,
    /why (is|are|does|do)/i,
  ];
  return cacheablePatterns.some((p) => p.test(lower));
}

function evictStaleAndOverflow(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.ts > CACHE_TTL_MS) cache.delete(key);
  }
  if (cache.size > CACHE_MAX_SIZE) {
    const sorted = [...cache.entries()].sort((a, b) => a[1].hits - b[1].hits);
    const toDelete = sorted.slice(0, cache.size - CACHE_MAX_SIZE);
    for (const [k] of toDelete) cache.delete(k);
  }
}

export function cacheGet(prompt: string): { answer: string; provider: string } | null {
  if (!isCacheable(prompt)) return null;
  const key = normalise(prompt);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  entry.hits++;
  return { answer: entry.answer, provider: `${entry.provider} (cached)` };
}

export function cacheSet(prompt: string, answer: string, provider: string): void {
  if (!isCacheable(prompt)) return;
  evictStaleAndOverflow();
  const key = normalise(prompt);
  cache.set(key, { answer, provider, ts: Date.now(), hits: 1 });
}

export function getCacheStats(): { size: number; maxSize: number } {
  return { size: cache.size, maxSize: CACHE_MAX_SIZE };
}
