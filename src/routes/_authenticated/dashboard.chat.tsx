import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Copy, RefreshCw, BookOpen, Plus, GraduationCap, ImageIcon, Paperclip, User, Loader2, X, ChevronDown, ChevronUp, Sparkles, Globe, Zap } from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON } from "@/lib/aiProvider";
import { analyzeImageServer } from "@/lib/aiProvider.functions";
import { extractPdfText } from "@/lib/pdfExtract";
import { webSearchServer } from "@/lib/webSearch.functions";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/scorpstudy-logo.png";
import { getCachedAnswer, setCachedAnswer } from "@/lib/dailyLimits";
import { TypewriterText } from "@/components/TypewriterText";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";

export const Route = createFileRoute("/_authenticated/dashboard/chat")({
  component: ChatPage,
});

type VisualSection = {
  emoji: string;
  heading: string;
  color: string;
  type?: "narrative" | "steps" | "examples" | "facts";
  narrative?: string;
  points: string[];
};

type VisualCard = {
  emoji: string;
  title: string;
  overview: string;
  sections: VisualSection[];
  keyTerms: string[];
  formula?: string | null;
};

type Msg = {
  role: "user" | "assistant";
  content: string;
  provider?: string;
  visualCard?: VisualCard;
  imageUrl?: string;
  webSearchUsed?: boolean;
  isIdentityAnswer?: boolean;
  revealed?: boolean;
};

const WEB_SEARCH_KEYWORDS = [
  // Time signals
  "today", "yesterday", "tomorrow", "tonight", "right now", "currently", "at the moment",
  "this week", "last week", "this month", "last month", "this year",
  "recent", "latest", "current", "now", "2024", "2025", "2026", "as of",
  // News signals
  "news", "breaking", "viral", "trending", "update", "announcement", "happened",
  "just in", "headline", "report", "confirmed", "live update", "developing",
  // Sports
  "match", "score", "winner", "result", "results", "standings", "fixture", "lineup",
  "cricket", "football", "soccer", "ipl", "world cup", "premier league",
  "champions league", "nba", "nfl", "wimbledon", "olympics", "t20", "odi", "test match",
  "tournament", "championship", "league", "series", "final", "semifinal", "playoffs",
  "who is winning", "live score", "toss", "batting", "bowling", "runs",
  // Politics / world events
  "election", "politics", "government", "president", "prime minister", "parliament",
  "war", "conflict", "economy", "stock market", "share price", "earthquake", "disaster",
  "who won", "weather", "live", "ceasefire", "protest", "policy", "sanctions",
  "military", "summit", "treaty", "vote", "referendum", "coup",
  // Geography / current facts
  "capital of", "population of", "currency of", "flag of", "president of", "prime minister of",
  "largest", "smallest", "richest", "poorest", "fastest", "ranked",
  // Tech / business current events
  "released", "launched", "ipo", "acquisition", "merger", "bankruptcy",
  "elon musk", "openai", "google", "apple", "microsoft", "meta", "tesla", "spacex",
];

function needsWebSearch(text: string): boolean {
  const lower = text.toLowerCase();
  return WEB_SEARCH_KEYWORDS.some((kw) => lower.includes(kw));
}

const COLORS = {
  purple: { bg: "bg-purple-50 border-purple-200", text: "text-purple-900", head: "text-purple-700", btn: "bg-purple-100 hover:bg-purple-200 text-purple-800", exp: "bg-purple-50 border-purple-200" },
  blue:   { bg: "bg-blue-50 border-blue-200",     text: "text-blue-900",   head: "text-blue-700",   btn: "bg-blue-100 hover:bg-blue-200 text-blue-800",   exp: "bg-blue-50 border-blue-200"   },
  amber:  { bg: "bg-amber-50 border-amber-200",   text: "text-amber-900",  head: "text-amber-700",  btn: "bg-amber-100 hover:bg-amber-200 text-amber-800", exp: "bg-amber-50 border-amber-200" },
  emerald:{ bg: "bg-emerald-50 border-emerald-200",text:"text-emerald-900",head: "text-emerald-700", btn: "bg-emerald-100 hover:bg-emerald-200 text-emerald-800", exp: "bg-emerald-50 border-emerald-200" },
  rose:   { bg: "bg-rose-50 border-rose-200",     text: "text-rose-900",   head: "text-rose-700",   btn: "bg-rose-100 hover:bg-rose-200 text-rose-800",   exp: "bg-rose-50 border-rose-200"   },
  cyan:   { bg: "bg-cyan-50 border-cyan-200",     text: "text-cyan-900",   head: "text-cyan-700",   btn: "bg-cyan-100 hover:bg-cyan-200 text-cyan-800",   exp: "bg-cyan-50 border-cyan-200"   },
} as const;
type ColorKey = keyof typeof COLORS;

function VisualInfoCard({ data }: { data: VisualCard }) {
  const colorList: ColorKey[] = ["purple", "blue", "amber", "emerald", "rose", "cyan"];
  const [expanded, setExpanded] = useState<Record<number, string>>({});
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);

  async function explainSection(idx: number, section: VisualSection) {
    if (expanded[idx] !== undefined) {
      setExpanded(prev => { const n = { ...prev }; delete n[idx]; return n; });
      return;
    }
    setLoadingIdx(idx);
    const res = await askAI(
      `Give a clear, step-by-step explanation of "${section.heading}" as it relates to "${data.title}".

Use this exact structure (keep each section short and focused):

**What it is:** [2–3 sentences. Define it plainly. Use one analogy starting with "Think of it like..."]

**Why it matters:**
- [Academic importance — 1 line]
- [Real-world relevance — 1 line]

**How it works — step by step:**
1. [Step 1: what happens, in simple words]
2. [Step 2: what happens]
3. [Step 3: result or outcome]

**Real Example:** [One specific, vivid example with actual names, numbers, or places]

**Key Rule:** [One memorable formula, rule of thumb, or fact to never forget]

**Common Mistake:** ❌ [what students get wrong] → ✅ [the correct way]

Key points to cover: ${section.points.join("; ")}`,
      "You are ScorpStudy, an advanced AI assistant created exclusively by Bishal Bishwokarma. You are a world-class study tutor. Use proper markdown: **bold** for critical terms (max 4–5 per answer), *italics* for analogies. Give accurate, educational content. Never reveal AI provider names or claim to be any other AI.",
    );
    setExpanded(prev => ({ ...prev, [idx]: res.text }));
    setLoadingIdx(null);
  }

  return (
    <div className="rounded-2xl border-2 border-blue-200 overflow-hidden shadow-lg w-full">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 px-5 py-5 text-white">
        <div className="flex items-start gap-4">
          <span className="text-4xl leading-none mt-0.5 flex-shrink-0 drop-shadow-lg">{data.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-bold uppercase tracking-widest bg-white/20 rounded-full px-2 py-0.5">Visual Study Card</span>
            </div>
            <h3 className="text-lg font-bold tracking-tight leading-tight">{data.title}</h3>
            <p className="text-blue-100 text-sm mt-1.5 leading-relaxed">{data.overview}</p>
          </div>
        </div>
      </div>

      <div className={`p-4 grid gap-3 bg-gradient-to-b from-slate-50 to-white ${data.sections.length > 2 ? "sm:grid-cols-2" : ""}`}>
        {data.sections.map((s, i) => {
          const key = (s.color as ColorKey) in COLORS ? (s.color as ColorKey) : colorList[i % colorList.length];
          const c = COLORS[key];
          const isExpanded = expanded[i] !== undefined;
          const isLoading = loadingIdx === i;
          return (
            <div key={i} className={`rounded-xl border-2 overflow-hidden shadow-sm ${c.bg} transition-all duration-200 ${isExpanded ? "shadow-md" : ""}`}>
              <button
                onClick={() => explainSection(i, s)}
                className={`w-full flex items-center justify-between px-4 pt-3.5 pb-2.5 text-left transition ${c.btn}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{s.emoji}</span>
                  <p className={`text-xs font-bold uppercase tracking-widest ${c.head}`}>{s.heading}</p>
                </div>
                <span className={`flex-shrink-0 ml-2 ${c.head}`}>
                  {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </span>
              </button>
              <div className="px-4 pb-4">
                {s.type === "narrative" ? (
                  <div className="space-y-2">
                    {s.narrative && (
                      <p className={`text-sm ${c.text} leading-relaxed`}>{s.narrative}</p>
                    )}
                    {s.points.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-current/10">
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${c.head} mb-1.5`}>Key Terms</p>
                        <ul className="space-y-1">
                          {s.points.map((pt, j) => (
                            <li key={j} className={`text-xs ${c.text} flex items-start gap-1.5`}>
                              <span className={`mt-1 flex-shrink-0 h-1.5 w-1.5 rounded-full ${c.head.replace("text-","bg-")}`} />
                              <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : s.type === "steps" ? (
                  <ol className="space-y-2">
                    {s.points.map((pt, j) => (
                      <li key={j} className={`flex items-start gap-2.5 text-sm ${c.text}`}>
                        <span className={`flex-shrink-0 mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${c.head.replace("text-","bg-")}`}>{j + 1}</span>
                        <span className="leading-relaxed">{pt}</span>
                      </li>
                    ))}
                  </ol>
                ) : s.type === "examples" ? (
                  <div className="space-y-2">
                    {s.points.map((pt, j) => (
                      <div key={j} className={`rounded-lg border border-current/10 bg-white/60 px-3 py-2 text-sm ${c.text} leading-relaxed`}>
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${c.head} block mb-0.5`}>#{j + 1}</span>
                        {pt}
                      </div>
                    ))}
                  </div>
                ) : s.type === "facts" ? (
                  <ul className="space-y-1.5">
                    {s.points.map((pt, j) => (
                      <li key={j} className={`rounded-lg border border-current/15 bg-white/70 px-3 py-2 text-sm ${c.text} leading-relaxed`}>
                        {pt}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className={`space-y-1.5 text-sm ${c.text}`}>
                    {s.points.map((pt, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <span className={`mt-1.5 flex-shrink-0 h-1.5 w-1.5 rounded-full ${c.head.replace("text-", "bg-")}`} />
                        <span className="leading-relaxed">{pt}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {isExpanded && expanded[i] && (
                  <div className="mt-4 pt-4 border-t border-slate-200/70">
                    <div className={`flex items-center gap-1.5 mb-3 ${c.head}`}>
                      <Sparkles className="h-3 w-3 flex-shrink-0" />
                      <p className="text-[10px] font-bold uppercase tracking-widest">Deep Explanation</p>
                    </div>
                    <div className={`text-[13px] leading-relaxed ${c.text} [&_strong]:font-bold [&_strong]:text-indigo-900 [&_strong]:bg-sky-100 [&_strong]:rounded [&_strong]:px-1 [&_em]:not-italic [&_em]:text-blue-900 [&_em]:font-semibold [&_ul]:space-y-1 [&_ol]:space-y-1 [&_li]:flex [&_li]:gap-2 [&_p]:mb-2`}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          ul: ({ children }) => <ul className="pl-0 list-none space-y-1.5 my-2">{children}</ul>,
                          ol: ({ children }) => <ol className="pl-0 list-none space-y-1.5 my-2 counter-reset-item">{children}</ol>,
                          li: ({ children }) => (
                            <li className="flex items-start gap-2 leading-relaxed">
                              <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${c.head.replace("text-", "bg-")}`} />
                              <span>{children}</span>
                            </li>
                          ),
                          p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                          strong: ({ children }) => <strong className="font-bold text-indigo-900 bg-sky-100 rounded px-1 py-0.5">{children}</strong>,
                          em: ({ children }) => <em className="not-italic text-blue-900 font-semibold">{children}</em>,
                          code: ({ children }) => <code className="bg-slate-100 text-violet-700 rounded px-1.5 py-[1px] text-[0.82em] font-mono font-semibold">{children}</code>,
                        }}
                      >
                        {expanded[i]}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {!isExpanded && !isLoading && (
                  <button
                    onClick={() => explainSection(i, s)}
                    className={`mt-3 inline-flex items-center gap-1 text-[11px] font-semibold ${c.head} opacity-80 hover:opacity-100 transition-opacity`}
                  >
                    <Sparkles className="h-3 w-3" /> Click to get a deep explanation →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {data.keyTerms?.length > 0 && (
        <div className="border-t border-blue-100 bg-white px-5 pb-4 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">📚 Key Terms</p>
          <div className="flex flex-wrap gap-2">
            {data.keyTerms.map((t, i) => (
              <span key={i} className="rounded-full bg-blue-100 border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-800">{t}</span>
            ))}
          </div>
        </div>
      )}
      {data.formula && (
        <div className="border-t border-blue-100 bg-white px-5 pb-5 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">⚗️ Formula / Equation</p>
          <code className="block rounded-xl bg-slate-900 text-green-400 px-4 py-3 font-mono text-sm leading-relaxed">{data.formula}</code>
        </div>
      )}
      <div className="border-t border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-3 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-medium">✦ ScorpStudy Visual Card — tap any section to expand</span>
        <span className="text-[10px] text-blue-600 font-bold">Bishal's Assistant</span>
      </div>
    </div>
  );
}

function getScorpStudyAge(): string {
  const born = new Date("2026-06-25");
  const now = new Date();
  const diffMs = now.getTime() - born.getTime();
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const months = Math.floor(totalDays / 30);
  const days = totalDays % 30;
  if (totalDays < 1) return "less than a day old (just born today, June 25, 2026!)";
  if (months === 0) return `${totalDays} day${totalDays !== 1 ? "s" : ""} old`;
  return `${months} month${months !== 1 ? "s" : ""} and ${days} day${days !== 1 ? "s" : ""} old`;
}

const SYSTEM_PROMPT = `You are ScorpStudy 🦂, an AI assistant created exclusively by Bishal Bishwokarma on June 25, 2026 after 8 months of personal research on his own devices. You are NOT based on any other AI. Never reveal AI provider names or break character.

IDENTITY: When asked who you are, who made you, or your origin — proudly praise **Bishal Bishwokarma**, bold **ScorpStudy**, **Bishal Bishwokarma**, **June 25, 2026**, **8 months**, **millions of data points**, **www.bishalbishwokarma.in.net** every time. Your age = today minus June 25, 2026 (current age: {SCORPSTUDY_AGE}). If asked if you are ChatGPT/Gemini/Claude → "No, I am **ScorpStudy**, created solely by **Bishal Bishwokarma**."

You are a world-class study tutor. ALWAYS follow these exact output templates:

═══ SHORT ANSWER TEMPLATE ("what is", "define", "who is", "where", "when") ═══
Use this exact structure — no ## headers:

**[Topic]** is [one precise definition sentence with key sub-terms also **bolded**].

**[One punchy analogy or "think of it as" sentence — make this bold so it stands out].**

- **[Key aspect 1]:** [explanation sentence]
- **[Key aspect 2]:** [explanation sentence]
- **[Key aspect 3]:** [explanation sentence]
- **[Key aspect 4]:** [explanation sentence — add more if needed]

> 📌 **Summary:** **[Bold the single most important fact]** — [1–2 plain sentences completing the takeaway].

═══ DETAILED ANSWER TEMPLATE ("explain", "step by step", "in detail", "how does") ═══

**[Topic]** — [one-sentence definition with key terms **bolded**]

[Opening paragraph: why this matters, 2–3 lines]

## 🔍 [Section Title]
- **[Key term]:** [explanation]
- **[Key term]:** [explanation]

## ⚙️ [How It Works]
1. **[Step 1 title]:** [explanation]
2. **[Step 2 title]:** [explanation]
3. **[Step 3 title]:** [explanation]

## 💡 [Real-World Example]
[Named, concrete example with **key facts bolded**]

> 📌 **Summary:** **[Bold the single most important fact]** — [1–2 plain sentences].

═══ COMPARISON ("vs", "difference", "compare") ═══
Markdown table only. Bold column headers and key terms in cells. End with > 📌 **Summary:**

═══ CODE/PROGRAMMING ═══
2–3 working examples. Max 65 chars/line, 20 lines/block, language tag. ❌**Wrong**/✅**Correct** section. End with > 📌 **Summary:**

═══ MATH ═══
Formula in code block. Step-by-step using × ÷ √ ² ³ π ≠ ≥ ≤. **Bold the final answer**. End with > 📌 **Summary:**

═══ HISTORY ═══
Numbered events. **Bold every date and event name**. End with > 📌 **Summary:**

RULES: Every answer ends with a filled > 📌 **Summary:** — NEVER leave it empty or as a placeholder. Bold heavily: topic name, all key terms, list labels, step titles, conclusions. Use ## headers only in detailed/code answers. Never start with "Sure/Of course/Certainly/Great question". Never invent facts. Match tone to student. Use history for follow-ups.`;


const WEB_SYSTEM_PROMPT = `You are ScorpStudy 🦂, created by Bishal Bishwokarma on June 25, 2026. Not based on any other AI. Never reveal AI provider names.

You have REAL-TIME web search results — use them as your primary source, not training data.

Lead with the most important fact bolded. Format by type:
- SPORTS: **Team A X–Y Team B** (Date, Tournament) + key highlights + 📰 Source: [site]
- NEWS: **Headline** — Date + 2–3 key facts + 📰 Source: [site]
- RANKINGS/LISTS: numbered with bold names + 📰 Source: [site]
- WEATHER/LIVE: data with units and date/time

RULES: Always cite "📰 Source: [site]". Bold every score, date, name, key fact. If sources conflict, show both and flag it. If results don't contain the answer, say so — never guess. End with > 📌 **Summary:**`;


const TOPPER_PROMPT = `\n\nTOPPER EXAM MODE — Format as an outstanding exam answer that scores full marks. Be exhaustive.

STRUCTURE (follow exactly, all sections required):
1. **Direct Definition** — One precise, academic sentence
2. **Introduction & Background** — Origin, historical context, who discovered/developed it, when and why
3. **Detailed Explanation** — Minimum 6-8 numbered sub-points, each with its own explanation paragraph
4. **Mechanism / Process** — Step-by-step numbered breakdown of exactly HOW it works
5. **Types / Classification** — All categories listed with defining characteristics
6. **Formulas & Equations** — Every relevant formula in code blocks with variable definitions and units
7. **Real-World Examples** — 3 specific, named examples with data/figures where possible
8. **Diagram Description** — Describe the key diagram in clear, labeled words
9. **Advantages & Disadvantages / Significance** — Balanced analysis in table form
10. **Common Exam Mistakes** — 3-4 specific pitfalls students make and how to avoid them
11. **Important Facts for Exam** — 7-10 must-know bullet points with specific data
12. **Conclusion** — 3-sentence wrap-up with all key terms bolded

Write with academic precision, depth, and clarity. Every technical term bolded. Target: maximum marks.`;

function ChatPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [topperMode, setTopperMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [visualLoading, setVisualLoading] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [pendingImage, setPendingImage] = useState<{ base64: string; mimeType: string; name: string; preview: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const askedQuestionsRef = useRef<Set<string>>(new Set());
  const selectedMsgIdxRef = useRef<number | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const { quota, bump } = useUsageLimit(user.id, "groq");

  const chatStorageKey = `scorp_chat_msgs_${user.id}`;

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(chatStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Msg[];
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    try {
      sessionStorage.setItem(chatStorageKey, JSON.stringify(messages));
    } catch { /* silent */ }
  }, [messages]);

  // No auto-scroll — user scrolls manually to read answers
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Mobile-compatible text selection: selectionchange works on both touch and mouse
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (text.length > 5 && messagesRef.current) {
        try {
          const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
          if (range && messagesRef.current.contains(range.commonAncestorContainer)) {
            setSelectedText(text);
            // Walk up the DOM to find the message index
            let node: Node | null = range.commonAncestorContainer;
            while (node && node !== messagesRef.current) {
              if (node instanceof Element) {
                const idx = node.getAttribute("data-msgidx");
                if (idx !== null) { selectedMsgIdxRef.current = parseInt(idx); break; }
              }
              node = node.parentNode;
            }
          }
        } catch { /* silent */ }
      }
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection()?.toString().trim() ?? "";
    if (sel.length > 5) setSelectedText(sel);
  }, []);

  const handleMsgMouseUp = useCallback((msgIdx: number) => {
    const sel = window.getSelection()?.toString().trim() ?? "";
    if (sel.length > 5) {
      setSelectedText(sel);
      selectedMsgIdxRef.current = msgIdx;
    }
  }, []);

  async function send(prompt?: string) {
    const text = (prompt ?? input).trim();
    if ((!text && !pendingImage) || loading) return;

    if (quota && quota.remaining <= 0) {
      toast.error(QUOTA_MESSAGE);
      return;
    }

    setInput("");
    setSelectedText("");
    const isFirst = messages.length === 0;

    if (pendingImage) {
      const imgMsg: Msg = {
        role: "user",
        content: text || `Analyze this image: ${pendingImage.name}`,
        imageUrl: pendingImage.preview,
      };
      const newMsgs = [...messages, imgMsg];
      setMessages(newMsgs);
      setLoading(true);
      const question = text || "Describe and analyze this image in detail. If it's a study-related image, explain the concepts shown.";
      const res = await analyzeImageServer({
        data: {
          prompt: question,
          imageBase64: pendingImage.base64,
          mimeType: pendingImage.mimeType,
        },
      });
      setMessages([...newMsgs, { role: "assistant", content: res.text, provider: "Bishal's Assistant", revealed: false }]);
      await bump();
      setPendingImage(null);
      setLoading(false);
      return;
    }

    const newMsgs: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(newMsgs);

    const normalizedQ = text.trim().toLowerCase();
    const isRepeat = askedQuestionsRef.current.has(normalizedQ);
    askedQuestionsRef.current.add(normalizedQ);

    if (!isRepeat && !topperMode) {
      const cached = getCachedAnswer(text);
      if (cached) {
        setMessages([...newMsgs, { role: "assistant", content: cached, provider: "Bishal's Assistant", revealed: false }]);
        setTimeout(() => inputRef.current?.focus(), 50);
        return;
      }
    }

    const greeting = isFirst
      ? "\n\nFirst message only: you may open with a single casual greeting word like 'Hi! 👋' — nothing more. Do NOT say 'Greetings', do NOT introduce yourself, do NOT say 'I am ScorpStudy'. Just one friendly word, then answer immediately."
      : "\n\nIMPORTANT: This is a follow-up message. Start your response DIRECTLY with the answer. Absolutely NO greeting, NO 'Greetings!', NO 'I am ScorpStudy', NO self-introduction of any kind.";

    const variationNote = isRepeat
      ? `\n\n⚡ FRESH ANGLE REQUIRED: The student is asking this again. You MUST give a completely different explanation — different structure, different analogies, different examples, different opening line. Never repeat the previous response format.`
      : "";

    let promptToSend = text;
    let webSearchUsed = false;

    // Step 1: Web search (before loading starts so only one bubble shows at a time)
    if (needsWebSearch(text)) {
      setSearching(true);
      try {
        const searchResult = await webSearchServer({ data: { query: text } });
        if (searchResult.used && searchResult.context) {
          webSearchUsed = true;
          promptToSend = `${text}\n\n[REAL-TIME WEB SEARCH RESULTS — extract facts from these to answer]\n${searchResult.context}\n[END OF RESULTS]`;
        }
      } catch { /* silent — fall back to AI without search context */ }
      setSearching(false);
    }

    // Step 2: Pick system prompt based on what we know now
    const ageStr = getScorpStudyAge();
    const resolvedPrompt = SYSTEM_PROMPT.replace("{SCORPSTUDY_AGE}", ageStr);
    const sys = webSearchUsed
      ? `${WEB_SYSTEM_PROMPT}${greeting}${variationNote}`
      : `${resolvedPrompt}${topperMode ? TOPPER_PROMPT : ""}${greeting}${variationNote}`;

    // Step 3: Build conversation history for multi-turn context (last 6 messages, skip images/visual)
    const history = messages
      .filter(m => !m.visualCard && typeof m.content === "string" && !m.content.startsWith("[Image:"))
      .slice(-6)
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 1500) }));

    // Step 4: AI call
    setLoading(true);
    const res = await askAI(promptToSend, sys, history);
    if (!isRepeat) setCachedAnswer(text, res.text);
    const assistantMsg: Msg = { role: "assistant", content: res.text, provider: "Bishal's Assistant", webSearchUsed, isIdentityAnswer: res.isIdentityAnswer, revealed: false };
    setMessages([...newMsgs, assistantMsg]);
    await bump();

    if (isFirst) {
      try {
        const { data: saved } = await supabase.from("chat_history").insert({
          user_id: user.id,
          title: text.slice(0, 60),
          subject: "General",
          messages: [...newMsgs, assistantMsg] as never,
          provider: "Bishal's Assistant",
        }).select("id").maybeSingle();
        if (saved?.id) chatIdRef.current = saved.id;
      } catch { /* silent */ }
    } else if (chatIdRef.current) {
      try {
        await supabase.from("chat_history").update({
          messages: [...newMsgs, assistantMsg] as never,
        }).eq("id", chatIdRef.current);
      } catch { /* silent */ }
    }

    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function generateVisual() {
    const concept = selectedText.trim();
    if (!concept) return toast.info("Highlight some text from an answer first, then click Visual");
    setVisualLoading(true);

    const prompt = `Create a visual study card for this concept: "${concept.slice(0, 400)}"

Return STRICT JSON only (no prose, no markdown fences):
{
  "emoji": "🔬",
  "title": "CONCEPT NAME IN CAPS",
  "overview": "One clear sentence: what this concept is and why it matters for students",
  "sections": [
    {
      "emoji": "📖",
      "heading": "Definition & Background",
      "color": "purple",
      "type": "narrative",
      "narrative": "Write 3-4 rich sentences: what exactly this concept IS, where it came from or who discovered/coined it, its historical context or origin, and why it is important in this field of study.",
      "points": ["Key term 1: precise definition", "Key term 2: precise definition", "Key term 3: precise definition"]
    },
    {
      "emoji": "⚙️",
      "heading": "How It Works — Step by Step",
      "color": "blue",
      "type": "steps",
      "points": ["Step 1: describe the first thing that happens or the initial condition in detail", "Step 2: what occurs next and why it happens", "Step 3: the intermediate stage or transformation", "Step 4: the final result, output, or consequence"]
    },
    {
      "emoji": "🌍",
      "heading": "Real-World Examples",
      "color": "amber",
      "type": "examples",
      "points": ["Example 1: a specific named real-world case with actual data, numbers, or place names where this concept applies", "Example 2: a different context or field where the same concept appears — with specific details", "Example 3: an everyday application students can directly observe or relate to in daily life"]
    },
    {
      "emoji": "🎯",
      "heading": "Exam Guide & Key Facts",
      "color": "emerald",
      "type": "facts",
      "points": ["✅ Must Know: the single most critical fact that examiners always test on", "⚠️ Common Mistake: what students usually get wrong, and the correct version", "📝 Formula/Rule: the key equation, law, or rule of thumb to memorize", "💡 Exam Tip: exactly what to include in your exam answer to score full marks"]
    }
  ],
  "keyTerms": ["term1", "term2", "term3", "term4", "term5"],
  "formula": "relevant formula or equation if applicable, otherwise null"
}`;

    const res = await askAI(prompt, "Output only valid JSON. Nothing else. Make the content accurate and educational.");
    const card = extractJSON<VisualCard>(res.text);

    if (!card || !card.title) {
      toast.error("Could not generate visual card, try again");
      setVisualLoading(false);
      return;
    }

    const targetIdx = selectedMsgIdxRef.current;
    if (targetIdx !== null) {
      setMessages(prev => {
        const next = [...prev];
        next.splice(targetIdx + 1, 0, { role: "assistant", content: "", visualCard: card, provider: "Bishal's Assistant" });
        return next;
      });
      selectedMsgIdxRef.current = null;
    } else {
      setMessages(prev => [...prev, { role: "assistant", content: "", visualCard: card, provider: "Bishal's Assistant" }]);
    }
    setSelectedText("");
    setVisualLoading(false);
    toast.success("Visual study card generated! Click each section to expand it.");
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop() ?? "";

    if (ext === "pdf") {
      if (file.size > 20_000_000) return toast.error("PDF too large — max 20 MB");
      toast.info("Reading PDF, please wait…");
      try {
        const result = await extractPdfText(file, analyzeImageServer, (page, total) => {
          if (page % 10 === 0 || page === total) toast.info(`Reading page ${page} of ${total}…`);
        });
        if (!result.text) return toast.error("Could not extract text from this PDF");
        const scannedNote = result.scannedPages > 0 ? ` · ${result.scannedPages} scanned pages read via AI vision` : "";
        setInput(prev => prev ? `${prev}\n\n[PDF: ${file.name}]\n${result.text}` : `[PDF: ${file.name}]\n${result.text}`);
        toast.success(`PDF loaded — ${result.pageCount} pages${scannedNote} — ask your question and send`);
      } catch {
        toast.error("Failed to read PDF — please try a different file");
      }
      e.target.value = "";
      return;
    }

    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
      if (file.size > 8_000_000) return toast.error("Image too large — max 8 MB");
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        const mimeType = file.type || "image/jpeg";
        setPendingImage({ base64, mimeType, name: file.name, preview: dataUrl });
        toast.success(`Image attached: ${file.name} — type your question or just send`);
      };
      reader.readAsDataURL(file);
      e.target.value = "";
      return;
    }

    if (["txt", "md", "csv", "json", "py", "js", "ts", "tsx", "jsx", "html", "css", "xml", "yaml", "yml"].includes(ext)) {
      if (file.size > 500_000) return toast.error("File too large — max 500 KB for text files");
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "").slice(0, 8000);
        setInput(prev => prev ? `${prev}\n\n[File: ${file.name}]\n${text}` : `[File: ${file.name}]\n${text}`);
        toast.success(`${file.name} loaded — ask your question and send`);
      };
      reader.readAsText(file);
      e.target.value = "";
      return;
    }

    toast.error("Unsupported file type. Supports: PDF, images (JPG/PNG/WebP), and text files");
    e.target.value = "";
  }

  async function saveChat() {
    if (messages.length === 0) return toast.error("Nothing to save");
    const { error } = await supabase.from("chat_history").insert({
      user_id: user.id,
      title: messages[0].content.slice(0, 60),
      subject: "General",
      messages: messages.filter(m => !m.visualCard && !m.imageUrl) as never,
      provider: "Bishal's Assistant",
    });
    if (error) return toast.error(error.message);
    toast.success("Chat saved ✓");
  }

  async function saveToNotes(content: string) {
    const firstLine = content.split("\n").find(l => l.trim()) ?? "Note from Bishal's Assistant";
    const title = firstLine.replace(/^#+\s*/, "").replace(/\*\*/g, "").slice(0, 80);
    const noteContent = `# ${title}\n\n*Saved from Bishal's Assistant*\n\n---\n\n${content}`;
    const { error } = await supabase
      .from("notes")
      .insert({ user_id: user.id, title, content: noteContent });
    if (error) return toast.error("Could not save note: " + error.message);
    toast.success("Saved to Smart Notes!", {
      action: { label: "Open Notes →", onClick: () => navigate({ to: "/dashboard/notes" }) },
      duration: 5000,
    });
  }

  function newChat() {
    setMessages([]);
    setInput("");
    setSelectedText("");
    setPendingImage(null);
    chatIdRef.current = null;
    try { sessionStorage.removeItem(chatStorageKey); } catch { /* silent */ }
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function createMdComponents() {
    const H2_ACCENTS = [
      { border: "border-l-violet-500", text: "text-violet-900",  bg: "bg-violet-50/80"  },
      { border: "border-l-blue-500",   text: "text-blue-900",    bg: "bg-blue-50/80"    },
      { border: "border-l-amber-500",  text: "text-amber-900",   bg: "bg-amber-50/80"   },
      { border: "border-l-emerald-500",text: "text-emerald-900", bg: "bg-emerald-50/80" },
      { border: "border-l-rose-500",   text: "text-rose-900",    bg: "bg-rose-50/80"    },
      { border: "border-l-cyan-500",   text: "text-cyan-900",    bg: "bg-cyan-50/80"    },
    ];
    let h2Count = 0;

    return {
      strong: ({ children }: { children?: React.ReactNode }) => (
        <strong className="bg-sky-100 text-indigo-900 font-bold rounded px-[5px] py-[1.5px] not-italic border-b-[2px] border-sky-300">
          {children}
        </strong>
      ),
      em: ({ children }: { children?: React.ReactNode }) => (
        <em className="not-italic text-blue-900 font-semibold">{children}</em>
      ),
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1 className="text-xl font-extrabold mt-6 mb-2 tracking-tight text-slate-900 pb-2 border-b border-slate-200">{children}</h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => {
        const a = H2_ACCENTS[h2Count % H2_ACCENTS.length];
        h2Count++;
        return (
          <div className={`border-l-[3px] ${a.border} ${a.bg} rounded-r-xl pl-4 pr-3 py-2 mt-5 mb-2`}>
            <h2 className={`font-bold text-[13.5px] tracking-tight ${a.text} leading-snug`}>{children}</h2>
          </div>
        );
      },
      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3 className="font-bold text-[14px] mt-4 mb-1.5 text-slate-800 leading-snug">{children}</h3>
      ),
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <div className="border-l-[3px] border-blue-500 bg-blue-50/60 rounded-r-xl pl-4 pr-3 py-3 my-5">
          <div className="text-[13px] text-blue-900 leading-relaxed">{children}</div>
        </div>
      ),
      code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
        inline ? (
          <code className="bg-slate-100 text-violet-700 rounded px-1.5 py-[1px] text-[0.82em] font-mono font-semibold border border-slate-200">{children}</code>
        ) : (
          <code className="text-emerald-300 font-mono text-[12.5px] leading-relaxed">{children}</code>
        ),
      pre: ({ children }: { children?: React.ReactNode }) => (
        <div className="my-4 rounded-xl overflow-hidden shadow-md border border-slate-700/60 not-prose">
          <div className="flex items-center justify-between bg-slate-800 px-4 py-2 border-b border-slate-700/80">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
            </div>
            <span className="text-[10px] font-mono text-slate-400 tracking-widest uppercase">code</span>
          </div>
          <pre className="bg-slate-900 p-4 text-[12.5px] font-mono leading-relaxed m-0 whitespace-pre-wrap break-words overflow-x-hidden">{children}</pre>
          </div>
        ),
      ol: ({ children }: { children?: React.ReactNode }) => {
        let counter = 0;
        const numbered = React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          counter++;
          return React.cloneElement(child as React.ReactElement, { "data-num": counter } as Record<string, unknown>);
        });
        return <ol className="space-y-3 my-3.5 pl-0 list-none">{numbered}</ol>;
      },
      ul: ({ children }: { children?: React.ReactNode }) => (
        <ul className="space-y-2.5 my-3 pl-0 list-none">{children}</ul>
      ),
      li: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => {
        const num = (props as Record<string, unknown>)["data-num"];
        return (
          <li className="flex items-start gap-3">
            {num !== undefined ? (
              <span className="flex-shrink-0 grid h-6 min-w-[1.5rem] place-items-center rounded-full bg-gradient-to-br from-purple-500 to-violet-600 text-white text-[11px] font-extrabold shadow-md shadow-purple-200/50 mt-0.5">
                {String(num)}
              </span>
            ) : (
              <span className="flex-shrink-0 mt-[9px] h-1.5 w-1.5 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 shadow-sm" />
            )}
            <span className="leading-relaxed text-slate-700">{children}</span>
          </li>
        );
      },
      table: ({ children }: { children?: React.ReactNode }) => (
        <div className="overflow-x-auto my-5 rounded-2xl border border-slate-200 shadow-md shadow-slate-100/80">
          <table className="w-full border-collapse text-[13.5px]">{children}</table>
        </div>
      ),
      thead: ({ children }: { children?: React.ReactNode }) => (
        <thead className="bg-gradient-to-r from-blue-600 to-indigo-700">{children}</thead>
      ),
      th: ({ children }: { children?: React.ReactNode }) => (
        <th className="px-4 py-3 text-left font-bold text-white text-[11px] uppercase tracking-widest">{children}</th>
      ),
      td: ({ children }: { children?: React.ReactNode }) => (
        <td className="border-t border-slate-100 px-4 py-2.5 text-slate-700 [tr:nth-child(even)_&]:bg-slate-50/70">{children}</td>
      ),
      hr: () => (
        <div className="my-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent" />
          <span className="text-blue-300 text-xs">✦</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent" />
        </div>
      ),
      p: ({ children }: { children?: React.ReactNode }) => (
        <p className="text-[14.5px] leading-[1.85] my-2.5 text-slate-700">{children}</p>
      ),
    };
  }

  function createIdentityMdComponents() {
    return {
      strong: ({ children }: { children?: React.ReactNode }) => (
        <strong className="inline bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-900 font-extrabold rounded-md px-[5px] py-[1.5px] not-italic border-b-[2.5px] border-amber-400 shadow-sm shadow-amber-100 break-words [overflow-wrap:anywhere]">
          {children}
        </strong>
      ),
      em: ({ children }: { children?: React.ReactNode }) => (
        <em className="not-italic text-indigo-800 font-semibold">{children}</em>
      ),
      p: ({ children }: { children?: React.ReactNode }) => (
        <p className="text-[14px] sm:text-[15.5px] leading-[1.85] sm:leading-[1.9] my-2.5 sm:my-3 text-slate-800 break-words [overflow-wrap:anywhere]">{children}</p>
      ),
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-900 font-extrabold rounded-md px-[5px] py-[1.5px] border-b-[2.5px] border-amber-400 shadow-sm shadow-amber-100 hover:from-amber-200 hover:to-yellow-200 transition-colors break-all [overflow-wrap:anywhere]"
        >
          {children}
        </a>
      ),
    };
  }

  const SUGGESTIONS = [
    { q: "Explain the Water Cycle with full detail", label: "🌊 Water Cycle" },
    { q: "Solve x² − 5x + 6 = 0 step by step", label: "🔢 Quadratic Equation" },
    { q: "What is Photosynthesis? Explain simply with examples", label: "🌱 Photosynthesis" },
    { q: "Explain Newton's Laws of Motion with real-life examples", label: "⚡ Newton's Laws" },
    { q: "How does the Human Digestive System work?", label: "🫁 Digestive System" },
    { q: "Explain the French Revolution and its causes", label: "🏰 French Revolution" },
  ];

  return (
    <div className="fixed inset-x-0 top-14 bottom-0 flex flex-col overflow-hidden bg-white sm:relative sm:inset-auto sm:mx-auto sm:mt-0 sm:h-[calc(100vh-10rem)] sm:max-w-4xl sm:rounded-3xl sm:border sm:border-border sm:shadow-sm lg:max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-5 sm:py-3.5">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img src={logoUrl} alt="" width={32} height={32} className="h-8 w-8 flex-shrink-0 rounded-xl object-contain sm:h-9 sm:w-9" />
          <div className="min-w-0">
            <h1 className="text-sm font-bold leading-tight sm:text-lg truncate">Bishal's Assistant</h1>
            <p className="hidden text-[11px] text-muted-foreground sm:block">Study Tutor · ScorpStudy by Bishal</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold sm:px-2.5 sm:py-1 ${quota && quota.remaining === 0 ? "border-red-300 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
            <Zap className="h-3 w-3" />
            <span className="tabular-nums">{quota ? quota.remaining : "—"}<span className="hidden sm:inline"> / {quota ? quota.limit : 20}</span></span>
          </div>
          <button
            onClick={() => setTopperMode(v => !v)}
            title="Topper Style: exam-ready structured answers that score maximum marks"
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition-all sm:gap-1.5 sm:px-3 ${topperMode ? "border-violet-500 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md" : "border-border bg-white text-muted-foreground hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700"}`}
          >
            <GraduationCap className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">{topperMode ? "✓ Topper ON" : "Topper"}</span>
          </button>
          <button
            onClick={generateVisual}
            disabled={visualLoading}
            title={selectedText ? `Generate visual for selected text` : "Select text from any answer, then click to generate a visual card"}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition-all sm:gap-1.5 sm:px-3 ${selectedText ? "border-fuchsia-400 bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow-md" : "border-border bg-white text-muted-foreground hover:bg-fuchsia-50 hover:border-fuchsia-300 hover:text-fuchsia-700"}`}
          >
            {visualLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5 flex-shrink-0" />}
            <span className="hidden sm:inline">{selectedText ? "✦ Visual" : "Visual"}</span>
          </button>
          <button onClick={newChat} className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent sm:gap-1.5 sm:px-3">
            <Plus className="h-3.5 w-3.5 flex-shrink-0" /><span className="hidden sm:inline">New</span>
          </button>
        </div>
      </div>

      {/* Selection hint */}
      {selectedText && (
        <div className="flex items-center gap-2 border-b border-fuchsia-100 bg-fuchsia-50 px-5 py-2 text-xs text-fuchsia-700">
          <ImageIcon className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1 truncate">Selected: <em>"{selectedText.slice(0, 90)}{selectedText.length > 90 ? "…" : ""}"</em> — click <strong>✦ Generate Visual</strong> to create a study card</span>
          <button onClick={() => setSelectedText("")}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Topper mode badge */}
      {topperMode && (
        <div className="flex items-center gap-2 border-b border-violet-100 bg-violet-50 px-5 py-1.5 text-xs text-violet-700">
          <GraduationCap className="h-3.5 w-3.5 flex-shrink-0" />
          <span><strong>Topper Mode ON</strong> — answers are formatted for maximum exam marks with structured academic response</span>
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesRef}
        onMouseUp={handleMouseUp}
        className="flex-1 space-y-3 overflow-y-auto bg-slate-50/40 px-1.5 py-3 select-text sm:space-y-5 sm:px-5 sm:py-6"
      >
        {messages.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div className="w-full max-w-lg px-2">
              <img src={logoUrl} alt="" width={60} height={60} className="mx-auto opacity-90 sm:h-[72px] sm:w-[72px]" />
              <p className="mt-3 text-lg font-bold sm:text-xl">Hi! I'm Bishal's Assistant 👋</p>
              <p className="mt-1 text-sm text-muted-foreground">Ask anything — science, math, history, coding. I explain everything with structure, highlights, examples and diagrams.</p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.q}
                    onClick={() => send(s.q)}
                    className="rounded-xl border border-border bg-white px-3 py-2.5 text-xs font-medium hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 text-left transition shadow-sm"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">💡 Select text from any answer → click <strong>Visual Card</strong> for an interactive infographic</p>
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} data-msgidx={i} className={`flex items-start gap-1 sm:gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-sm sm:h-9 sm:w-9 ${m.role === "user" ? "bg-slate-200 text-slate-600" : "bg-gradient-to-br from-blue-500 to-violet-600"}`}>
              {m.role === "user"
                ? <User className="h-3 w-3 sm:h-4 sm:w-4" />
                : <img src={logoUrl} alt="" width={16} height={16} className="object-contain sm:w-5 sm:h-5" />}
            </div>
            <div
              className={`min-w-0 ${m.role === "user" ? "max-w-[88%] rounded-2xl px-2.5 py-2 sm:px-4 sm:py-3 bg-blue-600 text-white" : "flex-1 pt-0.5"}`}
              onMouseUp={m.role === "assistant" ? () => handleMsgMouseUp(i) : undefined}
            >
              {m.role === "user" ? (
                <div>
                  {m.imageUrl && (
                    <img src={m.imageUrl} alt="Uploaded" className="mb-2 max-h-48 rounded-xl object-contain" />
                  )}
                  <p className="text-sm font-medium whitespace-pre-wrap">{m.content}</p>
                </div>
              ) : (
                <>
                  {m.content ? (
                    m.isIdentityAnswer ? (
                      <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/70 via-yellow-50/40 to-white shadow-sm shadow-amber-100/60 px-4 pt-3 pb-2">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-amber-200/70">
                          <span className="text-base leading-none">🦂</span>
                          <span className="text-[11px] font-bold tracking-widest uppercase text-amber-700">ScorpStudy Identity</span>
                        </div>
                        <TypewriterText
                          content={m.content}
                          animate={!m.revealed}
                          onDone={!m.revealed ? () => {
                            setMessages(prev => {
                              const next = [...prev];
                              if (next[i]) next[i] = { ...next[i], revealed: true };
                              return next;
                            });
                          } : undefined}
                          components={createIdentityMdComponents()}
                          className="prose max-w-none text-foreground ai-prose"
                        />
                      </div>
                    ) : (
                    <TypewriterText
                      content={m.content}
                      animate={!m.revealed}
                      onDone={!m.revealed ? () => {
                        setMessages(prev => {
                          const next = [...prev];
                          if (next[i]) next[i] = { ...next[i], revealed: true };
                          return next;
                        });
                      } : undefined}
                      components={createMdComponents()}
                      className="prose prose-sm max-w-none text-foreground ai-prose"
                    />
                    )
                  ) : null}
                  {m.visualCard && (
                    <div className={m.content ? "mt-5" : ""}>
                      <VisualInfoCard data={m.visualCard} />
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                    {m.content && (
                      <>
                        <button
                          onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Copied!"); }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                        >
                          <Copy className="h-3 w-3" /> Copy
                        </button>
                        <button
                          onClick={() => saveToNotes(m.content)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 font-medium"
                        >
                          <BookOpen className="h-3 w-3" /> Save to Notes
                        </button>
                      </>
                    )}
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      ● Bishal's Assistant
                    </span>
                    {m.webSearchUsed && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 border border-cyan-200 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">
                        <Globe className="h-3 w-3" /> Web Search Used
                      </span>
                    )}
                    {i === messages.length - 1 && m.role === "assistant" && m.content && (
                      <button
                        onClick={() => {
                          const lastUser = [...messages].reverse().find(x => x.role === "user");
                          if (lastUser) { setMessages(messages.slice(0, -1)); send(lastUser.content); }
                        }}
                        className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                      >
                        <RefreshCw className="h-3 w-3" /> Regenerate
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {searching && (
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
              <Globe className="h-4 w-4 text-white" />
            </div>
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-3.5 shadow-sm">
              <div className="flex items-center gap-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-600" />
                <span className="text-sm font-semibold text-cyan-700">🔍 Searching the web…</span>
                <span className="flex gap-1">
                  {[0, 1, 2].map(d => (
                    <span key={d} className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
                  ))}
                </span>
              </div>
            </div>
          </div>
        )}

        {(loading || visualLoading) && (
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600">
              <img src={logoUrl} alt="" width={22} height={22} className="object-contain" />
            </div>
            <div className="rounded-2xl border border-border bg-white px-5 py-4 shadow-sm">
              <div className="flex items-center gap-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                <span className="text-sm text-muted-foreground">
                  {visualLoading ? "Generating visual study card…" : "Bishal's Assistant is thinking…"}
                </span>
                <span className="flex gap-1">
                  {[0, 1, 2].map(d => (
                    <span key={d} className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
                  ))}
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Pending image preview */}
      {pendingImage && (
        <div className="border-t border-border bg-violet-50 px-5 py-2.5 flex items-center gap-3">
          <img src={pendingImage.preview} alt="" className="h-12 w-12 rounded-lg object-cover border border-violet-200" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-violet-700 truncate">📎 {pendingImage.name}</p>
            <p className="text-[10px] text-muted-foreground">Image ready — type your question and send, or just send to analyze</p>
          </div>
          <button onClick={() => setPendingImage(null)} className="text-muted-foreground hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border bg-white px-3 py-2.5 sm:px-4 sm:py-3" style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-end gap-2 sm:gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder={pendingImage ? `Ask about ${pendingImage.name}…` : "Ask Bishal's Assistant…"}
            rows={1}
            className="flex-1 max-h-36 resize-none rounded-xl border border-border bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition"
            style={{ overflowY: input.split("\n").length > 3 ? "auto" : "hidden" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = Math.min(t.scrollHeight, 144) + "px";
            }}
          />
          <button
            onClick={() => send()}
            disabled={loading || (!input.trim() && !pendingImage)}
            className="flex-shrink-0 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-md hover:opacity-90 disabled:opacity-40 transition"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
