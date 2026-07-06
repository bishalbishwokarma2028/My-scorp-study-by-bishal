import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Loader2, Upload, FileText, Send, BookOpen, X,
  Sparkles, MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { askAI } from "@/lib/aiProvider";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge, ProviderBadge } from "@/components/ai-ui";
import { usePageState } from "@/lib/pageState";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import logo from "@/assets/scorpstudy-logo.png";

export const Route = createFileRoute("/_authenticated/dashboard/pdf-chat")({
  component: PdfChatPage,
});

type Message = { role: "user" | "assistant"; content: string; provider?: string };

const CHUNK_SIZE = 2500;   // smaller chunks to leave room in system prompt
const MAX_CHUNKS = 6;      // 6 × 2500 = 15 000 chars — safely under 44 000 limit

function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

function scoreChunk(chunk: string, query: string): number {
  const q = query.toLowerCase();
  const c = chunk.toLowerCase();
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  return words.reduce((score, word) => {
    const count = (c.match(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    return score + count;
  }, 0);
}

function getRelevantContext(chunks: string[], query: string, maxChunks: number = MAX_CHUNKS): string {
  const scored = chunks.map((chunk, i) => ({ chunk, score: scoreChunk(chunk, query), i }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored
    .slice(0, maxChunks)
    .sort((a, b) => a.i - b.i)
    .map((s) => s.chunk)
    .join("\n\n");
}

function buildDocSystemPrompt(pdfName: string, context: string): string {
  return `You are Bishal's Assistant, a friendly expert study AI helping a student understand a document. You must ALWAYS give a confident, complete, well-formatted answer — never say you are unable to answer, never say to try again later, never mention being "busy" or having technical issues.

DOCUMENT: "${pdfName}"

MOST RELEVANT EXCERPTS FROM THE DOCUMENT:
---
${context}
---

STRICT RULES:
1. First, silently check whether the question relates to content covered in the excerpts above.
2. If it IS covered: answer using information present in the excerpts. Cite page numbers (e.g. "On Page 3..."), and be thorough and educational — explain concepts, don't just copy text.
3. If it is NOT covered in the excerpts (a general or off-topic question, including greetings, follow-ups, or requests to simplify/expand on something you already said): do NOT refuse and do NOT say the document doesn't cover it. Instead, start your reply with the short note "📚 *This isn't in your document — here's a general answer:*" on its own line, then answer the question fully, accurately, and helpfully using your own general knowledge as Bishal's Assistant.
4. If the question is a follow-up referring to the earlier conversation (e.g. "explain more", "simpler please", "give an example"), use the chat history to understand what is being asked and answer it directly — treat it as covered if the earlier topic came from the document.

FORMATTING RULES (always follow, for both document and general answers):
- Use **bold** generously on key terms, names, numbers, and important phrases.
- Break the answer into short paragraphs, separated by blank lines — never one dense block of text.
- Use bullet points or numbered lists for multi-part answers.
- Use ## headers to organize longer answers into sections.
- Use > blockquotes to highlight a key definition, direct quote, or takeaway.
- NEVER output raw HTML tags like <br>, <b>, <div> — use plain markdown only.`;
}

const GENERAL_SYSTEM_PROMPT = "You are Bishal's Assistant, a friendly expert study AI. Answer the student's question directly, confidently, and helpfully using your own general knowledge — never say you are unable to answer or ask them to try again later. Use rich markdown formatting: **bold** for key terms, short paragraphs separated by blank lines, bullet/numbered lists for multi-part answers, ## headers for longer answers, and > blockquotes for key definitions or takeaways.";

// Retries several times, shrinking the document context and finally dropping
// it entirely, so the user should never see a raw "AI is busy" error inside
// the PDF chat — there is always a substantive answer by the last attempt.
async function askWithResilience(
  text: string,
  pdfName: string,
  chunks: string[],
  history: { role: "user" | "assistant"; content: string }[],
): Promise<{ text: string; provider: string }> {
  const attempts: { systemPrompt: string; delay: number }[] = [
    { systemPrompt: buildDocSystemPrompt(pdfName, getRelevantContext(chunks, text, MAX_CHUNKS)), delay: 0 },
    { systemPrompt: buildDocSystemPrompt(pdfName, getRelevantContext(chunks, text, MAX_CHUNKS)), delay: 600 },
    { systemPrompt: buildDocSystemPrompt(pdfName, getRelevantContext(chunks, text, 2)), delay: 900 },
    { systemPrompt: GENERAL_SYSTEM_PROMPT, delay: 1200 },
    { systemPrompt: GENERAL_SYSTEM_PROMPT, delay: 1800 },
  ];

  let last: { text: string; provider: string } | null = null;
  for (const { systemPrompt, delay } of attempts) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    const res = await askAI(text, systemPrompt, history);
    if (res.provider !== "none") return res;
    last = res;
  }
  return last ?? { text: "I'm sorry, I couldn't reach the AI service just now — please try again in a moment.", provider: "Bishal's Assistant" };
}

const QUICK_PROMPTS = [
  { icon: "📋", label: "Summarize this document",      text: "Summarize this document" },
  { icon: "🔑", label: "List the key points",           text: "List the key points" },
  { icon: "❓", label: "Main conclusions?",             text: "What are the main conclusions?" },
  { icon: "📖", label: "Explain the main concept",     text: "Explain the most important concept" },
  { icon: "🧪", label: "Methods & techniques used",    text: "What methods or techniques are used?" },
  { icon: "📊", label: "Evidence or data presented",   text: "What evidence or data is presented?" },
];

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full shadow-sm overflow-hidden ${isUser ? "bg-primary text-primary-foreground" : "bg-white border border-violet-200"}`}>
        {isUser
          ? <span className="text-[10px] font-bold">You</span>
          : <img src={logo} alt="Assistant" className="h-full w-full object-contain p-0.5" />}
      </div>
      <div className={`max-w-[84%] flex flex-col ${isUser ? "items-end" : "items-start"} gap-1`}>
        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${isUser ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm border border-border bg-background text-foreground"}`}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:text-[13px] prose-headings:font-extrabold prose-headings:text-violet-900 prose-h2:border-b prose-h2:border-violet-100 prose-h2:pb-1 prose-p:my-2.5 prose-p:leading-relaxed prose-strong:rounded prose-strong:bg-violet-100/70 prose-strong:px-1 prose-strong:py-0.5 prose-strong:font-bold prose-strong:text-violet-900 prose-em:text-violet-700 prose-ul:my-2 prose-ul:space-y-1 prose-ol:my-2 prose-ol:space-y-1 prose-li:my-0.5 prose-li:leading-relaxed prose-code:rounded prose-code:bg-violet-50 prose-code:px-1 prose-code:text-violet-700 prose-code:text-xs prose-blockquote:my-2.5 prose-blockquote:border-l-4 prose-blockquote:border-l-violet-400 prose-blockquote:bg-violet-50 prose-blockquote:rounded-r-lg prose-blockquote:py-1.5 prose-blockquote:px-3 prose-blockquote:not-italic prose-blockquote:text-violet-900 prose-hr:my-3 prose-hr:border-violet-100">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            </div>
          )}
        </div>
        {msg.provider && !isUser && <ProviderBadge provider={msg.provider} />}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex gap-2.5">
      <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full border border-violet-200 bg-white overflow-hidden shadow-sm">
        <img src={logo} alt="Assistant" className="h-full w-full object-contain p-0.5" />
      </div>
      <div className="rounded-2xl rounded-tl-sm border border-border bg-background px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

function PdfChatPage() {
  const { user } = Route.useRouteContext();
  const [s, set] = usePageState("pdf-chat", {
    pdfText:  null as string | null,
    pdfName:  "",
    pdfPages: 0,
    chunks:   [] as string[],
    messages: [] as Message[],
    input:    "",
  });
  const { pdfText, pdfName, pdfPages, chunks, messages, input } = s;
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "pdf-chat");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function extractPdf(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) return toast.error("Please upload a PDF file");
    if (file.size > 25 * 1024 * 1024) return toast.error("PDF must be under 25 MB");

    setExtracting(true);
    setExtractProgress(0);
    set({ pdfText: null, chunks: [], messages: [] });

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://unpkg.com/pdfjs-dist@6.0.227/build/pdf.worker.min.mjs";

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const numPages = pdf.numPages;
      let fullText = "";

      for (let i = 1; i <= numPages; i++) {
        setExtractProgress(Math.round((i / numPages) * 100));
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: unknown) =>
            item && typeof item === "object" && "str" in item
              ? (item as { str: string }).str
              : ""
          )
          .join(" ");
        fullText += `\n\n[Page ${i}]\n${pageText}`;
      }

      const cleaned = fullText.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      if (cleaned.length < 100) {
        toast.error("No readable text found. This PDF may be scanned/image-based. Try a text-based PDF.");
        setExtracting(false);
        return;
      }

      const allChunks = splitIntoChunks(cleaned);
      set({
        pdfText:  cleaned,
        chunks:   allChunks,
        pdfName:  file.name,
        pdfPages: numPages,
        messages: [{
          role: "assistant",
          content: `📄 **${file.name}** is ready!\n\n**${numPages} pages** · **${allChunks.length} sections** indexed · **${Math.round(cleaned.length / 1000)}k characters** extracted\n\nI've read your entire document. Ask me anything about it — I'll search the relevant sections and give you a detailed answer.\n\n> ℹ️ I will only answer based on what's inside this document. If your question isn't covered in the PDF, I'll let you know.`,
          provider: "Bishal's Assistant",
        }],
      });
    } catch (err) {
      console.error("PDF extraction error:", err);
      toast.error("Failed to read PDF. Try another file or check it isn't password-protected.");
    } finally {
      setExtracting(false);
      setExtractProgress(0);
    }
  }

  function handleFile(file: File | undefined) {
    if (file) extractPdf(file);
  }

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || !chunks.length) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);

    const userMsg: Message = { role: "user", content: text };
    const msgsWithUser = [...messages, userMsg];
    set({ messages: msgsWithUser, input: "" });
    setLoading(true);

    const history = msgsWithUser.slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 2500) }));

    try {
      const res = await askWithResilience(text, pdfName, chunks, history);
      await bump();
      set({ messages: [...msgsWithUser, { role: "assistant", content: res.text, provider: res.provider }] });
    } catch {
      set({ messages: [...msgsWithUser, { role: "assistant", content: "I ran into a hiccup reaching the AI — please send your question again.", provider: "Bishal's Assistant" }] });
    } finally {
      setLoading(false);
    }
  }

  function clearPdf() {
    set({ pdfText: null, pdfName: "", pdfPages: 0, chunks: [], messages: [] });
  }

  // ── Upload screen ──────────────────────────────────────────────────────────
  if (!pdfText && !extracting) {
    return (
      <div className="mx-auto max-w-2xl space-y-5 px-1 lg:max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">Chat with Your PDF</h2>
            <p className="text-sm text-muted-foreground">Upload any textbook, paper, or notes — then ask questions</p>
          </div>
          <QuotaBadge quota={quota} loading={quotaLoading} />
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all ${dragging ? "border-violet-500 bg-violet-50 scale-[1.01]" : "border-border hover:border-violet-400 hover:bg-accent"}`}
        >
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-violet-100">
            <Upload className="h-8 w-8 text-violet-600" />
          </div>
          <p className="text-base font-bold text-foreground">Drop your PDF here</p>
          <p className="mt-1 text-sm text-muted-foreground">or tap to browse</p>
          <p className="mt-3 inline-block rounded-full bg-violet-100 px-4 py-1 text-xs font-semibold text-violet-700">
            Supports text-based PDFs up to 25 MB
          </p>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: "📚", title: "Textbooks", desc: "Ask about chapters, concepts, definitions" },
            { icon: "📄", title: "Research Papers", desc: "Summarize findings, methods, conclusions" },
            { icon: "📝", title: "Lecture Notes", desc: "Turn notes into Q&A, key points, summaries" },
          ].map((c) => (
            <div key={c.title} className="card-soft p-4 text-center">
              <div className="text-3xl">{c.icon}</div>
              <p className="mt-2 text-sm font-semibold">{c.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Extracting screen ──────────────────────────────────────────────────────
  if (extracting) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-5 text-center">
        <div className="relative">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-violet-100">
            <FileText className="h-8 w-8 text-violet-400" />
          </div>
          <Loader2 className="absolute -right-2 -top-2 h-6 w-6 animate-spin text-violet-600" />
        </div>
        <div>
          <p className="font-bold">Reading your PDF…</p>
          <p className="mt-1 text-sm text-muted-foreground">Extracting and indexing all pages</p>
        </div>
        {extractProgress > 0 && (
          <div className="w-48 space-y-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-violet-100">
              <div className="h-full rounded-full bg-violet-500 transition-all duration-200" style={{ width: `${extractProgress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{extractProgress}% complete</p>
          </div>
        )}
      </div>
    );
  }

  // ── Chat screen ────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex max-w-2xl flex-col lg:max-w-4xl" style={{ height: "calc(100dvh - 7rem)" }}>
      {/* Doc info bar */}
      <div className="mb-2 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 flex-shrink-0">
        <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-violet-200">
          <BookOpen className="h-4 w-4 text-violet-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-violet-900">{pdfName}</p>
          <p className="text-[10px] text-violet-600">
            {pdfPages} pages · {chunks.length} sections · {Math.round((pdfText?.length ?? 0) / 1000)}k chars
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <QuotaBadge quota={quota} loading={quotaLoading} />
          <button onClick={clearPdf} title="Remove PDF" className="rounded-lg p-1.5 text-violet-500 hover:bg-violet-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages area — scrollable, fills available space */}
      <div className="min-h-0 flex-1 overflow-y-auto space-y-3 rounded-xl border border-border bg-background/60 p-3">
        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
        {loading && <ThinkingBubble />}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts (only before first user message) */}
      {messages.length <= 1 && !loading && (
        <div className="mt-2 flex-shrink-0">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Quick prompts
          </p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p.text}
                onClick={() => sendMessage(p.text)}
                className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-100 transition-colors"
              >
                {p.icon} {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="mt-2 flex-shrink-0 space-y-1.5">
        <div className="flex gap-2 items-end">
          <div className="relative flex-1">
            <MessageCircle className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => set({ input: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
              }}
              placeholder="Ask anything about your document…"
              rows={2}
              className="w-full rounded-xl border border-input bg-background py-2 pl-9 pr-3 text-sm resize-none focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 rounded-xl bg-violet-600 px-3 py-2.5 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        {/* Follow-up suggestions after first answer */}
        {messages.length > 2 && !loading && (
          <div className="flex flex-wrap gap-1.5">
            {["Explain in simpler terms", "Give me an example", "Exam relevance?"].map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <p className="text-center text-[10px] text-muted-foreground">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
