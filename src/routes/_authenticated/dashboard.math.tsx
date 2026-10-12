import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { usePageState } from "@/lib/pageState";
import { Loader2, ChevronRight, ChevronLeft, Eye, EyeOff, Send, MessageCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { askAI, askAIJSON } from "@/lib/aiProvider";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge, ProviderBadge } from "@/components/ai-ui";
import { TypewriterText } from "@/components/TypewriterText";
import logo from "@/assets/scorpstudy-logo.png";

export const Route = createFileRoute("/_authenticated/dashboard/math")({
  component: MathPage,
});

type MathData = {
  topic: string;
  subject: string;
  introduction: string;
  prerequisites: string[];
  key_concepts: { term: string; definition: string }[];
  formulas: { name: string; formula: string; variables: string; when_to_use: string }[];
  worked_examples: { title: string; problem: string; solution: string; insight: string }[];
  common_errors: { error: string; fix: string }[];
  practice_problems: { difficulty: string; problem: string; answer: string; solution_hint: string }[];
  real_world_application: { context: string; example: string };
  exam_tips: string[];
};

type AskMessage = { role: "user" | "assistant"; content: string; revealed?: boolean };

const MATH_SUBJECTS = [
  {
    subject: "Arithmetic", icon: "🔢", color: "bg-blue-500", light: "bg-blue-50", text: "text-blue-700", border: "border-blue-200",
    topics: [
      "Natural, Whole & Integer Numbers", "BODMAS / PEMDAS — Order of Operations", "Fractions — Adding, Subtracting, Multiplying, Dividing",
      "Decimals — Operations & Conversions", "Percentages — Finding, Increase & Decrease",
      "Ratios & Proportions — Direct & Inverse", "HCF & LCM — Methods & Applications",
      "Prime Factorisation", "Square Roots & Cube Roots", "Scientific Notation & Standard Form",
      "Absolute Value", "Number Patterns & Sequences", "Divisibility Rules",
    ],
  },
  {
    subject: "Algebra", icon: "🔣", color: "bg-violet-500", light: "bg-violet-50", text: "text-violet-700", border: "border-violet-200",
    topics: [
      "Variables, Terms & Expressions", "Simplifying Algebraic Expressions", "Expanding Brackets & FOIL",
      "Factorisation — Common Factor, Grouping", "Factorising Quadratics", "Linear Equations — One & Two Variables",
      "Simultaneous Equations — Substitution & Elimination", "Quadratic Equations — Factoring, Formula & Completing the Square",
      "Inequalities — Linear & Quadratic", "Polynomials — Operations & Division",
      "Functions — Domain, Range & Notation", "Composite & Inverse Functions",
      "Exponents & Laws of Indices", "Logarithms — Definition, Laws & Equations",
      "Sequences — Arithmetic & Geometric", "Binomial Theorem",
    ],
  },
  {
    subject: "Geometry", icon: "📐", color: "bg-emerald-500", light: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200",
    topics: [
      "Points, Lines, Rays & Angles", "Angle Relationships — Complementary, Supplementary, Vertical",
      "Triangles — Types, Properties & Congruence", "Triangle Similarity & Tests",
      "Pythagorean Theorem & Applications", "Quadrilaterals — Square, Rectangle, Parallelogram, Rhombus, Trapezium",
      "Circles — Parts, Angles, Chords & Tangents", "Polygons — Interior & Exterior Angles",
      "Area — All Shapes & Formulas", "Perimeter & Circumference",
      "Volume — Prisms, Cylinders, Cones, Pyramids, Spheres", "Surface Area",
      "Coordinate Geometry — Distance, Midpoint & Gradient", "Equation of a Line",
      "Geometric Transformations — Translation, Reflection, Rotation, Enlargement",
      "Circle Theorems — All 8 Theorems",
    ],
  },
  {
    subject: "Trigonometry", icon: "📈", color: "bg-amber-500", light: "bg-amber-50", text: "text-amber-700", border: "border-amber-200",
    topics: [
      "Right-Angled Triangles — SOH CAH TOA", "Trigonometric Ratios — sin, cos, tan",
      "Inverse Trigonometric Functions", "Exact Values (30°, 45°, 60°)",
      "Unit Circle — Angles & Coordinates", "Graphs of sin, cos & tan",
      "Transformations of Trig Graphs — A, B, C, D", "Trigonometric Identities — Pythagorean",
      "Double Angle Formulas", "Sum-to-Product & Product-to-Sum",
      "Sine Rule — All Cases", "Cosine Rule — All Cases",
      "Area of a Triangle using Trigonometry", "Solving Trigonometric Equations",
      "Bearings & Navigation Problems", "Radians — Converting & Using",
    ],
  },
  {
    subject: "Calculus", icon: "∫", color: "bg-red-500", light: "bg-red-50", text: "text-red-700", border: "border-red-200",
    topics: [
      "Limits — Concept & Evaluation", "Limit Laws & Theorems", "Continuity — Types of Discontinuity",
      "Derivative — Definition from First Principles", "Basic Differentiation Rules",
      "Product Rule", "Quotient Rule", "Chain Rule",
      "Derivatives of Trigonometric Functions", "Derivatives of Exponential & Logarithmic Functions",
      "Higher Order Derivatives", "Implicit Differentiation",
      "Applications — Increasing/Decreasing & Extrema", "Applications — Curve Sketching",
      "Applications — Optimisation Problems", "Applications — Related Rates",
      "Integration — Antiderivatives & Indefinite Integrals", "Integration Rules",
      "Definite Integrals & Fundamental Theorem of Calculus", "Integration by Substitution",
      "Integration by Parts", "Area Between Curves", "Volumes of Revolution",
    ],
  },
  {
    subject: "Statistics & Probability", icon: "📊", color: "bg-cyan-500", light: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200",
    topics: [
      "Types of Data — Categorical vs Numerical", "Measures of Central Tendency — Mean, Median, Mode",
      "Measures of Spread — Range, IQR, Variance, Standard Deviation",
      "Data Representation — Bar Charts, Histograms, Pie Charts, Box Plots",
      "Scatter Plots & Correlation", "Linear Regression & Line of Best Fit",
      "Probability — Basic Rules & Definitions", "Addition & Multiplication Rules",
      "Conditional Probability", "Permutations — nPr",
      "Combinations — nCr", "Probability Distributions — Discrete",
      "Binomial Distribution — Mean, Variance & Calculations", "Normal Distribution — Properties",
      "Standard Normal & Z-Scores", "Sampling & Types of Samples",
      "Hypothesis Testing — Steps & Errors", "Confidence Intervals",
    ],
  },
];

function buildMathPrompt(topic: string, subject: string): string {
  return `Teach "${topic}" from ${subject} as a clear, accurate student lesson. Be focused rather than repetitive so the full lesson fits in one response.

Use plain Unicode math only (×, ÷, √, ², π, ≤, ≥, ≠); never use LaTeX, backslashes, or dollar-sign math.
Return exactly one valid JSON object matching this shape. Do not add markdown, comments, or keys:
{
  "topic": "...",
  "subject": "...",
  "introduction": "2-3 sentences explaining the idea and why it matters",
  "prerequisites": ["..."],
  "key_concepts": [{"term": "...", "definition": "Clear definition and context"}],
  "formulas": [{"name": "...", "formula": "...", "variables": "...", "when_to_use": "..."}],
  "worked_examples": [{"title": "...", "problem": "...", "solution": "Numbered steps with the essential reasoning and arithmetic", "insight": "..."}],
  "common_errors": [{"error": "...", "fix": "..."}],
  "practice_problems": [{"difficulty": "Easy", "problem": "...", "answer": "...", "solution_hint": "..."}],
  "real_world_application": {"context": "...", "example": "..."},
  "exam_tips": ["..."]
}

Include 4-6 key concepts, only formulas relevant to this topic, 2 worked examples, 3 common errors, 4 practice problems (easy to hard), and 3 useful exam tips. Explain worked solutions in 3-6 numbered steps; ensure each answer and formula is correct. Use empty arrays only where a section genuinely does not apply.`;
}

function isMathData(value: unknown): value is MathData {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  const isString = (item: unknown) => typeof item === "string";
  const isStringArray = (item: unknown) => Array.isArray(item) && item.every(isString);
  const isObjectArray = (item: unknown, keys: string[]) =>
    Array.isArray(item) && item.length > 0 && item.every((entry) =>
      Boolean(entry) && typeof entry === "object" && keys.every((key) => isString((entry as Record<string, unknown>)[key])),
    );
  const application = data.real_world_application;
  if (!application || typeof application !== "object") return false;
  const applicationFields = application as Record<string, unknown>;

  return isString(data.topic) && isString(data.subject) && isString(data.introduction) &&
    isStringArray(data.prerequisites) &&
    isObjectArray(data.key_concepts, ["term", "definition"]) &&
    (Array.isArray(data.formulas) && data.formulas.every((entry) =>
      Boolean(entry) && typeof entry === "object" && ["name", "formula", "variables", "when_to_use"].every((key) => isString((entry as Record<string, unknown>)[key])),
    )) &&
    isObjectArray(data.worked_examples, ["title", "problem", "solution", "insight"]) &&
    isObjectArray(data.common_errors, ["error", "fix"]) &&
    isObjectArray(data.practice_problems, ["difficulty", "problem", "answer", "solution_hint"]) &&
    isString(applicationFields.context) && isString(applicationFields.example) &&
    isStringArray(data.exam_tips);
}

function PracticeCard({ p, index }: { p: MathData["practice_problems"][0]; index: number }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const diffColor = p.difficulty === "Easy" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : p.difficulty === "Medium" ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-red-100 text-red-700 border-red-200";
  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
        <div className="flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${diffColor}`}>{p.difficulty}</span>
          </div>
          <p className="text-sm font-medium leading-relaxed">{p.problem}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!showHint && (
          <button onClick={() => setShowHint(true)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100">
            💡 Hint
          </button>
        )}
        <button onClick={() => setShowAnswer(!showAnswer)} className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
          {showAnswer ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showAnswer ? "Hide Answer" : "Show Answer"}
        </button>
      </div>
      {showHint && <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">💡 {p.solution_hint}</p>}
      {showAnswer && <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-800">✓ {p.answer}</p>}
    </div>
  );
}

function AskPanel({ topic, subject }: { topic: string; subject: string }) {
  const { user } = Route.useRouteContext();
  const [as, setAs] = usePageState(`math-ask-${topic}`, {
    messages: [] as AskMessage[],
    input: "",
  });
  const { messages, input } = as;
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { quota, bump } = useUsageLimit(user.id, "cerebras");

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const SUGGESTIONS = [
    `Give me a harder example of ${topic}`,
    `Explain ${topic} using a diagram description`,
    `What are the tricks for ${topic} in exams?`,
    `How does ${topic} connect to other topics?`,
  ];

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    const msgsWithUser: AskMessage[] = [...messages, { role: "user", content: text }];
    setAs({ messages: msgsWithUser, input: "" });
    setLoading(true);
    const system = `You are an expert ${subject} teacher. The student is studying "${topic}". Answer clearly with steps and examples.

FORMATTING RULES (strict):
- Use **bold** generously to highlight key terms, formulas, important numbers, and final answers — every important word or phrase should be bolded so the answer is easy to scan.
- Break your answer into short paragraphs or a numbered/bulleted list. Never write a big wall of unbroken text.
- NEVER use LaTeX syntax of any kind — no \\boxed{}, \\frac{}, \\times, \\subset, \\to, ^{}, _{}, $ signs, or backslash commands. Use plain Unicode math symbols instead: × for multiply, ÷ for divide, √ for square root, ² ³ for powers, π, ≤ ≥ ≠ ≈, → for "leads to", ⊂ for subset, ∈ for "is an element of".
- NEVER output raw HTML tags like <br>, <b>, <div> — use plain markdown (blank lines for new paragraphs, ** for bold) instead.
- Show calculations step-by-step using plain math notation, bolding the key formula or result of each step.`;
    const history = msgsWithUser.slice(0, -1).slice(-6).map(m => ({ role: m.role, content: m.content.slice(0, 1500) }));
    try {
      const res = await askAI(text, system, history, true);
      if (res.provider === "none") {
        toast.error("The AI service is unavailable. Your question is ready to retry.");
        setAs({ messages, input: text });
        return;
      }
      await bump();
      setAs({ messages: [...msgsWithUser, { role: "assistant", content: res.text }] });
    } catch {
      toast.error("The answer could not be loaded. Your question is ready to retry.");
      setAs({ messages, input: text });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card-soft overflow-hidden">
      <div className="border-b border-border bg-primary/5 px-4 py-3 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-primary" />
        <p className="text-sm font-bold text-primary">Ask about {topic}</p>
      </div>
      {messages.length === 0 && (
        <div className="p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Suggested questions</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(sg => (
              <button key={sg} onClick={() => send(sg)} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                {sg}
              </button>
            ))}
          </div>
        </div>
      )}
      {messages.length > 0 && (
        <div className="max-h-80 overflow-y-auto space-y-3 p-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              <div className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-[10px] font-bold overflow-hidden ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-white border border-primary/20"}`}>
                {m.role === "user" ? "You" : <img src={logo} alt="Assistant" className="h-full w-full object-contain p-0.5" />}
              </div>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted/50"}`}>
                {m.role === "user" ? <p>{m.content}</p> : (
                  <TypewriterText
                    content={m.content}
                    animate={!m.revealed}
                    onDone={!m.revealed ? () => {
                      const next = [...messages];
                      if (next[i]) next[i] = { ...next[i], revealed: true };
                      setAs({ messages: next });
                    } : undefined}
                    className="prose prose-sm max-w-none prose-p:my-1.5 prose-li:my-1 prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:text-xs"
                  />
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2">
              <div className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-white border border-primary/20 overflow-hidden">
                <img src={logo} alt="Assistant" className="h-full w-full object-contain p-0.5" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-muted/50 px-3 py-2.5">
                <div className="flex gap-1">{[0,150,300].map(d => <span key={d} className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}
      <div className="border-t border-border p-3 flex gap-2">
        <input value={input} onChange={e => setAs({ input: e.target.value })} onKeyDown={e => e.key === "Enter" && send()}
          placeholder={`Ask about ${topic}…`}
          className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        <button onClick={() => send()} disabled={loading || !input.trim()} className="rounded-xl bg-primary px-3 py-2 text-white disabled:opacity-40">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function MathPage() {
  const { user } = Route.useRouteContext();
  const [ps, set] = usePageState("math", {
    activeSubjectIdx: 0,
    selectedTopic:    null as string | null,
    mathData:         null as MathData | null,
    topicCache:       {} as Record<string, { data: MathData; provider: string | null }>,
    section:          "learn" as "learn" | "practice",
    provider:         null as string | null,
    expandedExample:  0 as number | null,
  });
  const { activeSubjectIdx, selectedTopic, mathData, section, provider, expandedExample } = ps;
  const [loading, setLoading] = useState(false);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "cerebras");

  const activeSubject = MATH_SUBJECTS[activeSubjectIdx];

  async function selectTopic(topic: string) {
    if (topic === selectedTopic) return;
    const cacheKey = `${activeSubject.subject}:${topic}`;
    const cached = ps.topicCache?.[cacheKey];
    if (cached) {
      set({ selectedTopic: topic, mathData: cached.data, provider: cached.provider, section: "learn", expandedExample: 0 });
      return;
    }
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    set({ selectedTopic: topic, mathData: null, provider: null, section: "learn", expandedExample: 0 });
    setLoading(true);
    try {
      const result = await askAIJSON<unknown>(
        buildMathPrompt(topic, activeSubject.subject),
        "You are an accurate math teacher. Return one valid JSON object matching the supplied schema.",
        undefined,
        true,
        4096,
      );
      if (result.provider === "none" || !isMathData(result.data)) {
        toast.error(result.provider === "none" ? "The AI service is unavailable. Please retry this topic." : "The lesson response was incomplete. Please retry this topic.");
        set({ selectedTopic: null });
        return;
      }

      const entries = Object.entries(ps.topicCache ?? {}).filter(([key]) => key !== cacheKey);
      const topicCache = Object.fromEntries([
        ...entries,
        [cacheKey, { data: result.data, provider: result.provider }],
      ].slice(-12));
      set({ mathData: result.data, provider: result.provider, topicCache });
      await bump();
    } catch {
      toast.error("Failed to load topic. Please try again.");
      set({ selectedTopic: null });
    } finally {
      setLoading(false);
    }
  }

  if (selectedTopic) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => set({ selectedTopic: null, mathData: null })}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Back to topics
          </button>
          <QuotaBadge quota={quota} loading={quotaLoading} />
        </div>

        {loading ? (
          <div className="card-soft flex min-h-[300px] flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading {selectedTopic}…</p>
          </div>
        ) : mathData ? (
            <div className="space-y-4">
              {/* Header */}
              <div className={`rounded-2xl ${activeSubject.color} p-5 text-white`}>
                <p className="text-xs font-bold uppercase tracking-wider opacity-75">{mathData.subject}</p>
                <h3 className="mt-1 text-xl font-bold">{mathData.topic}</h3>
                <p className="mt-2 text-sm leading-relaxed opacity-90">{mathData.introduction}</p>
                {mathData.prerequisites?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="text-xs opacity-70 font-semibold">Prerequisites:</span>
                    {mathData.prerequisites.map((p, i) => (
                      <span key={i} className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs">{p}</span>
                    ))}
                  </div>
                )}
                <div className="mt-3"><ProviderBadge provider={provider} /></div>
              </div>

              {/* Tabs */}
              <div className="flex gap-2">
                {(["learn", "practice"] as const).map(s => (
                  <button key={s} onClick={() => set({ section: s })}
                    className={`rounded-xl px-5 py-2 text-sm font-bold capitalize transition-all ${section === s ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>
                    {s === "learn" ? "📚 Learn" : "✏️ Practice"}
                  </button>
                ))}
              </div>

              {section === "learn" ? (
                <div className="space-y-4">
                  {/* Key concepts */}
                  <div className="card-soft p-4 sm:p-5">
                    <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">🔑 Key Concepts</h4>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {mathData.key_concepts.map((c, i) => (
                        <div key={i} className={`rounded-xl border ${activeSubject.border} ${activeSubject.light} p-3.5`}>
                          <p className={`text-xs font-bold ${activeSubject.text}`}>{c.term}</p>
                          <p className="mt-0.5 text-xs text-foreground/70 leading-relaxed">{c.definition}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Formulas */}
                  {mathData.formulas?.length > 0 && (
                    <div className="card-soft p-4 sm:p-5">
                      <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">📐 Formulas</h4>
                      <div className="space-y-3">
                        {mathData.formulas.map((f, i) => (
                          <div key={i} className="rounded-xl border border-border overflow-hidden">
                            <div className={`px-4 py-3 ${activeSubject.light}`}>
                              <p className={`text-xs font-bold ${activeSubject.text}`}>{f.name}</p>
                              <p className="mt-1.5 font-mono text-lg font-bold text-foreground">{f.formula}</p>
                              {f.variables && <p className="mt-1 text-xs text-foreground/60">{f.variables}</p>}
                            </div>
                            <p className="px-4 py-2.5 text-xs text-muted-foreground bg-background border-t border-border">{f.when_to_use}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Worked examples */}
                  <div className="card-soft p-4 sm:p-5">
                    <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">📝 Worked Examples</h4>
                    <div className="space-y-3">
                      {mathData.worked_examples.map((ex, i) => (
                        <div key={i} className="rounded-xl border border-border overflow-hidden">
                          <button onClick={() => set({ expandedExample: expandedExample === i ? null : i })}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left bg-muted/20 hover:bg-muted/40">
                            <span className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full ${activeSubject.color} text-xs font-bold text-white`}>{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-muted-foreground">{ex.title}</p>
                              <p className="text-sm font-medium mt-0.5 truncate">{ex.problem}</p>
                            </div>
                            {expandedExample === i ? <EyeOff className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : <Eye className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                          </button>
                          {expandedExample === i && (
                            <div className="border-t border-border">
                              <div className="bg-slate-900 px-4 py-4">
                                <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Solution</p>
                                <pre className="whitespace-pre-wrap font-mono text-sm text-emerald-300 leading-relaxed">{ex.solution}</pre>
                              </div>
                              {ex.insight && (
                                <div className={`px-4 py-3 ${activeSubject.light} border-t border-border`}>
                                  <p className={`text-xs font-bold ${activeSubject.text} mb-1`}>💡 Key Insight</p>
                                  <p className="text-xs text-foreground/75 leading-relaxed">{ex.insight}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Common errors */}
                  {mathData.common_errors?.length > 0 && (
                    <div className="card-soft p-4 sm:p-5">
                      <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">⚠️ Common Errors</h4>
                      <div className="space-y-2.5">
                        {mathData.common_errors.map((e, i) => (
                          <div key={i} className="rounded-xl border border-border bg-background p-3.5">
                            <p className="text-xs font-bold text-red-600 mb-1">❌ {e.error}</p>
                            <p className="text-xs text-emerald-700 leading-relaxed">✅ {e.fix}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Real world */}
                  {mathData.real_world_application && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                      <p className="text-xs font-bold text-primary mb-1">🌍 Real-World: {mathData.real_world_application.context}</p>
                      <p className="text-sm text-foreground/80 leading-relaxed">{mathData.real_world_application.example}</p>
                    </div>
                  )}

                  {/* Exam tips */}
                  {mathData.exam_tips?.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-xs font-bold text-amber-700 mb-2">🎯 Exam Tips</p>
                      <ul className="space-y-1.5">
                        {mathData.exam_tips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-amber-800">
                            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />{tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Ask AI */}
                  <AskPanel topic={selectedTopic} subject={activeSubject.subject} />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="card-soft p-4 sm:p-5 space-y-4">
                    <div>
                      <h4 className="font-bold">Practice Problems</h4>
                      <p className="text-sm text-muted-foreground mt-0.5">Try each problem before revealing the answer</p>
                    </div>
                    <div className="space-y-3">
                      {mathData.practice_problems.map((p, i) => <PracticeCard key={i} p={p} index={i} />)}
                    </div>
                  </div>
                  <AskPanel topic={selectedTopic} subject={activeSubject.subject} />
                </div>
              )}
            </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 lg:max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Mathematics</h2>
          <p className="text-sm text-muted-foreground">Every topic with formulas, worked examples, practice & AI chat</p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      {/* Subject pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {MATH_SUBJECTS.map(({ subject, icon, color }, i) => (
          <button key={subject} onClick={() => set({ activeSubjectIdx: i, selectedTopic: null, mathData: null })}
            className={`flex-shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition-all ${activeSubjectIdx === i ? `${color} text-white shadow-sm` : "border border-border bg-background hover:bg-accent"}`}>
            {icon} {subject}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Topic list */}
        <aside className="lg:w-64 flex-shrink-0">
          <div className="card-soft overflow-hidden">
            <div className={`border-b border-border px-4 py-2.5 ${activeSubject.light}`}>
              <p className={`text-xs font-bold uppercase tracking-wider ${activeSubject.text}`}>{activeSubject.icon} {activeSubject.subject}</p>
            </div>
            <nav className="max-h-[50vh] overflow-y-auto lg:max-h-[calc(100vh-18rem)]">
              {activeSubject.topics.map(topic => (
                <button key={topic} onClick={() => selectTopic(topic)}
                  className={`flex w-full items-center gap-2 border-b border-border/40 px-4 py-2.5 text-left text-xs transition-colors last:border-0 ${selectedTopic === topic ? `${activeSubject.color} text-white font-bold` : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
                  {selectedTopic === topic ? <span className="h-1.5 w-1.5 rounded-full bg-white flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-40" />}
                  <span className="truncate">{topic}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="card-soft flex min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="text-5xl">{activeSubject.icon}</div>
            <div>
              <p className="font-bold">{activeSubject.subject}</p>
              <p className="mt-1 text-sm text-muted-foreground">Select a topic for formulas, worked examples, practice problems & AI Q&A</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {activeSubject.topics.slice(0, 4).map(t => (
                <button key={t} onClick={() => selectTopic(t)} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent">{t}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
