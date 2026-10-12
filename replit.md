# ScorpStudy

AI-powered study assistant by Bishal. Built with TanStack Start + React + Supabase, with a multi-provider AI routing system.

## How to run

```
bun run dev
```

Workflow: **Start application** (`bun run dev`) — serves on port 5000.

## Stack

- **Frontend/SSR**: TanStack Start (Vite + React 19)
- **Database & Auth**: Supabase (PostgREST, Auth, Storage)
- **AI providers**: long-answer requests use OpenRouter Claude Sonnet 5.5 → DeepSeek V4.1 Flash → Gemini; default requests use Groq → Gemini → OpenRouter → HuggingFace
- **Web search**: Tavily (primary) → Serper (fallback / YouTube)
- **Styling**: Tailwind CSS v4 + shadcn/ui (Radix)

## Environment variables

All secrets are stored in Replit Secrets (never in code or `.env`). See `.env.example` for the full list. Required groups:

| Group | Keys |
|---|---|
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Groq | `GROQ_API_KEY_1` … `GROQ_API_KEY_7` |
| Groq Compound | `GROQ_COMPOUND_KEY_1` … `GROQ_COMPOUND_KEY_8` |
| Gemini | `GEMINI_API_KEY_1` … `GEMINI_API_KEY_5` |
| Tavily | `TAVILY_API_KEY`, `TAVILY_API_KEY_2` … `TAVILY_API_KEY_4` |
| Serper | `SERPER_API_KEY` |
| HuggingFace | `HUGGINGFACE_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` and optional `OPENROUTER_API_KEY_2` … `OPENROUTER_API_KEY_10` |

Config is read lazily at request time (not module load) — see `src/lib/config.ts`.
For long-answer requests, OpenRouter keys are tried in order (`OPENROUTER_API_KEY`, then `_2` through `_10`); provider/model fallbacks run only after the configured keys fail.

## Key source files

- `src/lib/config.ts` — central server-side config with multi-name env var fallbacks
- `src/lib/aiProvider.functions.ts` — AI routing + fallback logic
- `src/integrations/supabase/client.ts` — Supabase client (browser)
- `src/integrations/supabase/client.server.ts` — Supabase client (server / service role)
- `vite.config.ts` — runtime env injection plugin (keeps secrets server-side only)

## User preferences

- Never expose API keys or secrets to the frontend or chat.
- All sensitive values must be stored in Replit Secrets only.
