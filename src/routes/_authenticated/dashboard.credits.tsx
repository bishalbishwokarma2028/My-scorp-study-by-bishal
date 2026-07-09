import { createFileRoute } from "@tanstack/react-router";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { CEREBRAS_DAILY_LIMIT, GROQ_DAILY_LIMIT } from "@/lib/usageLimit.config";
import { Brain, Zap, CheckCircle2, Info, Sparkles, FlaskConical } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/credits")({
  component: CreditsPage,
});

const CEREBRAS_FEATURES = [
  { icon: "🧩", label: "Compare Concepts" },
  { icon: "🔬", label: "Deep Research" },
  { icon: "▶️", label: "YouTube Summarizer" },
  { icon: "💻", label: "Code Tutor" },
  { icon: "📋", label: "Mock Test" },
  { icon: "📄", label: "Chat with PDF" },
  { icon: "🖼️", label: "Visual Explainer" },
  { icon: "📐", label: "Formula Sheet" },
  { icon: "🧮", label: "Calculator (Formula)" },
  { icon: "📝", label: "Grammar" },
  { icon: "➗", label: "Mathematics" },
  { icon: "⚗️", label: "Science" },
  { icon: "📒", label: "Smart Notes" },
  { icon: "🪜", label: "Step-by-Step Solver" },
];

const GROQ_FEATURES = [
  { icon: "💬", label: "Bishal's Assistant (Chat)" },
  { icon: "🃏", label: "Flashcards" },
  { icon: "❓", label: "Quiz Generator" },
  { icon: "📑", label: "Summarizer" },
  { icon: "🌐", label: "Translator" },
];

function PoolCard({
  title,
  subtitle,
  used,
  limit,
  loading,
  features,
  gradient,
  iconBg,
  Icon,
  accentColor,
  barColor,
  badgeColor,
}: {
  title: string;
  subtitle: string;
  used: number;
  limit: number;
  loading: boolean;
  features: { icon: string; label: string }[];
  gradient: string;
  iconBg: string;
  Icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  barColor: string;
  badgeColor: string;
}) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const remaining = Math.max(limit - used, 0);
  const status =
    remaining === 0 ? "exhausted" : remaining <= 2 ? "low" : "healthy";

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${gradient} p-0.5 shadow-lg`}>
      <div className="rounded-[14px] bg-background p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconBg}`}>
              <Icon className={`h-5 w-5 ${accentColor}`} />
            </div>
            <div>
              <h3 className="font-bold text-base">{title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            </div>
          </div>
          <div
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              status === "exhausted"
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : status === "low"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : `${badgeColor}`
            }`}
          >
            {status === "exhausted" ? "No credits left" : status === "low" ? "Almost out" : "Credits available"}
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between items-end">
            <span className="text-xs font-medium text-muted-foreground">Daily usage</span>
            {loading ? (
              <span className="text-xs text-muted-foreground animate-pulse">Loading…</span>
            ) : (
              <span className="text-sm font-bold">
                <span className={accentColor}>{remaining}</span>
                <span className="text-muted-foreground font-normal"> / {limit} remaining</span>
              </span>
            )}
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            {loading ? (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-muted-foreground/20" />
            ) : (
              <div
                className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            )}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{used} used today</span>
            <span>Resets at midnight UTC</span>
          </div>
        </div>

        {/* Credit dots visualization */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Credit slots</p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: limit }).map((_, i) => (
              <div
                key={i}
                className={`h-4 w-4 rounded-full border transition-all duration-300 ${
                  i < used
                    ? status === "exhausted"
                      ? "border-red-400 bg-red-400"
                      : status === "low"
                      ? "border-amber-400 bg-amber-400"
                      : `${barColor} border-transparent`
                    : "border-muted-foreground/20 bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Features */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Included features</p>
          <div className="grid grid-cols-2 gap-1">
            {features.map((f) => (
              <div key={f.label} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 bg-muted/50">
                <span className="text-sm leading-none">{f.icon}</span>
                <span className="text-[11px] text-foreground/80 leading-tight">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreditsPage() {
  const { user } = Route.useRouteContext();
  const { quota: cQuota, quotaLoading: cLoad } = useUsageLimit(user.id, "cerebras");
  const { quota: gQuota, quotaLoading: gLoad } = useUsageLimit(user.id, "groq");

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 px-6 py-8 text-white shadow-xl">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/5" />
        <div className="absolute -bottom-8 -left-8 h-36 w-36 rounded-full bg-white/5" />
        <div className="relative">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-sm font-semibold tracking-wide opacity-90">Credit Reminder</span>
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">Your Daily AI Credits</h1>
          <p className="mt-2 max-w-lg text-sm opacity-80">
            ScorpStudy gives you free AI credits every day — automatically refreshed at midnight UTC.
            Credits are split into two pools based on the AI engine powering each feature.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur-sm">
              <Brain className="h-4 w-4" />
              <span>Cerebras Pool — {CEREBRAS_DAILY_LIMIT} credits</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur-sm">
              <Zap className="h-4 w-4" />
              <span>Groq Pool — {GROQ_DAILY_LIMIT} credits</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pool cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PoolCard
          title="Cerebras Pool"
          subtitle="Powers deep-thinking, long-answer features"
          used={cQuota?.used ?? 0}
          limit={CEREBRAS_DAILY_LIMIT}
          loading={cLoad}
          features={CEREBRAS_FEATURES}
          gradient="bg-gradient-to-br from-violet-400 via-purple-400 to-pink-400"
          iconBg="bg-violet-100 dark:bg-violet-900/40"
          Icon={Brain}
          accentColor="text-violet-600 dark:text-violet-400"
          barColor="bg-gradient-to-r from-violet-500 to-pink-500"
          badgeColor="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
        />
        <PoolCard
          title="Groq Pool"
          subtitle="Powers fast, conversational features"
          used={gQuota?.used ?? 0}
          limit={GROQ_DAILY_LIMIT}
          loading={gLoad}
          features={GROQ_FEATURES}
          gradient="bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400"
          iconBg="bg-amber-100 dark:bg-amber-900/40"
          Icon={Zap}
          accentColor="text-amber-600 dark:text-amber-400"
          barColor="bg-gradient-to-r from-amber-500 to-orange-500"
          badgeColor="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        />
      </div>

      {/* How it works */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="font-bold">How credits work</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: <FlaskConical className="h-5 w-5 text-violet-500" />,
              title: "1 credit per generation",
              desc: "Each time you generate content with an AI feature, 1 credit is deducted from the matching pool.",
            },
            {
              icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
              title: "Resets every day",
              desc: "Both pools reset at midnight UTC. You always get a fresh allocation — no rollover needed.",
            },
            {
              icon: <Sparkles className="h-5 w-5 text-amber-500" />,
              title: "Shared across features",
              desc: "All Cerebras features share the same 10-credit pool. All Groq features share the 20-credit pool.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl bg-muted/50 p-4 space-y-2">
              <div className="flex items-center gap-2">
                {item.icon}
                <span className="text-sm font-semibold">{item.title}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tip */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800/50 dark:bg-amber-900/10">
        <span className="text-lg mt-0.5">💡</span>
        <p className="text-amber-800 dark:text-amber-300">
          <strong>Tip:</strong> If you see &quot;Your today's free limit is exceeded. Try again Tomorrow.&quot; — your pool for that feature group is empty for the day. The other pool may still have credits available.
        </p>
      </div>
    </div>
  );
}
