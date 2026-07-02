import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
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
  { id: "full",    label: "Full Sheet", desc: "All formulas with variable definitions & examples" },
  { id: "compact", label: "Compact",   desc: "Formulas + variable meanings only" },
  { id: "exam",    label: "Exam Ready", desc: "Most important formulas with quick-reference tips" },
];

type PageState = {
  subject: string;
  topic: string;
  format: string;
  sheet: string | null;
  provider: string | null;
};

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

    const formatInstr = s.format === "full"
      ? "Include every relevant formula with: (1) the formula in a code block, (2) each variable defined with its unit, (3) a worked example, and (4) a key exam tip."
      : s.format === "compact"
      ? "List every formula in a code block with a one-line definition of each variable. No worked examples."
      : "List the 10-15 most exam-critical formulas. For each: formula in code block, variable meanings, one crucial exam tip or common mistake to avoid.";

    const prompt = `Generate a comprehensive formula sheet for the following:

Subject: ${SUBJECTS.find(x => x.id === s.subject)?.label.replace(/[^a-zA-Z ]/g, "").trim()}
Chapter / Topic: ${s.topic.trim()}
Format: ${FORMAT_OPTIONS.find(x => x.id === s.format)?.label}

Instructions:
${formatInstr}

Use this structure:
- Use ## for main formula sections (e.g. ## ⚡ Kinematic Equations)
- Use a fenced code block for each formula
- Use **bold** for variable names
- Use bullet points for variable definitions
- Add a 💡 Tip or ⚠️ Common Mistake line under each formula section
- At the end include a ## 📋 Quick Reference Table with all formulas in a markdown table

Make it comprehensive, accurate, and exam-ready. Cover ALL important formulas for this topic.`;

    const res = await askAI(prompt,
      "You are an expert academic formula-sheet generator. Generate precise, structured formula sheets in clean markdown. Use proper math notation. Never reveal AI provider names.");
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FileText className="h-5 w-5 text-primary" /> Formula Sheet Generator
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Generate a complete, printable formula sheet for any subject and chapter
          </p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      <div className="card-soft p-5 space-y-5">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subject</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUBJECTS.map(sub => (
              <button key={sub.id} onClick={() => { set({ subject: sub.id, topic: "" }); }}
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
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-semibold">Building your formula sheet…</p>
          <p className="text-xs text-muted-foreground">Collecting all formulas, variables, and examples</p>
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
              <button onClick={() => { set({ sheet: null, topic: "" }); }}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent transition">
                <RefreshCw className="h-3 w-3" /> New Sheet
              </button>
            </div>
          </div>

          <div ref={sheetRef} className="card-soft p-5 sm:p-7">
            <div className="prose prose-sm max-w-none
              [&_h2]:rounded-xl [&_h2]:border-l-4 [&_h2]:border-primary [&_h2]:bg-primary/5 [&_h2]:px-4 [&_h2]:py-2.5 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-6 [&_h2]:mb-3
              [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-4 [&_h3]:mb-2
              [&_pre]:rounded-xl [&_pre]:bg-slate-900 [&_pre]:px-5 [&_pre]:py-4 [&_pre]:text-green-300 [&_pre]:text-sm [&_pre]:font-mono [&_pre]:overflow-x-auto [&_pre]:my-3
              [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-violet-100 [&_code:not(pre_code)]:text-violet-800 [&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:text-xs [&_code:not(pre_code)]:font-mono
              [&_strong]:text-foreground [&_strong]:font-semibold
              [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold
              [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:text-xs [&_td]:font-mono
              [&_ul]:space-y-1 [&_li]:text-sm [&_p]:text-sm [&_p]:leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.sheet}</ReactMarkdown>
            </div>
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
