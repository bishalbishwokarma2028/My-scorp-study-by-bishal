import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Loader2, Upload, FileText, Send, BookOpen, X,
  ChevronDown, Sparkles, MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { askAI } from "@/lib/aiProvider";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge, ProviderBadge } from "@/components/ai-ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const Route = createFileRoute("/_authenticated/dashboard/pdf-chat")({
  component: PdfChatPage,
});

type Message = { role: "user" | "assistant"; content: string; provider?: string };

const CHUNK_SIZE = 3000;
const MAX_CHUNKS = 8;

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

function getRelevantContext(chunks: string[], query: string): string {
  const scored = chunks.map((chunk, i) => ({ chunk, score: scoreChunk(chunk, query), i }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored
    .slice(0, MAX_CHUNKS)
    .sort((a, b) => a.i - b.i)
    .map((s) => s.chunk)
    .join("\n\n");
}

const QUICK_PROMPTS = [
  "📋 Summarize this document",
  "🔑 List the key points",
  "❓ What are the main conclusions?",
  "📖 Explain the most important concept",
  "🧪 What methods or techniques are used?",
  "📊 What evidence or data is presented?",
];

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-xs font-bold shadow-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-violet-100 text-violet-700 border border-violet-200"
        }`}
      >
        {isUser ? "You" : "AI"}
      </div>
      <div className={`max-w-[82%] flex flex-col ${isUser ? "items-end" : "items-start"} gap-1`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
            isUser
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-tl-sm border border-border bg-background text-foreground"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none prose-headings:text-sm prose-headings:font-bold prose-p:my-1.5 prose-p:leading-relaxed prose-strong:text-foreground prose-strong:font-semibold prose-ul:my-1 prose-li:my-0.5 prose-code:rounded prose-code:bg-violet-50 prose-code:px-1 prose-code:text-violet-700 prose-code:text-xs prose-blockquote:border-l-violet-400 prose-blockquote:bg-violet-50 prose-blockquote:rounded-r-lg prose-blockquote:py-1">
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
      <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border border-violet-200 bg-violet-100 text-xs font-bold text-violet-700">
        AI
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
  const [pdfText, setPdfText] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState("");
  const [pdfPages, setPdfPages] = useState(0);
  const [chunks, setChunks] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
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
    setPdfText(null);
    setChunks([]);
    setMessages([]);

    try {
      // Dynamically import pdfjs-dist and use the LOCAL worker (version-matched)
      const pdfjsLib = await import("pdfjs-dist");
      // Use the exact installed version from unpkg so it matches
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
        toast.error(
          "No readable text found. This PDF may be scanned/image-based. Try a text-based PDF.",
        );
        setExtracting(false);
        return;
      }

      const allChunks = splitIntoChunks(cleaned);
      setPdfText(cleaned);
      setChunks(allChunks);
      setPdfName(file.name);
      setPdfPages(numPages);

      setMessages([
        {
          role: "assistant",
          content: `📄 **${file.name}** is ready!\n\n**${numPages} pages** · **${allChunks.length} sections** indexed · **${Math.round(cleaned.length / 1000)}k characters** extracted\n\nI've read your entire document. Ask me anything — I'll search the relevant sections and give you a detailed answer. You can also use the quick prompts below.`,
          provider: "Bishal's Assistant",
        },
      ]);
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
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const context = getRelevantContext(chunks, text);
    const systemPrompt = `You are an expert study assistant helping a student understand their uploaded document.

The user asked: "${text}"

Here are the most relevant excerpts from their document (with page numbers):
---
${context}
---

Instructions:
- Answer using ONLY the document content above. Do not invent information.
- If the answer isn't in the excerpts, say: "I couldn't find that in your document. Try asking differently or checking a different section."
- Cite page numbers when referencing specific content (e.g. "On Page 3...")
- Use **bold** for key terms and important facts
- Use bullet points or numbered lists for multi-part answers
- Use ## headers for long answers with multiple sections
- Use > blockquotes for direct quotes from the document
- Be thorough and educational — explain concepts, don't just copy text`;

    const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await askAI(text, systemPrompt, history);
      await bump();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.text, provider: res.provider },
      ]);
    } catch {
      toast.error("Failed to get answer — please try again");
    } finally {
      setLoading(false);
    }
  }

  function clearPdf() {
    setPdfText(null);
    setPdfName("");
    setPdfPages(0);
    setChunks([]);
    setMessages([]);
  }

  // ── Upload screen ──────────────────────────────────────────────────────────
  if (!pdfText && !extracting) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">Chat with Your PDF</h2>
            <p className="text-sm text-muted-foreground">
              Upload any textbook, paper, or notes — then ask questions
            </p>
          </div>
          <QuotaBadge quota={quota} loading={quotaLoading} />
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files[0]);
          }}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
            dragging
              ? "border-violet-500 bg-violet-50 scale-[1.01]"
              : "border-border hover:border-violet-400 hover:bg-accent"
          }`}
        >
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-2xl bg-violet-100">
            <Upload className="h-10 w-10 text-violet-600" />
          </div>
          <p className="text-lg font-bold text-foreground">Drop your PDF here</p>
          <p className="mt-1 text-sm text-muted-foreground">or click to browse</p>
          <p className="mt-3 inline-block rounded-full bg-violet-100 px-4 py-1 text-xs font-semibold text-violet-700">
            Supports text-based PDFs up to 25 MB
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
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
          <div className="grid h-20 w-20 place-items-center rounded-2xl bg-violet-100">
            <FileText className="h-10 w-10 text-violet-400" />
          </div>
          <Loader2 className="absolute -right-2 -top-2 h-7 w-7 animate-spin text-violet-600" />
        </div>
        <div>
          <p className="font-bold text-base">Reading your PDF…</p>
          <p className="mt-1 text-sm text-muted-foreground">Extracting and indexing all pages</p>
        </div>
        {extractProgress > 0 && (
          <div className="w-48 space-y-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-violet-100">
              <div
                className="h-full rounded-full bg-violet-500 transition-all duration-200"
                style={{ width: `${extractProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{extractProgress}% complete</p>
          </div>
        )}
      </div>
    );
  }

  // ── Chat screen ────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex max-w-2xl flex-col" style={{ height: "calc(100vh - 6rem)" }}>
      {/* Doc info bar */}
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 flex-shrink-0">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-violet-200">
          <BookOpen className="h-4 w-4 text-violet-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-violet-900">{pdfName}</p>
          <p className="text-xs text-violet-600">
            {pdfPages} pages · {chunks.length} sections · {Math.round((pdfText?.length ?? 0) / 1000)}k chars
          </p>
        </div>
        <div className="flex items-center gap-2">
          <QuotaBadge quota={quota} loading={quotaLoading} />
          <button
            onClick={clearPdf}
            title="Remove PDF"
            className="rounded-lg p-1.5 text-violet-500 hover:bg-violet-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 rounded-xl border border-border bg-background/60 p-4 min-h-0">
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        {loading && <ThinkingBubble />}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      {messages.length <= 1 && !loading && (
        <div className="mt-3 flex-shrink-0">
          <p className="mb-2 text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Quick prompts
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p.replace(/^[^\s]+\s/, ""))}
                className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="mt-3 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <div className="relative flex-1">
            <MessageCircle className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask anything about your document…"
              rows={2}
              className="w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-4 text-sm resize-none focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 rounded-xl bg-violet-600 px-4 py-3 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        {/* Suggested follow-ups after first answer */}
        {messages.length > 2 && !loading && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Explain that in simpler terms", "Give me an example", "What does this mean for exams?"].map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <p className="mt-1.5 text-center text-xs text-muted-foreground">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
