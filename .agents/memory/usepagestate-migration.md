---
name: usePageState migration pitfall
description: Checklist for converting a component from useState to the usePageState persistence hook without leaving stale setter calls behind.
---

When converting a component's local state from `useState(...)` pairs to the shared `usePageState(key, initial)` pattern (see `src/lib/pageState.ts`), all `setXxx(...)` calls derived from destructured `useState` must be rewritten to `set({ xxx: ... })`.

**Why:** Old setter calls (e.g. `setActiveSection(...)`, `setOpenChapter(...)`) are easy to miss because TypeScript only flags them if `noEmit` type-checking is run — a quick visual read of the diff, or even the file section you edited, won't catch usages elsewhere in the same file (e.g. deep in JSX further down, or in a second unrelated section that references the same conceptual state). They only surface as runtime `ReferenceError: setXxx is not defined` when a user clicks the affected control, which is easy to miss without exercising every interactive element.

**How to apply:** After any useState → usePageState conversion (or when auditing a file that already uses the pattern), grep the entire file for the old setter name(s) before considering the change done. Run `bun x tsc --noEmit` across the project after the edit — it will list every stale setter reference as a `TS2552: Cannot find name 'setXxx'` error, which is the fastest way to catch all instances at once.
