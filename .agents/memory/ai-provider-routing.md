---
name: AI provider routing pools
description: How preferCerebras vs default routing splits between Cerebras and Groq key pools, and how key rotation works.
---

The `preferCerebras` flag on `askAIServer` (in `src/lib/aiProvider.functions.ts`) selects between two completely separate routing chains:

- `preferCerebras: true` (long-answer features: Compare, Research, YouTube, CodeTutor, MockTest, PDFChat, Visual, FormulaSheet, Calculator, Grammar, Math, Science, Notes, Solver) → Cerebras key pool ONLY → OpenRouter → HuggingFace. Groq is never used on this path.
- `preferCerebras: false`/default (all other features) → Groq key pool → Cerebras key pool → OpenRouter → HuggingFace.

**Why:** the user explicitly wants Cerebras-only features isolated from Groq rate limits, and wants the reverse (Groq-first) for everything else, with Cerebras as the shared fallback pool for both.

**How to apply:** the Groq pool (`serverConfig.ai.groqKeys`) is a single merged pool of the original GROQ_API_KEY_N keys and the former GROQ_COMPOUND_KEY_N keys — do not reintroduce a separate "compound-mini" special path; that concept (and `compoundOnly`) was removed entirely. The Cerebras pool (`serverConfig.ai.cerebrasKeys`) supports up to 16 keys (CEREBRAS_API_KEY_1..16).

Key rotation: `rotatedKeys(poolName, keys)` in `aiProvider.functions.ts` keeps a module-level round-robin pointer per pool name so consecutive requests spread across all keys instead of always starting at key 1. On failure/rate-limit within a request, it still falls through the rest of that request's rotated key order before moving to the next provider.
