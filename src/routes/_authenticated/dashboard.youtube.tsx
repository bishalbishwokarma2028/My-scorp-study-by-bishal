import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { usePageState } from "@/lib/pageState";
import {
  Loader2, Youtube, AlertCircle, ExternalLink,
  ChevronUp, ChevronDown, CheckCircle2, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON } from "@/lib/aiProvider";
import { fetchYouTubeServer } from "@/lib/youtube.functions";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge, ProviderBadge } from "@/components/ai-ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { richMarkdownComponents } from "@/components/rich-markdown";

export const Route = createFileRoute("/_authenticated/dashboard/youtube")({
  component: YoutubePage,
});

type TabKey = "summary" | "keypoints" | "flashcards" | "quiz";
type Flashcard = { front: string; back: string };
type QuizQ = { question: string; options: string[]; answer: string; explanation: string };
type TabContent = {
  summary?: string;
  keypoints?: string[];
  flashcards?: Flashcard[];
  quiz?: QuizQ[];
};

const TABS: { key: TabKey; label: string; emoji: string; color: string; light: string }[] = [
  { key: "summary",    label: "Summary",     emoji: "📋", color: "bg-blue-600",    light: "bg-blue-50 text-blue-700 border-blue-200"     },
  { key: "keypoints",  label: "Key Points",  emoji: "⚡", color: "bg-violet-600",  light: "bg-violet-50 text-violet-700 border-violet-200" },
  { key: "flashcards", label: "Flashcards",  emoji: "🃏", color: "bg-emerald-600", light: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "quiz",       label: "Quiz",        emoji: "❓", color: "bg-amber-600",   light: "bg-amber-50 text-amber-700 border-amber-200"   },
];

const EXAMPLES = [
  "https://www.youtube.com/watch?v=aircAruvnKk",
  "https://youtu.be/PkZNo7MFNFg",
  "https://www.youtube.com/watch?v=HAnw168huqA",
];

// ─── Strictly content-grounded prompts ────────────────────────────────────────

function buildSummaryPrompt(content: string, title: string, isResearch: boolean): string {
  const sourceNote = isResearch
    ? `NOTE: The transcript was unavailable. The content below is research about this topic. Be transparent — label the summary as "Topic Overview" rather than claiming it is from the video directly.`
    : `NOTE: The content below is the actual video transcript. Summarize ONLY what is discussed in this transcript.`;

  return `You are a study assistant. ${sourceNote}

VIDEO TITLE: "${title}"

SOURCE MATERIAL:
${content.slice(0, 13000)}

Write a richly formatted, LONG, IN-DEPTH Markdown study summary using ONLY the information in the source material above. Do NOT add information from your general knowledge. Match the same polished, highlighted formatting style used in the ScorpStudy Deep Research reports.

## Formatting Requirements:
- Start section headings with one of these emoji so they render as styled section cards: 🔍 (overview), 📌 (key points), 📖 (detailed breakdown), 📊 (facts/stats), 📝 (notes), ✅ (conclusion), 🎯 (takeaways) — e.g. "## 📖 How It Works"
- Start with a "## 🔍 Overview" section — a compelling 3-4 sentence summary of what this content covers
- Use ## for every major section heading, and include AT LEAST 6-8 major sections that walk through the content in the order it was presented (not just 4) — break the detailed breakdown into multiple sub-sections (### ) covering distinct topics/segments of the video rather than one big block
- Each section must be substantial — at least 4-6 sentences or 5-8 bullet points of real detail per section, not one-liners
- Use **bold** for ALL key terms, concepts, formulas, names, dates, statistics, and important facts — bold liberally, every section should have several bolded terms
- Use > blockquotes for the most critical takeaways: > 💡 **Key insight:** ...
- Use > ⚠️ **Important:** for warnings or common mistakes
- Use > 📌 **Definition:** for key definitions
- Use numbered lists for steps or sequential content
- Use bullet lists with specific facts, not vague statements — include specific numbers, names, examples, and details actually mentioned in the source
- If the source material contains data suited to a table (comparisons, stats, timelines), include a Markdown table
- End with "## 🎯 Key Takeaways" listing 6-8 specific, actionable bullets with the most important words in **bold**
- Overall the summary should be thorough and comprehensive (aim for a long, detailed report, not a short digest) while staying strictly grounded in the source material provided — do not pad with filler or repetition, add real substance instead`;
}

function buildKeyPointsPrompt(content: string, title: string, isResearch: boolean): string {
  const note = isResearch
    ? "NOTE: The transcript was unavailable. Use the research content below."
    : "NOTE: Use ONLY what is in the video transcript below.";
  return `${note}

Extract the most important key points from the content about "${title}".

SOURCE MATERIAL: ${content.slice(0, 12000)}

Return STRICT JSON only — no prose, no fences:
{"points": [
  {"emoji": "relevant emoji", "point": "key point as a complete sentence — use **bold** for the most important word or concept", "detail": "1-2 sentence elaboration with a specific fact, number, or example from the source material"},
  ...12 to 16 total points from the actual content...
]}`;
}

function buildFlashcardsPrompt(content: string, title: string, isResearch: boolean): string {
  const note = isResearch
    ? "NOTE: The transcript was unavailable. Use the research content below."
    : "NOTE: Base all flashcards ONLY on the video transcript below. Do not add information not in the transcript.";
  return `${note}

Create study flashcards from the content about "${title}".

SOURCE MATERIAL: ${content.slice(0, 12000)}

Return STRICT JSON only — no prose, no fences:
{"cards": [
  {"front": "Specific question or term from the content", "back": "Detailed answer drawn from the source material (2-3 sentences)"},
  ...12 to 16 cards...
]}`;
}

function buildQuizPrompt(content: string, title: string, isResearch: boolean): string {
  const note = isResearch
    ? "NOTE: The transcript was unavailable. Use the research content below."
    : "NOTE: Every question must be answerable from the video transcript below. Do not test knowledge not covered in the transcript.";
  return `${note}

Create multiple-choice quiz questions based on the content about "${title}".

SOURCE MATERIAL: ${content.slice(0, 12000)}

Return STRICT JSON only — no prose, no fences:
{"questions": [
  {
    "question": "Specific question that tests understanding of something in the source material",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": "exact text of the correct option",
    "explanation": "Explanation citing the specific part of the source material that supports this answer (2 sentences)"
  },
  ...8 to 10 questions...
]}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KeyPointCard({ point, index }: { point: { emoji: string; point: string; detail: string }; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const colors = [
    "border-l-blue-400 bg-blue-50",
    "border-l-violet-400 bg-violet-50",
    "border-l-emerald-400 bg-emerald-50",
    "border-l-amber-400 bg-amber-50",
    "border-l-pink-400 bg-pink-50",
    "border-l-cyan-400 bg-cyan-50",
  ];
  return (
    <div className={`rounded-xl border-l-4 ${colors[index % colors.length]} overflow-hidden`}>
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-start gap-3 p-3.5 text-left">
        <span className="flex-shrink-0 text-lg leading-none mt-0.5">{point.emoji || "⚡"}</span>
        <div className="min-w-0 flex-1">
          <div className="prose prose-sm max-w-none prose-p:my-0 prose-strong:font-bold">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{point.point}</ReactMarkdown>
          </div>
        </div>
        <span className="flex-shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {expanded && point.detail && (
        <div className="border-t border-white/60 bg-white/50 px-4 pb-4 pt-3">
          <p className="text-sm leading-relaxed text-foreground/70">{point.detail}</p>
        </div>
      )}
    </div>
  );
}

function FlashcardItem({ card, index }: { card: Flashcard; index: number }) {
  const [flipped, setFlipped] = useState(false);
  const colors = [
    { bg: "from-blue-500 to-blue-600", light: "bg-blue-50 border-blue-100" },
    { bg: "from-violet-500 to-violet-600", light: "bg-violet-50 border-violet-100" },
    { bg: "from-emerald-500 to-emerald-600", light: "bg-emerald-50 border-emerald-100" },
    { bg: "from-amber-500 to-amber-600", light: "bg-amber-50 border-amber-100" },
    { bg: "from-pink-500 to-pink-600", light: "bg-pink-50 border-pink-100" },
  ];
  const c = colors[index % colors.length];
  return (
    <div
      onClick={() => setFlipped(!flipped)}
      className={`cursor-pointer rounded-xl border p-4 transition-all hover:shadow-md min-h-[110px] flex flex-col justify-between ${
        flipped ? `border-none bg-gradient-to-br ${c.bg} text-white shadow-lg` : c.light
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${flipped ? "text-white/70" : "text-muted-foreground"}`}>
          {flipped ? "Answer" : `Card ${index + 1}`}
        </span>
        <span className="text-base">{flipped ? "✅" : "❓"}</span>
      </div>
      <p className={`mt-2 text-sm leading-relaxed font-medium ${flipped ? "text-white" : "text-foreground"}`}>
        {flipped ? card.back : card.front}
      </p>
      <p className={`mt-2 text-[10px] ${flipped ? "text-white/60" : "text-muted-foreground/60"}`}>
        Tap to {flipped ? "see question" : "reveal answer"}
      </p>
    </div>
  );
}

function QuizItem({ q, index }: { q: QuizQ; index: number }) {
  const [selected, setSelected] = useState<string | null>(null);
  const answered = selected !== null;
  const correct = selected === q.answer;

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="px-4 py-3.5 bg-muted/20 border-b border-border">
        <div className="flex items-start gap-2.5">
          <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary mt-0.5">{index + 1}</span>
          <p className="text-sm font-semibold leading-relaxed">{q.question}</p>
        </div>
      </div>
      <div className="p-3.5 space-y-2">
        {q.options.map((opt, oi) => {
          const isCorrect = opt === q.answer;
          const isSelected = opt === selected;
          let cls = "border-border bg-background text-foreground";
          if (answered) {
            if (isCorrect) cls = "border-emerald-400 bg-emerald-50 text-emerald-800 font-semibold";
            else if (isSelected) cls = "border-red-400 bg-red-50 text-red-800 line-through";
          } else {
            cls = "border-border bg-background hover:border-primary/40 hover:bg-accent";
          }
          return (
            <button key={opt} onClick={() => !answered && setSelected(opt)} disabled={answered}
              className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-all disabled:cursor-default ${cls}`}>
              {answered && isCorrect && <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />}
              {answered && isSelected && !isCorrect && <XCircle className="h-4 w-4 flex-shrink-0 text-red-500" />}
              {!answered && <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">{["A","B","C","D"][oi]}</span>}
              <span className="flex-1">{opt}</span>
            </button>
          );
        })}
      </div>
      {answered && (
        <div className={`mx-3.5 mb-3.5 rounded-xl border p-3 text-sm leading-relaxed ${correct ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <p className="font-bold mb-1">{correct ? "✅ Correct!" : `❌ Answer: ${q.answer}`}</p>
          <p className="text-xs leading-relaxed opacity-90">{q.explanation}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function YoutubePage() {
  const { user } = Route.useRouteContext();
  const [s, set] = usePageState("youtube", {
    url: "",
    videoInfo: null as { id: string; title: string; content: string; source: string } | null,
    activeTab: "summary" as TabKey,
    tabContent: {} as TabContent,
    provider: null as string | null,
  });
  const { url, videoInfo, activeTab, tabContent, provider } = s;
  const [fetching, setFetching] = useState(false);
  const [tabLoading, setTabLoading] = useState<TabKey | null>(null);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "youtube");

  async function fetchVideo() {
    if (!url.trim()) return toast.error("Enter a YouTube URL");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);

    setFetching(true);
    set({ videoInfo: null, tabContent: {}, activeTab: "summary" });

    try {
      const result = await fetchYouTubeServer({ data: { url: url.trim() } });
      if (!result.videoId || result.source === "none") {
        toast.error("Couldn't retrieve video content. Make sure the video has captions/subtitles enabled.");
        setFetching(false);
        return;
      }
      const content = result.transcript || result.researchContext || "";
      const newVideoInfo = { id: result.videoId, title: result.title, content, source: result.source };
      set({ videoInfo: newVideoInfo });
      await generateTab("summary", content, result.title, result.source);
    } catch {
      toast.error("Failed to fetch video — try another URL");
    } finally {
      setFetching(false);
    }
  }

  async function generateTab(tab: TabKey, content?: string, title?: string, source?: string) {
    const c = content ?? videoInfo?.content ?? "";
    const t = title ?? videoInfo?.title ?? "";
    const src = source ?? videoInfo?.source ?? "transcript";
    if (!c || !t) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);

    set({ activeTab: tab, provider: null });
    setTabLoading(tab);

    const isResearch = src !== "transcript";

    try {
      if (tab === "summary") {
        const res = await askAI(buildSummaryPrompt(c, t, isResearch), "You are a study assistant. Write a rich markdown summary using ONLY the provided source material — no outside knowledge, no information from other videos, and no assumptions. Be concise, accurate, and faithful to the source.", undefined, true);
        set({ provider: res.provider });
        await bump();
        set({ tabContent: { ...tabContent, summary: res.text } });
      } else if (tab === "keypoints") {
        const res = await askAI(buildKeyPointsPrompt(c, t, isResearch), "Return ONLY valid JSON. Base everything strictly on the provided source material — never introduce facts from outside sources.", undefined, true);
        set({ provider: res.provider });
        await bump();
        const parsed = extractJSON<{ points: { emoji: string; point: string; detail: string }[] }>(res.text);
        if (parsed?.points) set({ tabContent: { ...tabContent, keypoints: parsed.points as unknown as string[] } });
      } else if (tab === "flashcards") {
        const res = await askAI(buildFlashcardsPrompt(c, t, isResearch), "Return ONLY valid JSON. Base everything strictly on the provided source material — never introduce facts from outside sources.", undefined, true);
        set({ provider: res.provider });
        await bump();
        const parsed = extractJSON<{ cards: Flashcard[] }>(res.text);
        if (parsed?.cards) set({ tabContent: { ...tabContent, flashcards: parsed.cards } });
      } else if (tab === "quiz") {
        const res = await askAI(buildQuizPrompt(c, t, isResearch), "Return ONLY valid JSON. Base every question strictly on the provided source material — never introduce facts from outside sources.", undefined, true);
        set({ provider: res.provider });
        await bump();
        const parsed = extractJSON<{ questions: QuizQ[] }>(res.text);
        if (parsed?.questions) set({ tabContent: { ...tabContent, quiz: parsed.questions } });
      }
    } catch {
      toast.error("Failed to generate content — try again");
    } finally {
      setTabLoading(null);
    }
  }

  function hasTab(tab: TabKey) {
    if (tab === "keypoints") return Array.isArray(tabContent.keypoints) && (tabContent.keypoints as unknown[]).length > 0;
    return !!(tabContent as Record<string, unknown>)[tab];
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 lg:max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">YouTube Summarizer</h2>
          <p className="text-sm text-muted-foreground">Paste any YouTube URL → get summary, key points, flashcards & quiz</p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      {/* URL Input */}
      <div className="card-soft space-y-3 p-4">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Youtube className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-red-500 flex-shrink-0" />
            <input
              value={url}
              onChange={(e) => set({ url: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && fetchVideo()}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-3 text-sm focus:border-red-400 focus:outline-none"
            />
          </div>
          <button
            onClick={fetchVideo}
            disabled={fetching || !url.trim()}
            className="flex-shrink-0 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />}
            <span className="hidden sm:inline">{fetching ? "Fetching…" : "Analyze"}</span>
          </button>
        </div>

        {/* Examples */}
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground self-center">Try:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => set({ url: ex })}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground truncate max-w-[200px]">
              {ex.slice(0, 38)}…
            </button>
          ))}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Works best with videos that have <strong>subtitles or closed captions</strong>. Without captions, the AI will research the general topic instead of the video's actual content.
          </p>
        </div>
      </div>

      {/* Fetching state */}
      {fetching && (
        <div className="card-soft flex flex-col items-center justify-center gap-4 py-12 text-center">
          <div className="relative">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-100">
              <Youtube className="h-7 w-7 text-red-500" />
            </div>
            <Loader2 className="absolute -right-2 -top-2 h-5 w-5 animate-spin text-red-500" />
          </div>
          <div>
            <p className="font-bold">Fetching video content…</p>
            <p className="mt-1 text-sm text-muted-foreground">Extracting transcript and generating summary</p>
          </div>
        </div>
      )}

      {/* Video content */}
      {videoInfo && (
        <div className="space-y-4">
          {/* Video card */}
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-background p-3.5 shadow-sm">
            <div className="relative flex-shrink-0">
              <img
                src={`https://img.youtube.com/vi/${videoInfo.id}/mqdefault.jpg`}
                alt="thumbnail"
                className="h-16 w-28 rounded-xl object-cover sm:h-20 sm:w-32"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm leading-snug line-clamp-2">{videoInfo.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {videoInfo.source === "transcript" ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                    ✅ Transcript — answers from actual video
                  </span>
                ) : (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                    🔍 Research mode — no transcript available
                  </span>
                )}
                {provider && <ProviderBadge provider={provider} />}
                <a
                  href={`https://www.youtube.com/watch?v=${videoInfo.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Watch <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Tab buttons — 2×2 on mobile, 4 in a row on sm+ */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TABS.map(({ key, label, emoji, color, light }) => {
              const active = activeTab === key;
              const done = hasTab(key);
              const isLoading = tabLoading === key;
              return (
                <button
                  key={key}
                  onClick={() => hasTab(key) ? set({ activeTab: key }) : generateTab(key)}
                  disabled={!!tabLoading}
                  className={`relative rounded-2xl border px-2 py-2.5 text-sm font-bold transition-all disabled:cursor-wait ${active ? `${color} text-white shadow-md border-transparent` : `${light} border`}`}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> <span className="hidden sm:inline">Loading…</span>
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      {emoji} {label}
                      {done && !active && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-current opacity-50" />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="card-soft min-h-[260px] overflow-hidden p-4 sm:p-5">
            {tabLoading === activeTab ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {activeTab === "summary" ? "Writing detailed summary…" :
                   activeTab === "keypoints" ? "Extracting key points…" :
                   activeTab === "flashcards" ? "Creating flashcards…" : "Generating quiz…"}
                </p>
              </div>
            ) : activeTab === "summary" && tabContent.summary ? (
              <div className="overflow-x-hidden">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={richMarkdownComponents}>
                  {tabContent.summary}
                </ReactMarkdown>
              </div>
            ) : activeTab === "keypoints" && Array.isArray(tabContent.keypoints) ? (
              <div className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  ⚡ {(tabContent.keypoints as unknown[]).length} Key Points — tap to expand
                </p>
                {(tabContent.keypoints as unknown as { emoji: string; point: string; detail: string }[]).map((pt, i) => (
                  <KeyPointCard key={i} point={pt} index={i} />
                ))}
              </div>
            ) : activeTab === "flashcards" && tabContent.flashcards ? (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  🃏 {tabContent.flashcards.length} Flashcards — tap each card to flip
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {tabContent.flashcards.map((c, i) => <FlashcardItem key={i} card={c} index={i} />)}
                </div>
              </div>
            ) : activeTab === "quiz" && tabContent.quiz ? (
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  ❓ {tabContent.quiz.length} Questions — select your answer
                </p>
                {tabContent.quiz.map((q, i) => <QuizItem key={i} q={q} index={i} />)}
              </div>
            ) : (
              <div className="flex min-h-[200px] items-center justify-center text-center">
                <div>
                  <p className="text-2xl mb-2">{TABS.find(t => t.key === activeTab)?.emoji}</p>
                  <p className="text-sm font-semibold">Click a tab above to generate content</p>
                  <p className="text-xs text-muted-foreground mt-1">Each tab uses 1 credit</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
