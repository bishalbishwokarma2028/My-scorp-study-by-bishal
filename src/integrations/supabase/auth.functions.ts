import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { serverConfig } from "@/lib/config";

const SignUpInput = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().optional(),
});

export const signUpWithAutoConfirm = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SignUpInput.parse(d))
  .handler(async ({ data }) => {
    const SUPABASE_URL = serverConfig.supabase.url;
    const SUPABASE_SERVICE_ROLE_KEY = serverConfig.supabase.serviceRoleKey;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase server configuration. See .env.example.");
    }

    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: data.fullName ? { full_name: data.fullName } : {},
      }),
    });

    const body = await res.json();

    if (!res.ok) {
      const msg = body?.msg || body?.message || body?.error_description || body?.error || "Signup failed";
      throw new Error(msg);
    }

    return { userId: body.id };
  });
