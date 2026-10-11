---
name: AI provider routing pools
description: How preferCerebras vs default routing splits between Cerebras and Groq key pools, and how key rotation works.
---

Text AI routing preserves the preferred provider while keeping Gemini as an active fallback:

- `preferCerebras: true` (long-answer features) → Cerebras pool → Gemini pool → OpenRouter → HuggingFace. This path does not use Groq.
- Default path → Groq pool → Gemini pool → Cerebras pool → OpenRouter → HuggingFace.
- Image requests use Gemini 2.5 Flash first, with OpenRouter as fallback.

**Why:** provider model IDs and free-tier availability change. A stale model ID can return 404 for every key, while billing or quota errors can disable an entire provider; these failures must not make all AI features unavailable when another configured pool works.

**How to apply:** verify model IDs against current provider catalogs and a small live request before changing them. Keep Gemini's configured text fallback on `gemini-2.5-flash`, preserve Groq-first routing for default requests, and never route `preferCerebras` requests through Groq. Do not silently treat a provider/model error as a user daily quota limit.

The Groq pool is a merged pool of `GROQ_API_KEY_N` and former `GROQ_COMPOUND_KEY_N` keys; do not restore a separate compound-mini path. Cerebras supports up to 16 keys, Gemini up to 5. Rotation advances per pool on each request and still tries the rest of that pool after a per-key failure.
