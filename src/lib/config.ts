/**
 * Central configuration — SERVER SIDE ONLY (process.env).
 *
 * Every service (Supabase, AI providers) reads from this file.
 * Multi-name fallbacks mean the app works regardless of which env-var
 * name you used when setting up your secrets (e.g. SUPABASE_ANON_KEY
 * vs SUPABASE_PUBLISHABLE_KEY are treated identically).
 *
 * Portability note
 * ----------------
 * Replit Secrets do NOT transfer when you ZIP and re-upload a project.
 * After importing into a new Replit, add your secrets once using the
 * Secrets tab (or paste them into a local .env file that Bun loads
 * automatically). See .env.example for the full list.
 */

function getEnv(...keys: string[]): string {
  for (const key of keys) {
    const val = process.env[key];
    if (val && val.trim()) return val.trim();
  }
  return "";
}

export const serverConfig = {
  supabase: {
    url: getEnv("SUPABASE_URL", "VITE_SUPABASE_URL"),
    anonKey: getEnv(
      "SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
    ),
    serviceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  },
  ai: {
    groqPrimaryKeys: [1, 2, 3, 4, 5]
      .map((i) => getEnv(`GROQ_API_KEY_${i}`))
      .filter(Boolean),
    groqSecondaryKeys: [6, 7]
      .map((i) => getEnv(`GROQ_API_KEY_${i}`))
      .filter(Boolean),
    openrouterKey: getEnv("OPENROUTER_API_KEY"),
    geminiKeys: [1, 2, 3, 4, 5]
      .map((i) => getEnv(`GEMINI_API_KEY_${i}`))
      .filter(Boolean),
    huggingfaceKey: getEnv("HUGGINGFACE_API_KEY"),
  },
} as const;

/**
 * Call once at startup (e.g. in server.ts) to surface missing variables
 * clearly in the console instead of getting cryptic errors later.
 */
export function validateConfig(): string[] {
  const missing: string[] = [];

  if (!serverConfig.supabase.url)
    missing.push("SUPABASE_URL");
  if (!serverConfig.supabase.anonKey)
    missing.push("SUPABASE_ANON_KEY  (also accepted: SUPABASE_PUBLISHABLE_KEY)");
  if (!serverConfig.supabase.serviceRoleKey)
    missing.push("SUPABASE_SERVICE_ROLE_KEY");

  const hasAnyAI =
    serverConfig.ai.groqPrimaryKeys.length > 0 ||
    serverConfig.ai.groqSecondaryKeys.length > 0 ||
    !!serverConfig.ai.openrouterKey ||
    serverConfig.ai.geminiKeys.length > 0 ||
    !!serverConfig.ai.huggingfaceKey;

  if (!hasAnyAI)
    missing.push(
      "at least one AI key — GROQ_API_KEY_1, GEMINI_API_KEY_1, OPENROUTER_API_KEY, or HUGGINGFACE_API_KEY",
    );

  if (missing.length > 0) {
    console.warn(
      [
        "",
        "⚠️  ScorpStudy — missing environment variables:",
        ...missing.map((m) => `   • ${m}`),
        "   See .env.example for the full list and instructions.",
        "",
      ].join("\n"),
    );
  }

  return missing;
}
