-- Admin flags on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unlimited_credits boolean NOT NULL DEFAULT false;

-- Configurable, realtime-syncable daily credit limits per pool
CREATE TABLE IF NOT EXISTS public.pool_limits (
  pool text PRIMARY KEY,
  daily_limit int NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.pool_limits (pool, daily_limit) VALUES ('cerebras', 10), ('groq', 20)
  ON CONFLICT (pool) DO NOTHING;

GRANT SELECT ON public.pool_limits TO anon, authenticated;
GRANT ALL ON public.pool_limits TO service_role;
ALTER TABLE public.pool_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_can_read_pool_limits" ON public.pool_limits FOR SELECT USING (true);

-- Enable realtime broadcast for pool_limits so admin edits push to all clients instantly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pool_limits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pool_limits;
  END IF;
END $$;

-- API call usage log (who called what, when, via which pool/provider)
CREATE TABLE IF NOT EXISTS public.api_call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text,
  pool text NOT NULL,
  feature text,
  provider text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_call_log_created_at_idx ON public.api_call_log (created_at DESC);
CREATE INDEX IF NOT EXISTS api_call_log_user_id_idx ON public.api_call_log (user_id);

GRANT SELECT ON public.api_call_log TO authenticated;
GRANT ALL ON public.api_call_log TO service_role;
ALTER TABLE public.api_call_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_call_log" ON public.api_call_log FOR SELECT USING (auth.uid() = user_id);
