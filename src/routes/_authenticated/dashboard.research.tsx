import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Search, ExternalLink, RefreshCw, Copy, Check, Globe } from "lucide-react";
import { toast } from "sonner";
import { askAI } from "@/lib/aiProvider";
import { deepResearchServer, type SearchResult } from "@/lib/research.functions";
import { ProviderBadge, QuotaBadge } from "@/components/ai-ui";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { usePageState } from "@/lib/pageState";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

function ResearchPage() {
  const { user } = Route.useRouteContext();

  // Persisted state across route changes
  const [s, set, clear] = usePageState("research", {
    query:        "",
    focusType:    "general",
    report:       null as string | null,
    sources:      [] as SearchResult[],
    searchSource: "",
    provider:     null as string | null,
  });

  // Transient
  const [loading, setLoading] = useState(false);
  const [copied,  setCopied]  = useState(false);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "research");

  async function research() {
    if (!s.query.trim()) return toast.error("Enter a topic to research");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true);
    set({ report: null, sources: [], searchSource: "", provider: null });

    try {
      const webCtx = await deepResearchServer({ data: { query: s.query.trim() } });
      set({ sources: webCtx.sources, searchSource: webCtx.searchSource });

      const focusLabel = FOCUS_TYPES.find(f => f.id === s.focusType)?.label || "General Overview";

      const prompt = `You are a deep research assistant for students. Research this topic comprehensively.

TOPIC: "${s.query.trim()}"
FOCUS: ${focusLabel}

LIVE WEB CONTEXT (use this as primary source):
${webCtx.context || "No live web data available — use training knowledge."}

Write a comprehensive, well-structured research report in markdown. Use these exact sections:

## 🔍 Executive Summary
(2-3 paragraphs covering the most important points)

## 📌 Key Findings
(6-8 bullet points of the most critical facts and insights)

## 📖 Detailed Analysis
(3-4 subsections with ### headings, each covering a major aspect of the topic)

## 📊 Statistics & Important Facts
(A bullet list of specific numbers, dates, measurements, and verifiable facts)

## 🌍 Different Perspectives
(2-3 different viewpoints or angles on the topic)

## ✅ Conclusion & Key Takeaways
(Summary paragraph + 4-5 bullet points of the most important takeaways for a student)

Rules:
- Be thorough, accurate, and educational
- Use specific facts, dates, and statistics from the web context where available
- Format with proper markdown (bold, bullets, headers)
- Write in a clear, engaging style for students`;

      const res = await askAI(prompt,
        "You are an expert research assistant. Write comprehensive, factual, well-structured research reports for students. Use markdown formatting.");
      set({ provider: res.provider, report: res.text });
      await bump();
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
          <div className="card-soft p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
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
                  {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <div className="prose prose-sm max-w-none [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5 [&_ul]:my-1 [&_li]:my-0.5 [&_p]:leading-relaxed [&_strong]:font-semibold">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.report}</ReactMarkdown>
            </div>
          </div>

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
                <div key={i} className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
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
