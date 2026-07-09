import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_EMAILS = ["bishalbishwokarma2180@gmail.com"];

export const Route = createFileRoute("/admin/login")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email?.toLowerCase();
    // Only redirect straight through if this session is already an allowlisted
    // admin. A regular signed-in (non-admin) user must be able to land on this
    // page without being signed out of their normal session.
    if (email && ADMIN_EMAILS.includes(email)) throw redirect({ to: "/admin" });
  },
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error((err as Error).message || "Sign in failed");
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600/20 ring-1 ring-violet-500/40">
            <ShieldCheck className="h-6 w-6 text-violet-400" />
          </div>
          <h1 className="text-lg font-bold text-white">Admin Access</h1>
          <p className="mt-1 text-sm text-slate-400">Restricted area — authorized personnel only</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
