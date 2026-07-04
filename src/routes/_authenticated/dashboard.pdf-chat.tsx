import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, FileText, Send, Trash2, BookOpen, X } from "lucide-react";
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

const CHUNK_SIZE = 2400;
const MAX_CHUNKS = 6;

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
  const words = q.split(/\s+/).filter((w) => w.length > 3);
  return words.reduce((score, word) => {
    const count = (c.match(new RegExp(word, "g")) || []).length;
    return score + count;
  }, 0);
}

function getRelevantContext(chunks: string[], query: string): string {
  const scored = chunks.map((chunk, i) => ({ chunk, score: scoreChunk(chunk, query), i }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, MAX_CHUNKS).sort((a, b) => a.i - b.i).map((s) => s.chunk).join("\n\n");
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-sm font-bold ${isUser ? "bg-primary text-primary-foreground" : "bg-violet-100 text-violet-700"}`}>
        {isUser ? "You" : "AI"}
      </div>
      <div className={`max-w-[80%] space-y-1 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${isUser ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted/60 text-foreground"}`}>
          {isUser ? (
            <p>{msg.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none prose-p:my-1 prose-pre:bg-black/10 prose-code:text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            </div>
          )}
        </div>
        {msg.provider && !isUser && <ProviderBadge provider={msg.provider} />}
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
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "pdf-chat");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function extractPdf(file: File) {
    if (!file.name.endsWith(".pdf")) return toast.error("Please upload a PDF file");
    if (file.size > 20 * 1024 * 1024) return toast.error("PDF must be under 20 MB");

    setExtracting(true);
    setPdfText(null);
    setChunks([]);
    setMessages([]);

    try {
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      let fullText = "";

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: unknown) => (item && typeof item === "object" && "str" in item ? (item as { str: string }).str : "")).join(" ");
        fullText += `\n\n[Page ${i}]\n${pageText}`;
      }

      const cleaned = fullText.replace(/\s+/g, " ").trim();
      if (cleaned.length < 50) {
        toast.error("Couldn't extract text — this PDF may be image-based or scanned.");
        setExtracting(false);
        return;
      }

      const allChunks = splitIntoChunks(cleaned);
      setPdfText(cleaned);
      setChunks(allChunks);
      setPdfName(file.name);
      setPdfPages(numPages);
      setMessages([{
        role: "assistant",
        content: `📄 **${file.name}** loaded successfully!\n\n- **${numPages} pages** · **${allChunks.length} sections** indexed\n- **${Math.round(cleaned.length / 1000)}k characters** extracted\n\nAsk me anything about this document — I'll find the relevant sections and answer your question.`,
        provider: "Bishal's Assistant",
      }]);
    } catch (err) {
      console.error(err);
      toast.error("Failed to read PDF — try another file");
    } finally {
      setExtracting(false);
    }
  }

  function handleFile(file: File | undefined) {
    if (file) extractPdf(file);
  }

  async function sendMessage() {
    if (!input.trim() || !chunks.length) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const context = getRelevantContext(chunks, userMsg.content);
    const systemPrompt = `You are an expert study assistant. The user has uploaded a PDF document. Answer questions using ONLY the provided document excerpts. If the answer isn't in the excerpts, say so honestly. Be clear, concise, and cite page numbers when possible (they appear as [Page N] in the text).

Document excerpts:
---
${context}
---`;

    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    const res = await askAI(userMsg.content, systemPrompt, history);
    await bump();

    setMessages((prev) => [...prev, { role: "assistant", content: res.text, provider: res.provider }]);
    setLoading(false);
  }

  function clearPdf() {
    setPdfText(null);
    setPdfName("");
    setPdfPages(0);
    setChunks([]);
    setMessages([]);
  }

  // Upload screen
  if (!pdfText && !extracting) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
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
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all ${dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-accent"}`}
        >
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-primary/10">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <p className="font-semibold text-foreground">Drop your PDF here</p>
          <p className="mt-1 text-sm text-muted-foreground">or click to browse · Max 20 MB</p>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: "📚", title: "Textbooks", desc: "Ask about specific chapters or concepts" },
            { icon: "📄", title: "Research Papers", desc: "Summarize findings and methodology" },
            { icon: "📝", title: "Lecture Notes", desc: "Turn notes into Q&A and flashcards" },
          ].map((c) => (
            <div key={c.title} className="card-soft p-4 text-center">
              <div className="text-2xl">{c.icon}</div>
              <p className="mt-1.5 text-sm font-semibold">{c.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (extracting) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <div className="relative">
          <FileText className="h-14 w-14 text-primary/30" />
          <Loader2 className="absolute inset-0 m-auto h-7 w-7 animate-spin text-primary" />
        </div>
        <div>
          <p className="font-semibold">Reading your PDF…</p>
          <p className="text-sm text-muted-foreground">Extracting and indexing all text content</p>
        </div>
      </div>
    );
  }

  // Chat screen
  return (
    <div className="mx-auto flex max-w-2xl flex-col" style={{ height: "calc(100vh - 7rem)" }}>
      {/* Doc info bar */}
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5">
        <BookOpen className="h-4 w-4 flex-shrink-0 text-violet-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-violet-900">{pdfName}</p>
          <p className="text-xs text-violet-600">{pdfPages} pages · {chunks.length} sections indexed</p>
        </div>
        <div className="flex items-center gap-2">
          <QuotaBadge quota={quota} loading={quotaLoading} />
          <button onClick={clearPdf} title="Remove PDF" className="rounded-lg p-1.5 text-violet-500 hover:bg-violet-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-background/50 p-4">
        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
        {loading && (
          <div className="flex gap-3">
            <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">AI</div>
            <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Ask anything about your document…"
          rows={2}
          className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm resize-none focus:border-primary focus:outline-none"
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="flex-shrink-0 rounded-xl bg-primary px-4 py-2.5 text-white disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1.5 text-center text-xs text-muted-foreground">Shift+Enter for new line · Enter to send</p>
    </div>
  );
}
