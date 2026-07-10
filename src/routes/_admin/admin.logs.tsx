import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ScrollText, Brain, Zap } from "lucide-react";
import { toast } from "sonner";
import { adminApiCallLogServer, adminListUsersServer } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/logs")({
  component: AdminLogs,
});

type LogRow = Awaited<ReturnType<typeof adminApiCallLogServer>>[number];

function AdminLogs() {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [emailById, setEmailById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminApiCallLogServer(), adminListUsersServer({ data: { page: 1, perPage: 200 } })])
      .then(([logs, usersRes]) => {
        setRows(logs as LogRow[]);
        setEmailById(new Map(usersRes.users.map((u) => [u.id, u.email])));
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !rows) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Request Logs</h1>
        <p className="mt-1 text-sm text-slate-500">
          Most recent 200 AI requests — who made them, and which engine (Deep = Cerebras, Rapid = Groq) handled it.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 text-slate-500">
          <ScrollText className="h-6 w-6" />
          <span className="text-sm">No requests logged yet. Logs appear as users use AI features.</span>
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
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-slate-300">{emailById.get((r as { user_id?: string }).user_id ?? "") ?? r.user_email ?? "—"}</td>
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
