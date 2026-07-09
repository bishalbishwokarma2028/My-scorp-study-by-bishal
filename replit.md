# ScorpStudy

## Overview
ScorpStudy (by Bishal) is a study-companion web app built with TanStack Start (React 19 + Vite) and Supabase (auth/database/storage). It offers Q&A, problem solving, quiz generation, textbook summarization, and flashcards, powered by a multi-provider AI routing layer (Groq, Groq Compound, Cerebras, OpenRouter, Gemini, Hugging Face) with automatic fallback across pools, plus web search via Tavily/Serper.

Imported into Replit from a Lovable-connected zip export.

## Running the project
- Dev server: `bun run dev` (runs `vite dev`), bound to port 5000. Configured as the "Start application" workflow.
- Build: `bun run build`; production start: `bun .output/server/index.mjs`.
- Dependencies are managed with Bun (`bun install`).

## Environment / secrets
All required keys are stored as Replit Secrets (not in `.env`, since Replit Secrets don't transfer across zip export/import — see `.env.example` for the full reference list and accepted alternate names):
- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- AI providers: `GROQ_API_KEY_1..7`, `GROQ_COMPOUND_KEY_1..8`, `CEREBRAS_API_KEY_1..16`, `OPENROUTER_API_KEY`, `HUGGINGFACE_API_KEY`
- Web search: `TAVILY_API_KEY` (+ `_2..4`), `SERPER_API_KEY`

The app prints a startup warning listing any missing variables.

## User preferences
None recorded yet.
