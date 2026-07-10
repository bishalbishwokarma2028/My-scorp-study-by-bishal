-- Per-user credit overrides: lets the admin panel set a custom daily credit
-- limit for an individual user, per pool, instead of only the global default.
-- NULL means "no override — use the global pool_limits value".
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cerebras_limit_override int;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS groq_limit_override int;
