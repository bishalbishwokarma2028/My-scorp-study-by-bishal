import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ChevronDown, ChevronRight, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON } from "@/lib/aiProvider";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge, ProviderBadge } from "@/components/ai-ui";

export const Route = createFileRoute("/_authenticated/dashboard/grammar")({
  component: GrammarPage,
});

type GrammarData = {
  topic: string;
  definition: string;
  rules: string[];
  examples: { sentence: string; explanation: string }[];
  common_mistakes: { wrong: string; correct: string; explanation: string }[];
  exercise: {
    instruction: string;
    questions: { question: string; answer: string; hint?: string }[];
  };
};

const GRAMMAR_TOPICS = [
  {
    category: "Parts of Speech", icon: "🔤", color: "bg-blue-500",
    topics: ["Nouns", "Pronouns", "Verbs", "Adjectives", "Adverbs", "Prepositions", "Conjunctions", "Interjections", "Articles & Determiners"],
  },
  {
    category: "Tenses", icon: "⏰", color: "bg-violet-500",
    topics: ["Present Simple", "Present Continuous", "Present Perfect", "Present Perfect Continuous", "Past Simple", "Past Continuous", "Past Perfect", "Future Simple", "Future Continuous", "Future Perfect"],
  },
  {
    category: "Sentence Structure", icon: "🏗️", color: "bg-emerald-500",
    topics: ["Simple Sentences", "Compound Sentences", "Complex Sentences", "Independent Clauses", "Dependent Clauses", "Phrases", "Subject-Verb Agreement", "Parallel Structure"],
  },
  {
    category: "Punctuation", icon: "✍️", color: "bg-amber-500",
    topics: ["Period & Comma", "Semicolon & Colon", "Apostrophe", "Quotation Marks", "Hyphen & Dash", "Parentheses & Brackets", "Exclamation & Question Mark"],
  },
  {
    category: "Voice & Speech", icon: "🗣️", color: "bg-pink-500",
    topics: ["Active Voice", "Passive Voice", "Direct Speech", "Indirect (Reported) Speech", "Speech Verbs"],
  },
  {
    category: "Conditionals & Modals", icon: "❓", color: "bg-cyan-500",
    topics: ["Zero Conditional", "First Conditional", "Second Conditional", "Third Conditional", "Mixed Conditionals", "Modal Verbs (can, could, may, might, must, should, would)"],
  },
  {
    category: "Common Errors", icon: "⚠️", color: "bg-red-500",
    topics: ["Run-on Sentences", "Comma Splices", "Dangling Modifiers", "Misplaced Modifiers", "Double Negatives", "Commonly Confused Words (their/there/they're)", "Sentence Fragments"],
  },
  {
    category: "Writing Skills", icon: "📝", color: "bg-indigo-500",
    topics: ["Paragraph Structure", "Essay Introduction", "Thesis Statements", "Body Paragraphs", "Conclusion Writing", "Transition Words", "Paraphrasing", "Avoiding Plagiarism"],
  },
];

function buildGrammarPrompt(topic: string): string {
  return `Teach the English grammar topic: "${topic}"

Return STRICT JSON only — no prose, no markdown fences:
{
  "topic": "${topic}",
  "definition": "Clear, simple definition in 1-2 sentences suitable for students",
  "rules": ["Rule 1", "Rule 2", "Rule 3 (include 3-5 clear rules)"],
  "examples": [
    {"sentence": "Example sentence demonstrating the rule", "explanation": "Brief explanation of how the rule is applied"},
    {"sentence": "Second example", "explanation": "Explanation"},
    {"sentence": "Third example", "explanation": "Explanation"}
  ],
  "common_mistakes": [
    {"wrong": "Incorrect usage example", "correct": "Corrected version", "explanation": "Why this is wrong and how to fix it"},
    {"wrong": "Second mistake", "correct": "Corrected", "explanation": "Explanation"}
  ],
  "exercise": {
    "instruction": "Clear instruction for the exercise (e.g. 'Fill in the blank with the correct form', 'Correct the error in each sentence')",
    "questions": [
      {"question": "Exercise question or sentence", "answer": "Correct answer", "hint": "Optional short hint"},
      {"question": "Question 2", "answer": "Answer 2"},
      {"question": "Question 3", "answer": "Answer 3"},
      {"question": "Question 4", "answer": "Answer 4"},
      {"question": "Question 5", "answer": "Answer 5"}
    ]
  }
}`;
}

function ExerciseItem({ q, index }: { q: GrammarData["exercise"]["questions"][0]; index: number }) {
  const [userAnswer, setUserAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const correct = userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase();

  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-3">
      <div className="flex items-start gap-2">
        <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
        <p className="text-sm font-medium">{q.question}</p>
      </div>
      <input
        value={userAnswer}
        onChange={(e) => { setUserAnswer(e.target.value); setChecked(false); }}
        placeholder="Your answer…"
        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${checked ? (correct ? "border-emerald-400 bg-emerald-50" : "border-red-400 bg-red-50") : "border-input focus:border-primary"}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setChecked(true)} disabled={!userAnswer.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">
          Check
        </button>
        {q.hint && !checked && (
          <button onClick={() => setShowHint(!showHint)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            {showHint ? "Hide hint" : "💡 Hint"}
          </button>
        )}
        {checked && (
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${correct ? "text-emerald-700" : "text-red-700"}`}>
            {correct ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {correct ? "Correct!" : `Answer: ${q.answer}`}
          </div>
        )}
      </div>
      {showHint && q.hint && !checked && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">💡 {q.hint}</p>
      )}
    </div>
  );
}

function GrammarPage() {
  const { user } = Route.useRouteContext();
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set([GRAMMAR_TOPICS[0].category]));
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [grammarData, setGrammarData] = useState<GrammarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<"learn" | "exercise">("learn");
  const [provider, setProvider] = useState<string | null>(null);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "grammar");

  function toggleCategory(cat: string) {
    setOpenCategories((prev) => {
      const n = new Set(prev);
      n.has(cat) ? n.delete(cat) : n.add(cat);
      return n;
    });
  }

  async function selectTopic(topic: string) {
    if (topic === selectedTopic) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setSelectedTopic(topic);
    setGrammarData(null);
    setActiveSection("learn");
    setLoading(true);
    const res = await askAI(buildGrammarPrompt(topic), "Return ONLY valid JSON — no markdown, no prose.");
    setProvider(res.provider);
    await bump();
    const parsed = extractJSON<GrammarData>(res.text);
    if (parsed) {
      setGrammarData(parsed);
    } else {
      toast.error("Could not load topic — please try again");
      setSelectedTopic(null);
    }
    setLoading(false);
  }

  const categoryColor = GRAMMAR_TOPICS.find(g => g.topics.includes(selectedTopic ?? ""))?.color ?? "bg-primary";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Grammar</h2>
          <p className="text-sm text-muted-foreground">Complete English grammar reference with examples and practice</p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Sidebar */}
        <aside className="lg:w-64 flex-shrink-0">
          <div className="card-soft overflow-hidden">
            <div className="border-b border-border bg-muted/30 px-4 py-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Topics</p>
            </div>
            <nav className="max-h-[60vh] overflow-y-auto lg:max-h-[calc(100vh-14rem)]">
              {GRAMMAR_TOPICS.map(({ category, icon, color, topics }) => (
                <div key={category}>
                  <button
                    onClick={() => toggleCategory(category)}
                    className="flex w-full items-center gap-2 border-b border-border/50 px-4 py-2.5 text-left text-sm font-semibold hover:bg-accent"
                  >
                    <span className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-md ${color} text-xs text-white`}>{icon}</span>
                    <span className="flex-1 truncate">{category}</span>
                    {openCategories.has(category) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  {openCategories.has(category) && (
                    <div className="border-b border-border/50 bg-muted/20">
                      {topics.map((topic) => (
                        <button
                          key={topic}
                          onClick={() => selectTopic(topic)}
                          className={`flex w-full items-center gap-2 px-5 py-2 text-left text-xs transition-colors ${selectedTopic === topic ? `${color} text-white font-semibold` : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                        >
                          {selectedTopic === topic && <span className="h-1.5 w-1.5 rounded-full bg-white flex-shrink-0" />}
                          <span className="truncate">{topic}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {!selectedTopic ? (
            <div className="card-soft flex min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="text-5xl">📖</div>
              <div>
                <p className="font-semibold">Select a grammar topic</p>
                <p className="mt-1 text-sm text-muted-foreground">Choose from the sidebar to start learning with examples and exercises</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {["Present Simple", "Passive Voice", "First Conditional", "Nouns"].map((t) => (
                  <button key={t} onClick={() => selectTopic(t)} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent">
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
          ) : grammarData ? (
            <div className="space-y-4">
              {/* Topic header */}
              <div className={`rounded-2xl ${categoryColor} p-5 text-white`}>
                <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Grammar Topic</p>
                <h3 className="mt-1 text-xl font-bold">{grammarData.topic}</h3>
                <p className="mt-2 text-sm leading-relaxed opacity-90">{grammarData.definition}</p>
                <div className="mt-3 flex items-center gap-2">
                  <ProviderBadge provider={provider} />
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-2">
                {(["learn", "exercise"] as const).map((s) => (
                  <button key={s} onClick={() => setActiveSection(s)} className={`rounded-xl px-5 py-2 text-sm font-semibold capitalize transition-all ${activeSection === s ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>
                    {s === "learn" ? "📚 Learn" : "✏️ Practice"}
                  </button>
                ))}
              </div>

              {activeSection === "learn" ? (
                <div className="space-y-4">
                  {/* Rules */}
                  <div className="card-soft p-4 sm:p-5">
                    <h4 className="mb-3 font-bold text-sm uppercase tracking-wider text-muted-foreground">📌 Rules</h4>
                    <ul className="space-y-2">
                      {grammarData.rules.map((rule, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm">
                          <span className="mt-1 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">{i + 1}</span>
                          {rule}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Examples */}
                  <div className="card-soft p-4 sm:p-5">
                    <h4 className="mb-3 font-bold text-sm uppercase tracking-wider text-muted-foreground">✅ Examples</h4>
                    <div className="space-y-3">
                      {grammarData.examples.map((ex, i) => (
                        <div key={i} className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                          <p className="font-medium text-emerald-900 text-sm">"{ex.sentence}"</p>
                          <p className="mt-1 text-xs text-emerald-700">{ex.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Common mistakes */}
                  <div className="card-soft p-4 sm:p-5">
                    <h4 className="mb-3 font-bold text-sm uppercase tracking-wider text-muted-foreground">⚠️ Common Mistakes</h4>
                    <div className="space-y-3">
                      {grammarData.common_mistakes.map((m, i) => (
                        <div key={i} className="rounded-xl border border-border overflow-hidden">
                          <div className="flex items-start gap-3 bg-red-50 px-4 py-2.5">
                            <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                            <p className="text-sm line-through text-red-700">"{m.wrong}"</p>
                          </div>
                          <div className="flex items-start gap-3 bg-emerald-50 px-4 py-2.5">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                            <p className="text-sm font-medium text-emerald-800">"{m.correct}"</p>
                          </div>
                          <p className="px-4 py-2 text-xs text-muted-foreground bg-background">{m.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card-soft p-4 sm:p-5 space-y-4">
                  <div>
                    <h4 className="font-bold">Practice Exercise</h4>
                    <p className="mt-0.5 text-sm text-muted-foreground">{grammarData.exercise.instruction}</p>
                  </div>
                  <div className="space-y-3">
                    {grammarData.exercise.questions.map((q, i) => <ExerciseItem key={i} q={q} index={i} />)}
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
