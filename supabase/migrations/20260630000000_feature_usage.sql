-- Per-feature daily usage tracking
CREATE TABLE IF NOT EXISTS public.feature_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  count int NOT NULL DEFAULT 0,
  UNIQUE(user_id, feature, usage_date)
);

GRANT SELECT, INSERT, UPDATE ON public.feature_usage TO service_role;
GRANT SELECT ON public.feature_usage TO authenticated;

ALTER TABLE public.feature_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_usage" ON public.feature_usage
  FOR SELECT USING (auth.uid() = user_id);
