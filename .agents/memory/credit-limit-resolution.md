---
name: Credit limit resolution priority
description: How ScorpStudy resolves a user's effective daily AI credit limit across unlimited/override/global/default tiers, and the pre-migration-safety pattern required when extending it.
---

`resolveLimit()` in `src/lib/usageLimit.functions.ts` resolves the effective daily
limit for a (user, pool) pair in this priority order:
1. `profiles.unlimited_credits` — treated as an effectively unlimited limit.
2. `profiles.{pool}_limit_override` — an admin-set custom limit for that one user.
3. `pool_limits.daily_limit` — the global admin-configurable default for the pool.
4. Hardcoded constant in `usageLimit.config.ts` — last-resort fallback.

**Why:** The per-user override columns were added in a later migration than
`unlimited_credits`. The query that reads `unlimited_credits` and the override
column together will hard-fail (not just return null) if the override column
doesn't exist yet on that Supabase project — silently breaking `unlimited_credits`
for existing users until the migration is applied.

**How to apply:** Any future addition to this resolution chain must keep the
try-full-query-then-fall-back-to-narrower-query pattern already used here (and in
`adminListUsersServer`), so older/not-yet-migrated schemas keep working.
