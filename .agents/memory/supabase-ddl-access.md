---
name: No direct Supabase DB/DDL access
description: This project's Supabase project is only reachable via SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (PostgREST/Auth REST APIs). There is no DATABASE_URL, DB password, or Supabase Management API token available.
---

Schema changes (ALTER TABLE, CREATE TABLE, new columns, RLS policies) cannot be
executed by the agent directly against this Supabase project — no `exec_sql`-style
RPC exists, and the service role key only grants PostgREST data access, not raw DDL.

**Why:** Confirmed by testing common `exec_sql`/`execute_sql`/`run_sql` RPC names (404)
and checking available secrets/connections (no Supabase connector attached, no DB
connection string secret).

**How to apply:** When a feature needs a new column/table, write the migration SQL
to `supabase/migrations/<timestamp>_<name>.sql` (keeps the repo's existing migration
history consistent) and give the exact SQL to the user to run in the Supabase SQL
Editor themselves — or ask if they want to provide a direct Postgres connection
string as a secret so the agent can run it. Always make dependent server code
degrade gracefully (try/catch or a fallback query) for the window before the user
applies the migration, so existing features don't regress if the column is missing.
