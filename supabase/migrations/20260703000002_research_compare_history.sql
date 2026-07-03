-- RESEARCH HISTORY
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_history TO authenticated;
GRANT ALL ON public.research_history TO service_role;
ALTER TABLE public.research_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_research_history" ON public.research_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- COMPARE HISTORY
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compare_history TO authenticated;
GRANT ALL ON public.compare_history TO service_role;
ALTER TABLE public.compare_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_compare_history" ON public.compare_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
