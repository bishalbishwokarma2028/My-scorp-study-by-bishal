import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, ImagePlus, ClipboardPaste, X, ScanText, Sparkles, Send, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { analyzeImageServer } from "@/lib/aiProvider.functions";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge } from "@/components/ai-ui";
import { usePageState } from "@/lib/pageState";
import { mapMathChildren, convertLatexToPlainMath } from "@/lib/mathText";
import { ensureBrowserSupportedImage, isImageFile } from "@/lib/imageUpload";

export const Route = createFileRoute("/_authenticated/dashboard/image-solver")({
  component: ImageSolverPage,
});

type PendingImage = { base64: string; mimeType: string; name: string; preview: string };
type ConvMsg = { role: "user" | "assistant"; content: string };

function buildPrompt(instructions: string): string {
  const userInstructions = instructions.trim()
    ? `The user gave these specific instructions — follow them exactly:\n"${instructions.trim()}"`
    : `No specific instructions — answer whatever question, problem, or task the image shows.`;

  return `You are an expert OCR and problem-solving assistant. The attached image may contain text, a handwritten or printed question, a diagram, a worksheet, or a problem statement in ANY language or script.

Step 1 — Extract: read ALL visible text from the image exactly as written, preserving the original language.
Step 2 — Understand: identify precisely what is being asked and assess the question's complexity:
  • Very short question → thorough explanation, at least 8–10 complete sentences, concept + worked example.
  • Short question → full detailed solution, at least 1.5–2 pages: introduce the concept, state all formulas, show every calculation step, explain WHY each step is taken, close with a clear summary.
  • Long / multi-part question → comprehensive solution, at least 3 full pages: solve each part separately with its own heading, complete derivations, reasoning for every step, verification, and a summary.
  • Advanced / university-level → full treatment: concepts, derivations, calculations, verification, and final conclusions.
Step 3 — Answer: ${userInstructions}

ACCURACY IS THE HIGHEST PRIORITY. Double-check every calculation before writing it. Never guess — if you are not certain, say so.

For ALL numerical / mathematical / science questions, use this EXACT structure (use Markdown headings exactly as shown):

## 📝 Detected Question
[Copy the exact question or task from the image verbatim.]

## 📊 Given Data
[List every piece of information given in the problem, one item per bullet. Include units.]

## 🎯 Required
[State clearly what needs to be found or proven.]

## 📐 Formula
[Write out every relevant formula that will be used. Explain each variable briefly.]

## 💡 Concept
[Explain the underlying principle or theory in 2–4 sentences so the student understands WHY the formula applies.]

## 🔢 Step-by-Step Solution
[Number every step. For each step: state what you're doing, write the formula, substitute the values, simplify.]

## 🧮 Calculation
[Show the full arithmetic/algebra in detail. Every intermediate result on its own line. State units at every step.]

## ✅ Verification
[Verify the answer using a different method, unit analysis, or by substituting back. Confirm it is reasonable.]

> **🎯 Final Answer:** [State the complete final answer with correct units, bold and clear.]

## 📖 Short Explanation
[2–3 sentences summarising the solution in plain student-friendly language.]

For non-numerical questions (essays, definitions, history, languages, etc.), use:

## 📝 Detected Question
## 🧠 Understanding the Problem
## ✅ Complete Answer

FORMATTING RULES — follow these exactly:
- Use proper Unicode math symbols inline: ×, ÷, √, ², ³, ⁴, π, ≈, ±, ≤, ≥, ≠, Δ, Σ, ∫, ∞, °, θ, α, β, γ, λ, μ.
- For fractions write "(numerator) / (denominator)" — e.g. "(v₀ × sin θ) / (g)".
- For exponents write "x²" or "x^n"; for square roots write "√(x)".
- For subscripts write them as: v₀, t_max, h_max (Unicode subscripts preferred; use underscore only when Unicode unavailable).
- NEVER output raw LaTeX commands — not \\frac{}{}, \\sqrt{}, \\bar{}, \\hat{}, \\vec{}, \\pi, \\Delta, \\times, \\cdot, \\left(, \\right), $...$, or ANY other backslash command. Unicode only.
- Use **bold** for every key term, formula name, and final answer value.
- Tables are encouraged for comparing values or listing data.
- If the question is in a non-English language, answer in that same language.

Never reveal AI provider names.`;
}

function buildFollowupPrompt(question: string): string {
  return `Continue answering the student's follow-up question below. You can see the original image and all previous conversation turns above.

ACCURACY IS THE HIGHEST PRIORITY. Be thorough and well-structured. Use the same formatting rules as before — Unicode math symbols, no LaTeX backslash commands, bold key terms, numbered steps for calculations.

Follow-up question: ${question}`;
}

function ImageSolverPage() {
  const { user } = Route.useRouteContext();
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "cerebras");

  // Persisted state — survives route changes within the same session
  const [state, setState] = usePageState("image-solver", {
    answer: "",
    instructions: "",
    loading: false,
    chatHistory: [] as ConvMsg[],
    followupInput: "",
    followupLoading: false,
  });

  const [imgState, setImgState] = usePageState<{ image: PendingImage | null }>(
    "image-solver-img",
    { image: null },
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const followupRef = useRef<HTMLTextAreaElement>(null);

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
      setState({ answer: "", chatHistory: [], followupInput: "" });
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
    setState({ loading: true, answer: "", chatHistory: [], followupInput: "" });
    try {
      const prompt = buildPrompt(state.instructions);
      const res = await analyzeImageServer({
        data: {
          prompt,
          imageBase64: imgState.image.base64,
          mimeType: imgState.image.mimeType,
        },
      });
      setState({
        answer: res.text,
        loading: false,
        chatHistory: [
          { role: "user", content: prompt },
          { role: "assistant", content: res.text },
        ],
      });
      await bump();
    } catch {
      toast.error("Failed to read/solve the image — please try again");
      setState({ loading: false });
    }
  }

  async function sendFollowup() {
    const q = state.followupInput.trim();
    if (!q || state.followupLoading || !imgState.image) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setState({ followupLoading: true, followupInput: "" });
    try {
      const res = await analyzeImageServer({
        data: {
          prompt: buildFollowupPrompt(q),
          imageBase64: imgState.image.base64,
          mimeType: imgState.image.mimeType,
          history: state.chatHistory,
        },
      });
      setState((prev: typeof state) => ({
        followupLoading: false,
        chatHistory: [
          ...prev.chatHistory,
          { role: "user", content: q },
          { role: "assistant", content: res.text },
        ],
      }));
      await bump();
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      toast.error("Follow-up failed — please try again");
      setState({ followupLoading: false });
    }
  }

  function handleFollowupKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendFollowup();
    }
  }

  // The conversation thread excluding the initial solve (shown separately)
  const followupMsgs = state.chatHistory.slice(2);

  const mdComponents = {
    strong: ({ children }: { children?: React.ReactNode }) => (
      <mark className="bg-yellow-200 text-yellow-900 font-bold rounded px-0.5">{mapMathChildren(children)}</mark>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => {
      const t = String(children).toLowerCase();
      if (t.includes("📝") || t.includes("detected")) {
        return (
          <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 mt-5 mb-3">
            <h2 className="font-extrabold text-sm text-amber-900 tracking-wide">{children}</h2>
          </div>
        );
      }
      if (t.includes("📊") || t.includes("given")) return <div className="rounded-xl border-l-4 border-blue-400 bg-blue-50 px-3 py-2 mt-5 mb-3"><h2 className="font-bold text-sm text-blue-900">{children}</h2></div>;
      if (t.includes("🎯") || t.includes("required")) return <div className="rounded-xl border-l-4 border-violet-400 bg-violet-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-violet-900">{children}</h2></div>;
      if (t.includes("📐") || t.includes("formula")) return <div className="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-indigo-900">{children}</h2></div>;
      if (t.includes("💡") || t.includes("concept")) return <div className="rounded-xl border-l-4 border-yellow-400 bg-yellow-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-yellow-900">{children}</h2></div>;
      if (t.includes("🔢") || t.includes("step")) return <div className="rounded-xl border-l-4 border-orange-400 bg-orange-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-orange-900">{children}</h2></div>;
      if (t.includes("🧮") || t.includes("calculat")) return <div className="rounded-xl border-l-4 border-pink-400 bg-pink-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-pink-900">{children}</h2></div>;
      if (t.includes("✅") || t.includes("verif") || t.includes("solution") || t.includes("answer") || t.includes("complete")) return <div className="rounded-xl border-l-4 border-emerald-400 bg-emerald-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-emerald-900">{children}</h2></div>;
      if (t.includes("📖") || t.includes("explanation") || t.includes("summary")) return <div className="rounded-xl border-l-4 border-teal-400 bg-teal-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-teal-900">{children}</h2></div>;
      if (t.includes("🧠") || t.includes("understanding") || t.includes("asked")) return <div className="rounded-xl border-l-4 border-purple-400 bg-purple-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-purple-900">{children}</h2></div>;
      return <div className="rounded-xl border-l-4 border-slate-300 bg-slate-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-slate-800">{children}</h2></div>;
    },
    h3: ({ children }: { children?: React.ReactNode }) => (
      <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2 mt-4 mb-2">
        <h3 className="font-extrabold text-sm text-amber-900">{mapMathChildren(children)}</h3>
      </div>
    ),
    h4: ({ children }: { children?: React.ReactNode }) => (
      <h4 className="font-bold text-sm text-violet-800 mt-3 mb-1 px-2 py-1 bg-violet-50 rounded border-l-2 border-violet-400">{mapMathChildren(children)}</h4>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <div className="my-4 rounded-2xl border-2 border-emerald-400 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 shadow-sm">
        <div className="text-sm font-semibold text-emerald-800 leading-relaxed">{children}</div>
      </div>
    ),
    p: ({ children }: { children?: React.ReactNode }) => <p className="my-3 leading-relaxed">{mapMathChildren(children)}</p>,
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="my-3 space-y-3 pl-5 list-decimal">{children}</ol>,
    ul: ({ children }: { children?: React.ReactNode }) => <ul className="my-3 space-y-2 pl-5 list-disc">{children}</ul>,
    li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed pl-1">{mapMathChildren(children)}</li>,
    code: ({ children }: { children?: React.ReactNode }) => (
      <code className="bg-slate-100 text-violet-700 rounded px-1.5 py-0.5 font-mono text-[0.85em]">{mapMathChildren(children)}</code>
    ),
    pre: ({ children }: { children?: React.ReactNode }) => (
      <pre className="bg-slate-900 text-green-400 rounded-xl p-3.5 overflow-x-auto font-mono text-sm my-2 leading-relaxed">{children}</pre>
    ),
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="overflow-x-auto my-3 rounded-xl border border-border">
        <table className="min-w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }: { children?: React.ReactNode }) => <thead className="bg-violet-600 text-white">{children}</thead>,
    th: ({ children }: { children?: React.ReactNode }) => (
      <th className="px-3 py-2 text-left text-xs font-semibold">{mapMathChildren(children)}</th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td className="border-b border-border px-3 py-2 text-sm">{mapMathChildren(children)}</td>
    ),
  };

  const { image } = imgState;

  // Pre-process markdown: convert any raw LaTeX the AI might have emitted
  // despite the prompt instructions, before react-markdown sees it.
  function renderAnswer(text: string) {
    const clean = convertLatexToPlainMath(text);
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {clean}
      </ReactMarkdown>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* ── Upload / Image panel ── */}
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
              <button onClick={() => { setImgState({ image: null }); setState({ answer: "", chatHistory: [], followupInput: "" }); }} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
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

      {/* ── Loading state ── */}
      {state.loading && (
        <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-violet-600" />
          <p className="mt-3 text-sm text-muted-foreground">Reading the image and working out the answer…</p>
        </div>
      )}

      {/* ── Initial answer ── */}
      {state.answer && !state.loading && (
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="prose prose-sm max-w-none">
            {renderAnswer(state.answer)}
          </div>
        </div>
      )}

      {/* ── Follow-up conversation thread ── */}
      {followupMsgs.length > 0 && (
        <div className="space-y-3">
          {followupMsgs.map((msg, i) =>
            msg.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-violet-600 px-4 py-3 text-sm text-white shadow-sm">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div key={i} className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                <div className="prose prose-sm max-w-none">
                  {renderAnswer(msg.content)}
                </div>
              </div>
            )
          )}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* ── Follow-up chat input (appears once initial answer exists) ── */}
      {state.answer && !state.loading && imgState.image && (
        <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-violet-700">
            <MessageCircle className="h-4 w-4" />
            Ask a follow-up question about this image
          </p>
          <div className="flex gap-2">
            <textarea
              ref={followupRef}
              value={state.followupInput}
              onChange={(e) => setState({ followupInput: e.target.value })}
              onKeyDown={handleFollowupKey}
              placeholder='e.g. "Explain step 3 in more detail" or "Solve it using a different method"'
              rows={2}
              disabled={state.followupLoading}
              className="flex-1 resize-none rounded-xl border border-border bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
            />
            <button
              onClick={sendFollowup}
              disabled={state.followupLoading || !state.followupInput.trim()}
              className="flex h-auto w-12 flex-shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow hover:bg-violet-700 disabled:opacity-40"
            >
              {state.followupLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Press Enter to send · Shift+Enter for new line</p>
        </div>
      )}
    </div>
  );
}
