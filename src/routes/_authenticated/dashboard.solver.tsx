import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { usePageState } from "@/lib/pageState";
import {
  Loader2, ChevronRight, ChevronDown, Lightbulb,
  RotateCcw, CheckCircle2, AlertCircle, BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { askAIJSON } from "@/lib/aiProvider";
import { convertLatexToPlainMath, renderMathText } from "@/lib/mathText";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge, ProviderBadge } from "@/components/ai-ui";

export const Route = createFileRoute("/_authenticated/dashboard/solver")({
  component: SolverPage,
});

type Subject = "Math" | "Physics" | "Chemistry" | "Biology" | "Economics" | "Other";

type Step = {
  title: string;
  what: string;
  why: string;
  how: string;
  formula: string | null;
  formula_explanation: string | null;
  calculation: string | null;
  result: string | null;
  common_mistake: string | null;
};

type Solution = {
  problem_type: string;
  subject: string;
  difficulty: "Easy" | "Medium" | "Hard";
  given: string[];
  find: string[];
  steps: Step[];
  final_answer: string;
  verification: string | null;
  key_concept: string;
  tip: string;
};

const SUBJECTS: { value: Subject; emoji: string; color: string; bg: string }[] = [
  { value: "Math",      emoji: "🔢", color: "text-blue-700",   bg: "bg-blue-100 border-blue-300"    },
  { value: "Physics",   emoji: "⚛️", color: "text-violet-700", bg: "bg-violet-100 border-violet-300" },
  { value: "Chemistry", emoji: "🧪", color: "text-emerald-700",bg: "bg-emerald-100 border-emerald-300"},
  { value: "Biology",   emoji: "🦠", color: "text-pink-700",   bg: "bg-pink-100 border-pink-300"    },
  { value: "Economics", emoji: "📊", color: "text-amber-700",  bg: "bg-amber-100 border-amber-300"  },
  { value: "Other",     emoji: "🧩", color: "text-slate-700",  bg: "bg-slate-100 border-slate-300"  },
];

const EXAMPLES: { subject: Subject; text: string }[] = [
  { subject: "Math",      text: "Solve: 2x² - 5x + 3 = 0 using the quadratic formula" },
  { subject: "Math",      text: "Find the derivative of f(x) = 3x³ - 2x² + 5x - 7" },
  { subject: "Physics",   text: "A car of mass 1200 kg accelerates from rest to 25 m/s in 10 s. Find: (a) acceleration, (b) net force, (c) work done." },
  { subject: "Physics",   text: "A ball is projected at 30° above the horizontal with initial velocity 40 m/s. Find max height, range, and time of flight. (g = 10 m/s²)" },
  { subject: "Chemistry", text: "Balance and explain: Fe₂O₃ + CO → Fe + CO₂. Identify the type of reaction." },
  { subject: "Chemistry", text: "Calculate the pH of a 0.01 M HCl solution and a 0.01 M NaOH solution." },
  { subject: "Biology",   text: "Explain the steps of DNA replication including all enzymes involved." },
  { subject: "Math",      text: "A train travels 300 km at speed v. If speed increases by 20 km/h, the journey takes 1 hour less. Find v." },
];

function buildPrompt(problem: string, subject: Subject): string {
  return `You are a world-class tutor solving a ${subject} problem for a student. Solve this problem with MAXIMUM detail and explanation so the student truly understands every step.

Problem: "${problem}"

Return STRICT JSON only (no prose outside JSON, no markdown fences):
{
  "problem_type": "Specific type (e.g. Quadratic Equation, Projectile Motion, Acid-Base Reaction)",
  "subject": "${subject}",
  "difficulty": "Easy|Medium|Hard",
  "given": ["List each given value or fact", "e.g. Mass m = 1200 kg", "Initial velocity u = 0 m/s"],
  "find": ["What we need to find", "e.g. Acceleration a = ?", "Net force F = ?"],
  "steps": [
    {
      "title": "Step title — action-oriented, 4-8 words (e.g. 'Identify the Quadratic Coefficients')",
      "what": "Clearly state WHAT you are doing in this step (1-2 sentences). Be specific.",
      "why": "Explain WHY this step is necessary — the reasoning and theory behind it (2-3 sentences). Connect to concepts.",
      "how": "Explain HOW to perform this step — detailed method, approach, or procedure (2-4 sentences).",
      "formula": "The exact formula using ONLY plain Unicode — e.g. 'F = ma', 'x = (-b ± √(b²-4ac)) / (2a)', 'H = v₀t - (1/2)gt²'. NEVER use LaTeX.",
      "formula_explanation": "If a formula is used: explain what each variable represents in the context of this problem. Otherwise null.",
      "calculation": "Show the full numeric substitution and arithmetic using plain Unicode — e.g. 'F = 1200 × 2.5 = 3000 N'. Use × for multiply, ÷ for divide, √ for root, ² for squared. NEVER use \\text{}, \\times, \\frac{}{}, or any LaTeX.",
      "result": "The result of this step with units (e.g. 'a = 2.5 m/s²') or null",
      "common_mistake": "The most common mistake students make in this exact step and how to avoid it, or null"
    }
  ],
  "final_answer": "Complete, clearly stated final answer with all values and units",
  "verification": "Show a quick way to verify/check the answer (substitute back, dimensional analysis, etc.) or null",
  "key_concept": "The most important underlying concept or principle this problem tests (2-3 sentences)",
  "tip": "One powerful exam tip or shortcut related to this type of problem"
}

REQUIREMENTS:
- Include 6 to 12 steps. Never fewer than 6.
- Each step must be LONG and DETAILED. The 'why' field must always explain the physics/math/chemistry theory.
- Show ALL arithmetic in the 'calculation' field — substitute numbers, simplify step by step.
- Never skip sub-steps. If simplifying an expression, show each simplification.
- MATHEMATICAL NOTATION — use ONLY plain Unicode and simple conventions. NEVER LaTeX backslash commands:
  • Fractions: write as (numerator) / (denominator) — e.g. (v₀² × sin²θ) / (2g)
  • Exponents: Unicode superscripts ², ³, ⁴ or caret — e.g. x² or x^2
  • Subscripts: Unicode subscripts ₀, ₁, ₂ or underscore — e.g. v₀ or v_0
  • Square roots: √(expression) — e.g. √(b² - 4ac)
  • Greek: actual characters — π, θ, α, β, γ, Δ, Σ, μ, λ, ω (NOT \\pi, \\theta, etc.)
  • Operators: ×, ÷, ±, ≈, ≠, ≤, ≥, ∞, °, ·
  • FORBIDDEN: \\frac{}{}, \\sqrt{}, \\text{}, \\times, \\left, \\right, \\begin, $...$, &=, \\\\ line breaks`;
}

const STEP_COLORS = [
  { border: "border-l-blue-400",   bg: "bg-blue-50",    num: "bg-blue-500",    badge: "bg-blue-100 text-blue-700" },
  { border: "border-l-violet-400", bg: "bg-violet-50",  num: "bg-violet-500",  badge: "bg-violet-100 text-violet-700" },
  { border: "border-l-emerald-400",bg: "bg-emerald-50", num: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700" },
  { border: "border-l-amber-400",  bg: "bg-amber-50",   num: "bg-amber-500",   badge: "bg-amber-100 text-amber-700" },
  { border: "border-l-pink-400",   bg: "bg-pink-50",    num: "bg-pink-500",    badge: "bg-pink-100 text-pink-700" },
  { border: "border-l-cyan-400",   bg: "bg-cyan-50",    num: "bg-cyan-500",    badge: "bg-cyan-100 text-cyan-700" },
  { border: "border-l-orange-400", bg: "bg-orange-50",  num: "bg-orange-500",  badge: "bg-orange-100 text-orange-700" },
  { border: "border-l-rose-400",   bg: "bg-rose-50",    num: "bg-rose-500",    badge: "bg-rose-100 text-rose-700" },
];

function StepCard({
  step, index, total, revealed, onReveal,
}: {
  step: Step; index: number; total: number; revealed: boolean; onReveal: () => void;
}) {
  const c = STEP_COLORS[index % STEP_COLORS.length];

  if (!revealed) {
    return (
      <button
        onClick={onReveal}
        className="group w-full rounded-xl border-2 border-dashed border-border bg-muted/20 px-5 py-4 text-left transition-all hover:border-primary/50 hover:bg-accent"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-muted text-sm font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
            {index + 1}
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground group-hover:text-foreground">
              Step {index + 1} of {total}
            </p>
            <p className="text-xs text-muted-foreground/70">Click to reveal</p>
          </div>
          <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground group-hover:text-primary" />
        </div>
      </button>
    );
  }

  return (
    <div className={`rounded-xl border-l-4 ${c.border} ${c.bg} p-5 animate-in slide-in-from-top-2 duration-300 space-y-4`}>
      {/* Step header */}
      <div className="flex items-start gap-3">
        <div className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-full ${c.num} text-sm font-bold text-white shadow-sm`}>
          {index + 1}
        </div>
        <div>
          <h4 className="font-bold text-foreground text-base">{step.title}</h4>
          <span className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${c.badge}`}>
            Step {index + 1} of {total}
          </span>
        </div>
      </div>

      {/* What */}
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/50">📌 What we're doing</p>
        <p className="text-sm leading-relaxed text-foreground/90 font-medium">{renderMathText(convertLatexToPlainMath(step.what))}</p>
      </div>

      {/* Why */}
      <div className="rounded-lg bg-white/60 border border-white/80 p-3.5 space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/50">🧠 Why this step</p>
        <p className="text-sm leading-relaxed text-foreground/80">{renderMathText(convertLatexToPlainMath(step.why))}</p>
      </div>

      {/* How */}
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/50">⚙️ How to do it</p>
        <p className="text-sm leading-relaxed text-foreground/80">{renderMathText(convertLatexToPlainMath(step.how))}</p>
      </div>

      {/* Formula */}
      {step.formula && (
        <div className="rounded-xl border border-white bg-white/70 p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/50 mb-2">📐 Formula</p>
          <p className="font-mono text-base font-bold text-foreground leading-relaxed">
            {renderMathText(convertLatexToPlainMath(step.formula))}
          </p>
          {step.formula_explanation && (
            <p className="mt-2 text-xs text-foreground/60 leading-relaxed">
              {renderMathText(convertLatexToPlainMath(step.formula_explanation))}
            </p>
          )}
        </div>
      )}

      {/* Calculation */}
      {step.calculation && (
        <div className="rounded-xl bg-slate-900 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">🔢 Calculation</p>
          <p className="whitespace-pre-wrap font-mono text-sm text-emerald-300 leading-relaxed">
            {renderMathText(convertLatexToPlainMath(step.calculation))}
          </p>
        </div>
      )}

      {/* Result */}
      {step.result && (
        <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
          <p className="text-sm font-bold text-emerald-800">Result: {renderMathText(convertLatexToPlainMath(step.result))}</p>
        </div>
      )}

      {/* Common mistake */}
      {step.common_mistake && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
          <div>
            <p className="text-[10px] font-bold uppercase text-red-600">⚠️ Common Mistake</p>
            <p className="mt-0.5 text-xs text-red-700 leading-relaxed">{renderMathText(convertLatexToPlainMath(step.common_mistake))}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function DifficultyBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    Easy:   "bg-emerald-100 text-emerald-700 border-emerald-200",
    Medium: "bg-amber-100 text-amber-700 border-amber-200",
    Hard:   "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${map[level] ?? "bg-muted text-muted-foreground"}`}>
      {level === "Easy" ? "🟢" : level === "Medium" ? "🟡" : "🔴"} {level}
    </span>
  );
}

function SolverPage() {
  const { user } = Route.useRouteContext();
  const [s, set] = usePageState("solver", {
    problem:  "",
    subject:  "Math" as Subject,
    solution: null as Solution | null,
    provider: null as string | null,
    revealed: [] as boolean[],
  });
  const { problem, subject, solution, provider, revealed } = s;
  const [loading, setLoading] = useState(false);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "cerebras");

  async function solve() {
    if (!problem.trim()) return toast.error("Enter a problem to solve");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true);
    set({ solution: null, revealed: [] });
    try {
      // askAIJSON automatically retries with a stricter prompt if the first
      // response is not valid JSON — handles long questions that can cause
      // truncated or malformed responses.
      const { data: parsed, provider: prov } = await askAIJSON<Solution>(
        buildPrompt(problem, subject),
        "You are an expert tutor. Return ONLY valid JSON — absolutely no markdown fences or prose outside the JSON.",
        undefined, true, 4000,
      );
      set({ provider: prov });
      await bump();
      if (parsed?.steps?.length) {
        set({ solution: parsed, revealed: Array(parsed.steps.length).fill(false) });
      } else {
        toast.error("Could not generate a solution — please try again");
      }
    } catch {
      toast.error("Failed to solve — please try again");
    } finally {
      setLoading(false);
    }
  }

  function revealStep(i: number) {
    const n = [...revealed]; n[i] = true;
    set({ revealed: n });
  }

  function revealAll() {
    if (!solution) return;
    set({ revealed: Array(solution.steps.length).fill(true) });
  }

  function reset() {
    set({ solution: null, revealed: [], problem: "" });
  }

  const revealedCount = revealed.filter(Boolean).length;
  const allRevealed = revealed.length > 0 && revealed.every(Boolean);

  return (
    <div className="mx-auto max-w-2xl space-y-5 lg:max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Step-by-Step Solver</h2>
          <p className="text-sm text-muted-foreground">
            Deep explanations — every step includes what, why, how, and the calculation
          </p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      {/* Input card */}
      {!solution && (
        <div className="card-soft space-y-5 p-5 sm:p-6">
          {/* Subject selector */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Subject
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {SUBJECTS.map(({ value, emoji, bg }) => (
                <button
                  key={value}
                  onClick={() => set({ subject: value })}
                  className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${
                    subject === value ? bg : "border-border bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {emoji} {value}
                </button>
              ))}
            </div>
          </div>

          {/* Problem input */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Your Problem
            </label>
            <textarea
              value={problem}
              onChange={(e) => set({ problem: e.target.value })}
              placeholder="Type or paste your problem here — include all given values and what you need to find…"
              rows={5}
              className="mt-2 w-full rounded-xl border border-input bg-background p-3.5 text-sm focus:border-primary focus:outline-none resize-none leading-relaxed"
            />
          </div>

          {/* Examples */}
          <div>
            <p className="mb-2.5 text-xs font-bold text-muted-foreground">💡 Try an example:</p>
            <div className="space-y-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.text}
                  onClick={() => set({ problem: ex.text, subject: ex.subject })}
                  className="flex w-full items-start gap-3 rounded-xl border border-border px-4 py-3 text-left text-xs hover:border-primary/40 hover:bg-accent transition-colors"
                >
                  <span>{SUBJECTS.find(sub => sub.value === ex.subject)?.emoji}</span>
                  <span className="text-muted-foreground hover:text-foreground">{ex.text}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={solve}
            disabled={loading || !problem.trim()}
            className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Solving with full explanation…</>
              : "🧮 Solve Step by Step"}
          </button>
        </div>
      )}

      {/* Solution */}
      {solution && (
        <div className="space-y-4">
          {/* Problem recap + meta */}
          <div className="card-soft p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-2xl">
                {SUBJECTS.find(s => s.value === subject)?.emoji ?? "🧩"}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-bold text-primary">
                    {solution.problem_type}
                  </span>
                  <DifficultyBadge level={solution.difficulty} />
                  <ProviderBadge provider={provider} />
                </div>
                <p className="text-sm font-semibold leading-relaxed">{problem}</p>
              </div>
              <button
                onClick={reset}
                className="flex-shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent"
                title="New problem"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>

            {/* Given / Find */}
            {(solution.given?.length > 0 || solution.find?.length > 0) && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {solution.given?.length > 0 && (
                  <div className="rounded-xl bg-blue-50 border border-blue-100 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-2">📋 Given</p>
                    <ul className="space-y-1">
                      {solution.given.map((g, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-blue-900">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                          {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {solution.find?.length > 0 && (
                  <div className="rounded-xl bg-violet-50 border border-violet-100 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 mb-2">🎯 Find</p>
                    <ul className="space-y-1">
                      {solution.find.map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-violet-900">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Key concept */}
            {solution.key_concept && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                <BookOpen className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Key Concept</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-amber-800">{solution.key_concept}</p>
                </div>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">
                {revealedCount}/{solution.steps.length} steps revealed
              </span>
              <span className="text-muted-foreground">
                {allRevealed ? "✅ Complete!" : "Click each step to reveal"}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${solution.steps.length ? (revealedCount / solution.steps.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {solution.steps.map((step, i) => (
              <StepCard
                key={i}
                step={step}
                index={i}
                total={solution.steps.length}
                revealed={revealed[i]}
                onReveal={() => revealStep(i)}
              />
            ))}
          </div>

          {/* Reveal all */}
          {!allRevealed && (
            <button
              onClick={revealAll}
              className="w-full rounded-xl border-2 border-primary/30 py-3 text-sm font-bold text-primary hover:bg-primary/5 flex items-center justify-center gap-2"
            >
              <ChevronDown className="h-4 w-4" /> Reveal All {solution.steps.length} Steps
            </button>
          )}

          {/* Final Answer */}
          {allRevealed && (
            <>
              <div className="animate-in slide-in-from-bottom-2 rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100 p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500">
                    <CheckCircle2 className="h-4 w-4 text-white" />
                  </div>
                  <span className="font-bold text-emerald-800 text-base">Final Answer</span>
                </div>
                <p className="text-base font-bold text-emerald-900 leading-relaxed">{solution.final_answer}</p>

                {solution.verification && (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-white/60 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1.5">✅ Verification</p>
                    <p className="text-xs text-emerald-800 leading-relaxed">{solution.verification}</p>
                  </div>
                )}
              </div>

              {/* Tip */}
              {solution.tip && (
                <div className="animate-in slide-in-from-bottom-2 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <Lightbulb className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
                  <div>
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">💡 Exam Tip</p>
                    <p className="mt-1 text-sm text-amber-800 leading-relaxed">{solution.tip}</p>
                  </div>
                </div>
              )}

              <button
                onClick={reset}
                className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground flex items-center justify-center gap-2"
              >
                <RotateCcw className="h-4 w-4" /> Solve Another Problem
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
