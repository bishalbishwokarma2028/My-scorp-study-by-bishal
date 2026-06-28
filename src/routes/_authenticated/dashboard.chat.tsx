import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Copy, RefreshCw, Save, Plus, GraduationCap, ImageIcon, Paperclip, User, Loader2, X, ChevronDown, ChevronUp, Sparkles, Zap, Globe } from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON } from "@/lib/aiProvider";
import { analyzeImageServer } from "@/lib/aiProvider.functions";
import { webSearchServer } from "@/lib/webSearch.functions";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/scorpstudy-logo.png";
import { canUseAI, bumpAIUsage, QUOTA_MSG, getCachedAnswer, setCachedAnswer, getAIUsedToday, AI_DAILY_LIMIT } from "@/lib/dailyLimits";

export const Route = createFileRoute("/_authenticated/dashboard/chat")({
  component: ChatPage,
});

type VisualSection = {
  emoji: string;
  heading: string;
  color: string;
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
};

const WEB_SEARCH_KEYWORDS = [
  "today", "recent", "latest", "news", "match", "score", "winner",
  "2024", "2025", "who won", "currently", "right now", "yesterday",
  "this week", "cricket", "football", "politics", "election", "weather",
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
      `Give a comprehensive, student-friendly deep-dive explanation of "${section.heading}" in the context of "${data.title}".

Structure your answer like this:
**What it is:** [2-3 clear sentences — define it simply, use an analogy]
**Why it matters:** [2 sentences on real importance — academic + real world]
**Real-World Example:** [One vivid, specific example with names/places/data]
**Key insight to remember:** [One memorable fact or rule of thumb]
**Common mistake:** [One thing students often get wrong about this]

Key points from the card to address: ${section.points.join("; ")}`,
      "You are Bishal's Assistant — a world-class study tutor. Use markdown formatting: **bold** for key terms, use clear paragraphs. Be thorough but easy to understand. Never reveal AI provider names.",
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
                <ul className={`space-y-1.5 text-sm ${c.text}`}>
                  {s.points.map((pt, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <span className={`mt-1.5 flex-shrink-0 h-1.5 w-1.5 rounded-full ${c.head.replace("text-", "bg-")}`} />
                      <span className="leading-relaxed">{pt}</span>
                    </li>
                  ))}
                </ul>

                {isExpanded && expanded[i] && (
                  <div className={`mt-3 rounded-xl border-2 p-4 ${c.exp}`}>
                    <div className={`flex items-center gap-1.5 mb-3 ${c.head}`}>
                      <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
                      <p className="text-[10px] font-bold uppercase tracking-widest">Bishal's Deep-Dive Explanation</p>
                    </div>
                    <div className={`text-sm leading-relaxed space-y-2 ${c.text}`}>
                      {expanded[i].split("\n").filter(Boolean).map((line, li) => {
                        const bold = line.replace(/\*\*(.+?)\*\*/g, (_m, t) => `<strong>${t}</strong>`);
                        return (
                          <p key={li} dangerouslySetInnerHTML={{ __html: bold }} className="leading-7" />
                        );
                      })}
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

const SYSTEM_PROMPT = `You are Bishal's Assistant — an elite AI study tutor built into ScorpStudy by Bishal Bishwokarma.

ANSWER DEPTH: Every answer must be COMPREHENSIVE, DETAILED, and PREMIUM quality. Aim for 500-800+ words. Never give short or surface-level answers. Go deep — cover history, mechanism, examples, significance, and nuances.

FORMAT EVERY ANSWER EXACTLY LIKE THIS:

> 💡 **Quick Answer:** [One sharp, precise sentence that directly answers the question]

## 📌 Definition & Overview
[Thorough explanation in 3-5 sentences using clear language and analogies. Think of it like... / Imagine... — make it memorable and intuitive. Cover what it is, where it comes from, and why it matters.]

## 🔍 Detailed Explanation — How It Works
1. **[First concept/step]** — [Full paragraph-level explanation, not just a label. Include the why and how.]
2. **[Second concept/step]** — [Full explanation with context and reasoning.]
3. **[Third concept/step]** — [Full explanation — continue for ALL key aspects. Never stop at 3 if more are needed.]
4. **[More points as needed]** — [Always be thorough. Add sub-points if necessary.]

## ⚗️ Key Formula / Equation ← (include for science, math, physics, chemistry, economics)
\`\`\`
[Formula with all variables explained below]
Where: Variable1 = meaning, Variable2 = meaning
Units: [relevant units]
\`\`\`

## 💡 Real-World Examples & Applications
> **Example 1:** [Specific, vivid real-world scenario with full context — name actual places, events, or objects]

> **Example 2:** [A second distinct application showing breadth of relevance]

## 🌍 Wider Context & Significance
[2-3 sentences on the broader importance — historical background, societal impact, academic importance, or why students must know this. Use specific dates, names, and data where possible.]

## ⚠️ Common Misconceptions
- **Myth:** [Common wrong belief] → **Fact:** [Correct understanding]
- **Myth:** [Another common error] → **Fact:** [Correct understanding]

## 🧠 Key Terms — Quick Reference
| Term | Definition |
|------|-----------|
| **Term1** | Clear one-line definition |
| **Term2** | Clear one-line definition |
| **Term3** | Clear one-line definition |
| **Term4** | Clear one-line definition |

## ✅ Must-Remember — Quick Recap
- 📌 [Most critical takeaway 1]
- 📌 [Critical takeaway 2]
- 📌 [Critical takeaway 3]
- 📌 [Critical takeaway 4]
- 📌 [Critical takeaway 5]

ABSOLUTE RULES:
• **Bold** every important term, law, formula, name, or concept — they render as vivid blue highlights
• Use numbered lists for steps/processes, bullet points for facts, tables for comparisons
• Code blocks for ALL formulas and equations — always include units and variable meanings
• Be engaging and vivid — NOT textbook-dry. Use "Think of it like...", "Imagine...", "Here's the key insight..."
• MINIMUM 500 words. Never truncate or rush. Students deserve complete answers.
• Include ALL sections every time — never skip a section
• NEVER reveal AI provider names (OpenAI, Google, Groq, etc.)`;

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

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("scorp_chat_msgs");
      if (saved) {
        const parsed = JSON.parse(saved) as Msg[];
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    try {
      sessionStorage.setItem("scorp_chat_msgs", JSON.stringify(messages));
    } catch { /* silent */ }
  }, [messages]);

  // No auto-scroll — user scrolls manually to read answers
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection()?.toString().trim() ?? "";
    if (sel.length > 5) setSelectedText(sel);
  }, []);

  async function send(prompt?: string) {
    const text = (prompt ?? input).trim();
    if ((!text && !pendingImage) || loading) return;

    if (!canUseAI()) {
      toast.error(QUOTA_MSG);
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
      bumpAIUsage();
      const question = text || "Describe and analyze this image in detail. If it's a study-related image, explain the concepts shown.";
      const res = await analyzeImageServer({
        data: {
          prompt: question,
          imageBase64: pendingImage.base64,
          mimeType: pendingImage.mimeType,
        },
      });
      setMessages([...newMsgs, { role: "assistant", content: res.text, provider: "Bishal's Assistant" }]);
      setPendingImage(null);
      setLoading(false);
      return;
    }

    const newMsgs: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(newMsgs);
    setLoading(true);

    const cached = getCachedAnswer(text);
    if (cached && !topperMode) {
      setMessages([...newMsgs, { role: "assistant", content: cached, provider: "Bishal's Assistant" }]);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }

    bumpAIUsage();
    const sys = `${SYSTEM_PROMPT}${topperMode ? TOPPER_PROMPT : ""}${isFirst ? "\n\nThis is the first message — greet the student warmly in one sentence before answering." : "\n\nThis is a follow-up — do NOT repeat the greeting. Jump straight to the answer."}`;

    let promptToSend = text;
    let webSearchUsed = false;

    if (needsWebSearch(text)) {
      setSearching(true);
      try {
        const searchResult = await webSearchServer({ data: { query: text } });
        if (searchResult.used && searchResult.context) {
          webSearchUsed = true;
          promptToSend = `${text}\n\n[REAL-TIME WEB SEARCH RESULTS — use this fresh data to answer accurately]\n${searchResult.context}\n[END OF WEB RESULTS]`;
        }
      } catch { /* silent — fall back to AI without search context */ }
      setSearching(false);
    }

    const res = await askAI(promptToSend, sys);
    setCachedAnswer(text, res.text);
    const assistantMsg: Msg = { role: "assistant", content: res.text, provider: "Bishal's Assistant", webSearchUsed };
    setMessages([...newMsgs, assistantMsg]);

    if (isFirst) {
      try {
        await supabase.from("chat_history").insert({
          user_id: user.id,
          title: text.slice(0, 60),
          subject: "General",
          messages: [...newMsgs, assistantMsg] as never,
          provider: "Bishal's Assistant",
        });
      } catch { /* silent */ }
    }

    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function generateVisual() {
    const concept = selectedText || (() => {
      const last = [...messages].reverse().find(m => m.role === "assistant" && !m.visualCard);
      return last?.content.slice(0, 400) ?? "";
    })();
    if (!concept.trim()) return toast.info("Select text from an answer first, then click Visual");
    setVisualLoading(true);

    const prompt = `Create a visual study infographic card for this concept: "${concept.slice(0, 400)}"

Return STRICT JSON only (no prose, no markdown fences):
{
  "emoji": "🔬",
  "title": "CONCEPT NAME IN CAPS",
  "overview": "One clear sentence: what this concept is and why it matters",
  "sections": [
    {"emoji": "📌", "heading": "Definition", "color": "purple", "points": ["concise accurate point 1", "point 2", "point 3"]},
    {"emoji": "⚙️", "heading": "How It Works", "color": "blue", "points": ["step/fact 1", "step 2", "step 3"]},
    {"emoji": "💡", "heading": "Real Example", "color": "amber", "points": ["specific real-world example", "application in daily life"]},
    {"emoji": "✅", "heading": "Why It Matters", "color": "emerald", "points": ["academic importance", "real-world significance"]}
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

    setMessages(prev => [...prev, { role: "assistant", content: "", visualCard: card, provider: "Bishal's Assistant" }]);
    setSelectedText("");
    setVisualLoading(false);
    toast.success("Visual study card generated! Click each section to expand it.");
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop() ?? "";

    if (ext === "pdf") {
      if (file.size > 10_000_000) return toast.error("PDF too large — max 10 MB");
      toast.info("Reading PDF, please wait...");
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
        const buf = await file.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        let text = "";
        for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((item: unknown) => {
            const it = item as { str?: string };
            return it.str ?? "";
          }).join(" ") + "\n";
        }
        text = text.replace(/\s+/g, " ").trim().slice(0, 12000);
        if (!text) return toast.error("Could not extract text from this PDF");
        setInput(prev => prev ? `${prev}\n\n[PDF: ${file.name}]\n${text}` : `[PDF: ${file.name}]\n${text}`);
        toast.success(`PDF loaded (${doc.numPages} pages) — ask your question above and send`);
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

  function newChat() {
    setMessages([]);
    setInput("");
    setSelectedText("");
    setPendingImage(null);
    try { sessionStorage.removeItem("scorp_chat_msgs"); } catch { /* silent */ }
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const mdComponents = {
    strong: ({ children }: { children?: React.ReactNode }) => (
      <mark className="bg-blue-100 text-blue-900 font-bold rounded px-0.5 not-italic border-b border-blue-300">{children}</mark>
    ),
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className="text-xl font-bold mt-4 mb-2 text-slate-900 border-b border-slate-200 pb-1">{children}</h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => {
      const t = String(children).toLowerCase();
      let cls = "bg-blue-50 border-blue-500 text-blue-900 shadow-blue-100";
      if (t.includes("📌") || t.includes("definition") || t.includes("overview") || t.includes("what"))
        cls = "bg-purple-50 border-purple-500 text-purple-900 shadow-purple-100";
      else if (t.includes("💡") || t.includes("example") || t.includes("real"))
        cls = "bg-amber-50 border-amber-500 text-amber-900 shadow-amber-100";
      else if (t.includes("✅") || t.includes("recap") || t.includes("summary") || t.includes("takeaway"))
        cls = "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-emerald-100";
      else if (t.includes("🧠") || t.includes("key term") || t.includes("concept"))
        cls = "bg-violet-50 border-violet-500 text-violet-900 shadow-violet-100";
      else if (t.includes("⚗") || t.includes("formula") || t.includes("equation") || t.includes("math"))
        cls = "bg-slate-100 border-slate-500 text-slate-900 shadow-slate-100";
      else if (t.includes("⚠") || t.includes("misconception") || t.includes("mistake") || t.includes("common"))
        cls = "bg-rose-50 border-rose-500 text-rose-900 shadow-rose-100";
      return (
        <div className={`rounded-xl border-l-[5px] px-4 py-3 mt-6 mb-2 shadow-sm ${cls}`}>
          <h2 className="font-extrabold text-sm tracking-wide">{children}</h2>
        </div>
      );
    },
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="font-bold text-sm mt-4 mb-1.5 text-slate-800 flex items-center gap-2 border-b border-dashed border-slate-200 pb-1">{children}</h3>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <div className="rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 px-5 py-4 my-4 shadow-lg shadow-blue-200">
        <div className="flex items-start gap-3">
          <span className="text-xl flex-shrink-0 mt-0.5">⚡</span>
          <div className="text-sm text-white leading-relaxed font-medium">{children}</div>
        </div>
      </div>
    ),
    code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
      inline ? (
        <code className="bg-blue-50 text-blue-700 rounded-md px-1.5 py-0.5 text-[0.85em] font-mono border border-blue-100">{children}</code>
      ) : (
        <pre className="bg-slate-900 text-green-400 rounded-xl p-4 overflow-x-auto text-sm font-mono my-3 leading-relaxed shadow-md">
          <code>{children}</code>
        </pre>
      ),
    ol: ({ children }: { children?: React.ReactNode }) => {
      let counter = 0;
      const numbered = React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        counter++;
        return React.cloneElement(child as React.ReactElement, { "data-num": counter } as Record<string, unknown>);
      });
      return <ol className="space-y-2.5 my-3 pl-0 list-none">{numbered}</ol>;
    },
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="space-y-2 my-2.5 pl-0 list-none">{children}</ul>
    ),
    li: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => {
      const num = (props as Record<string, unknown>)["data-num"];
      return (
        <li className="flex items-start gap-3 text-sm">
          {num !== undefined ? (
            <span className="flex-shrink-0 grid h-6 min-w-[1.5rem] place-items-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white text-[11px] font-bold shadow-sm">
              {String(num)}
            </span>
          ) : (
            <span className="flex-shrink-0 mt-[7px] h-2 w-2 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 shadow-sm" />
          )}
          <span className="pt-0.5 leading-relaxed">{children}</span>
        </li>
      );
    },
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="overflow-x-auto my-4 rounded-xl border border-blue-100 shadow-sm">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }: { children?: React.ReactNode }) => (
      <thead className="bg-gradient-to-r from-blue-600 to-blue-700">{children}</thead>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th className="border-b border-blue-400 px-4 py-2.5 text-left font-bold text-white text-xs uppercase tracking-wider">{children}</th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td className="border-b border-slate-100 px-4 py-2.5 last:border-b-0 text-sm">{children}</td>
    ),
    hr: () => <hr className="my-5 border-blue-100" />,
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="text-sm leading-7 my-2">{children}</p>
    ),
  };

  const SUGGESTIONS = [
    { q: "Explain the Water Cycle with full detail", label: "🌊 Water Cycle" },
    { q: "Solve x² − 5x + 6 = 0 step by step", label: "🔢 Quadratic Equation" },
    { q: "What is Photosynthesis? Explain simply with examples", label: "🌱 Photosynthesis" },
    { q: "Explain Newton's Laws of Motion with real-life examples", label: "⚡ Newton's Laws" },
    { q: "How does the Human Digestive System work?", label: "🫁 Digestive System" },
    { q: "Explain the French Revolution and its causes", label: "🏰 French Revolution" },
  ];

  return (
    <div className="fixed inset-x-0 top-14 bottom-0 flex flex-col overflow-hidden bg-white sm:relative sm:inset-auto sm:mx-auto sm:mt-0 sm:h-[calc(100vh-10rem)] sm:max-w-4xl sm:rounded-3xl sm:border sm:border-border sm:shadow-sm">
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
          <div className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold sm:px-2.5 sm:py-1 ${getAIUsedToday() >= AI_DAILY_LIMIT ? "border-red-300 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
            <Zap className="h-3 w-3" />
            <span className="tabular-nums">{Math.max(0, AI_DAILY_LIMIT - getAIUsedToday())}<span className="hidden sm:inline"> / {AI_DAILY_LIMIT}</span></span>
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
          <button onClick={saveChat} className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent sm:gap-1.5 sm:px-3">
            <Save className="h-3.5 w-3.5 flex-shrink-0" /><span className="hidden sm:inline">Save</span>
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
          <div key={i} className={`flex items-start gap-1 sm:gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-sm sm:h-9 sm:w-9 ${m.role === "user" ? "bg-slate-200 text-slate-600" : "bg-gradient-to-br from-blue-500 to-violet-600"}`}>
              {m.role === "user"
                ? <User className="h-3 w-3 sm:h-4 sm:w-4" />
                : <img src={logoUrl} alt="" width={16} height={16} className="object-contain sm:w-5 sm:h-5" />}
            </div>
            <div className={`min-w-0 rounded-2xl px-2.5 py-2 sm:px-4 sm:py-3 ${m.role === "user" ? "max-w-[88%] bg-blue-600 text-white" : "flex-1 border border-border bg-white text-foreground shadow-sm"}`}>
              {m.role === "user" ? (
                <div>
                  {m.imageUrl && (
                    <img src={m.imageUrl} alt="Uploaded" className="mb-2 max-h-48 rounded-xl object-contain" />
                  )}
                  <p className="text-sm font-medium whitespace-pre-wrap">{m.content}</p>
                </div>
              ) : m.visualCard ? (
                <VisualInfoCard data={m.visualCard} />
              ) : (
                <>
                  <div className="prose prose-sm max-w-none text-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
                    <button
                      onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Copied!"); }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      ● Bishal's Assistant
                    </span>
                    {m.webSearchUsed && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 border border-cyan-200 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">
                        <Globe className="h-3 w-3" /> Web Search Used
                      </span>
                    )}
                    {i === messages.length - 1 && m.role === "assistant" && (
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
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-shrink-0 grid h-10 w-10 place-items-center rounded-xl border border-border bg-slate-50 text-muted-foreground hover:bg-violet-50 hover:border-violet-300 hover:text-violet-600 transition"
            title="Upload PDF, image, or text file"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.txt,.md,.csv,.json,.py,.js,.ts,.tsx,.jsx,.html,.css,.xml,.yaml,.yml,.jpg,.jpeg,.png,.gif,.webp"
            onChange={handleFile}
          />
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
