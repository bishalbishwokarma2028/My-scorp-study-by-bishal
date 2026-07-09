import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Loader2, Search, ExternalLink, RefreshCw, Copy, Check, Globe, Youtube } from "lucide-react";
import { toast } from "sonner";
import { askAI } from "@/lib/aiProvider";
import { deepResearchServer, type SearchResult, type YouTubeVideo } from "@/lib/research.functions";
import { ProviderBadge, QuotaBadge } from "@/components/ai-ui";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { usePageState } from "@/lib/pageState";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { richMarkdownComponents } from "@/components/rich-markdown";

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

  const [s, set, clear] = usePageState("research", {
    query:         "",
    focusType:     "general",
    report:        null as string | null,
    sources:       [] as SearchResult[],
    youtubeVideos: [] as YouTubeVideo[],
    searchSource:  "",
    provider:      null as string | null,
  });

  const [loading, setLoading] = useState(false);
  const [copied,  setCopied]  = useState(false);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "cerebras");

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
      set({ sources: webCtx.sources, searchSource: webCtx.searchSource, youtubeVideos: webCtx.youtubeVideos ?? [] });

      const focusLabel = FOCUS_TYPES.find(f => f.id === s.focusType)?.label || "General Overview";

      const prompt = `You are a deep research assistant for students. Produce a rich, visually engaging, comprehensive research report.

TOPIC: "${s.query.trim()}"
FOCUS: ${focusLabel}

LIVE WEB CONTEXT (use as primary source):
${webCtx.context || "No live web data available — use training knowledge."}

ACCURACY RULES (critical):
- Every claim must be factual, well-verified, and unbiased. Never speculate, guess, or invent statistics, names, or dates.
- Prioritize information from the LIVE WEB CONTEXT above your own training knowledge — it is more current and reliable.
- Prefer reputable, trustworthy sources (established institutions, official bodies, peer-reviewed or widely-cited publications) over unverified claims.
- If the live web context does not clearly support a fact, do not state it as certain — qualify it or omit it.
- Present multiple perspectives fairly when a topic is contested; do not favor one viewpoint without evidence.

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
        "You are an expert research assistant. Write comprehensive, beautifully formatted research reports with rich markdown — bold key terms, tables, and blockquotes throughout. Every fact must be accurate, well-verified, and unbiased — prioritize reliable, trustworthy sources and never fabricate information.",
        undefined, true);
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
                components={richMarkdownComponents}
              >
                {s.report}
              </ReactMarkdown>
            </div>
          </div>

          {/* Sources sidebar */}
          <div className="space-y-3">
            {/* YouTube Videos */}
            {s.youtubeVideos && s.youtubeVideos.length > 0 && (
              <div className="card-soft p-4 space-y-3">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <Youtube className="h-4 w-4 text-red-500" /> Top YouTube Videos
                </p>
                <p className="text-[10px] text-muted-foreground -mt-2">Most relevant videos on this topic</p>
                {s.youtubeVideos.map((vid, i) => (
                  <a
                    key={i}
                    href={vid.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex gap-2.5 rounded-lg border border-border bg-muted/20 p-2.5 hover:bg-accent/40 transition-colors group"
                  >
                    {vid.imageUrl ? (
                      <img
                        src={vid.imageUrl}
                        alt={vid.title}
                        className="h-14 w-24 flex-shrink-0 rounded-md object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="grid h-14 w-24 flex-shrink-0 place-items-center rounded-md bg-red-100">
                        <Youtube className="h-6 w-6 text-red-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">{vid.title}</p>
                      {vid.channel && <p className="mt-1 text-[10px] text-muted-foreground">{vid.channel}</p>}
                      {vid.date && <p className="text-[9px] text-muted-foreground/70 mt-0.5">{vid.date}</p>}
                      <p className="mt-1 flex items-center gap-0.5 text-[9px] text-red-600">
                        <ExternalLink className="h-2.5 w-2.5" /> Watch on YouTube
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            )}

            {/* Web sources */}
            <div className="card-soft p-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-primary" /> Web Sources
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
                      {(() => { try { return new URL(src.url).hostname.replace("www.",""); } catch { return src.url.slice(0,30); } })()}
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
