import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ChevronRight, Eye, EyeOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON } from "@/lib/aiProvider";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge, ProviderBadge } from "@/components/ai-ui";

export const Route = createFileRoute("/_authenticated/dashboard/math")({
  component: MathPage,
});

type MathData = {
  topic: string;
  subject: string;
  introduction: string;
  key_concepts: string[];
  formulas: { name: string; formula: string; description: string }[];
  worked_examples: { problem: string; solution: string }[];
  practice_problems: { problem: string; answer: string; solution_hint: string }[];
  real_world_application: string;
};

const MATH_SUBJECTS = [
  {
    subject: "Arithmetic", icon: "🔢", color: "bg-blue-500", light: "bg-blue-50", text: "text-blue-700",
    topics: ["Basic Operations", "Fractions", "Decimals", "Percentages", "Ratios & Proportions", "BODMAS / PEMDAS", "Prime Numbers", "HCF & LCM", "Square & Cube Roots", "Scientific Notation"],
  },
  {
    subject: "Algebra", icon: "🔣", color: "bg-violet-500", light: "bg-violet-50", text: "text-violet-700",
    topics: ["Variables & Expressions", "Linear Equations", "Simultaneous Equations", "Quadratic Equations", "Polynomials", "Factorisation", "Inequalities", "Functions & Graphs", "Exponents & Logarithms", "Sequences & Series"],
  },
  {
    subject: "Geometry", icon: "📐", color: "bg-emerald-500", light: "bg-emerald-50", text: "text-emerald-700",
    topics: ["Points, Lines & Angles", "Triangles", "Quadrilaterals", "Circles", "Polygons", "Area & Perimeter", "Volume & Surface Area", "Coordinate Geometry", "Pythagorean Theorem", "Geometric Transformations"],
  },
  {
    subject: "Trigonometry", icon: "📈", color: "bg-amber-500", light: "bg-amber-50", text: "text-amber-700",
    topics: ["Sin, Cos & Tan", "Trigonometric Ratios", "Unit Circle", "Trigonometric Identities", "Inverse Trig Functions", "Graphs of Trig Functions", "Laws of Sines & Cosines", "Heights & Distances", "Radians & Degrees"],
  },
  {
    subject: "Calculus", icon: "∫", color: "bg-red-500", light: "bg-red-50", text: "text-red-700",
    topics: ["Limits", "Continuity", "Derivatives (Basic Rules)", "Chain Rule", "Product & Quotient Rule", "Applications of Derivatives", "Integration (Antiderivatives)", "Definite Integrals", "Area Under a Curve", "Differential Equations"],
  },
  {
    subject: "Statistics", icon: "📊", color: "bg-cyan-500", light: "bg-cyan-50", text: "text-cyan-700",
    topics: ["Mean, Median & Mode", "Range & IQR", "Standard Deviation & Variance", "Probability Basics", "Permutations & Combinations", "Binomial Distribution", "Normal Distribution", "Correlation & Regression", "Data Representation", "Hypothesis Testing"],
  },
];

function buildMathPrompt(topic: string, subject: string): string {
  return `Teach the mathematics topic "${topic}" from ${subject}.

Return STRICT JSON only — no prose, no markdown fences:
{
  "topic": "${topic}",
  "subject": "${subject}",
  "introduction": "Engaging 2-3 sentence introduction explaining what this topic is and why it matters",
  "key_concepts": ["Concept 1", "Concept 2", "Concept 3 (list 4-6 key concepts or vocabulary terms)"],
  "formulas": [
    {"name": "Formula name", "formula": "The actual formula using standard notation", "description": "When and how to use this formula"},
    {"name": "Formula 2", "formula": "...", "description": "..."}
  ],
  "worked_examples": [
    {
      "problem": "A clear, specific problem statement",
      "solution": "Step 1: [action]\\nStep 2: [action]\\nStep 3: [action]\\nFinal Answer: [answer with units if applicable]"
    },
    {
      "problem": "A second example problem (slightly harder)",
      "solution": "Step 1: ...\\nFinal Answer: ..."
    }
  ],
  "practice_problems": [
    {"problem": "Practice problem 1", "answer": "Final numerical answer", "solution_hint": "Key step or formula to use"},
    {"problem": "Practice problem 2", "answer": "Answer", "solution_hint": "Hint"},
    {"problem": "Practice problem 3", "answer": "Answer", "solution_hint": "Hint"},
    {"problem": "Practice problem 4 (harder)", "answer": "Answer", "solution_hint": "Hint"}
  ],
  "real_world_application": "A concrete real-world example of how this topic is used (2-3 sentences)"
}
Include 2-4 formulas if applicable (0 if none). Make worked examples detailed and easy to follow.`;
}

function PracticeCard({ p, index }: { p: MathData["practice_problems"][0]; index: number }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
        <p className="text-sm font-medium">{p.problem}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!showHint && (
          <button onClick={() => setShowHint(true)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">
            💡 Hint
          </button>
        )}
        <button onClick={() => setShowAnswer(!showAnswer)} className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
          {showAnswer ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showAnswer ? "Hide Answer" : "Show Answer"}
        </button>
      </div>
      {showHint && <p className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">💡 Hint: {p.solution_hint}</p>}
      {showAnswer && <p className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800">✓ Answer: {p.answer}</p>}
    </div>
  );
}

function MathPage() {
  const { user } = Route.useRouteContext();
  const [activeSubjectIdx, setActiveSubjectIdx] = useState(0);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [mathData, setMathData] = useState<MathData | null>(null);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState<"learn" | "practice">("learn");
  const [provider, setProvider] = useState<string | null>(null);
  const [expandedExample, setExpandedExample] = useState<number | null>(0);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "math");

  const activeSubject = MATH_SUBJECTS[activeSubjectIdx];

  async function selectTopic(topic: string) {
    if (topic === selectedTopic) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setSelectedTopic(topic);
    setMathData(null);
    setSection("learn");
    setExpandedExample(0);
    setLoading(true);
    const res = await askAI(
      buildMathPrompt(topic, activeSubject.subject),
      "You are a math teacher. Return ONLY valid JSON — no markdown, no prose.",
    );
    setProvider(res.provider);
    await bump();
    const parsed = extractJSON<MathData>(res.text);
    if (parsed) {
      setMathData(parsed);
    } else {
      toast.error("Could not load topic — please try again");
      setSelectedTopic(null);
    }
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Mathematics</h2>
          <p className="text-sm text-muted-foreground">Every topic explained with formulas, examples & practice</p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      {/* Subject pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {MATH_SUBJECTS.map(({ subject, icon, color }, i) => (
          <button
            key={subject}
            onClick={() => { setActiveSubjectIdx(i); setSelectedTopic(null); setMathData(null); }}
            className={`flex-shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition-all ${activeSubjectIdx === i ? `${color} text-white shadow-sm` : "border border-border bg-background hover:bg-accent"}`}
          >
            {icon} {subject}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Topic list */}
        <aside className="lg:w-56 flex-shrink-0">
          <div className="card-soft overflow-hidden">
            <div className={`border-b border-border px-4 py-2.5 ${activeSubject.light}`}>
              <p className={`text-xs font-bold uppercase tracking-wider ${activeSubject.text}`}>{activeSubject.icon} {activeSubject.subject}</p>
            </div>
            <nav className="max-h-[50vh] overflow-y-auto lg:max-h-[calc(100vh-18rem)]">
              {activeSubject.topics.map((topic) => (
                <button
                  key={topic}
                  onClick={() => selectTopic(topic)}
                  className={`flex w-full items-center gap-2 border-b border-border/40 px-4 py-2.5 text-left text-xs transition-colors last:border-0 ${selectedTopic === topic ? `${activeSubject.color} text-white font-semibold` : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                >
                  {selectedTopic === topic ? <span className="h-1.5 w-1.5 rounded-full bg-white flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-40" />}
                  <span className="truncate">{topic}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {!selectedTopic ? (
            <div className="card-soft flex min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="text-5xl">{activeSubject.icon}</div>
              <div>
                <p className="font-semibold">{activeSubject.subject}</p>
                <p className="mt-1 text-sm text-muted-foreground">Select a topic from the left to learn with formulas, worked examples and practice problems</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {activeSubject.topics.slice(0, 4).map((t) => (
                  <button key={t} onClick={() => selectTopic(t)} className={`rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ) : loading ? (
            <div className="card-soft flex min-h-[300px] flex-col items-center justify-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading {selectedTopic}…</p>
            </div>
          ) : mathData ? (
            <div className="space-y-4">
              {/* Header */}
              <div className={`rounded-2xl ${activeSubject.color} p-5 text-white`}>
                <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{mathData.subject}</p>
                <h3 className="mt-1 text-xl font-bold">{mathData.topic}</h3>
                <p className="mt-2 text-sm leading-relaxed opacity-90">{mathData.introduction}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <ProviderBadge provider={provider} />
                  <button onClick={() => { setSelectedTopic(null); setMathData(null); }} className="ml-auto rounded-lg bg-white/20 px-2.5 py-1 text-xs font-semibold hover:bg-white/30">
                    <RefreshCw className="mr-1 inline h-3 w-3" /> Change topic
                  </button>
                </div>
              </div>

              {/* Section tabs */}
              <div className="flex gap-2">
                {(["learn", "practice"] as const).map((s) => (
                  <button key={s} onClick={() => setSection(s)} className={`rounded-xl px-5 py-2 text-sm font-semibold capitalize transition-all ${section === s ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>
                    {s === "learn" ? "📚 Learn" : "✏️ Practice"}
                  </button>
                ))}
              </div>

              {section === "learn" ? (
                <div className="space-y-4">
                  {/* Key concepts */}
                  <div className="card-soft p-4 sm:p-5">
                    <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">🔑 Key Concepts</h4>
                    <div className="flex flex-wrap gap-2">
                      {mathData.key_concepts.map((c, i) => (
                        <span key={i} className={`rounded-full px-3 py-1 text-xs font-semibold ${activeSubject.light} ${activeSubject.text}`}>{c}</span>
                      ))}
                    </div>
                  </div>

                  {/* Formulas */}
                  {mathData.formulas.length > 0 && (
                    <div className="card-soft p-4 sm:p-5">
                      <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">📐 Formulas</h4>
                      <div className="space-y-3">
                        {mathData.formulas.map((f, i) => (
                          <div key={i} className="rounded-xl border border-border overflow-hidden">
                            <div className={`px-4 py-2.5 ${activeSubject.light}`}>
                              <p className={`text-xs font-bold ${activeSubject.text}`}>{f.name}</p>
                              <p className="mt-1 font-mono text-base font-bold text-foreground">{f.formula}</p>
                            </div>
                            <p className="px-4 py-2.5 text-xs text-muted-foreground bg-background">{f.description}</p>
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
                          <button
                            onClick={() => setExpandedExample(expandedExample === i ? null : i)}
                            className="flex w-full items-center justify-between px-4 py-3 text-left bg-muted/20 hover:bg-muted/40"
                          >
                            <div>
                              <p className="text-[10px] font-bold uppercase text-muted-foreground">Example {i + 1}</p>
                              <p className="text-sm font-medium mt-0.5">{ex.problem}</p>
                            </div>
                            {expandedExample === i ? <EyeOff className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : <Eye className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                          </button>
                          {expandedExample === i && (
                            <div className="bg-background px-4 py-3">
                              <p className="text-xs font-bold text-muted-foreground mb-2">Solution:</p>
                              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground font-sans">{ex.solution}</pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Real world */}
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <p className="text-xs font-bold text-primary mb-1">🌍 Real-World Application</p>
                    <p className="text-sm text-foreground/80">{mathData.real_world_application}</p>
                  </div>
                </div>
              ) : (
                <div className="card-soft p-4 sm:p-5 space-y-4">
                  <div>
                    <h4 className="font-bold">Practice Problems</h4>
                    <p className="text-sm text-muted-foreground mt-0.5">Try each problem before revealing the answer</p>
                  </div>
                  <div className="space-y-3">
                    {mathData.practice_problems.map((p, i) => <PracticeCard key={i} p={p} index={i} />)}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
