import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Brain, Zap, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { adminGetPoolLimitsServer, adminSetPoolLimitServer } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/credits")({
  component: AdminCredits,
});

type PoolLimit = { pool: string; daily_limit: number; updated_at: string | null };

function PoolCard({
  icon: Icon,
  name,
  pool,
  value,
  onSave,
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  pool: "cerebras" | "groq";
  value: number;
  onSave: (pool: "cerebras" | "groq", newValue: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(value), [value]);

  const dirty = draft !== value;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(pool, draft);
      toast.success(`${name} daily limit updated to ${draft}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-violet-400" />
        <span className="text-sm font-semibold text-white">{name}</span>
        <span className="ml-auto rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">{pool}</span>
      </div>
      <label className="mb-1.5 block text-xs font-medium text-slate-400">Daily credit limit per user</label>
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={0}
          max={2000}
          value={draft}
          onChange={(e) => setDraft(Math.max(0, Number(e.target.value) || 0))}
          className="w-32 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
        />
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500">Applies instantly to every user's daily quota — no restart needed.</p>
    </div>
  );
}

function AdminCredits() {
  const [limits, setLimits] = useState<PoolLimit[] | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await adminGetPoolLimitsServer();
      setLimits(data as PoolLimit[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(pool: "cerebras" | "groq", dailyLimit: number) {
    await adminSetPoolLimitServer({ data: { pool, dailyLimit } });
    await load();
  }

  if (loading || !limits) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const cerebras = limits.find((l) => l.pool === "cerebras")?.daily_limit ?? 10;
  const groq = limits.find((l) => l.pool === "groq")?.daily_limit ?? 20;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Credit Limits</h1>
        <p className="mt-1 text-sm text-slate-500">Control the daily per-user request quota for each AI engine.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <PoolCard icon={Brain} name="Deep Engine" pool="cerebras" value={cerebras} onSave={save} />
        <PoolCard icon={Zap} name="Rapid Engine" pool="groq" value={groq} onSave={save} />
      </div>
    </div>
  );
}
