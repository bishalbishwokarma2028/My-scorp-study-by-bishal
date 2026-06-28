---
name: Vite SSR env var timing
description: Replit Secrets aren't available during Vite SSR module initialization; fix by using JS getter properties on config objects.
---

# Vite SSR env var timing (ScorpStudy / TanStack Start)

## The rule
Never freeze `process.env` values into a module-level `const` object in a Vite SSR app running on Replit. Use JavaScript **getter properties** instead so the values are read at access time (request time), not at module-load time.

**Why:** Replit Secrets are injected as environment variables, but they aren't visible in Vite's SSR module initialization context at server startup. A `const serverConfig = { ai: { groqKeys: process.env.GROQ... } }` gets frozen with empty strings. Subsequent requests never see the real secrets, even though `process.env` contains them at that point.

**How to apply:**
```ts
// BAD — frozen at module load time
export const serverConfig = {
  ai: { groqPrimaryKeys: [1,2,3,4,5].map(i => process.env[`GROQ_API_KEY_${i}`]).filter(Boolean) }
};

// GOOD — read fresh on each access
export const serverConfig = {
  get ai() {
    return { groqPrimaryKeys: [1,2,3,4,5].map(i => process.env[`GROQ_API_KEY_${i}`]).filter(Boolean) };
  }
};
```

**Symptom:** Server startup warns "missing environment variables" even though `echo $SECRET_KEY` in the shell shows it's set. AI calls that are NOT cached all return the fallback "busy" message; cached responses still work.

**Confirmed fixed in:** `src/lib/config.ts` — all three top-level sections (supabase, ai, search) converted to getter properties.
