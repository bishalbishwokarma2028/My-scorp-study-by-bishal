/** Daily credit limits per provider pool */
export const CEREBRAS_DAILY_LIMIT = 10;
export const GROQ_DAILY_LIMIT = 20;

/** Pool keys stored in the DB */
export const CEREBRAS_POOL_KEY = "cerebras" as const;
export const GROQ_POOL_KEY = "groq" as const;
export type PoolKey = typeof CEREBRAS_POOL_KEY | typeof GROQ_POOL_KEY;

export function limitForPool(pool: PoolKey): number {
  return pool === "cerebras" ? CEREBRAS_DAILY_LIMIT : GROQ_DAILY_LIMIT;
}

export const QUOTA_MESSAGE =
  "Your today's free limit is exceeded. Try again Tomorrow.";

/** @deprecated kept for DB backward-compat only */
export const GLOBAL_POOL_KEY = "global" as const;
/** @deprecated use limitForPool(pool) */
export const DAILY_CREDIT_LIMIT = 30;
export type FeatureKey = string;
