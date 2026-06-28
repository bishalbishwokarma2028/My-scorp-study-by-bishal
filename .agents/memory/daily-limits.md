---
name: Daily Limits System
description: How per-feature daily usage limits are tracked and enforced across ScorpStudy
---

# Daily Limits — Architecture

All daily limits use `localStorage` via `src/lib/dailyLimits.ts`. Each key stores `{ day: string, count: number }` and resets automatically when the date changes.

**Why:** User requested quotas per feature to prevent abuse while keeping the app free.

## Limits
| Feature | Limit | Key |
|---|---|---|
| Global AI (chat, summarizer, quiz, flashcards, image-gen) | 35/day | `scorp_ai_quota` |
| Image Gen (images only) | 3/day | `scorp_img_quota` |
| Smart Notes Enhance | 10/day | `scorp_enhance_quota` |
| Translator | 15/day | `scorp_translate_quota` |

## Pattern in each route file
```ts
import { canUseAI, bumpAIUsage, QUOTA_MSG } from "@/lib/dailyLimits";
// At start of action function:
if (!canUseAI()) return toast.error(QUOTA_MSG);
bumpAIUsage();
```

## Q&A Cache
Common questions are cached in `localStorage` under key `scorp_qa_cache` (max 60 entries, LRU-style). Cache is skipped in Topper Mode so users always get fresh detailed answers.

## History 30-day cleanup
`dashboard.history.tsx` runs a `useEffect` on mount that deletes all entries older than 30 days across all 8 tables via Supabase `.lt("created_at", cutoff)`.
