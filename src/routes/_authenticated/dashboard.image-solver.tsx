import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, ImagePlus, ClipboardPaste, X, ScanText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { analyzeImageServer } from "@/lib/aiProvider.functions";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge } from "@/components/ai-ui";

export const Route = createFileRoute("/_authenticated/dashboard/image-solver")({
  component: ImageSolverPage,
});

type PendingImage = { base64: string; mimeType: string; name: string; preview: string };

function buildPrompt(instructions: string): string {
  const userInstructions = instructions.trim()
    ? `The user gave these specific instructions/requirements for how to answer — follow them exactly:\n"${instructions.trim()}"`
    : `The user did not give extra instructions — just answer whatever question, problem, or task is shown in the image.`;

  return `You are an expert OCR and problem-solving assistant. The attached image may contain text, a handwritten or printed question, a diagram, a worksheet, or a problem statement — in ANY language or script (English, Nepali, Hindi, Chinese, Japanese, Arabic, Spanish, French, or any other language). Carefully read the image and do the following, in order:

1. Extract ALL visible text from the image exactly as written, preserving the original language and script — do not translate it in this step.
2. Figure out exactly what is being asked — the question, problem, or task shown in (or implied by) the image.
3. ${userInstructions}
4. Answer or solve it completely, correctly, and with full explanation/derivation/working steps where relevant (math, physics, chemistry, code, etc.). If the question is in a non-English language, answer in that same language unless the user's instructions say otherwise.

Format your response in Markdown using exactly this structure:

## 📝 Extracted Text
[Verbatim transcription of all text found in the image, in its original language/script. If there is no readable text, say so.]

## 🧠 What's Being Asked
[A short, clear restatement of the question/problem/task.]

## ✅ Answer / Solution
[The complete, correct, well-explained answer — show step-by-step working for numerical/scientific problems, use **bold** for key terms/results, and use plain Unicode math symbols (×, ÷, √, ², ³, π, ≈, etc.) instead of LaTeX.]

Never reveal AI provider names.`;
}

function ImageSolverPage() {
  const { user } = Route.useRouteContext();
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "cerebras");
  const [image, setImage] = useState<PendingImage | null>(null);
  const [instructions, setInstructions] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function loadFile(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Please upload or paste an image file");
    if (file.size > 8_000_000) return toast.error("Image too large — max 8 MB");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      setAnswer("");
      setImage({ base64, mimeType: file.type || "image/jpeg", name: file.name || "pasted-image.png", preview: dataUrl });
      toast.success("Image loaded — click Solve");
    };
    reader.readAsDataURL(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = "";
  }

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          loadFile(file);
        }
        return;
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }

  async function solve() {
    if (loading) return;
    if (!image) return toast.error("Upload or paste an image first");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true);
    setAnswer("");
    try {
      const res = await analyzeImageServer({
        data: {
          prompt: buildPrompt(instructions),
          imageBase64: image.base64,
          mimeType: image.mimeType,
        },
      });
      setAnswer(res.text);
      await bump();
    } catch {
      toast.error("Failed to read/solve the image — please try again");
    } finally {
      setLoading(false);
    }
  }

  const mdComponents = {
    strong: ({ children }: { children?: React.ReactNode }) => (
      <mark className="bg-yellow-200 text-yellow-900 font-bold rounded px-0.5">{children}</mark>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => {
      const t = String(children).toLowerCase();
      let cls = "bg-blue-50 border-blue-300 text-blue-900";
      if (t.includes("📝") || t.includes("extracted")) cls = "bg-slate-50 border-slate-300 text-slate-900";
      else if (t.includes("🧠") || t.includes("asked")) cls = "bg-violet-50 border-violet-300 text-violet-900";
      else if (t.includes("✅") || t.includes("answer")) cls = "bg-emerald-50 border-emerald-300 text-emerald-900";
      return <div className={`rounded-xl border-l-4 px-3 py-2 mt-5 mb-3 ${cls}`}><h2 className="font-bold text-sm">{children}</h2></div>;
    },
    p: ({ children }: { children?: React.ReactNode }) => <p className="my-3 leading-relaxed whitespace-pre-wrap">{children}</p>,
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="my-3 space-y-3 pl-5 list-decimal">{children}</ol>,
    ul: ({ children }: { children?: React.ReactNode }) => <ul className="my-3 space-y-2 pl-5 list-disc">{children}</ul>,
    li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed pl-1">{children}</li>,
    code: ({ children }: { children?: React.ReactNode }) => (
      <pre className="bg-slate-900 text-green-400 rounded-xl p-3.5 overflow-x-auto font-mono text-sm my-2 leading-relaxed"><code>{children}</code></pre>
    ),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center justify-between flex-wrap gap-2">
          <h2 className="flex items-center gap-2 font-bold"><ScanText className="h-5 w-5 text-violet-600" /> Image Solver</h2>
          <QuotaBadge quota={quota} loading={quotaLoading} />
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Upload or paste (Ctrl+V) any image — a photo, screenshot, or scan of a question, worksheet, or problem in <strong>any language</strong>. We'll extract the text and answer it.
        </p>

        {!image ? (
          <div
            ref={dropRef}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`grid cursor-pointer place-items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition ${dragOver ? "border-violet-400 bg-violet-50" : "border-border bg-slate-50 hover:border-violet-300 hover:bg-violet-50/50"}`}
          >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-violet-600">
              <ImagePlus className="h-7 w-7" />
            </div>
            <p className="text-sm font-semibold">Click to upload, drag & drop, or paste an image</p>
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ClipboardPaste className="h-3.5 w-3.5" /> Ctrl+V works anywhere on this page</p>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border border-border bg-slate-50">
              <img src={image.preview} alt={image.name} className="max-h-80 w-full object-contain" />
              <button onClick={() => { setImage(null); setAnswer(""); }} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder='Optional: tell it how to answer, e.g. "only solve question 2" or "answer in English"'
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
            <div className="flex items-center gap-2">
              <button onClick={solve} disabled={loading}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-50">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loading ? "Reading & solving…" : "Solve"}
              </button>
              <button onClick={() => fileRef.current?.click()} className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium hover:bg-accent">
                Replace
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-violet-600" />
          <p className="mt-3 text-sm text-muted-foreground">Reading the image and working out the answer…</p>
        </div>
      )}

      {answer && !loading && (
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{answer}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
