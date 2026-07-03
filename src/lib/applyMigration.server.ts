import { createServerFn } from "@tanstack/react-start";
import { serverConfig } from "@/lib/config";

/**
 * Applies pending DDL migrations (CREATE TABLE IF NOT EXISTS) using
 * Supabase's pg/query admin endpoint with the service-role key.
 * Called once from the History page on first load.
 */
export const applyFeatureTablesMigration = createServerFn({ method: "POST" }).handler(async () => {
  const { url, serviceRoleKey } = serverConfig.supabase;
  if (!url || !serviceRoleKey) return { ok: false, reason: "missing supabase config" };

  const sql = `
    CREATE TABLE IF NOT EXISTS public.research_history (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      query text NOT NULL,
      focus_type text,
      report text,
      sources jsonb DEFAULT '[]',
      search_source text,
      provider text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'research_history' AND policyname = 'own_research_history') THEN
        ALTER TABLE public.research_history ENABLE ROW LEVEL SECURITY;
        CREATE POLICY own_research_history ON public.research_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_history TO authenticated;
        GRANT ALL ON public.research_history TO service_role;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS public.compare_history (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      concept_a text NOT NULL,
      concept_b text NOT NULL,
      category text,
      result jsonb,
      provider text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'compare_history' AND policyname = 'own_compare_history') THEN
        ALTER TABLE public.compare_history ENABLE ROW LEVEL SECURITY;
        CREATE POLICY own_compare_history ON public.compare_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.compare_history TO authenticated;
        GRANT ALL ON public.compare_history TO service_role;
      END IF;
    END $$;
  `;

  // Try Supabase pg/query admin endpoint (available on all hosted projects)
  try {
    const res = await fetch(`${url}/pg/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    if (res.ok) return { ok: true };
  } catch { /* fall through */ }

  // Fallback: Supabase REST RPC (works if exec_sql function exists)
  try {
    const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ sql }),
    });
    if (res.ok) return { ok: true };
  } catch { /* fall through */ }

  return { ok: false, reason: "migration endpoint not available — apply migration manually via Supabase Dashboard SQL Editor" };
});
