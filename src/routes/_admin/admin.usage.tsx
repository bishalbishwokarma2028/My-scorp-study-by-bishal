import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { adminUsageStatsServer } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/usage")({
  component: AdminUsage,
});

type Day = { date: string; cerebras: number; groq: number; other: number };

function AdminUsage() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminUsageStatsServer()
      .then((d) => setDays(d as Day[]))
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

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

      {days.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 text-slate-500">
          <BarChart3 className="h-6 w-6" />
          <span className="text-sm">No usage recorded yet.</span>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> Deep Engine</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Rapid Engine</span>
          </div>
          <div className="flex h-48 items-end gap-2">
            {days.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-col-reverse gap-0.5" style={{ height: "160px" }}>
                  <div
                    className="w-full rounded-sm bg-violet-500"
                    style={{ height: `${(d.cerebras / max) * 160}px` }}
                    title={`Deep Engine: ${d.cerebras}`}
                  />
                  <div
                    className="w-full rounded-sm bg-amber-500"
                    style={{ height: `${(d.groq / max) * 160}px` }}
                    title={`Rapid Engine: ${d.groq}`}
                  />
                </div>
                <span className="text-[10px] text-slate-600">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
