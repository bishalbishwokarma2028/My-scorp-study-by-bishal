import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import React from "react";
import { Loader2, Download, Copy, Check, FileText, RefreshCw, BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askAI } from "@/lib/aiProvider";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge, ProviderBadge } from "@/components/ai-ui";
import { usePageState } from "@/lib/pageState";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/formula-sheet")({
  component: FormulaSheetPage,
});

const SUBJECTS = [
  { id: "physics",    label: "⚡ Physics" },
  { id: "math",       label: "📐 Mathematics" },
  { id: "chemistry",  label: "🧪 Chemistry" },
  { id: "biology",    label: "🧬 Biology" },
  { id: "economics",  label: "📈 Economics" },
  { id: "computer",   label: "💻 Computer Science" },
  { id: "statistics", label: "📊 Statistics" },
  { id: "accounting", label: "🧾 Accounting" },
];

const QUICK_TOPICS: Record<string, string[]> = {
  physics:    ["Mechanics & Motion","Electricity & Magnetism","Thermodynamics","Waves & Optics","Modern Physics","Gravitation","Work, Energy & Power"],
  math:       ["Algebra & Functions","Trigonometry","Calculus (Differentiation)","Calculus (Integration)","Coordinate Geometry","Matrices & Determinants","Probability & Statistics"],
  chemistry:  ["Atomic Structure","Chemical Bonding","Thermochemistry","Electrochemistry","Acids & Bases","Organic Chemistry","Gas Laws"],
  biology:    ["Cell Biology","Genetics & DNA","Photosynthesis","Respiration","Enzymes & Metabolism","Ecology","Human Physiology"],
  economics:  ["Supply & Demand","Elasticity","National Income (GDP)","Inflation & Monetary Policy","Cost & Revenue","Market Structures","International Trade"],
  computer:   ["Time Complexity (Big O)","Sorting Algorithms","Graph Algorithms","Binary & Number Systems","Boolean Algebra","Networking Formulas","Database Normalization"],
  statistics: ["Descriptive Statistics","Probability Rules","Distributions","Hypothesis Testing","Correlation & Regression","Sampling & Estimation","Bayes Theorem"],
  accounting: ["Balance Sheet","Income Statement","Ratio Analysis","Depreciation Methods","Cash Flow","Break-Even Analysis","Journal Entries"],
};

const FORMAT_OPTIONS = [
  { id: "full",    label: "Full Sheet",  desc: "All formulas with variable definitions & examples" },
  { id: "compact", label: "Compact",    desc: "Formulas + variable meanings only" },
  { id: "exam",    label: "Exam Ready", desc: "Top formulas with quick-reference tips" },
];

type PageState = {
  subject: string;
  topic: string;
  format: string;
  sheet: string | null;
  provider: string | null;
};

/* ─── Custom Markdown Components ──────────────────────────────────────── */
function makeComponents() {
  const SECTION_COLORS: Record<number, { bg: string; border: string; text: string; dot: string }> = {
    0: { bg: "bg-violet-50",  border: "border-violet-400", text: "text-violet-900", dot: "bg-violet-500" },
    1: { bg: "bg-blue-50",    border: "border-blue-400",   text: "text-blue-900",   dot: "bg-blue-500"   },
    2: { bg: "bg-emerald-50", border: "border-emerald-400",text: "text-emerald-900",dot: "bg-emerald-500"},
    3: { bg: "bg-amber-50",   border: "border-amber-400",  text: "text-amber-900",  dot: "bg-amber-500"  },
    4: { bg: "bg-rose-50",    border: "border-rose-400",   text: "text-rose-900",   dot: "bg-rose-500"   },
    5: { bg: "bg-cyan-50",    border: "border-cyan-400",   text: "text-cyan-900",   dot: "bg-cyan-500"   },
  };
  let sectionIdx = 0;

  return {
    h2({ children }: { children?: React.ReactNode }) {
      const c = SECTION_COLORS[sectionIdx++ % 6];
      return (
        <div className={`flex items-center gap-3 rounded-2xl border-l-4 ${c.border} ${c.bg} px-4 py-3 mt-7 mb-4`}>
          <span className={`h-2.5 w-2.5 rounded-full ${c.dot} flex-shrink-0`} />
          <h2 className={`text-base font-bold ${c.text}`}>{children}</h2>
        </div>
      );
    },

    h3({ children }: { children?: React.ReactNode }) {
      return (
        <h3 className="mt-4 mb-1.5 text-sm font-semibold text-foreground flex items-center gap-1.5">
          <span className="text-muted-foreground">▸</span> {children}
        </h3>
      );
    },

    blockquote({ children }: { children?: React.ReactNode }) {
      return (
        <div className="my-3 max-w-full overflow-x-auto rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 px-3 py-3 sm:px-5 sm:py-4 shadow-sm">
          <div className="min-w-max text-center text-base sm:text-xl font-bold tracking-wide text-violet-800 font-mono leading-relaxed mx-auto">
            {children}
          </div>
        </div>
      );
    },

    code({ inline, children }: { inline?: boolean; children?: React.ReactNode }) {
      if (inline) {
        return (
          <code className="rounded-lg bg-violet-100 px-1.5 py-0.5 text-xs sm:text-sm font-bold font-mono text-violet-700 break-words">
            {children}
          </code>
        );
      }
      return (
        <div className="my-3 max-w-full overflow-x-auto rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 px-3 py-3 sm:px-5 sm:py-4 shadow-sm">
          <div className="flex justify-center">
            <span className="text-base sm:text-xl font-bold tracking-wide text-violet-800 font-mono leading-relaxed whitespace-pre inline-block">
              {children}
            </span>
          </div>
        </div>
      );
    },

    pre({ children }: { children?: React.ReactNode }) {
      return <>{children}</>;
    },

    strong({ children }: { children?: React.ReactNode }) {
      return <strong className="font-bold text-foreground">{children}</strong>;
    },

    em({ children }: { children?: React.ReactNode }) {
      return <em className="text-violet-700 font-semibold not-italic">{children}</em>;
    },

    ul({ children }: { children?: React.ReactNode }) {
      return <ul className="my-2 space-y-1.5 pl-1">{children}</ul>;
    },

    li({ children }: { children?: React.ReactNode }) {
      return (
        <li className="flex items-start gap-2 text-sm text-foreground leading-snug">
          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-violet-400 flex-shrink-0" />
          <span>{children}</span>
        </li>
      );
    },

    p({ children }: { children?: React.ReactNode }) {
      const text = String(children);
      if (text.startsWith("💡") || text.startsWith("✅")) {
        return (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
            {children}
          </div>
        );
      }
      if (text.startsWith("⚠️") || text.startsWith("❌")) {
        return (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
            {children}
          </div>
        );
      }
      if (text.startsWith("📌") || text.startsWith("🧠")) {
        return (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm text-blue-800">
            {children}
          </div>
        );
      }
      return <p className="my-1.5 text-sm leading-relaxed text-foreground">{children}</p>;
    },

    table({ children }: { children?: React.ReactNode }) {
      return (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border shadow-sm">
          <table className="w-full border-collapse text-sm">{children}</table>
        </div>
      );
    },
    thead({ children }: { children?: React.ReactNode }) {
      return <thead className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white">{children}</thead>;
    },
    th({ children }: { children?: React.ReactNode }) {
      return <th className="px-4 py-2.5 text-left text-xs font-bold tracking-wide">{children}</th>;
    },
    td({ children }: { children?: React.ReactNode }) {
      return <td className="border-t border-border px-4 py-2 text-xs font-mono">{children}</td>;
    },
    tr({ children }: { children?: React.ReactNode }) {
      return <tr className="even:bg-muted/30 transition hover:bg-violet-50/40">{children}</tr>;
    },
    hr() {
      return <hr className="my-5 border-dashed border-border" />;
    },
  };
}

/* ─── Page ────────────────────────────────────────────────────────────── */
function FormulaSheetPage() {
  const { user } = Route.useRouteContext();
  const [s, set] = usePageState<PageState>("formula-sheet", {
    subject: "physics", topic: "", format: "full", sheet: null, provider: null,
  });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied]   = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "formula_sheet");

  const quickTopics = QUICK_TOPICS[s.subject] ?? [];

  async function generate() {
    if (!s.topic.trim()) return toast.error("Enter a chapter or topic first");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true);
    set({ sheet: null, provider: null });

    const subjectLabel = SUBJECTS.find(x => x.id === s.subject)?.label.replace(/[^a-zA-Z ]/g, "").trim();

    const formatInstr = s.format === "full"
      ? `For EACH formula:
1. Write the formula in a code block using proper Unicode math symbols
2. Use a bullet list to define every variable with its unit in simple words
3. Give a step-by-step worked example a beginner can follow
4. Where a derivation or proof is mathematically possible/standard, include a short "Derivation" section showing the key steps from first principles to the final formula
5. Add a 💡 Tip or ⚠️ Common Mistake line`
      : s.format === "compact"
      ? `For EACH formula:
1. Write the formula in a code block using proper Unicode math symbols
2. Define each variable in simple one-line bullets`
      : `List the most exam-important formulas for this topic (do not artificially cap the count — include every formula a student could be tested on).
For each:
1. Formula in a code block with Unicode math symbols
2. Quick variable meanings
3. One 💡 Tip or ⚠️ Common Mistake`;

    const prompt = `Generate a COMPLETE, exhaustive, beautiful, easy-to-understand formula sheet for:

Subject: ${subjectLabel}
Topic: ${s.topic.trim()}
Format: ${FORMAT_OPTIONS.find(x => x.id === s.format)?.label}

CRITICAL RULES — follow these exactly:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. COMPLETENESS — This is the #1 priority. Before writing, mentally list EVERY formula, law, theorem, identity, and equation that belongs to "${s.topic.trim()}" at a standard school/college syllabus level — including special cases, alternate forms, and related sub-formulas (e.g. for Trigonometry: not just sin/cos/tan but also reciprocal ratios, Pythagorean identities, sum/difference formulas, double angle, half angle, product-to-sum, law of sines/cosines if relevant). Do NOT stop early or truncate the list. Nothing important should be missing. If the topic naturally has more than 15-20 formulas, include all of them, grouped logically — do not artificially limit the count.

2. FORMULA DISPLAY — Always put each formula in a fenced code block:
\`\`\`
v = u + at
\`\`\`
   Use REAL Unicode symbols, never abbreviations or words:
   • Superscripts: ² ³ ⁴ ⁻¹ ⁻² (never write "^2" or "^3")
   • Fractions: write as  numerator / denominator  with spaces
   • Square root: use √ symbol (e.g. √(a² + b²)), cube root ∛
   • Greek letters: α β γ δ θ λ μ π σ τ ω Δ Σ Ω ρ φ ε η
   • Arrows/operators: → ≈ ≠ ≤ ≥ × ÷ ∝ ∞ ∴ ∵ ∈ ∀ ∃
   • Subscripts: write as v₀ v₁ v₂ or V_initial (clear labelling)
   • Integrals: ∫ f(x) dx   Summations: Σᵢ xᵢ   Products: Πᵢ xᵢ
   • Keep each formula SHORT on one line where possible — split very long formulas across two code blocks rather than one extremely wide line, since this must render well on narrow mobile screens
   EXAMPLES of good formula writing:
   v² = u² + 2as
   F = (G × m₁ × m₂) / r²
   E = mc²
   sin²θ + cos²θ = 1
   x = (-b ± √(b² - 4ac)) / 2a
   Q = mcΔT

3. STRUCTURE — Use this exact format for each formula group:

## [emoji] [Group Name]

### [Formula Name]
\`\`\`
[formula with Unicode symbols]
\`\`\`
**Where:**
- **symbol** — plain-English meaning (unit)
- **symbol** — plain-English meaning (unit)

[Only for Full Sheet, when a derivation is standard/possible] **Derivation:**
1. [starting principle/definition]
2. [algebraic/logical step]
3. [algebraic/logical step]
4. [final formula reached] — proof complete ∎

[Only for Full Sheet] **Example:** [step-by-step solution a 10-year-old could follow]

💡 Tip: [one clear, useful tip] OR ⚠️ Common Mistake: [one mistake to avoid]

4. LANGUAGE — Explain everything in PLAIN SIMPLE English. Write variable definitions as if explaining to a student who has never seen this topic. Use everyday analogies where helpful.

5. At the very end, add:
## 📋 Quick Reference Table
with columns: Formula | What It Finds | Key Variables
— this table must list EVERY formula covered above, not a subset.

6. Cover ALL formulas for the topic exhaustively — completeness matters more than brevity. Never say "and more" or "etc." — always spell out every remaining item explicitly.

${formatInstr}`;

    const res = await askAI(prompt,
      "You are an expert teacher and mathematician who produces exhaustive, complete formula references — you never skip or truncate formulas for the sake of brevity. Always use Unicode math symbols (², ³, √, θ, π, α, Δ etc.) directly in formula code blocks — never write '^2' or '^3'. Include short derivations/proofs from first principles whenever mathematically standard. Write variable explanations in plain, simple English that any student can understand. Use proper markdown structure exactly as instructed. Never reveal AI provider names.");
    set({ sheet: res.text, provider: res.provider });
    await bump();
    setLoading(false);
  }

  function copySheet() {
    if (!s.sheet) return;
    navigator.clipboard.writeText(s.sheet);
    setCopied(true);
    toast.success("Formula sheet copied!");
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadSheet() {
    if (!s.sheet) return;
    const blob = new Blob([s.sheet], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `${s.subject}-${s.topic.slice(0, 30).replace(/\s+/g, "-")}-formula-sheet.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded as Markdown");
  }

  const mdComponents = makeComponents();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FileText className="h-5 w-5 text-primary" /> Formula Sheet Generator
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Beautiful, symbol-rich formula sheets anyone can understand
          </p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      <div className="card-soft p-5 space-y-5">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subject</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUBJECTS.map(sub => (
              <button key={sub.id} onClick={() => set({ subject: sub.id, topic: "" })}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${s.subject === sub.id ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-background hover:bg-accent"}`}>
                {sub.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chapter / Topic</label>
          <input
            value={s.topic}
            onChange={e => set({ topic: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter" && !loading) generate(); }}
            placeholder="e.g. Thermodynamics, Quadratic Equations, Organic Reactions…"
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {quickTopics.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quickTopics.map(t => (
                <button key={t} onClick={() => set({ topic: t })}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] hover:bg-accent hover:border-primary/40 transition">
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Format</label>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {FORMAT_OPTIONS.map(f => (
              <button key={f.id} onClick={() => set({ format: f.id })}
                className={`rounded-xl border p-3 text-left transition ${s.format === f.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}>
                <div className={`text-sm font-semibold ${s.format === f.id ? "text-primary" : ""}`}>{f.label}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{f.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <button onClick={generate} disabled={loading || !s.topic.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 hover:opacity-90 transition">
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating Formula Sheet…</>
            : <><FileText className="h-4 w-4" /> Generate Formula Sheet</>}
        </button>
      </div>

      {loading && (
        <div className="card-soft flex flex-col items-center gap-3 py-14 text-center">
          <div className="relative">
            <Loader2 className="h-12 w-12 animate-spin text-violet-300" />
            <span className="absolute inset-0 flex items-center justify-center text-xl">📐</span>
          </div>
          <p className="text-sm font-semibold">Building your formula sheet…</p>
          <p className="text-xs text-muted-foreground">Generating formulas with proper symbols and examples</p>
        </div>
      )}

      {!loading && s.sheet && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">{s.topic}</span>
              <ProviderBadge provider={s.provider} />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={copySheet}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent transition">
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied!" : "Copy"}
              </button>
              <button onClick={downloadSheet}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent transition">
                <Download className="h-3 w-3" /> Download
              </button>
              <button onClick={() => set({ sheet: null, topic: "" })}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent transition">
                <RefreshCw className="h-3 w-3" /> New Sheet
              </button>
            </div>
          </div>

          <div ref={sheetRef} className="card-soft p-5 sm:p-7">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents as never}>
              {s.sheet}
            </ReactMarkdown>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            💡 Download as Markdown and open in Notion, Obsidian, or any notes app for perfect formatting
          </p>
        </div>
      )}

      {!loading && !s.sheet && (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2">💡 Tips for best results</p>
          <div className="grid gap-1 sm:grid-cols-2 text-xs text-muted-foreground">
            <span>• Use <strong>Full Sheet</strong> for deep study sessions and revision</span>
            <span>• Use <strong>Compact</strong> for quick lookups during problem-solving</span>
            <span>• Use <strong>Exam Ready</strong> the night before your exam</span>
            <span>• Be specific — "Chapter 4: Thermodynamics" beats just "Chemistry"</span>
          </div>
        </div>
      )}
    </div>
  );
}
