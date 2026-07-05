import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, BookOpen, Zap, Brain, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signUpWithAutoConfirm } from "@/integrations/supabase/auth.functions";
import logoUrl from "@/assets/scorpstudy-logo.png";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function passwordStrength(pw: string): { label: string; color: string; width: string } {
  if (pw.length < 6) return { label: "Weak", color: "bg-red-500", width: "33%" };
  if (pw.length < 10) return { label: "Medium", color: "bg-amber-500", width: "66%" };
  return { label: "Strong", color: "bg-emerald-500", width: "100%" };
}

const FEATURES = [
  { icon: Brain, label: "Bishal's Assistant", desc: "Instant expert explanations on any topic, any subject" },
  { icon: BookOpen, label: "Smart Notes", desc: "Write, enhance & export professional study notes" },
  { icon: Zap, label: "Quiz Generator", desc: "Auto-generate quizzes from your study material" },
  { icon: Trophy, label: "Topper Mode", desc: "Exam-ready structured answers like a topper" },
];

function AuthPage() {
  const { mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup") {
      if (password !== confirmPw) return toast.error("Passwords don't match");
      if (!agree) return toast.error("Please accept the terms");
      if (password.length < 6) return toast.error("Password too short (min 6 characters)");
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        await signUpWithAutoConfirm({ data: { email, password, fullName: name } });
        toast.success("Account created! Signing you in...");
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function forgotPassword() {
    if (!email) return toast.error("Enter your email first");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) return toast.error(error.message);
    toast.success("Password reset email sent — check your inbox.");
  }

  const strength = passwordStrength(password);

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex lg:w-[55%] flex-col justify-between relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #4c1d95 40%, #7c3aed 70%, #a855f7 100%)" }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 h-64 w-64 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-20 right-10 h-80 w-80 rounded-full bg-fuchsia-400 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-violet-300 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-center flex-1 px-14 py-16">
          <Link to="/" className="flex items-center gap-3 mb-12">
            <div className="h-14 w-14 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/20">
              <img src={logoUrl} alt="ScorpStudy" className="h-10 w-10 object-contain" />
            </div>
            <div>
              <div className="text-white text-2xl font-bold leading-tight">ScorpStudy</div>
              <div className="text-violet-200 text-sm font-medium">by Bishal Bishwokarma</div>
            </div>
          </Link>

          <h2 className="text-4xl font-bold text-white leading-snug mb-4">
            Meet Bishal's<br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(90deg, #fbbf24, #f59e0b)" }}>
              Study Assistant
            </span>
          </h2>
          <p className="text-violet-200 text-lg leading-relaxed mb-10 max-w-sm">
            Study smarter, not harder. Get expert explanations, auto-generate quizzes, create mind maps, and ace every exam — completely free.
          </p>

          <div className="space-y-4">
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="flex-shrink-0 h-9 w-9 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{label}</p>
                  <p className="text-violet-300 text-xs">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 grid grid-cols-2 gap-3">
            {[
              { n: "24/7", l: "Always Available" },
              { n: "21+", l: "Study Tools" },
              { n: "60+", l: "Languages" },
              { n: "Free", l: "Forever" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-white/10 backdrop-blur-sm px-4 py-3 text-center">
                <div className="text-lg font-bold text-white">{s.n}</div>
                <div className="text-xs text-violet-300 mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 px-14 pb-8">
          <p className="text-violet-400 text-xs">© {new Date().getFullYear()} ScorpStudy by Bishal Bishwokarma. All rights reserved.</p>
        </div>
      </div>

      {/* Right Panel — Form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 lg:px-12 bg-white">
        {/* Mobile logo */}
        <Link to="/" className="flex items-center gap-2 mb-8 lg:hidden">
          <img src={logoUrl} alt="ScorpStudy" className="h-10 w-10 object-contain" />
          <span className="text-xl font-bold">ScorpStudy <span className="text-muted-foreground font-normal text-base">by Bishal</span></span>
        </Link>

        <div className="w-full max-w-md">
          {/* Tab switcher */}
          <div className="flex rounded-2xl bg-slate-100 p-1 mb-8">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 ${mode === "signin" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 ${mode === "signup" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Create Account
            </button>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">
              {mode === "signin" ? "Welcome back 👋" : "Get started free ✨"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {mode === "signin"
                ? "Sign in to continue your learning journey with Bishal's Assistant."
                : "Create your account — free forever, no credit card required."}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full rounded-xl border border-input bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-violet-400 focus:ring-3 focus:ring-violet-100"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-input bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-violet-400 focus:ring-3 focus:ring-violet-100"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-semibold text-foreground">Password</label>
                {mode === "signin" && (
                  <button type="button" onClick={forgotPassword} className="text-xs text-violet-600 hover:underline font-medium">
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="w-full rounded-xl border border-input bg-slate-50 px-4 py-3 pr-12 text-sm outline-none transition focus:border-violet-400 focus:ring-3 focus:ring-violet-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {mode === "signup" && password && (
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                      style={{ width: strength.width }}
                    />
                  </div>
                  <span className={`text-xs font-semibold ${strength.label === "Weak" ? "text-red-500" : strength.label === "Medium" ? "text-amber-600" : "text-emerald-600"}`}>
                    {strength.label}
                  </span>
                </div>
              )}
            </div>

            {mode === "signup" && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1.5">Confirm Password</label>
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="Re-enter your password"
                    className={`w-full rounded-xl border bg-slate-50 px-4 py-3 text-sm outline-none transition focus:ring-3 focus:ring-violet-100 ${confirmPw && confirmPw !== password ? "border-red-400 focus:border-red-400" : "border-input focus:border-violet-400"}`}
                  />
                  {confirmPw && confirmPw !== password && (
                    <p className="mt-1 text-xs text-red-500">Passwords don't match</p>
                  )}
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="relative mt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      onClick={() => setAgree(v => !v)}
                      className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${agree ? "bg-violet-600 border-violet-600" : "border-slate-300 bg-white"}`}
                    >
                      {agree && <span className="text-white text-[10px] font-bold">✓</span>}
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground leading-relaxed">
                    I agree to the <span className="text-violet-600 font-medium hover:underline cursor-pointer">Terms of Service</span> and <span className="text-violet-600 font-medium hover:underline cursor-pointer">Privacy Policy</span>.
                  </span>
                </label>
              </>
            )}

            <button
              type="submit"
              disabled={loading || (mode === "signup" && !agree)}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Please wait...</>
              ) : (
                mode === "signin" ? "Sign In to ScorpStudy →" : "Create Free Account →"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              {mode === "signin" ? "New to ScorpStudy?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="font-semibold text-violet-600 hover:underline"
              >
                {mode === "signin" ? "Create a free account" : "Sign in instead"}
              </button>
            </p>
          </div>

          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-muted-foreground">trusted & secure</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="mt-4 flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <span>🔒 256-bit encrypted</span>
            <span>✅ Free forever</span>
            <span>🚀 Instant access</span>
          </div>
        </div>
      </div>
    </div>
  );
}
