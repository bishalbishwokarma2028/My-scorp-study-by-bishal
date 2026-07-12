import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, ImagePlus, ClipboardPaste, X, ScanText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { analyzeImageServer } from "@/lib/aiProvider.functions";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge } from "@/components/ai-ui";
import { usePageState } from "@/lib/pageState";
import { mapMathChildren } from "@/lib/mathText";
import { ensureBrowserSupportedImage, isImageFile } from "@/lib/imageUpload";

export const Route = createFileRoute("/_authenticated/dashboard/image-solver")({
  component: ImageSolverPage,
});

type PendingImage = { base64: string; mimeType: string; name: string; preview: string };

function buildPrompt(instructions: string): string {
  const userInstructions = instructions.trim()
    ? `The user gave these specific instructions — follow them exactly:\n"${instructions.trim()}"`
    : `No specific instructions — answer whatever question, problem, or task the image shows.`;

  return `You are an expert OCR and problem-solving assistant. The attached image may contain text, a handwritten or printed question, a diagram, a worksheet, or a problem statement in ANY language or script.

Step 1 — Extract: read ALL visible text from the image exactly as written, preserving the original language.
Step 2 — Understand: identify precisely what is being asked and assess the question's complexity:
  • Very short question (a quick fact, definition, or 1-line question) → answer in around 4–5 meaningful, complete sentences. Do not pad it out further.
  • Short question (a single well-defined problem) → give approximately one full page of clear, step-by-step explanation with all working shown.
  • Long question (multi-part, a full worksheet, or a complex problem) → give around 2–2.5 full pages: complete step-by-step derivation, an explanation for every step, worked examples where helpful, and a short summary at the end.
Step 3 — Answer: ${userInstructions}

FORMATTING:
Use this exact Markdown structure:

## 📝 Extracted Text
[Verbatim transcription of all text in the image, in its original language. If no readable text, say so.]

## 🧠 What's Being Asked
[Clear restatement of the question/task. Note the complexity level you determined: Very Short / Short-Medium / Long-Complex.]

## ✅ Answer / Solution
[Complete, correctly-scaled answer.
- For maths/science/physics: show every step of the working clearly.
- Use proper Unicode math symbols inline: ×, ÷, √, ², ³, ⁴, π, ≈, ±, ≤, ≥, ≠, Δ, Σ, ∫, ∞, °.
- For fractions write "a/b"; for exponents write "x²" or "x^n"; for square roots write "√x".
- Never output raw LaTeX like \\frac, \\sqrt, ^{}, _{}.
- Use **bold** for every key term and final answer.
- If the question is in a non-English language, answer in that same language.]

Never reveal AI provider names.`;
}

function ImageSolverPage() {
  const { user } = Route.useRouteContext();
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "cerebras");

  // Persisted state — survives route changes within the same session
  const [state, setState] = usePageState("image-solver", {
    answer: "",
    instructions: "",
    loading: false,
  });

  // Image is NOT persisted (binary data too large for module cache),
  // but we keep it in local component state for the current visit.
  const [imgState, setImgState] = usePageState<{ image: PendingImage | null }>(
    "image-solver-img",
    { image: null },
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  async function loadFile(rawFile: File) {
    if (!isImageFile(rawFile)) return toast.error("Please upload or paste an image file");
    if (rawFile.size > 8_000_000) return toast.error("Image too large — max 8 MB");
    let file = rawFile;
    try {
      if (rawFile.name.toLowerCase().match(/\.(heic|heif)$/) || /heic|heif/i.test(rawFile.type)) {
        toast.info("Converting HEIC image…");
      }
      file = await ensureBrowserSupportedImage(rawFile);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read this image");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      setState({ answer: "" });
      setImgState({ image: { base64, mimeType: file.type || "image/jpeg", name: file.name || "pasted-image.png", preview: dataUrl } });
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
        if (file) { e.preventDefault(); loadFile(file); }
        return;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }

  async function solve() {
    if (state.loading) return;
    if (!imgState.image) return toast.error("Upload or paste an image first");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setState({ loading: true, answer: "" });
    try {
      const res = await analyzeImageServer({
        data: {
          prompt: buildPrompt(state.instructions),
          imageBase64: imgState.image.base64,
          mimeType: imgState.image.mimeType,
        },
      });
      setState({ answer: res.text, loading: false });
      await bump();
    } catch {
      toast.error("Failed to read/solve the image — please try again");
      setState({ loading: false });
    }
  }

  const mdComponents = {
    strong: ({ children }: { children?: React.ReactNode }) => (
      <mark className="bg-yellow-200 text-yellow-900 font-bold rounded px-0.5">{mapMathChildren(children)}</mark>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => {
      const t = String(children).toLowerCase();
      let cls = "bg-blue-50 border-blue-300 text-blue-900";
      if (t.includes("📝") || t.includes("extracted")) cls = "bg-slate-50 border-slate-300 text-slate-900";
      else if (t.includes("🧠") || t.includes("asked")) cls = "bg-violet-50 border-violet-300 text-violet-900";
      else if (t.includes("✅") || t.includes("answer")) cls = "bg-emerald-50 border-emerald-300 text-emerald-900";
      return <div className={`rounded-xl border-l-4 px-3 py-2 mt-5 mb-3 ${cls}`}><h2 className="font-bold text-sm">{children}</h2></div>;
    },
    p: ({ children }: { children?: React.ReactNode }) => <p className="my-3 leading-relaxed">{mapMathChildren(children)}</p>,
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="my-3 space-y-3 pl-5 list-decimal">{children}</ol>,
    ul: ({ children }: { children?: React.ReactNode }) => <ul className="my-3 space-y-2 pl-5 list-disc">{children}</ul>,
    li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed pl-1">{mapMathChildren(children)}</li>,
    code: ({ children }: { children?: React.ReactNode }) => (
      <pre className="bg-slate-900 text-green-400 rounded-xl p-3.5 overflow-x-auto font-mono text-sm my-2 leading-relaxed"><code>{children}</code></pre>
    ),
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="overflow-x-auto my-3"><table className="min-w-full border-collapse text-sm">{children}</table></div>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th className="bg-violet-600 text-white px-3 py-2 text-left text-xs font-semibold">{mapMathChildren(children)}</th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td className="border-b border-border px-3 py-2 text-sm">{mapMathChildren(children)}</td>
    ),
  };

  const { image } = imgState;

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
            onDragOver={(e) => { e.preventDefault(); }}
            onDragLeave={() => {}}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className="grid cursor-pointer place-items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition border-border bg-slate-50 hover:border-violet-300 hover:bg-violet-50/50"
          >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-violet-600">
              <ImagePlus className="h-7 w-7" />
            </div>
            <p className="text-sm font-semibold">Click to upload, drag & drop, or paste an image</p>
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ClipboardPaste className="h-3.5 w-3.5" /> Ctrl+V works anywhere on this page</p>
            <input ref={fileRef} type="file" accept="image/*,.heic,.heif" onChange={handleFileInput} className="hidden" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border border-border bg-slate-50">
              <img src={image.preview} alt={image.name} className="max-h-80 w-full object-contain" />
              <button onClick={() => { setImgState({ image: null }); setState({ answer: "" }); }} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={state.instructions}
              onChange={(e) => setState({ instructions: e.target.value })}
              placeholder='Optional: tell it how to answer, e.g. "only solve question 2" or "answer in English"'
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
            <div className="flex items-center gap-2">
              <button onClick={solve} disabled={state.loading}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-50">
                {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {state.loading ? "Reading & solving…" : "Solve"}
              </button>
              <button onClick={() => fileRef.current?.click()} className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium hover:bg-accent">
                Replace
              </button>
              <input ref={fileRef} type="file" accept="image/*,.heic,.heif" onChange={handleFileInput} className="hidden" />
            </div>
          </div>
        )}
      </div>

      {state.loading && (
        <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-violet-600" />
          <p className="mt-3 text-sm text-muted-foreground">Reading the image and working out the answer…</p>
        </div>
      )}

      {state.answer && !state.loading && (
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={mdComponents}
            >{state.answer}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
