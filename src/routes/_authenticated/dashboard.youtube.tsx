import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Youtube, FileText, Zap, BookOpen, HelpCircle, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
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

const TABS: { key: TabKey; label: string; emoji: string; color: string }[] = [
  { key: "summary",    label: "Summary",     emoji: "📋", color: "bg-blue-500" },
  { key: "keypoints",  label: "Key Points",  emoji: "⚡", color: "bg-violet-500" },
  { key: "flashcards", label: "Flashcards",  emoji: "🃏", color: "bg-emerald-500" },
  { key: "quiz",       label: "Quiz",        emoji: "❓", color: "bg-amber-500" },
];

const EXAMPLES = [
  "https://www.youtube.com/watch?v=aircAruvnKk",
  "https://youtu.be/PkZNo7MFNFg",
  "https://www.youtube.com/watch?v=HAnw168huqA",
];

function buildSummaryPrompt(content: string, title: string, source: string): string {
  const ctx = source === "transcript" ? `Full transcript:\n${content}` : `Research context about this video:\n${content}`;
  return `You are a study assistant. Based on the following content from the YouTube video "${title}", write a comprehensive study summary.

${ctx}

Write a clear, well-structured summary in 4–6 paragraphs covering:
1. Main topic and purpose
2. Key concepts explained
3. Important details and examples
4. Conclusions or takeaways

Use markdown formatting with bold for key terms.`;
}

function buildKeyPointsPrompt(content: string, title: string): string {
  return `Extract the most important key points from this YouTube video "${title}".

Content: ${content.slice(0, 10000)}

Return STRICT JSON array of 8-12 key points:
["key point 1", "key point 2", ...]
Each point must be a complete, self-contained fact or insight (1-2 sentences). No prose outside JSON.`;
}

function buildFlashcardsPrompt(content: string, title: string): string {
  return `Create study flashcards from this YouTube video "${title}".

Content: ${content.slice(0, 10000)}

Return STRICT JSON array of 8-12 flashcards:
[{"front": "term or question", "back": "definition or answer"}]
Focus on key terms, concepts, and facts. No prose outside JSON.`;
}

function buildQuizPrompt(content: string, title: string): string {
  return `Create multiple-choice quiz questions from this YouTube video "${title}".

Content: ${content.slice(0, 10000)}

Return STRICT JSON array of 6-8 questions:
[{"question": "question text", "options": ["A", "B", "C", "D"], "answer": "exact correct option text", "explanation": "1-2 sentences"}]
No prose outside JSON.`;
}

function FlashcardItem({ card }: { card: Flashcard }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div onClick={() => setFlipped(!flipped)} className="cursor-pointer rounded-xl border border-border bg-background p-4 transition-all hover:shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{flipped ? "Answer" : "Question"}</span>
        <span className="text-xs text-muted-foreground">{flipped ? "↩ flip back" : "tap to flip"}</span>
      </div>
      <p className={`text-sm font-medium ${flipped ? "text-emerald-700" : "text-foreground"}`}>{flipped ? card.back : card.front}</p>
    </div>
  );
}

function QuizItem({ q, index }: { q: QuizQ; index: number }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-3">
      <p className="text-sm font-semibold">{index + 1}. {q.question}</p>
      <div className="space-y-2">
        {q.options.map((opt) => {
          const isSelected = selected === opt;
          const isCorrect = opt === q.answer;
          let cls = "w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ";
          if (!selected) cls += "border-border hover:bg-accent";
          else if (isCorrect) cls += "border-emerald-400 bg-emerald-50 text-emerald-800 font-medium";
          else if (isSelected) cls += "border-red-400 bg-red-50 text-red-800";
          else cls += "border-border opacity-50";
          return (
            <button key={opt} onClick={() => !selected && setSelected(opt)} className={cls}>{opt}</button>
          );
        })}
      </div>
      {selected && (
        <div className={`rounded-lg px-3 py-2 text-xs ${selected === q.answer ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
          {selected === q.answer ? "✅ Correct! " : `❌ Incorrect. `}{q.explanation}
        </div>
      )}
    </div>
  );
}

function YoutubePage() {
  const { user } = Route.useRouteContext();
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [videoData, setVideoData] = useState<{ videoId: string; title: string; content: string; source: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [tabContent, setTabContent] = useState<TabContent>({});
  const [tabLoading, setTabLoading] = useState<TabKey | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "youtube");

  async function fetchVideo() {
    if (!url.trim()) return toast.error("Enter a YouTube URL");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setFetching(true);
    setVideoData(null);
    setTabContent({});

    const result = await fetchYouTubeServer({ data: { url: url.trim() } });

    if (!result.videoId) {
      toast.error("Invalid YouTube URL — please check and try again");
      setFetching(false);
      return;
    }

    const content = result.transcript || result.researchContext || "";
    if (!content) {
      toast.error("Couldn't fetch video content. This video may have captions disabled.");
      setFetching(false);
      return;
    }

    setVideoData({ videoId: result.videoId, title: result.title, content, source: result.source });
    await bump();

    // Auto-generate summary
    setActiveTab("summary");
    setTabLoading("summary");
    const res = await askAI(
      buildSummaryPrompt(content, result.title, result.source),
      "You are a concise, accurate study assistant. Use markdown formatting.",
    );
    setProvider(res.provider);
    setTabContent({ summary: res.text });
    setTabLoading(null);
    setFetching(false);
  }

  async function loadTab(tab: TabKey) {
    setActiveTab(tab);
    if (tabContent[tab] !== undefined || !videoData) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);

    setTabLoading(tab);
    const { content, title } = videoData;

    let prompt = "";
    if (tab === "keypoints") prompt = buildKeyPointsPrompt(content, title);
    else if (tab === "flashcards") prompt = buildFlashcardsPrompt(content, title);
    else if (tab === "quiz") prompt = buildQuizPrompt(content, title);

    const res = await askAI(prompt, "Return ONLY valid JSON. No markdown. No prose.");
    setProvider(res.provider);
    await bump();

    if (tab === "keypoints") {
      const data = extractJSON<string[]>(res.text);
      setTabContent((prev) => ({ ...prev, keypoints: data || [] }));
    } else if (tab === "flashcards") {
      const data = extractJSON<Flashcard[]>(res.text);
      setTabContent((prev) => ({ ...prev, flashcards: data || [] }));
    } else if (tab === "quiz") {
      const data = extractJSON<QuizQ[]>(res.text);
      setTabContent((prev) => ({ ...prev, quiz: data || [] }));
    }
    setTabLoading(null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">YouTube Lecture Summarizer</h2>
          <p className="text-sm text-muted-foreground">Paste a YouTube URL → get summary, key points, flashcards & quiz</p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      {/* URL input */}
      <div className="card-soft space-y-3 p-4 sm:p-5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Youtube className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-red-500" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchVideo()}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <button
            onClick={fetchVideo}
            disabled={fetching || !url.trim()}
            className="flex-shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50 flex items-center gap-2"
          >
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            <span className="hidden sm:inline">{fetching ? "Loading…" : "Analyze"}</span>
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">Examples:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => setUrl(ex)} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-mono">
              {ex.slice(0, 40)}…
            </button>
          ))}
        </div>
      </div>

      {/* Video content */}
      {videoData && (
        <div className="space-y-4">
          {/* Video info */}
          <div className="card-soft flex flex-wrap items-center gap-3 p-4">
            <img
              src={`https://img.youtube.com/vi/${videoData.videoId}/mqdefault.jpg`}
              alt={videoData.title}
              className="h-16 w-28 rounded-lg object-cover flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm line-clamp-2">{videoData.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${videoData.source === "transcript" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {videoData.source === "transcript" ? "✓ Transcript" : "Research mode"}
                </span>
                <a href={`https://www.youtube.com/watch?v=${videoData.videoId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> Watch on YouTube
                </a>
                {provider && <ProviderBadge provider={provider} />}
              </div>
            </div>
          </div>

          {/* Transcript preview */}
          {videoData.source === "transcript" && (
            <div className="card-soft overflow-hidden p-4">
              <button onClick={() => setShowTranscript(!showTranscript)} className="flex w-full items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> Transcript Preview</span>
                {showTranscript ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showTranscript && (
                <p className="mt-3 max-h-40 overflow-y-auto text-xs leading-relaxed text-muted-foreground">
                  {videoData.content.slice(0, 1200)}…
                </p>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {TABS.map(({ key, label, emoji, color }) => (
              <button
                key={key}
                onClick={() => loadTab(key)}
                className={`flex-shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${activeTab === key ? `${color} text-white shadow-sm` : "border border-border bg-background hover:bg-accent"}`}
              >
                {emoji} {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="card-soft min-h-[200px] p-4 sm:p-6">
            {tabLoading === activeTab ? (
              <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 text-center">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {activeTab === "summary" ? "Writing summary…" : activeTab === "keypoints" ? "Extracting key points…" : activeTab === "flashcards" ? "Creating flashcards…" : "Generating quiz…"}
                </p>
              </div>
            ) : activeTab === "summary" && tabContent.summary ? (
              <div className="prose prose-sm max-w-none prose-headings:text-base prose-p:text-sm prose-p:leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{tabContent.summary}</ReactMarkdown>
              </div>
            ) : activeTab === "keypoints" && tabContent.keypoints ? (
              <div className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{tabContent.keypoints.length} Key Points</p>
                {tabContent.keypoints.map((pt, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl bg-violet-50 px-4 py-3">
                    <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-700">{i + 1}</span>
                    <p className="text-sm text-violet-900">{pt}</p>
                  </div>
                ))}
              </div>
            ) : activeTab === "flashcards" && tabContent.flashcards ? (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{tabContent.flashcards.length} Flashcards — tap each to flip</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {tabContent.flashcards.map((c, i) => <FlashcardItem key={i} card={c} />)}
                </div>
              </div>
            ) : activeTab === "quiz" && tabContent.quiz ? (
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{tabContent.quiz.length} Questions</p>
                {tabContent.quiz.map((q, i) => <QuizItem key={i} q={q} index={i} />)}
              </div>
            ) : (
              <div className="flex min-h-[160px] items-center justify-center">
                <p className="text-sm text-muted-foreground">Click a tab to generate content</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
