---
name: Research & Compare History Tables
description: New DB tables for Research and Compare history, migration strategy, and save/restore pattern used across all section types.
---

## Tables Added
- `research_history` — stores query, focus_type, report, sources (jsonb), search_source, provider, created_at
- `compare_history` — stores concept_a, concept_b, category, result (jsonb), provider, created_at
- Visual Explainer uses the existing `mindmaps` table (topic, map_data jsonb)

## Migration Strategy
Migration SQL is in `supabase/migrations/20260703000002_research_compare_history.sql`.
`src/lib/applyMigration.server.ts` tries to apply it at runtime via Supabase's `/pg/query` admin endpoint (service_role key). Falls back to `/rest/v1/rpc/exec_sql`. Gracefully no-ops if neither endpoint is available.
History page calls `applyFeatureTablesMigration` once on mount (guarded by `useRef` to prevent repeat calls).

**Why:** Supabase JS client can't run DDL directly — PostgREST is CRUD only. Management API requires PAT (not service_role). Runtime migration via `/pg/query` is the best available option without extra credentials.

## Save Pattern
All saves are non-blocking fire-and-forget (`.then(() => {})`). If table doesn't exist, the insert silently fails — no UX disruption. `safeFetch<T>` in history.tsx uses `PromiseLike` (not `Promise`) to accept Supabase query builders, and catches all errors returning `[]`.

## Restore Pattern (sessionStorage keys)
- Research: `scorp_research_restore` → `{ query, focusType, report, sources, searchSource, provider }`
- Compare: `scorp_compare_restore` → `{ conceptA, conceptB, category, result, provider }`
- Visual: `scorp_visual_restore` → `{ topic, diagramType, diagram, provider }`
All three pages read + clear the key in a `useEffect([], [])` on mount.

## Auto-delete Policy
- `chat_history`: 30 days (Bishal's Assistant)
- All other tables (quiz, notes, flashcards, images, summaries, translations, research_history, compare_history, mindmaps): 10 days
