import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, Download, Save, ListChecks, Paperclip, FileText, BookOpen, Sparkles, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON } from "@/lib/aiProvider";
import { analyzeImageServer } from "@/lib/aiProvider.functions";
import { extractPdfText } from "@/lib/pdfExtract";
import { supabase } from "@/integrations/supabase/client";
import { ProviderBadge } from "@/components/ai-ui";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge } from "@/components/ai-ui";

export const Route = createFileRoute("/_authenticated/dashboard/summarizer")({
  component: SummarizerPage,
});

type Output = {
  summary: string;
  keyPoints: string[];
  examQuestions: string[];
  vocabulary: { term: string; definition: string }[];
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function SummarizerPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<Output | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "summarizer");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("scorp_restore");
      if (!raw) return;
      const item = JSON.parse(raw);
      if (item.type !== "Summary") return;
      sessionStorage.removeItem("scorp_restore");
      if (item.data) {
        const d = item.data;
        setOutput({ summary: d.summary ?? "", keyPoints: d.key_points ?? [], examQuestions: d.exam_questions ?? [], vocabulary: d.vocabulary ?? [] });
      }
    } catch { /* silent */ }
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) return toast.error("File too large. Max 2 MB.");
    const ext = file.name.toLowerCase().split(".").pop() ?? "";

    if (["txt", "md", "csv"].includes(ext)) {
      setText(await file.text());
      toast.success(`Loaded ${file.name}`);
      e.target.value = "";
      return;
    }

    if (ext === "pdf") {
      toast.info("Reading PDF, please wait…");
      try {
        const result = await extractPdfText(file, analyzeImageServer, (page, total) => {
          if (page % 5 === 0 || page === total) toast.info(`Reading page ${page} of ${total}…`);
        });
        if (!result.text) return toast.error("Could not extract text from this PDF");
        setText(result.text);
        const scannedNote = result.scannedPages > 0 ? ` (${result.scannedPages} scanned pages read via AI)` : "";
        toast.success(`PDF loaded — ${result.pageCount} pages${scannedNote}`);
      } catch {
        toast.error("Failed to read PDF — try a different file");
      }
      e.target.value = "";
      return;
    }

    if (file.type.startsWith("image/")) {
      toast.info("Extracting text from image…");
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(",")[1];
          const mimeType = file.type || "image/jpeg";
          const res = await analyzeImageServer({
            data: {
              prompt: "Extract ALL visible text from this image exactly as it appears. If there is study content (notes, diagrams with labels, textbook pages), describe what you see and transcribe all text. Output only the extracted text content, no commentary.",
              imageBase64: base64,
              mimeType,
            },
          });
          const extracted = res.text.trim();
          if (!extracted || extracted.length < 10) {
            toast.error("Could not extract text from this image — try a clearer photo");
          } else {
            setText(extracted);
            toast.success("Text extracted from image — ready to summarize");
          }
        };
        reader.readAsDataURL(file);
      } catch {
        toast.error("Failed to read image");
      }
      e.target.value = "";
      return;
    }

    toast.error("Unsupported file type");
    e.target.value = "";
  }

  async function summarize() {
    const source = text.trim();
    if (source.length < 50) return toast.error("Please enter at least 50 characters");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true);
    setOutput(null);
    const prompt = `Summarize the following text.

Return STRICT JSON with this exact shape:
{"summary": "string", "keyPoints": ["..."], "examQuestions": ["5 exam questions"], "vocabulary": [{"term": "...", "definition": "..."}]}

TEXT:
${source.slice(0, 12000)}`;
    const res = await askAI(prompt, "You output only valid JSON. No prose, no code fences.");
    setProvider(res.provider);
    const parsed = extractJSON<Output>(res.text);
    setOutput(parsed ?? { summary: res.text, keyPoints: [], examQuestions: [], vocabulary: [] });
    await bump();
    setLoading(false);
  }

  function download() {
    if (!output) return;
    const content = `# Summary\n\n${output.summary}\n\n## Key Points\n${output.keyPoints.map((p) => `- ${p}`).join("\n")}\n\n## Exam Questions\n${output.examQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\n## Vocabulary\n${output.vocabulary.map((v) => `- **${v.term}**: ${v.definition}`).join("\n")}`;
    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `summary-${Date.now()}.md`; a.click();
  }

  async function save() {
    if (!output) return;
    const { error } = await supabase.from("summaries").insert({
      user_id: user.id, source_type: "text", original_text: text.slice(0, 5000),
      summary: output.summary, key_points: output.keyPoints as never,
      exam_questions: output.examQuestions as never, vocabulary: output.vocabulary as never,
    });
    if (error) return toast.error(error.message);
    toast.success("Saved to history");
  }

  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileText className="h-6 w-6 text-violet-600" /> PDF & Notes Summarizer
          </h1>
          <QuotaBadge quota={quota} loading={quotaLoading} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Paste text or upload a file — PDF, image, or document — for an instant AI-powered study breakdown.</p>
      </div>

      {/* Allowed banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
        <p className="text-amber-900">
          <span className="font-semibold">Allowed:</span> PDF, images (JPG/PNG/etc. under 2 MB), text files (.txt, .md, .csv){"  "}
          <span className="font-semibold">Not allowed:</span> Audio files, video files, images over 2 MB
        </p>
      </div>

      {/* Two column */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Input */}
        <div className="rounded-2xl border border-border bg-white p-6">
          <h2 className="flex items-center gap-2 font-bold">
            <BookOpen className="h-4 w-4 text-violet-600" /> Your Text
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Paste text, or click the upload button to load a file.</p>

          <div className="mt-4">
            <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-accent">
              <Paperclip className="h-4 w-4" /> Upload File
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.csv,image/*" onChange={handleFile} className="hidden" />
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder="Paste your text here, or upload a file above... (minimum 50 characters)"
            className="mt-4 w-full resize-y rounded-xl border border-border bg-slate-50/50 p-3.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
          />
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span><span className="font-semibold text-foreground">{chars}</span> chars  <span className="ml-2 font-semibold text-foreground">{words}</span> words</span>
            <button onClick={summarize} disabled={loading || chars < 50} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Summarize
            </button>
          </div>
        </div>

        {/* Output */}
        <div className="rounded-2xl border border-border bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold">Bishal's Analysis</h2>
              <p className="mt-1 text-xs text-muted-foreground">Summary, key points, and exam questions.</p>
            </div>
            {output && (
              <div className="flex items-center gap-1.5">
                <ProviderBadge provider={provider} />
                <button onClick={download} className="rounded-md border border-border p-1.5 hover:bg-accent" title="Download"><Download className="h-3.5 w-3.5" /></button>
                <button onClick={save} className="rounded-md border border-border p-1.5 hover:bg-accent" title="Save"><Save className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </div>

          {!output && !loading && (
            <div className="mt-10 grid place-items-center py-10 text-center text-muted-foreground">
              <FileText className="h-14 w-14 text-muted-foreground/30" />
              <p className="mt-4 font-semibold text-foreground">No analysis yet</p>
              <p className="mt-1 text-sm">Paste text or upload a file, then click Summarize.</p>
            </div>
          )}

          {loading && (
            <div className="mt-10 grid place-items-center py-10 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
              <p className="mt-3 text-sm text-muted-foreground">Analyzing your text…</p>
            </div>
          )}

          {output && (
            <div className="mt-5 space-y-5">
              <Section title="📝 Summary"><p className="text-sm leading-relaxed">{output.summary}</p></Section>
              {output.keyPoints?.length > 0 && (
                <Section title="🔑 Key Points"><ul className="list-disc space-y-1.5 pl-5 text-sm">{output.keyPoints.map((p, i) => <li key={i}><span className="font-semibold text-blue-600 underline decoration-blue-400/60 underline-offset-2">{p.split(":")[0]}</span>{p.includes(":") && <>: {p.split(":").slice(1).join(":")}</>}</li>)}</ul></Section>
              )}
              {output.examQuestions?.length > 0 && (
                <Section title="🎯 Exam Questions"><ol className="list-decimal space-y-1.5 pl-5 text-sm">{output.examQuestions.map((q, i) => <li key={i}>{q}</li>)}</ol></Section>
              )}
              {output.vocabulary?.length > 0 && (
                <Section title="📚 Vocabulary"><dl className="space-y-2 text-sm">{output.vocabulary.map((v, i) => <div key={i}><dt className="font-semibold text-blue-600 underline decoration-blue-400/60 underline-offset-2">{v.term}</dt><dd className="text-muted-foreground">{v.definition}</dd></div>)}</dl></Section>
              )}
              <button
                onClick={() => {
                  const quizTopic = `${output.summary}\n\nKey Points:\n${output.keyPoints.join("\n")}`.slice(0, 4000);
                  sessionStorage.setItem("scorp_quiz_topic", quizTopic);
                  toast.success("Sending to Quiz Generator…");
                  navigate({ to: "/dashboard/quiz" });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
              >
                <ListChecks className="h-3.5 w-3.5" /> Make Quiz from this
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="mb-2 text-sm font-bold text-foreground">{title}</h3>{children}</div>;
}
