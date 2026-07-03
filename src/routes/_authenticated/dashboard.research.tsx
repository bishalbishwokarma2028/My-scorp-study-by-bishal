import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Loader2, Search, ExternalLink, RefreshCw, Copy, Check, Globe } from "lucide-react";
import { toast } from "sonner";
import { askAI } from "@/lib/aiProvider";
import { deepResearchServer, type SearchResult } from "@/lib/research.functions";
import { ProviderBadge, QuotaBadge } from "@/components/ai-ui";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { usePageState } from "@/lib/pageState";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

export const Route = createFileRoute("/_authenticated/dashboard/research")({
  component: ResearchPage,
});

const FOCUS_TYPES = [
  { id: "general",    label: "General Overview",        icon: "📚" },
  { id: "scientific", label: "Scientific / Academic",   icon: "🔬" },
  { id: "historical", label: "Historical",               icon: "📜" },
  { id: "howto",      label: "How It Works",             icon: "⚙️" },
  { id: "pros_cons",  label: "Pros & Cons",              icon: "⚖️" },
  { id: "current",    label: "Current Events",           icon: "🌐" },
];

const EXAMPLE_TOPICS = [
  "Quantum computing and its future applications",
  "How does CRISPR gene editing work?",
  "The causes and effects of World War I",
  "Climate change: current status and solutions",
  "Artificial intelligence in healthcare",
  "The history of the internet",
];

// Section header color map based on emoji prefix
const SECTION_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  "🔍": { bg: "from-blue-50 to-blue-50/30",   border: "border-blue-400",   text: "text-blue-700"   },
  "📌": { bg: "from-violet-50 to-violet-50/30", border: "border-violet-400", text: "text-violet-700" },
  "📖": { bg: "from-emerald-50 to-emerald-50/30", border: "border-emerald-400", text: "text-emerald-700" },
  "📊": { bg: "from-amber-50 to-amber-50/30",  border: "border-amber-400",  text: "text-amber-700"  },
  "🌍": { bg: "from-cyan-50 to-cyan-50/30",    border: "border-cyan-400",   text: "text-cyan-700"   },
  "✅": { bg: "from-green-50 to-green-50/30",  border: "border-green-500",  text: "text-green-700"  },
};

function getSection(text: string) {
  for (const [emoji, style] of Object.entries(SECTION_STYLES)) {
    if (String(text).startsWith(emoji)) return style;
  }
  return { bg: "from-primary/5 to-primary/0", border: "border-primary", text: "text-primary" };
}

// Rich custom components for beautiful research report rendering
const reportComponents: Components = {
  h2: ({ children }) => {
    const s = getSection(String(children));
    return (
      <div className={`flex items-center gap-2.5 mt-7 mb-3 px-4 py-3 rounded-xl bg-gradient-to-r ${s.bg} border-l-4 ${s.border} shadow-sm`}>
        <span className={`text-sm font-bold leading-snug ${s.text}`}>{children}</span>
      </div>
    );
  },
  h3: ({ children }) => (
    <h3 className="text-sm font-bold mt-5 mb-2 pl-3 border-l-2 border-primary/50 text-foreground">{children}</h3>
  ),
  strong: ({ children }) => (
    <mark className="bg-yellow-200/80 text-yellow-900 px-0.5 rounded-sm font-semibold not-italic">{children}</mark>
  ),
  em: ({ children }) => (
    <em className="text-primary font-medium not-italic">{children}</em>
  ),
  li: ({ children }) => (
    <li className="flex items-start gap-2 my-1.5 leading-relaxed">
      <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
      <span className="flex-1 text-sm">{children}</span>
    </li>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-none pl-0 space-y-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal pl-5 space-y-1 text-sm">{children}</ol>
  ),
  p: ({ children }) => (
    <p className="text-sm leading-relaxed my-2 text-foreground/90">{children}</p>
  ),
  blockquote: ({ children }) => (
    <div className="my-3 rounded-lg border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 font-medium">
      {children}
    </div>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-border shadow-sm">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground border-b border-border">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-xs border-b border-border/60">{children}</td>
  ),
  tr: ({ children }) => (
    <tr className="even:bg-muted/20 hover:bg-accent/30 transition-colors">{children}</tr>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{children}</code>
  ),
  hr: () => <hr className="my-4 border-border/50" />,
};

function ResearchPage() {
  const { user } = Route.useRouteContext();

  const [s, set, clear] = usePageState("research", {
    query:        "",
    focusType:    "general",
    report:       null as string | null,
    sources:      [] as SearchResult[],
    searchSource: "",
    provider:     null as string | null,
  });

  const [loading, setLoading] = useState(false);
  const [copied,  setCopied]  = useState(false);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "research");

  // Restore from History navigation
  useEffect(() => {
    const raw = sessionStorage.getItem("scorp_research_restore");
    if (raw) {
      try { set(JSON.parse(raw)); } catch {}
      sessionStorage.removeItem("scorp_research_restore");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function research() {
    if (!s.query.trim()) return toast.error("Enter a topic to research");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true);
    set({ report: null, sources: [], searchSource: "", provider: null });

    try {
      const webCtx = await deepResearchServer({ data: { query: s.query.trim() } });
      set({ sources: webCtx.sources, searchSource: webCtx.searchSource });

      const focusLabel = FOCUS_TYPES.find(f => f.id === s.focusType)?.label || "General Overview";

      const prompt = `You are a deep research assistant for students. Produce a rich, visually engaging, comprehensive research report.

TOPIC: "${s.query.trim()}"
FOCUS: ${focusLabel}

LIVE WEB CONTEXT (use as primary source):
${webCtx.context || "No live web data available — use training knowledge."}

Write a comprehensive markdown research report using these EXACT section headers:

## 🔍 Executive Summary
Write 2–3 detailed paragraphs. **Bold every key term, name, concept, and critical fact.** Include the most essential information a student must know.

## 📌 Key Findings
List 7–9 bullet points. **Bold the critical keyword or statistic at the start of each point.** Each point should be a complete, informative sentence.

## 📖 Detailed Analysis
Write 3–4 subsections using ### headings. Under each, write 2–3 paragraphs with **bolded key terms throughout**. Be thorough and educational.

## 📊 Statistics & Important Facts
Use a markdown table with columns: | Fact | Detail | Source/Year |
Include 6–8 rows of specific, verifiable statistics and figures.

## 🌍 Different Perspectives
Present 2–3 distinct viewpoints as separate paragraphs. Use > blockquotes to highlight the single most important insight from each perspective.

## ✅ Conclusion & Key Takeaways
Write a strong summary paragraph, then list 5–6 bullet points where each starts with **bold takeaway label:** followed by the explanation.

FORMATTING RULES:
- **Bold all key terms, important names, statistics, dates, and critical concepts** throughout the entire report
- Use markdown tables for comparative or statistical information
- Use > blockquotes for particularly important insights or quotes
- Write at a high academic quality — detailed, factual, well-structured
- Make it thorough enough that a student could write an essay from this report alone`;

      const res = await askAI(prompt,
        "You are an expert research assistant. Write comprehensive, beautifully formatted research reports with rich markdown — bold key terms, tables, and blockquotes throughout.");
      set({ provider: res.provider, report: res.text });
      await bump();

      // Save to history (non-blocking)
      supabase.from("research_history" as never).insert({
        user_id: user.id,
        query: s.query.trim(),
        focus_type: s.focusType,
        report: res.text,
        sources: webCtx.sources as never,
        search_source: webCtx.searchSource,
        provider: res.provider,
      } as never).then(() => {});

    } catch {
      toast.error("Research failed — please try again");
    }
    setLoading(false);
  }

  async function copyReport() {
    if (!s.report) return;
    await navigator.clipboard.writeText(s.report);
    setCopied(true);
    toast.success("Report copied");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Search className="h-5 w-5 text-primary" /> Deep Research Assistant
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Enter any topic — AI searches the web and writes a comprehensive research report with sources
          </p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      <div className="card-soft p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Research Topic</label>
          <textarea value={s.query} onChange={e => set({ query: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !loading) { e.preventDefault(); research(); } }}
            rows={3} placeholder="e.g. How does CRISPR gene editing work and what are its ethical implications?"
            className="mt-1.5 w-full rounded-lg border border-input bg-background p-3 text-sm resize-none" />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Research Focus</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {FOCUS_TYPES.map(({ id, label, icon }) => (
              <button key={id} onClick={() => set({ focusType: id })}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${s.focusType === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"}`}>
                {icon} {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Example topics:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_TOPICS.map(t => (
              <button key={t} onClick={() => set({ query: t, report: null, sources: [] })}
                className="rounded-full border border-border bg-background px-3 py-1 text-xs hover:bg-accent truncate max-w-[220px]">{t}</button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={research} disabled={loading || !s.query.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Searching & writing report…</> : <><Search className="h-4 w-4" />Research This Topic</>}
          </button>
          {s.report && (
            <button onClick={clear} className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent">
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="card-soft flex flex-col items-center gap-4 py-16 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div>
            <p className="text-sm font-semibold">Searching the web &amp; compiling your report</p>
            <p className="mt-1 text-xs text-muted-foreground">Checking Tavily, Serper, and AI knowledge sources…</p>
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> Live web search</span>
            <span>→</span><span>AI synthesis</span><span>→</span><span>Structured report</span>
          </div>
        </div>
      )}

      {!loading && s.report && (
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          {/* Report card */}
          <div className="card-soft p-5 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-border">
              <div>
                <p className="font-semibold text-sm">{s.query}</p>
                {s.searchSource && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sources: <span className="font-medium text-primary">{s.searchSource}</span>
                    {s.sources.length > 0 && ` · ${s.sources.length} results`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ProviderBadge provider={s.provider} />
                <button onClick={copyReport}
                  className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent">
                  {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* Rich formatted report */}
            <div className="research-report">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={reportComponents}
              >
                {s.report}
              </ReactMarkdown>
            </div>
          </div>

          {/* Sources sidebar */}
          <div className="space-y-3">
            <div className="card-soft p-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-primary" /> Sources
                {s.sources.length === 0 && <span className="text-xs font-normal text-muted-foreground">(AI knowledge)</span>}
              </p>
              {s.sources.length === 0 && (
                <p className="text-xs text-muted-foreground">No live web sources — report based on AI training knowledge.</p>
              )}
              {s.sources.map((src, i) => (
                <div key={i} className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 hover:bg-accent/30 transition-colors">
                  <p className="text-xs font-semibold leading-snug line-clamp-2">{src.title}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-3">{src.snippet}</p>
                  {src.url && (
                    <a href={src.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                      <ExternalLink className="h-2.5 w-2.5" />
                      {new URL(src.url).hostname.replace("www.","")}
                    </a>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-semibold mb-1">📌 Study Actions</p>
              <button onClick={() => { sessionStorage.setItem("scorp_quiz_topic", s.query); window.location.href = "/dashboard/quiz"; }}
                className="w-full text-left hover:underline">→ Generate a Quiz on this topic</button>
              <button onClick={() => { sessionStorage.setItem("scorp_flashcard_topic", s.query); window.location.href = "/dashboard/flashcards"; }}
                className="mt-1 w-full text-left hover:underline">→ Create Flashcards</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
