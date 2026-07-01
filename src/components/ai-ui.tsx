import { Loader2 } from "lucide-react";
import type { QuotaState } from "@/hooks/useUsageLimit";

export function AiThinking({ label = "ScorpStudy AI is thinking..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-primary" /> {label}
    </div>
  );
}

export function ProviderBadge({ provider }: { provider: string | null }) {
  if (!provider || provider === "none") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      {provider}
    </span>
  );
}

/**
 * Shared daily-credit badge shown at the top of every AI feature.
 * Displays "Daily Credits: X / 30"
 */
export function QuotaBadge({ quota, loading }: { quota: QuotaState | null; loading?: boolean }) {
  if (loading) return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> Loading credits…
    </div>
  );
  if (!quota) return null;
  const exhausted = quota.remaining === 0;
  const pct = Math.round((quota.remaining / quota.limit) * 100);
  const barColor = pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className={`inline-flex items-center gap-2.5 rounded-full border px-3 py-1.5 text-[11px] font-medium ${exhausted ? "border-red-300 bg-red-50 text-red-700" : "border-violet-200 bg-violet-50 text-violet-700"}`}>
      {/* Mini progress bar */}
      <div className="h-1.5 w-16 rounded-full bg-black/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span>
        <strong>{quota.remaining}</strong>
        <span className="opacity-60"> / {quota.limit}</span>
        <span className="ml-1 opacity-70">daily credits</span>
      </span>
      {exhausted && <span className="ml-0.5">🔒</span>}
    </div>
  );
}
