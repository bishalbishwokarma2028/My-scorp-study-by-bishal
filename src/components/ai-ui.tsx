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
 * Compact quota strip shown at the top of each AI feature.
 * Displays "Remaining: X / N  •  Used Today: X"
 */
export function QuotaBadge({ quota, loading }: { quota: QuotaState | null; loading?: boolean }) {
  if (loading) return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> Loading usage…
    </div>
  );
  if (!quota) return null;
  const exhausted = quota.remaining === 0;
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium ${exhausted ? "border-red-300 bg-red-50 text-red-700" : "border-violet-200 bg-violet-50 text-violet-700"}`}>
      <span>Remaining: <strong>{quota.remaining} / {quota.limit}</strong></span>
      <span className="text-[10px] opacity-60">•</span>
      <span>Used Today: <strong>{quota.used}</strong></span>
    </div>
  );
}
