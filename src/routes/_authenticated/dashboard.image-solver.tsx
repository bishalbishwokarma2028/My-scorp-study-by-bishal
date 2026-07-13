import { createFileRoute } from "@tanstack/react-router";
import React, { useCallback, useEffect, useRef, isValidElement } from "react";
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

  return `You are a world-class expert tutor, OCR engine, and problem-solving assistant. The attached image may contain handwritten or printed text, a diagram, a worksheet, an exam question, or a problem in ANY language or script.

═══════════════════════════════════════
STEP 1 — READ & EXTRACT
═══════════════════════════════════════
Read every piece of visible text from the image exactly as written. Preserve the original language, all numbers, units, and labels. Do not skip or paraphrase.

═══════════════════════════════════════
STEP 2 — DISPLAY THE QUESTION (MANDATORY FIRST OUTPUT)
═══════════════════════════════════════
The VERY FIRST thing you output must be the detected question in this EXACT blockquote format — copy the question word-for-word from the image:

> 🔍 **DETECTED QUESTION FROM IMAGE:**
> [Copy the complete, exact question text here — every word, every part, every sub-question. If multi-part (a, b, c…), include ALL parts.]

═══════════════════════════════════════
STEP 3 — ANSWER
═══════════════════════════════════════
${userInstructions}

ABSOLUTE LENGTH REQUIREMENT — THIS IS NON-NEGOTIABLE:
Your response MUST be extremely long, comprehensive, and detailed. Treat every question as if you are writing a full textbook chapter section:
• Simple / short question → minimum 600 words. Introduce the concept from first principles, state all relevant formulas with full derivations, show every single arithmetic step, give a real-world example, verify the answer two different ways.
• Medium question → minimum 1 200 words. Cover background theory, all formulas, full worked solution with every sub-step shown, alternative method, verification, common mistakes, and a key-points summary.
• Long / multi-part question → minimum 2 000 words. Each part gets its own full section with heading, theory, full working, and conclusion. Then a comprehensive overall summary.
• Advanced / university-level → minimum 2 500 words. Full textbook-level treatment: concept introduction, derivation, worked solution, alternative approaches, real-world applications, verification, and exam strategy.

NEVER give a short answer. NEVER say "the answer is X" without extensive working. If you think the question is simple, you are required to expand it with deeper explanation and examples.

═══════════════════════════════════════
STRUCTURE FOR MATH / SCIENCE / NUMERICAL QUESTIONS
═══════════════════════════════════════
Use ALL of these sections (every single one, no skipping):

## 📊 Given Data
List every piece of information from the problem as individual bullet points. Include variable names, values, and units. If data is implicit (e.g. g = 9.8 m/s² for Earth), state it explicitly here.

## 🎯 What We Need to Find
State exactly what quantity or quantities must be determined. For multi-part questions, list each part separately.

## 📐 Relevant Formulas & Equations
Write out EVERY formula that will be used. For each formula:
- State it in symbolic form (e.g. F = ma)
- Define every variable (e.g. F = net force in Newtons, m = mass in kg, a = acceleration in m/s²)
- Explain WHY this formula applies to this specific problem
- If the formula requires rearranging, show the algebraic rearrangement step by step

## 💡 Core Concept & Theory
Write a minimum of 4–6 sentences explaining the underlying physics, mathematics, or scientific principle being tested. Explain it as if teaching a student who has never seen this topic before. Use analogies where helpful.

## 🔢 Step-by-Step Solution
Number EVERY step. For each step:
1. State what you are about to do and why
2. Write the formula being applied
3. Substitute values (show every substitution explicitly)
4. Simplify step by step — every intermediate result on its own line
5. State the partial result with units

Never combine steps. If a step has two parts, split it into two steps.

## 🧮 Full Arithmetic & Algebra Workings
Expand ALL arithmetic in complete detail. Show every multiplication, division, addition, and subtraction. Do not skip any step — write out each operation separately even if it seems obvious. Include units at every line.

## 🔄 Alternative Method / Cross-Check
Solve the problem using a completely different approach (different formula, graphical method, energy method, vector method, etc.). This confirms your answer and teaches the student a second technique.

## ✅ Verification
MANDATORY. Perform a rigorous independent check:
- Substitute the final answer back into the original equation
- Verify units are dimensionally consistent (dimensional analysis)
- Check if the magnitude and sign of the answer are physically reasonable
- Explicitly conclude: "Answer verified ✓" or state any correction made.

> **🎯 Final Answer:** [Complete final answer with ALL values, correct units, significant figures. Make it unmistakable.]

## ⚠️ Common Mistakes & How to Avoid Them
List 3–5 specific mistakes students commonly make on this type of problem. For each mistake: describe what goes wrong and how to avoid it.

## 📖 Summary & Key Takeaways
Write 4–6 bullet points summarising the most important concepts, formulas, and reasoning used. A student should be able to read only this section and understand the core of the solution.

## 🌟 Real-World Application
Describe in 3–5 sentences where this concept appears in real life, engineering, science, or everyday situations. Make it engaging and relevant.

## 📝 Exam Strategy & Tips
Give 2–4 specific tips for answering this type of question in an exam: what to write first, how to organise the working, common traps to watch for, how to check the answer quickly.

═══════════════════════════════════════
STRUCTURE FOR NON-NUMERICAL QUESTIONS (essays, definitions, history, languages, comprehension)
═══════════════════════════════════════
## 🧠 Understanding the Problem
## 📚 Background & Context
## ✅ Complete Detailed Answer
## 💡 Key Points to Remember
## 🌟 Broader Significance

═══════════════════════════════════════
FORMATTING RULES — STRICTLY ENFORCED
═══════════════════════════════════════
- Math symbols: ×, ÷, √, ², ³, ⁴, π, ≈, ±, ≤, ≥, ≠, Δ, Σ, ∫, ∞, °, θ, α, β, γ, λ, μ
- Fractions: (numerator) / (denominator) — e.g. (v₀ × sin θ) / (2g)
- Exponents: x² or x^n | Square roots: √(expression)
- Subscripts: v₀, t_max, h_max (Unicode preferred)
- NEVER LaTeX: not \\frac, \\sqrt, \\text, \\times, \\left, \\right, $...$, or any backslash command
- **Bold** every key term, formula name, unit, and final answer value
- Use numbered lists for steps, bullet lists for data/facts
- Tables for comparing values or listing data sets
- Answer in the same language as the question if non-English

ACCURACY IS THE HIGHEST PRIORITY. Verify every single calculation before writing it. Never fabricate a number. If genuinely uncertain, say so explicitly.
Never reveal AI provider names.`;
}

function buildFollowupPrompt(question: string): string {
  return `Continue answering the student's follow-up question below. You can see the original image and all previous conversation turns above.

ACCURACY IS THE HIGHEST PRIORITY. Your answer MUST be long, detailed, and comprehensive — minimum 400 words. Do not give a brief reply. Explain the concept fully, show all working, include examples, and verify any calculations.

Use the same formatting rules as before — Unicode math symbols, no LaTeX backslash commands, **bold** key terms, numbered steps for all calculations, sectioned with ## headings.

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
      // Capture history before the await so we can extend it afterwards.
      // (usePageState doesn't support functional setState — must pass a plain object.)
      const historySnapshot = [...state.chatHistory];
      const res = await analyzeImageServer({
        data: {
          prompt: buildFollowupPrompt(q),
          imageBase64: imgState.image.base64,
          mimeType: imgState.image.mimeType,
          history: historySnapshot,
        },
      });
      setState({
        followupLoading: false,
        chatHistory: [
          ...historySnapshot,
          { role: "user" as const, content: q },
          { role: "assistant" as const, content: res.text },
        ],
      });
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

  /** Recursively flatten React children to a plain string for detection logic. */
  function getText(node: React.ReactNode): string {
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(getText).join("");
    if (isValidElement(node))
      return getText((node.props as { children?: React.ReactNode }).children);
    return "";
  }

  const mdComponents = {
    strong: ({ children }: { children?: React.ReactNode }) => (
      <mark className="bg-yellow-200 text-yellow-900 font-bold rounded px-0.5">{mapMathChildren(children)}</mark>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => {
      const t = String(children).toLowerCase();
      if (t.includes("📊") || t.includes("given")) return <div className="rounded-xl border-l-4 border-blue-400 bg-blue-50 px-3 py-2 mt-5 mb-3"><h2 className="font-bold text-sm text-blue-900">{children}</h2></div>;
      if (t.includes("🎯") || t.includes("required") || t.includes("find")) return <div className="rounded-xl border-l-4 border-violet-400 bg-violet-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-violet-900">{children}</h2></div>;
      if (t.includes("📐") || t.includes("formula") || t.includes("equation")) return <div className="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-indigo-900">{children}</h2></div>;
      if (t.includes("💡") || t.includes("concept") || t.includes("theory")) return <div className="rounded-xl border-l-4 border-yellow-400 bg-yellow-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-yellow-900">{children}</h2></div>;
      if (t.includes("🔢") || t.includes("step")) return <div className="rounded-xl border-l-4 border-orange-400 bg-orange-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-orange-900">{children}</h2></div>;
      if (t.includes("🧮") || t.includes("calculat") || t.includes("arithmetic") || t.includes("algebra")) return <div className="rounded-xl border-l-4 border-pink-400 bg-pink-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-pink-900">{children}</h2></div>;
      if (t.includes("🔄") || t.includes("alternative") || t.includes("cross-check") || t.includes("method")) return <div className="rounded-xl border-l-4 border-cyan-400 bg-cyan-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-cyan-900">{children}</h2></div>;
      if (t.includes("✅") || t.includes("verif") || t.includes("solution") || t.includes("answer") || t.includes("complete")) return <div className="rounded-xl border-l-4 border-emerald-400 bg-emerald-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-emerald-900">{children}</h2></div>;
      if (t.includes("⚠️") || t.includes("mistake") || t.includes("error") || t.includes("avoid")) return <div className="rounded-xl border-l-4 border-red-400 bg-red-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-red-900">{children}</h2></div>;
      if (t.includes("📖") || t.includes("summary") || t.includes("key takeaway") || t.includes("explanation")) return <div className="rounded-xl border-l-4 border-teal-400 bg-teal-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-teal-900">{children}</h2></div>;
      if (t.includes("🌟") || t.includes("real-world") || t.includes("application")) return <div className="rounded-xl border-l-4 border-amber-500 bg-amber-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-amber-900">{children}</h2></div>;
      if (t.includes("📝") || t.includes("exam") || t.includes("tip") || t.includes("strategy")) return <div className="rounded-xl border-l-4 border-lime-400 bg-lime-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-lime-900">{children}</h2></div>;
      if (t.includes("🧠") || t.includes("understanding") || t.includes("background") || t.includes("context")) return <div className="rounded-xl border-l-4 border-purple-400 bg-purple-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-purple-900">{children}</h2></div>;
      if (t.includes("📚") || t.includes("broader") || t.includes("significance")) return <div className="rounded-xl border-l-4 border-rose-400 bg-rose-50 px-3 py-2 mt-4 mb-2"><h2 className="font-bold text-sm text-rose-900">{children}</h2></div>;
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
    blockquote: ({ children }: { children?: React.ReactNode }) => {
      const raw = getText(children);

      // ── Detected-question blockquote (🔍) ─────────────────────────────────
      // The prompt instructs the AI to always begin with:
      //   > 🔍 **DETECTED QUESTION FROM IMAGE:**
      //   > [question text]
      // We render this as a large, prominent amber hero card.
      if (raw.includes("🔍") || raw.toLowerCase().includes("detected question")) {
        // Strip the "DETECTED QUESTION FROM IMAGE:" label line for cleaner display
        return (
          <div className="my-6 rounded-2xl border-[3px] border-amber-400 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 shadow-lg ring-4 ring-amber-100 overflow-hidden">
            {/* Banner header */}
            <div className="flex items-center gap-3 bg-amber-400 px-5 py-3">
              <span className="text-2xl">📋</span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.15em] text-amber-950">Question from Image</p>
                <p className="text-[10px] font-semibold text-amber-800 mt-0.5">Detected &amp; extracted by AI — this is what is being solved</p>
              </div>
            </div>
            {/* Question text body */}
            <div className="px-5 py-4 text-[15px] font-bold leading-relaxed text-amber-950 [&_strong]:bg-amber-200 [&_strong]:text-amber-900 [&_strong]:px-0.5 [&_strong]:rounded [&_p]:my-1.5">
              {children}
            </div>
          </div>
        );
      }

      // ── Final Answer blockquote (🎯) ────────────────────────────────────────
      return (
        <div className="my-4 rounded-2xl border-2 border-emerald-400 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 shadow-sm">
          <div className="text-sm font-semibold text-emerald-800 leading-relaxed">{children}</div>
        </div>
      );
    },
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
