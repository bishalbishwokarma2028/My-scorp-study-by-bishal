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
 * Plugin that injects Supabase env vars at request-time so that
 * Replit Secrets (which are injected after module load) are always
 * picked up correctly.
 */
function runtimeEnvPlugin(): Plugin {
  return {
    name: "runtime-env-inject",
    configResolved() {},
    transform(code, id) {
      if (!id.includes("supabase") && !id.includes("client")) return;
      return null;
    },
    config() {
      const SUPABASE_URL = pickEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
      const SUPABASE_KEY = pickEnv(
        "SUPABASE_ANON_KEY",
        "SUPABASE_PUBLISHABLE_KEY",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
      );
      return {
        define: {
          "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(SUPABASE_URL),
          "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(SUPABASE_KEY),
          "import.meta.env.SUPABASE_ANON_KEY": JSON.stringify(SUPABASE_KEY),
        },
      };
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
          "**/.cache/bun/**",
          "**/node_modules/**",
          "**/.local/state/**",
        ],
      },
    },
  },
});
