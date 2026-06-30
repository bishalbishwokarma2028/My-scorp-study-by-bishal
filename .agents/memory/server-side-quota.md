---
name: Server-side quota system
description: Per-user daily AI usage limits backed by Supabase, replacing old localStorage quota system
---

## Architecture

- **Table**: `daily_usage (id, user_id, feature, usage_date, count, updated_at)` with UNIQUE(user_id, feature, usage_date)
- **Postgres RPC**: `increment_daily_usage(p_user_id, p_feature, p_limit)` — atomic conditional UPDATE (`count+1 WHERE count < limit`); returns `{allowed, used, limit, remaining}` as JSON
- **Server functions**: `src/lib/usageLimit.functions.ts` — `getUsageServer` (read) and `bumpUsageServer` (calls RPC)
- **Hook**: `src/hooks/useUsageLimit.ts` — `useUsageLimit(userId, feature)` returns `{quota, quotaLoading, bump}`
- **Config**: `src/lib/usageLimit.config.ts` — `FEATURE_LIMITS` map and `QUOTA_MESSAGE`
- **UI**: `QuotaBadge` in `src/components/ai-ui.tsx` — shows "Remaining: X/N • Used Today: X"

## Feature limits
chat:20, summarizer:5, quiz:5, flashcards:5, notes:10 (Enhance+Summarize shared), translator:20, formula:15

## Key decisions

**Why atomic RPC**: The naive read+write pattern races under concurrent tabs. The Postgres RPC uses a single `UPDATE ... WHERE count < limit` which is atomic at the row level.

**Why bump after AI call (regardless of parse)**: Counts the AI API call, not client-side parse success. Parse failures don't give free retries.

**Why quizMe() in notes does NOT bump**: `quizMe()` only navigates to the quiz page — no AI call happens there. The quiz page has its own quota.

**Why not bump for identity-cache/QA-cache answers in chat**: Cached answers don't hit the AI API; original localStorage system also didn't count them.

**Fail-open**: `quota=null` (network error) allows AI calls to proceed. Acceptable for a study app where availability > strict enforcement.

**Auth**: Server functions accept client-provided `userId` (no server-side token verification). Service-role key bypasses RLS. Acceptable for this study app — worst case is quota count leakage or cross-user bump (low-value data).

## Files NOT migrated
`dashboard.image-gen.tsx` — not in the spec; still uses old `localStorage` quota from `dailyLimits.ts`.
