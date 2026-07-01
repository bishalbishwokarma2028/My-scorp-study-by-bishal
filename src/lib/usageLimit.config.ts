/** Unified daily credit pool — all features share this single balance */
export const DAILY_CREDIT_LIMIT = 30;

/** The shared pool key stored in the DB for every user */
export const GLOBAL_POOL_KEY = "global" as const;

/** Kept for backward-compatibility — every call still passes a feature name but the server ignores it */
export type FeatureKey = string;

export const QUOTA_MESSAGE = "You've used all 30 of your daily credits. Come back tomorrow!";
