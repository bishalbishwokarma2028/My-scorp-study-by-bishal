import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

function pickEnv(...keys: string[]): string {
  for (const key of keys) {
    const val = process.env[key];
    if (val && val.trim()) return val.trim();
  }
  return "";
}

/**
 * Plugin that injects Supabase public env vars at transform-time per request,
 * so Replit Secrets injected after module load are always picked up.
 */
function runtimeEnvPlugin(): Plugin {
  return {
    name: "runtime-env-inject",
    transform(code, id) {
      if (!id.includes("supabase/client")) return null;

      const SUPABASE_URL = pickEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
      const SUPABASE_KEY = pickEnv(
        "SUPABASE_ANON_KEY",
        "SUPABASE_PUBLISHABLE_KEY",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
      );

      return code
        .replace(/import\.meta\.env\.VITE_SUPABASE_URL/g, JSON.stringify(SUPABASE_URL))
        .replace(/import\.meta\.env\.VITE_SUPABASE_PUBLISHABLE_KEY/g, JSON.stringify(SUPABASE_KEY))
        .replace(/import\.meta\.env\.SUPABASE_ANON_KEY/g, JSON.stringify(SUPABASE_KEY));
    },
  };
}

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [runtimeEnvPlugin()],
    server: {
      port: 5000,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      watch: {
        ignored: [
          "**/.cache/**",
          "**/node_modules/**",
          "**/.local/**",
          "**/tmp/**",
          "**/.agents/**",
        ],
      },
    },
  },
});
