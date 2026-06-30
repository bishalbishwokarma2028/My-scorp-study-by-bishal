/** Per-feature daily limits — single source of truth for server and client */
export const FEATURE_LIMITS = {
  chat:       20,
  summarizer:  5,
  quiz:        5,
  flashcards:  5,
  notes:      10,   // Enhance + Summarize + Quiz Me combined
  translator: 20,
  formula:    15,
} as const;

export type FeatureKey = keyof typeof FEATURE_LIMITS;

export const QUOTA_MESSAGE = "You crossed today's free quota limit. Try again tomorrow!";
