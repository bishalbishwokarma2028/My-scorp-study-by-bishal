/** Per-feature daily limits — single source of truth for server and client */
export const FEATURE_LIMITS = {
  chat:             20,
  summarizer:        5,
  quiz:              5,
  flashcards:        5,
  notes:            10,
  translator:       20,
  formula:          15,
  code_tutor:       10,
  compare:           8,
  research:          5,
  visual_explainer:  8,
} as const;

export type FeatureKey = keyof typeof FEATURE_LIMITS;

export const QUOTA_MESSAGE = "You crossed today's free quota limit. Try again tomorrow!";
