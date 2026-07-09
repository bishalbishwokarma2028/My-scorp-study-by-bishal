import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { serverConfig } from "./config";

/**
 * Admin allowlist — access control decisions are made ONLY against this
 * server-side list, never against a client-editable DB flag. This avoids
 * relying on the `profiles.is_admin` column (which a signed-in user could
 * otherwise attempt to tamper with) as the sole gate for admin actions.
 */
const ADMIN_EMAILS = ["bishalbishwokarma2180@gmail.com"];

/**
 * Verifies the caller's Supabase session (Bearer token) and confirms their
 * email is on the admin allowlist. Throws if either check fails.
 * Call this as the first line of every admin server function.
 */
export async function requireAdmin(): Promise<{ userId: string; email: string }> {
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized: admin session required");
  }

  const token = authHeader.replace("Bearer ", "");
  const cfg = serverConfig.supabase;

  if (!cfg.url || !cfg.anonKey) {
    throw new Error("Missing Supabase config. See .env.example.");
  }

  const supabase = createClient(cfg.url, cfg.anonKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Error("Unauthorized: invalid session");
  }

  const email = String(data.claims.email ?? "").toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) {
    throw new Error("Unauthorized: admin access only");
  }

  return { userId: String(data.claims.sub), email };
}

/** Service-role Supabase client — bypasses RLS. Admin functions only. */
export function getAdminClient() {
  const cfg = serverConfig.supabase;
  if (!cfg.url || !cfg.serviceRoleKey) {
    throw new Error("Missing Supabase service role config. See .env.example.");
  }
  return createClient(cfg.url, cfg.serviceRoleKey);
}
