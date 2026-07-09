import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Users, Ban, Sparkles, Brain, Zap, Loader2 } from "lucide-react";
import { adminOverviewServer } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/")({
  ssr: false,
  component: AdminOverview,
});

type Overview = Awaited<ReturnType<typeof adminOverviewServer>>;

async function fetchOverview(): Promise<Overview> {
  return adminOverviewServer();
}

function StatCard({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}

function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchOverview()
      .then(setData)
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (err || !data) {
    return <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-400">{err || "Failed to load"}</div>;
  }

  const cerebrasLimit = data.poolLimits.find((p) => p.pool === "cerebras")?.daily_limit ?? 10;
  const groqLimit = data.poolLimits.find((p) => p.pool === "groq")?.daily_limit ?? 20;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Overview</h1>
        <p className="mt-1 text-sm text-slate-500">Live snapshot of your ScorpStudy platform.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Total users" value={data.totalUsers} tone="bg-blue-500/15 text-blue-400" />
        <StatCard icon={Ban} label="Banned users" value={data.bannedUsers} tone="bg-red-500/15 text-red-400" />
        <StatCard icon={Sparkles} label="Unlimited credits" value={data.unlimitedUsers} tone="bg-amber-500/15 text-amber-400" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-semibold text-white">Deep Engine</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {data.usageToday.cerebras} <span className="text-sm font-normal text-slate-500">requests today, across all users</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Per-user daily limit: {cerebrasLimit} credits</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-white">Rapid Engine</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {data.usageToday.groq} <span className="text-sm font-normal text-slate-500">requests today, across all users</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Per-user daily limit: {groqLimit} credits</div>
        </div>
      </div>
    </div>
  );
}
