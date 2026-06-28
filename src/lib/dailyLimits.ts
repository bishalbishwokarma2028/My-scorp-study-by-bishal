const TODAY = () => new Date().toDateString();

function getUsage(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { day: string; count: number };
    if (parsed.day !== TODAY()) return 0;
    return parsed.count ?? 0;
  } catch { return 0; }
}

function bumpUsage(key: string): number {
  const next = getUsage(key) + 1;
  localStorage.setItem(key, JSON.stringify({ day: TODAY(), count: next }));
  return next;
}

export const AI_DAILY_LIMIT = 35;
export const IMAGE_DAILY_LIMIT = 3;
export const ENHANCE_DAILY_LIMIT = 10;
export const TRANSLATE_DAILY_LIMIT = 15;

export const QUOTA_MSG = "You've crossed your daily free quota limit. Try again Tomorrow!";
export const ENHANCE_LIMIT_MSG = "Your enhance feature for today is reached. Try again Tomorrow!";
export const TRANSLATE_LIMIT_MSG = "Daily translation limit reached. Try again Tomorrow!";

const AI_KEY = "scorp_ai_quota";
export function getAIUsedToday() { return getUsage(AI_KEY); }
export function bumpAIUsage() { return bumpUsage(AI_KEY); }
export function canUseAI() { return getAIUsedToday() < AI_DAILY_LIMIT; }

const IMG_KEY = "scorp_img_quota";
export function getImageUsedToday() { return getUsage(IMG_KEY); }
export function bumpImageUsage() { bumpUsage(IMG_KEY); }
export function canGenerateImage() { return getImageUsedToday() < IMAGE_DAILY_LIMIT; }

const ENHANCE_KEY = "scorp_enhance_quota";
export function getEnhanceUsedToday() { return getUsage(ENHANCE_KEY); }
export function bumpEnhanceUsage() { bumpUsage(ENHANCE_KEY); }
export function canEnhance() { return getEnhanceUsedToday() < ENHANCE_DAILY_LIMIT; }

const TRANSLATE_KEY = "scorp_translate_quota";
export function getTranslateUsedToday() { return getUsage(TRANSLATE_KEY); }
export function bumpTranslateUsage() { bumpUsage(TRANSLATE_KEY); }
export function canTranslate() { return getTranslateUsedToday() < TRANSLATE_DAILY_LIMIT; }

const QA_CACHE_KEY = "scorp_qa_cache";
export function getCachedAnswer(question: string): string | null {
  try {
    const raw = localStorage.getItem(QA_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Record<string, string>;
    const key = question.trim().toLowerCase().slice(0, 200);
    return cache[key] ?? null;
  } catch { return null; }
}
export function setCachedAnswer(question: string, answer: string) {
  try {
    const raw = localStorage.getItem(QA_CACHE_KEY);
    const cache = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const key = question.trim().toLowerCase().slice(0, 200);
    cache[key] = answer;
    const entries = Object.entries(cache);
    const trimmed = entries.length > 60 ? Object.fromEntries(entries.slice(-60)) : cache;
    localStorage.setItem(QA_CACHE_KEY, JSON.stringify(trimmed));
  } catch { /* silent */ }
}
