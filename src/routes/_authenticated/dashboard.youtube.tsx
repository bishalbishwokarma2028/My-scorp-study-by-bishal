import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
  { key: "summary",    label: "Summary",     emoji: "📋", color: "bg-blue-600",   light: "bg-blue-50 text-blue-700 border-blue-200"    },
  { key: "keypoints",  label: "Key Points",  emoji: "⚡", color: "bg-violet-600", light: "bg-violet-50 text-violet-700 border-violet-200"},
  { key: "flashcards", label: "Flashcards",  emoji: "🃏", color: "bg-emerald-600",light: "bg-emerald-50 text-emerald-700 border-emerald-200"},
  { key: "quiz",       label: "Quiz",        emoji: "❓", color: "bg-amber-600",  light: "bg-amber-50 text-amber-700 border-amber-200"  },
];

const EXAMPLES = [
  "https://www.youtube.com/watch?v=aircAruvnKk",
  "https://youtu.be/PkZNo7MFNFg",
  "https://www.youtube.com/watch?v=HAnw168huqA",
];

// ─── Prompts ──────────────────────────────────────────────────────────────────

function buildSummaryPrompt(content: string, title: string): string {
  return `You are a brilliant study assistant creating a comprehensive study summary of the YouTube video titled "${title}".

Based on this content:
${content.slice(0, 14000)}

Write a richly formatted, visually structured summary in Markdown. Requirements:

## Format Rules:
- Start with a compelling **Overview** section (2-3 sentences)
- Use ## for major section headings
- Use **bold** for ALL key terms, concepts, formulas, and important facts
- Use > blockquotes for the most critical takeaways or memorable quotes
- Use - bullet lists for supporting details
- Use numbered lists for sequential steps or ranked items
- Mark important warnings or notes as > ⚠️ **Note:** text
- Mark key definitions as > 📌 **Definition:** term — explanation
- End with a ## Key Takeaways section with 4-6 bullets
- Include at least 5 major sections
- Be comprehensive — aim for depth that helps students study effectively
- Highlight statistics, dates, names, and specific facts in **bold**`;
}

function buildKeyPointsPrompt(content: string, title: string): string {
  return `Extract the most important key points from the YouTube video "${title}".

Content: ${content.slice(0, 12000)}

Return STRICT JSON only — no prose, no fences:
{"points": [
  {"emoji": "relevant emoji", "point": "key point as a complete, self-contained sentence with important terms bolded using **bold**", "detail": "1-2 extra sentences of context or explanation"},
  ...12 to 16 total points...
]}`;
}

function buildFlashcardsPrompt(content: string, title: string): string {
  return `Create comprehensive study flashcards from the YouTube video "${title}".

Content: ${content.slice(0, 12000)}

Return STRICT JSON only — no prose, no fences:
{"cards": [
  {"front": "Question or term (clear and specific)", "back": "Detailed answer or definition (2-4 sentences, complete explanation)"},
  ...12 to 16 cards total...
]}`;
}

function buildQuizPrompt(content: string, title: string): string {
  return `Create challenging multiple-choice quiz questions from the YouTube video "${title}".

Content: ${content.slice(0, 12000)}

Return STRICT JSON only — no prose, no fences:
{"questions": [
  {
    "question": "Clear, specific question testing understanding (not just recall)",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": "exact text of the correct option",
    "explanation": "Detailed explanation of why the answer is correct and why others are wrong (2-3 sentences)"
  },
  ...8 to 10 questions total...
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
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span className="flex-shrink-0 text-lg">{point.emoji || "⚡"}</span>
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
      className={`cursor-pointer rounded-xl border p-5 transition-all hover:shadow-md min-h-[120px] flex flex-col justify-between ${
        flipped ? `border-none bg-gradient-to-br ${c.bg} text-white shadow-lg` : `${c.light}`
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${flipped ? "text-white/70" : "text-muted-foreground"}`}>
          {flipped ? "Answer" : `Card ${index + 1}`}
        </span>
        <span className={`text-lg ${flipped ? "opacity-70" : "opacity-50"}`}>{flipped ? "✅" : "❓"}</span>
      </div>
      <p className={`mt-2 text-sm leading-relaxed font-medium ${flipped ? "text-white" : "text-foreground"}`}>
        {flipped ? card.back : card.front}
      </p>
      <p className={`mt-3 text-[10px] ${flipped ? "text-white/60" : "text-muted-foreground/60"}`}>
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
      <div className="px-5 py-4 bg-muted/20 border-b border-border">
        <div className="flex items-start gap-2.5">
          <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {index + 1}
          </span>
          <p className="text-sm font-semibold leading-relaxed">{q.question}</p>
        </div>
      </div>
      <div className="p-4 space-y-2">
        {q.options.map((opt) => {
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
            <button
              key={opt}
              onClick={() => !answered && setSelected(opt)}
              disabled={answered}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all disabled:cursor-default ${cls}`}
            >
              {answered && isCorrect && <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />}
              {answered && isSelected && !isCorrect && <XCircle className="h-4 w-4 flex-shrink-0 text-red-500" />}
              {!answered && <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">{["A","B","C","D"][q.options.indexOf(opt)]}</span>}
              <span className="flex-1">{opt}</span>
            </button>
          );
        })}
      </div>
      {answered && (
        <div className={`mx-4 mb-4 rounded-xl border p-3.5 text-sm leading-relaxed ${correct ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <p className="font-bold mb-1">{correct ? "✅ Correct!" : `❌ The answer is: ${q.answer}`}</p>
          <p className="text-xs leading-relaxed opacity-90">{q.explanation}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function YoutubePage() {
  const { user } = Route.useRouteContext();
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [videoInfo, setVideoInfo] = useState<{ id: string; title: string; content: string; source: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [tabContent, setTabContent] = useState<TabContent>({});
  const [tabLoading, setTabLoading] = useState<TabKey | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "youtube");

  function extractVideoId(url: string): string | null {
    const m = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  async function fetchVideo() {
    if (!url.trim()) return toast.error("Enter a YouTube URL");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);

    setFetching(true);
    setVideoInfo(null);
    setTabContent({});
    setActiveTab("summary");

    try {
      const result = await fetchYouTubeServer({ data: { url: url.trim() } });
      if (!result.videoId || result.source === "none") {
        toast.error("Couldn't retrieve video content. Make sure the video has captions/subtitles.");
        setFetching(false);
        return;
      }
      const content = result.transcript || result.researchContext || "";
      setVideoInfo({ id: result.videoId, title: result.title, content, source: result.source });
      // Auto-generate summary
      await generateTab("summary", content, result.title);
    } catch {
      toast.error("Failed to fetch video — try another URL");
    } finally {
      setFetching(false);
    }
  }

  async function generateTab(tab: TabKey, content?: string, title?: string) {
    const c = content ?? videoInfo?.content ?? "";
    const t = title ?? videoInfo?.title ?? "";
    if (!c || !t) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);

    setActiveTab(tab);
    setTabLoading(tab);
    setProvider(null);

    try {
      if (tab === "summary") {
        const res = await askAI(buildSummaryPrompt(c, t), "You are an expert study assistant. Format your response using rich Markdown as instructed.");
        setProvider(res.provider);
        await bump();
        setTabContent((prev) => ({ ...prev, summary: res.text }));
      } else if (tab === "keypoints") {
        const res = await askAI(buildKeyPointsPrompt(c, t), "Return ONLY valid JSON.");
        setProvider(res.provider);
        await bump();
        const parsed = extractJSON<{ points: { emoji: string; point: string; detail: string }[] }>(res.text);
        if (parsed?.points) setTabContent((prev) => ({ ...prev, keypoints: parsed.points as unknown as string[] }));
      } else if (tab === "flashcards") {
        const res = await askAI(buildFlashcardsPrompt(c, t), "Return ONLY valid JSON.");
        setProvider(res.provider);
        await bump();
        const parsed = extractJSON<{ cards: Flashcard[] }>(res.text);
        if (parsed?.cards) setTabContent((prev) => ({ ...prev, flashcards: parsed.cards }));
      } else if (tab === "quiz") {
        const res = await askAI(buildQuizPrompt(c, t), "Return ONLY valid JSON.");
        setProvider(res.provider);
        await bump();
        const parsed = extractJSON<{ questions: QuizQ[] }>(res.text);
        if (parsed?.questions) setTabContent((prev) => ({ ...prev, quiz: parsed.questions }));
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
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">YouTube Summarizer</h2>
          <p className="text-sm text-muted-foreground">Paste any YouTube URL → get summary, key points, flashcards & quiz</p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      {/* URL Input */}
      <div className="card-soft space-y-4 p-5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Youtube className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-red-500" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchVideo()}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full rounded-xl border border-input bg-background py-3 pl-10 pr-4 text-sm focus:border-red-400 focus:outline-none"
            />
          </div>
          <button
            onClick={fetchVideo}
            disabled={fetching || !url.trim()}
            className="flex-shrink-0 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />}
            {fetching ? "Fetching…" : "Analyze"}
          </button>
        </div>

        {/* Examples */}
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Try an example:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setUrl(ex)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {ex.slice(0, 40)}…
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Works best with videos that have <strong>subtitles or closed captions</strong>. For videos without captions, we'll research the topic using web search.
          </p>
        </div>
      </div>

      {/* Fetching state */}
      {fetching && (
        <div className="card-soft flex flex-col items-center justify-center gap-4 py-14 text-center">
          <div className="relative">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-red-100">
              <Youtube className="h-8 w-8 text-red-500" />
            </div>
            <Loader2 className="absolute -right-2 -top-2 h-6 w-6 animate-spin text-red-500" />
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
          <div className="flex items-start gap-4 rounded-2xl border border-border bg-background p-4 shadow-sm">
            <div className="relative flex-shrink-0">
              <img
                src={`https://img.youtube.com/vi/${videoInfo.id}/mqdefault.jpg`}
                alt="thumbnail"
                className="h-20 w-32 rounded-xl object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm leading-snug line-clamp-2">{videoInfo.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  videoInfo.source === "transcript"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}>
                  {videoInfo.source === "transcript" ? "✅ Transcript available" : "🔍 Research mode"}
                </span>
                {provider && <ProviderBadge provider={provider} />}
                <a
                  href={`https://www.youtube.com/watch?v=${videoInfo.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Watch <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Tab buttons */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TABS.map(({ key, label, emoji, color, light }) => {
              const active = activeTab === key;
              const done = hasTab(key);
              const loading = tabLoading === key;
              return (
                <button
                  key={key}
                  onClick={() => hasTab(key) ? setActiveTab(key) : generateTab(key)}
                  disabled={!!tabLoading}
                  className={`relative rounded-2xl border px-3 py-3 text-sm font-bold transition-all disabled:cursor-wait ${
                    active ? `${color} text-white shadow-md border-transparent` : `${light} border`
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      {emoji} {label}
                      {done && !active && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-current opacity-50" />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="card-soft min-h-[280px] p-5 sm:p-6">
            {tabLoading === activeTab ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {activeTab === "summary" ? "Writing detailed summary…" :
                   activeTab === "keypoints" ? "Extracting key points…" :
                   activeTab === "flashcards" ? "Creating flashcards…" : "Generating quiz questions…"}
                </p>
              </div>
            ) : activeTab === "summary" && tabContent.summary ? (
              <div className="prose prose-sm max-w-none
                prose-headings:font-bold prose-headings:text-foreground prose-h2:text-base prose-h2:mt-5 prose-h2:mb-2 prose-h2:border-b prose-h2:pb-1 prose-h2:border-border
                prose-p:leading-relaxed prose-p:text-foreground/85
                prose-strong:text-foreground prose-strong:font-bold prose-strong:bg-yellow-50 prose-strong:px-0.5 prose-strong:rounded
                prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-primary/5 prose-blockquote:rounded-r-xl prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:not-italic prose-blockquote:text-foreground
                prose-ul:space-y-1 prose-li:text-foreground/85
                prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                prose-a:text-primary">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{tabContent.summary}</ReactMarkdown>
              </div>
            ) : activeTab === "keypoints" && Array.isArray(tabContent.keypoints) ? (
              <div className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                  ⚡ {(tabContent.keypoints as unknown[]).length} Key Points — tap to expand
                </p>
                {(tabContent.keypoints as unknown as { emoji: string; point: string; detail: string }[]).map((pt, i) => (
                  <KeyPointCard key={i} point={pt} index={i} />
                ))}
              </div>
            ) : activeTab === "flashcards" && tabContent.flashcards ? (
              <div className="space-y-4">
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
                  <p className="text-2xl mb-2">
                    {TABS.find(t => t.key === activeTab)?.emoji}
                  </p>
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
