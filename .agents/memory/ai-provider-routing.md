---
name: AI provider routing pools
description: Long-answer OpenRouter routing, provider fallbacks, and multi-key rotation behavior.
---

Text AI routing keeps separate long-answer and default paths:

- Long-answer features use OpenRouter Claude Sonnet 5.5 first, then DeepSeek V4.1 Flash, Gemini, free OpenRouter models, and Hugging Face.
- Default requests keep Groq first, then Gemini, free OpenRouter models, and Hugging Face.
- The dedicated math solver uses the OpenRouter long-answer models before Groq and Gemini.
- Image requests use Gemini 2.5 Flash first, with OpenRouter as fallback.

**Why:** provider model IDs and free-tier availability change. A stale model ID can return 404 for every key, while billing or quota errors can disable an entire provider; these failures must not make all AI features unavailable when another configured pool works.

**How to apply:** verify model IDs against the current provider catalog and a small live request before changing them. Preserve Groq-first routing for default requests, keep Gemini as a fallback, and do not treat provider failures as user daily quota exhaustion. OpenRouter keys from one account share that account's credits; adding keys does not multiply the balance.

The Groq pool merges `GROQ_API_KEY_N` with former `GROQ_COMPOUND_KEY_N` keys; do not restore a separate compound-mini path. Gemini supports up to 5 keys. OpenRouter uses the original unsuffixed key plus optional `_2` through `_10`; rotate the pool and try remaining keys after per-key failures.
