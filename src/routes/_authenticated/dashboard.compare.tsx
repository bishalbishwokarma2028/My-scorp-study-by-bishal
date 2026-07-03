import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Loader2, GitCompare, RefreshCw, Lightbulb, BookOpen, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { askAIJSON } from "@/lib/aiProvider";
import { ProviderBadge, QuotaBadge } from "@/components/ai-ui";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { usePageState } from "@/lib/pageState";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/compare")({
  component: ComparePage,
});

const CATEGORIES = [
  "Auto-detect","Biology","Chemistry","Physics","Mathematics",
  "Computer Science","History","Economics","Literature",
  "Psychology","Engineering","Business","Philosophy","Geography",
];

type Comparison = {
  conceptA: {
    name: string; overview: string; keyFeatures: string[];
    advantages: string[]; disadvantages: string[]; usedFor: string;
  };
  conceptB: {
    name: string; overview: string; keyFeatures: string[];
    advantages: string[]; disadvantages: string[]; usedFor: string;
  };
  similarities: string[];
  differences: { aspect: string; a: string; b: string }[];
  memoryTrick: string;
  examTip: string;
};

const EXAMPLE_PAIRS = [
  ["Mitosis","Meiosis"],["TCP","UDP"],["Stack","Queue"],
  ["Capitalism","Socialism"],["Classical Conditioning","Operant Conditioning"],
  ["Photosynthesis","Respiration"],
];

const COL_COLORS = {
  a: { bg: "bg-blue-50", border: "border-blue-200", header: "bg-blue-600 text-white" },
  b: { bg: "bg-violet-50", border: "border-violet-200", header: "bg-violet-600 text-white" },
};

function ComparePage() {
  const { user } = Route.useRouteContext();

  // Persisted across route changes
  const [s, set, clear] = usePageState("compare", {
    conceptA: "", conceptB: "", category: "Auto-detect",
    result: null as Comparison | null, provider: null as string | null,
  });

  // Transient UI state
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "compare");

  // Restore from History navigation
  useEffect(() => {
    const raw = sessionStorage.getItem("scorp_compare_restore");
    if (raw) {
      try { set(JSON.parse(raw)); } catch {}
      sessionStorage.removeItem("scorp_compare_restore");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadExample(pair: string[]) {
    set({ conceptA: pair[0], conceptB: pair[1], result: null, provider: null });
  }

  async function generate() {
    if (!s.conceptA.trim() || !s.conceptB.trim()) return toast.error("Enter both concepts to compare");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true);
    set({ result: null });

    const catNote = s.category !== "Auto-detect" ? ` (subject: ${s.category})` : "";
    const prompt = `Compare "${s.conceptA.trim()}" vs "${s.conceptB.trim()}"${catNote} for a student.

Return STRICT JSON only — no prose, no markdown fences:
{
  "conceptA": {
    "name": "${s.conceptA.trim()}",
    "overview": "2-3 sentence clear definition",
    "keyFeatures": ["feature 1","feature 2","feature 3","feature 4"],
    "advantages": ["advantage 1","advantage 2","advantage 3"],
    "disadvantages": ["disadvantage 1","disadvantage 2"],
    "usedFor": "1 sentence on when/where this is used"
  },
  "conceptB": {
    "name": "${s.conceptB.trim()}",
    "overview": "2-3 sentence clear definition",
    "keyFeatures": ["feature 1","feature 2","feature 3","feature 4"],
    "advantages": ["advantage 1","advantage 2","advantage 3"],
    "disadvantages": ["disadvantage 1","disadvantage 2"],
    "usedFor": "1 sentence on when/where this is used"
  },
  "similarities": ["similarity 1","similarity 2","similarity 3","similarity 4"],
  "differences": [
    {"aspect":"Purpose","a":"...","b":"..."},
    {"aspect":"Process/Mechanism","a":"...","b":"..."},
    {"aspect":"Outcome/Result","a":"...","b":"..."},
    {"aspect":"Complexity","a":"...","b":"..."},
    {"aspect":"Application","a":"...","b":"..."}
  ],
  "memoryTrick": "A fun, memorable mnemonic or trick to remember the key difference",
  "examTip": "The single most important thing to remember in an exam about these two concepts"
}`;

    const { data: parsed, provider: prov } = await askAIJSON<Comparison>(prompt);
    set({ provider: prov });
    await bump();
    if (!parsed || !parsed.conceptA || !parsed.conceptB) {
      toast.error("Couldn't build the comparison — please try again");
    } else {
      set({ result: parsed });
      // Save to history (non-blocking)
      supabase.from("compare_history" as never).insert({
        user_id: user.id,
        concept_a: s.conceptA.trim(),
        concept_b: s.conceptB.trim(),
        category: s.category,
        result: parsed as never,
        provider: prov,
      } as never).then(() => {});
    }
    setLoading(false);
  }

  async function copyAll() {
    if (!s.result) return;
    const r = s.result;
    const text = [
      `# ${r.conceptA.name} vs ${r.conceptB.name}`,
      `\n## ${r.conceptA.name}\n${r.conceptA.overview}`,
      `\n## ${r.conceptB.name}\n${r.conceptB.overview}`,
      `\n## Similarities\n${r.similarities.map(x => `• ${x}`).join("\n")}`,
      `\n## Key Differences\n${r.differences.map(d => `**${d.aspect}**: ${d.a} vs ${d.b}`).join("\n")}`,
      `\n## Memory Trick\n${r.memoryTrick}`,
      `\n## Exam Tip\n${r.examTip}`,
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <GitCompare className="h-5 w-5 text-primary" /> Comparative Learning
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Compare any two concepts side-by-side — similarities, differences, memory tricks &amp; exam tips
          </p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      {/* Input card */}
      <div className="card-soft p-5 space-y-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Quick examples:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PAIRS.map(([a, b]) => (
              <button key={a+b} onClick={() => loadExample([a, b])}
                className="rounded-full border border-border bg-background px-3 py-1 text-xs hover:bg-accent">
                {a} vs {b}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <div>
            <label className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Concept A</label>
            <input value={s.conceptA} onChange={e => set({ conceptA: e.target.value })}
              placeholder="e.g. Mitosis"
              className="mt-1.5 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div className="flex items-end justify-center pb-1">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-sm font-bold text-muted-foreground">vs</div>
          </div>
          <div>
            <label className="text-xs font-semibold text-violet-600 uppercase tracking-wide">Concept B</label>
            <input value={s.conceptB} onChange={e => set({ conceptB: e.target.value })}
              placeholder="e.g. Meiosis"
              className="mt-1.5 w-full rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs font-medium text-muted-foreground">Subject / Category</label>
            <select value={s.category} onChange={e => set({ category: e.target.value })}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={generate} disabled={loading || !s.conceptA.trim() || !s.conceptB.trim()}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Comparing…</> : <><GitCompare className="h-4 w-4" />Compare</>}
          </button>
          {s.result && (
            <button onClick={clear} className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent">
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="card-soft flex flex-col items-center gap-3 py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">AI is building a deep comparison…</p>
        </div>
      )}

      {!loading && s.result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-base font-bold">
              {s.result.conceptA.name} <span className="font-normal text-muted-foreground">vs</span> {s.result.conceptB.name}
            </h3>
            <div className="flex items-center gap-2">
              <ProviderBadge provider={s.provider} />
              <button onClick={copyAll}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent">
                {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy all"}
              </button>
            </div>
          </div>

          {/* Side-by-side overview */}
          <div className="grid gap-4 sm:grid-cols-2">
            {(["a","b"] as const).map(side => {
              const c = side === "a" ? s.result!.conceptA : s.result!.conceptB;
              const col = COL_COLORS[side];
              return (
                <div key={side} className={`rounded-xl border ${col.border} ${col.bg} p-4 space-y-3`}>
                  <div className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${col.header}`}>{c.name}</div>
                  <p className="text-sm leading-relaxed">{c.overview}</p>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Key Features</p>
                    <ul className="space-y-1">
                      {c.keyFeatures.map((f,i) => <li key={i} className="flex items-start gap-1.5 text-xs"><span className="mt-0.5 text-primary">•</span>{f}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 mb-1">✅ Advantages</p>
                    <ul className="space-y-1">{c.advantages.map((a,i) => <li key={i} className="text-xs text-emerald-800">• {a}</li>)}</ul>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500 mb-1">⚠️ Limitations</p>
                    <ul className="space-y-1">{c.disadvantages.map((d,i) => <li key={i} className="text-xs text-red-700">• {d}</li>)}</ul>
                  </div>
                  <div className="rounded-lg bg-white/60 px-3 py-2 text-xs">
                    <span className="font-semibold">Used for: </span>{c.usedFor}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Similarities */}
          <div className="card-soft p-4">
            <p className="mb-3 text-sm font-semibold">🟢 Similarities</p>
            <div className="flex flex-wrap gap-2">
              {s.result.similarities.map((sim,i) => (
                <span key={i} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-800">{sim}</span>
              ))}
            </div>
          </div>

          {/* Differences table */}
          <div className="card-soft overflow-hidden p-0">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">⚡ Key Differences</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-1/4">Aspect</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-blue-600">{s.result.conceptA.name}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-violet-600">{s.result.conceptB.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.result.differences.map((d,i) => (
                    <tr key={i} className={`border-b border-border last:border-0 ${i%2===0?"":"bg-muted/20"}`}>
                      <td className="px-4 py-3 text-xs font-semibold text-muted-foreground">{d.aspect}</td>
                      <td className="px-4 py-3 text-xs text-blue-800 bg-blue-50/50">{d.a}</td>
                      <td className="px-4 py-3 text-xs text-violet-800 bg-violet-50/50">{d.b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Memory trick + Exam tip */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                <Lightbulb className="h-4 w-4" /> Memory Trick
              </p>
              <p className="text-sm text-amber-900">{s.result.memoryTrick}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-blue-700">
                <BookOpen className="h-4 w-4" /> Exam Tip
              </p>
              <p className="text-sm text-blue-900">{s.result.examTip}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
