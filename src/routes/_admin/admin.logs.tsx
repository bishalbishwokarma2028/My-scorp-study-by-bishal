import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, ScrollText, Brain, Zap, Download, RefreshCw, Users2 } from "lucide-react";
import { toast } from "sonner";
import { adminApiCallLogServer, adminListUsersServer } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/logs")({
  component: AdminLogs,
});

type LogRow = Awaited<ReturnType<typeof adminApiCallLogServer>>[number];
type PoolFilter = "all" | "cerebras" | "groq";

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

function AdminLogs() {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [emailById, setEmailById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<PoolFilter>("all");

  async function load(showSpinner: boolean) {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const [logs, usersRes] = await Promise.all([
        adminApiCallLogServer(),
        adminListUsersServer({ data: { page: 1, perPage: 200 } }),
      ]);
      setRows(logs as LogRow[]);
      setEmailById(new Map(usersRes.users.map((u) => [u.id, u.email])));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load(true);
  }, []);

  const filtered = useMemo(() => (rows ?? []).filter((r) => filter === "all" || r.pool === filter), [rows, filter]);

  const stats = useMemo(() => {
    const cerebras = (rows ?? []).filter((r) => r.pool === "cerebras").length;
    const groq = (rows ?? []).filter((r) => r.pool === "groq").length;
    const uniqueUsers = new Set((rows ?? []).map((r) => (r as { user_id?: string }).user_id)).size;
    return { total: rows?.length ?? 0, cerebras, groq, uniqueUsers };
  }, [rows]);

  function exportCsv() {
    if (!filtered.length) return;
    const header = "user_email,engine,created_at\n";
    const body = filtered
      .map((r) => {
        const email = emailById.get((r as { user_id?: string }).user_id ?? "") ?? r.user_email ?? "";
        const engine = r.pool === "cerebras" ? "Deep Engine" : "Rapid Engine";
        return `${email},${engine},${r.created_at}`;
      })
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `request-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !rows) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Request Logs</h1>
          <p className="mt-1 text-sm text-slate-500">
            Most recent 300 AI requests — who made them, and which engine (Deep = Cerebras, Rapid = Groq) handled it.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => load(false)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={!filtered.length}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={ScrollText} label="Total logged" value={stats.total} accent="bg-slate-700/50 text-slate-300" />
        <StatCard icon={Brain} label="Deep Engine" value={stats.cerebras} accent="bg-violet-500/15 text-violet-400" />
        <StatCard icon={Zap} label="Rapid Engine" value={stats.groq} accent="bg-amber-500/15 text-amber-400" />
        <StatCard icon={Users2} label="Unique users" value={stats.uniqueUsers} accent="bg-sky-500/15 text-sky-400" />
      </div>

      <div className="flex gap-2">
        {(["all", "cerebras", "groq"] as PoolFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
            }`}
          >
            {f === "all" ? "All" : f === "cerebras" ? "Deep Engine" : "Rapid Engine"}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 text-slate-500">
          <ScrollText className="h-6 w-6" />
          <span className="text-sm">
            {rows.length === 0 ? "No requests logged yet. Logs appear as users use AI features." : "No requests match this filter."}
          </span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Engine</th>
                <th className="px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/50">
              {filtered.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-slate-300">
                    {emailById.get((r as { user_id?: string }).user_id ?? "") ?? r.user_email ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.pool === "cerebras" ? "bg-violet-500/15 text-violet-300" : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {r.pool === "cerebras" ? <Brain className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                      {r.pool === "cerebras" ? "Deep Engine" : "Rapid Engine"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
