import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, BarChart3, TrendingUp, Brain, Zap, Trophy } from "lucide-react";
import { toast } from "sonner";
import { adminUsageStatsServer, adminTopUsersServer, adminListUsersServer } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/usage")({
  component: AdminUsage,
});

type Day = { date: string; cerebras: number; groq: number; other: number };
type TopUser = Awaited<ReturnType<typeof adminTopUsersServer>>[number];

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${accent}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function AdminUsage() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [topUsers, setTopUsers] = useState<TopUser[] | null>(null);
  const [emailById, setEmailById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminUsageStatsServer(), adminTopUsersServer(), adminListUsersServer({ data: { page: 1, perPage: 200 } })])
      .then(([d, top, usersRes]) => {
        setDays(d as Day[]);
        setTopUsers(top);
        setEmailById(new Map(usersRes.users.map((u) => [u.id, u.email])));
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(() => {
    if (!days) return { cerebras: 0, groq: 0, total: 0, avgPerDay: 0 };
    const cerebras = days.reduce((s, d) => s + d.cerebras, 0);
    const groq = days.reduce((s, d) => s + d.groq, 0);
    const total = cerebras + groq;
    return { cerebras, groq, total, avgPerDay: days.length ? Math.round(total / days.length) : 0 };
  }, [days]);

  if (loading || !days) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const max = Math.max(1, ...days.map((d) => d.cerebras + d.groq));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Usage Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">Requests per engine over the last 14 days.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={TrendingUp} label="Total requests (14d)" value={totals.total} accent="bg-emerald-500/15 text-emerald-400" />
        <StatCard icon={Brain} label="Deep Engine" value={totals.cerebras} accent="bg-violet-500/15 text-violet-400" />
        <StatCard icon={Zap} label="Rapid Engine" value={totals.groq} accent="bg-amber-500/15 text-amber-400" />
        <StatCard icon={BarChart3} label="Avg / day" value={totals.avgPerDay} accent="bg-sky-500/15 text-sky-400" />
      </div>

      {days.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 text-slate-500">
          <BarChart3 className="h-6 w-6" />
          <span className="text-sm">No usage recorded yet.</span>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-900/60 p-5">
          <div className="mb-4 flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-b from-violet-400 to-violet-600" /> Deep Engine
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-b from-amber-300 to-amber-500" /> Rapid Engine
            </span>
          </div>
          <div className="flex h-48 items-end gap-2">
            {days.map((d) => (
              <div key={d.date} className="group flex flex-1 flex-col items-center gap-1">
                <div className="relative flex w-full flex-col-reverse gap-0.5" style={{ height: "160px" }}>
                  <div
                    className="w-full rounded-sm bg-gradient-to-t from-violet-600 to-violet-400 transition-all group-hover:brightness-110"
                    style={{ height: `${(d.cerebras / max) * 160}px` }}
                    title={`Deep Engine: ${d.cerebras}`}
                  />
                  <div
                    className="w-full rounded-sm bg-gradient-to-t from-amber-500 to-amber-300 transition-all group-hover:brightness-110"
                    style={{ height: `${(d.groq / max) * 160}px` }}
                    title={`Rapid Engine: ${d.groq}`}
                  />
                  <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    {d.cerebras + d.groq}
                  </div>
                </div>
                <span className="text-[10px] text-slate-600">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <Trophy className="h-4 w-4 text-amber-400" /> Top users (14d)
        </h2>
        {!topUsers || topUsers.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-sm text-slate-500">
            No usage yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3 text-right">Deep</th>
                  <th className="px-4 py-3 text-right">Rapid</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                {topUsers.map((u, i) => (
                  <tr key={u.userId}>
                    <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                    <td className="px-4 py-3 text-slate-200">{u.fullName || emailById.get(u.userId) || u.userId.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-right text-violet-300">{u.cerebras}</td>
                    <td className="px-4 py-3 text-right text-amber-300">{u.groq}</td>
                    <td className="px-4 py-3 text-right font-semibold text-white">{u.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
