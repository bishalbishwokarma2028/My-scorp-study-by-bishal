import { defineConfig } from "@lovable.dev/vite-tanstack-config";

function pickEnv(...keys: string[]): string {
  for (const key of keys) {
    const val = process.env[key];
    if (val && val.trim()) return val.trim();
  }
  return "";
}

const SUPABASE_URL = pickEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
const SUPABASE_KEY = pickEnv(
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
);

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(SUPABASE_URL),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(SUPABASE_KEY),
      "import.meta.env.SUPABASE_ANON_KEY": JSON.stringify(SUPABASE_KEY),
    },
    server: {
      port: 5000,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      watch: {
        ignored: [
          "**/.cache/bun/**",
          "**/node_modules/**",
          "**/.local/state/**",
        ],
      },
    },
  },
});
