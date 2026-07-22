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

/**
 * Lazily-evaluated config — each property is a getter that reads
 * process.env at access time, so Replit Secrets injected after module
 * load (or in the SSR context) are always picked up correctly.
 */
export const serverConfig = {
  get supabase() {
    return {
      url: getEnv("SUPABASE_URL", "VITE_SUPABASE_URL"),
      anonKey: getEnv(
        "SUPABASE_ANON_KEY",
        "SUPABASE_PUBLISHABLE_KEY",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
      ),
      serviceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    };
  },
  get ai() {
    // Groq pool — merges the 7 original GROQ_API_KEY_N keys with the 8
    // former "compound" keys (now unused for compound-mini) into a single
    // 15-key rotating pool used for all Groq-routed features.
    const groqKeys = [
      ...[1, 2, 3, 4, 5, 6, 7].map((i) => getEnv(`GROQ_API_KEY_${i}`)),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => getEnv(`GROQ_COMPOUND_KEY_${i}`)),
    ].filter(Boolean);

    // Cerebras pool — up to 16 keys, rotated for load balancing.
    const cerebrasKeys = Array.from({ length: 16 }, (_, i) => getEnv(`CEREBRAS_API_KEY_${i + 1}`))
      .filter(Boolean);

    // Gemini pool — up to 5 keys. Primary vision provider (free tier, multimodal).
    const geminiKeys = Array.from({ length: 5 }, (_, i) => getEnv(`GEMINI_API_KEY_${i + 1}`))
      .filter(Boolean);

    return {
      groqKeys,
      cerebrasKeys,
      geminiKeys,
      openrouterKey: getEnv("OPENROUTER_API_KEY"),
      huggingfaceKey: getEnv("HUGGINGFACE_API_KEY"),
    };
  },
  get search() {
    return {
      tavilyKeys: [1, 2, 3, 4]
        .map((i) => (i === 1 ? getEnv("TAVILY_API_KEY", "TAVILY_API_KEY_1") : getEnv(`TAVILY_API_KEY_${i}`)))
        .filter(Boolean),
      serperKey: getEnv("SERPER_API_KEY"),
    };
  },
};

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

  const ai = serverConfig.ai;
  const hasAnyAI =
    ai.groqKeys.length > 0 ||
    !!ai.openrouterKey ||
    ai.cerebrasKeys.length > 0 ||
    !!ai.huggingfaceKey;

  if (!hasAnyAI)
    missing.push(
      "at least one AI key — GROQ_API_KEY_1, CEREBRAS_API_KEY_1, OPENROUTER_API_KEY, or HUGGINGFACE_API_KEY",
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
