import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ChevronRight, ChevronDown, Lightbulb, RotateCcw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON } from "@/lib/aiProvider";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge, ProviderBadge } from "@/components/ai-ui";

export const Route = createFileRoute("/_authenticated/dashboard/solver")({
  component: SolverPage,
});

type Subject = "Math" | "Physics" | "Chemistry" | "Biology" | "Other";
type Step = { title: string; content: string; formula: string | null };
type Solution = {
  problem_type: string;
  subject: string;
  steps: Step[];
  final_answer: string;
  tip: string;
};

const SUBJECTS: { value: Subject; emoji: string; color: string }[] = [
  { value: "Math",      emoji: "🔢", color: "bg-blue-100 text-blue-800 border-blue-300" },
  { value: "Physics",   emoji: "⚛️", color: "bg-violet-100 text-violet-800 border-violet-300" },
  { value: "Chemistry", emoji: "🧪", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { value: "Biology",   emoji: "🦠", color: "bg-pink-100 text-pink-800 border-pink-300" },
  { value: "Other",     emoji: "🧩", color: "bg-amber-100 text-amber-800 border-amber-300" },
];

const EXAMPLES = [
  "Solve: 2x² - 5x + 3 = 0",
  "A car accelerates from 0 to 60 km/h in 5 seconds. Find the acceleration.",
  "Balance the equation: Fe + HCl → FeCl₂ + H₂",
  "Find the area of a triangle with base 8 cm and height 5 cm.",
  "A ball is thrown upward with velocity 20 m/s. How high does it go? (g = 10 m/s²)",
];

function buildPrompt(problem: string, subject: Subject): string {
  return `Solve this ${subject} problem step by step: "${problem}"

Return STRICT JSON only — no prose, no markdown fences:
{
  "problem_type": "short name of problem type (e.g. Quadratic Equation, Newton's Second Law)",
  "subject": "${subject}",
  "steps": [
    {
      "title": "Step title (short, 3-6 words)",
      "content": "Clear explanation of what to do in this step and why (2-4 sentences)",
      "formula": "Any formula or equation used (e.g. 'v = u + at', 'x = (-b ± √(b²-4ac)) / 2a') or null if none"
    }
  ],
  "final_answer": "The complete final answer with units if applicable",
  "tip": "One helpful tip or common mistake students make with this type of problem"
}
Include 3–8 steps. Each step must be self-contained and easy to follow.`;
}

function StepCard({ step, index, total, revealed, onReveal }: {
  step: Step; index: number; total: number; revealed: boolean; onReveal: () => void;
}) {
  const colors = [
    "border-l-blue-400 bg-blue-50",
    "border-l-violet-400 bg-violet-50",
    "border-l-emerald-400 bg-emerald-50",
    "border-l-amber-400 bg-amber-50",
    "border-l-pink-400 bg-pink-50",
    "border-l-cyan-400 bg-cyan-50",
    "border-l-orange-400 bg-orange-50",
    "border-l-rose-400 bg-rose-50",
  ];
  const color = colors[index % colors.length];

  if (!revealed) {
    return (
      <button
        onClick={onReveal}
        className="w-full rounded-xl border-2 border-dashed border-border bg-muted/30 px-5 py-4 text-left transition-all hover:border-primary/40 hover:bg-accent"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {index + 1}
          </div>
          <span className="text-sm text-muted-foreground">Click to reveal Step {index + 1} of {total}</span>
          <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
        </div>
      </button>
    );
  }

  return (
    <div className={`rounded-xl border-l-4 p-4 sm:p-5 ${color} animate-in slide-in-from-top-2 duration-300`}>
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-white/80 text-sm font-bold text-foreground shadow-sm">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold text-foreground">{step.title}</h4>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">{step.content}</p>
          {step.formula && (
            <div className="mt-3 rounded-lg bg-white/70 px-4 py-2.5 font-mono text-sm font-semibold text-foreground shadow-sm">
              {step.formula}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SolverPage() {
  const { user } = Route.useRouteContext();
  const [problem, setProblem] = useState("");
  const [subject, setSubject] = useState<Subject>("Math");
  const [loading, setLoading] = useState(false);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "solver");

  async function solve() {
    if (!problem.trim()) return toast.error("Enter a problem to solve");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true);
    setSolution(null);
    setRevealed([]);
    setShowAnswer(false);
    const res = await askAI(
      buildPrompt(problem, subject),
      "You are an expert tutor. Return ONLY valid JSON — no markdown, no prose.",
    );
    setProvider(res.provider);
    await bump();
    const parsed = extractJSON<Solution>(res.text);
    if (parsed?.steps?.length) {
      setSolution(parsed);
      setRevealed(Array(parsed.steps.length).fill(false));
    } else {
      toast.error("Could not parse solution — try rephrasing the problem");
    }
    setLoading(false);
  }

  function revealStep(i: number) {
    setRevealed((prev) => { const n = [...prev]; n[i] = true; return n; });
  }

  function revealAll() {
    if (!solution) return;
    setRevealed(Array(solution.steps.length).fill(true));
    setShowAnswer(true);
  }

  function reset() {
    setSolution(null);
    setRevealed([]);
    setShowAnswer(false);
    setProblem("");
  }

  const allRevealed = revealed.length > 0 && revealed.every(Boolean);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Step-by-Step Solver</h2>
          <p className="text-sm text-muted-foreground">Paste any problem — reveal each step at your own pace</p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      {/* Input card */}
      {!solution && (
        <div className="card-soft space-y-4 p-4 sm:p-6">
          {/* Subject selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subject</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {SUBJECTS.map(({ value, emoji, color }) => (
                <button
                  key={value}
                  onClick={() => setSubject(value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${subject === value ? color : "border-border bg-background text-muted-foreground hover:bg-accent"}`}
                >
                  {emoji} {value}
                </button>
              ))}
            </div>
          </div>

          {/* Problem input */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Problem</label>
            <textarea
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder="Type or paste your problem here…"
              rows={4}
              className="mt-2 w-full rounded-xl border border-input bg-background p-3 text-sm focus:border-primary focus:outline-none resize-none"
            />
          </div>

          {/* Examples */}
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Try an example:</p>
            <div className="flex flex-col gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setProblem(ex)}
                  className="rounded-lg border border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={solve}
            disabled={loading || !problem.trim()}
            className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Solving…</> : "🧮 Solve Step by Step"}
          </button>
        </div>
      )}

      {/* Solution */}
      {solution && (
        <div className="space-y-4">
          {/* Problem recap */}
          <div className="card-soft flex items-start gap-3 p-4">
            <div className="mt-0.5 text-xl">{SUBJECTS.find(s => s.value === subject)?.emoji ?? "🧩"}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{solution.problem_type}</span>
                <ProviderBadge provider={provider} />
              </div>
              <p className="mt-1.5 text-sm font-medium">{problem}</p>
            </div>
            <button onClick={reset} className="flex-shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
              <RotateCcw className="h-4 w-4" />
            </button>
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
              className="w-full rounded-xl border border-primary/30 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5"
            >
              <ChevronDown className="mr-1.5 inline h-4 w-4" /> Reveal All Steps
            </button>
          )}

          {/* Final answer */}
          {(allRevealed || showAnswer) && (
            <div className="animate-in slide-in-from-bottom-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span className="font-bold text-emerald-800">Final Answer</span>
              </div>
              <p className="mt-2 text-base font-semibold text-emerald-900">{solution.final_answer}</p>
            </div>
          )}

          {/* Tip */}
          {allRevealed && solution.tip && (
            <div className="animate-in slide-in-from-bottom-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <div>
                  <span className="text-xs font-bold text-amber-700">Pro Tip</span>
                  <p className="mt-0.5 text-sm text-amber-800">{solution.tip}</p>
                </div>
              </div>
            </div>
          )}

          {/* New problem */}
          {allRevealed && (
            <button onClick={reset} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground">
              <RotateCcw className="mr-2 inline h-4 w-4" /> Solve Another Problem
            </button>
          )}
        </div>
      )}
    </div>
  );
}
