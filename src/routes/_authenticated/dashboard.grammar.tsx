import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { usePageState } from "@/lib/pageState";
import { Loader2, ChevronDown, ChevronRight, CheckCircle2, XCircle, Send, MessageCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON } from "@/lib/aiProvider";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge, ProviderBadge } from "@/components/ai-ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askMdComponents } from "@/lib/askMdComponents";
import logo from "@/assets/scorpstudy-logo.png";

export const Route = createFileRoute("/_authenticated/dashboard/grammar")({
  component: GrammarPage,
});

type GrammarData = {
  topic: string;
  definition: string;
  when_to_use: string;
  structure: string | null;
  rules: { rule: string; explanation: string }[];
  examples: { sentence: string; explanation: string; incorrect?: string }[];
  common_mistakes: { wrong: string; correct: string; explanation: string }[];
  advanced_notes: string[];
  exercise: { instruction: string; questions: { question: string; answer: string; hint?: string }[] };
};

type AskMessage = { role: "user" | "assistant"; content: string };

const GRAMMAR_TOPICS = [
  {
    category: "Parts of Speech", icon: "🔤", color: "bg-blue-500", light: "bg-blue-50", text: "text-blue-700", border: "border-blue-200",
    topics: [
      "Nouns — Types & Functions", "Pronouns — Personal, Relative, Reflexive", "Verbs — Action, Linking, Helping",
      "Adjectives — Order & Comparatives", "Adverbs — Types & Position", "Prepositions — Time, Place, Direction",
      "Conjunctions — Coordinating, Subordinating, Correlative", "Interjections", "Articles — Definite, Indefinite & Zero",
      "Determiners — Quantifiers & Demonstratives",
    ],
  },
  {
    category: "Verb Tenses", icon: "⏰", color: "bg-violet-500", light: "bg-violet-50", text: "text-violet-700", border: "border-violet-200",
    topics: [
      "Present Simple — Facts & Habits", "Present Continuous — Actions in Progress", "Present Perfect — Experience & Recent Past",
      "Present Perfect Continuous — Duration to Now", "Past Simple — Completed Actions", "Past Continuous — Background Actions",
      "Past Perfect — Before Another Past Event", "Past Perfect Continuous — Duration Before Past Event",
      "Future Simple (will) — Predictions & Decisions", "Future with 'going to' — Plans & Evidence",
      "Future Continuous — Actions in Progress in Future", "Future Perfect — Completion Before a Future Time",
    ],
  },
  {
    category: "Sentence Structure", icon: "🏗️", color: "bg-emerald-500", light: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200",
    topics: [
      "Simple Sentences — Subject & Predicate", "Compound Sentences — Joining Independent Clauses",
      "Complex Sentences — Main & Subordinate Clauses", "Compound-Complex Sentences",
      "Noun Clauses", "Adjective (Relative) Clauses — Defining & Non-defining",
      "Adverbial Clauses — Time, Reason, Condition", "Phrases vs Clauses",
      "Subject-Verb Agreement — All Rules", "Parallel Structure",
    ],
  },
  {
    category: "Conditionals", icon: "❓", color: "bg-cyan-500", light: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200",
    topics: [
      "Zero Conditional — General Truths", "First Conditional — Real & Possible Situations",
      "Second Conditional — Unreal Present & Future", "Third Conditional — Unreal Past",
      "Mixed Conditionals", "Unless, In case, Provided that", "Wish & If only Sentences",
    ],
  },
  {
    category: "Voice & Reported Speech", icon: "🗣️", color: "bg-pink-500", light: "bg-pink-50", text: "text-pink-700", border: "border-pink-200",
    topics: [
      "Active Voice", "Passive Voice — Present, Past & Perfect", "Passive Voice — Future & Modal",
      "When to Use Passive Voice", "Direct Speech", "Indirect (Reported) Speech — Statements",
      "Indirect Speech — Questions", "Indirect Speech — Commands & Requests",
      "Reporting Verbs (say, tell, ask, warn, suggest, etc.)",
    ],
  },
  {
    category: "Modal Verbs", icon: "🎭", color: "bg-amber-500", light: "bg-amber-50", text: "text-amber-700", border: "border-amber-200",
    topics: [
      "Can & Could — Ability & Permission", "May & Might — Possibility & Permission",
      "Must & Have to — Obligation & Necessity", "Should & Ought to — Advice & Expectation",
      "Would — Hypothetical & Habitual Past", "Shall — Offers & Suggestions (formal)",
      "Need — Necessity (modal & lexical)", "Dare", "Modals for Deduction (must/can't/might be)",
      "Modals for Past Events (should have, might have, could have)",
    ],
  },
  {
    category: "Punctuation", icon: "✍️", color: "bg-red-500", light: "bg-red-50", text: "text-red-700", border: "border-red-200",
    topics: [
      "Period & Full Stop", "Comma — 8 Key Rules", "Semicolon — Joining & Lists",
      "Colon — Introducing & Emphasis", "Apostrophe — Possession & Contraction",
      "Quotation Marks — Direct Speech & Titles", "Hyphen & Compound Words",
      "Em Dash & En Dash", "Parentheses & Brackets", "Ellipsis", "Exclamation & Question Mark",
    ],
  },
  {
    category: "Common Errors", icon: "⚠️", color: "bg-orange-500", light: "bg-orange-50", text: "text-orange-700", border: "border-orange-200",
    topics: [
      "Their / There / They're", "Your / You're", "Its / It's", "Affect vs Effect",
      "Then vs Than", "Fewer vs Less", "Lie vs Lay", "Who vs Whom",
      "Further vs Farther", "Comprise vs Compose", "Imply vs Infer",
      "Dangling Modifiers", "Misplaced Modifiers", "Run-on Sentences", "Comma Splices",
      "Double Negatives", "Sentence Fragments",
    ],
  },
  {
    category: "Writing Skills", icon: "📝", color: "bg-indigo-500", light: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200",
    topics: [
      "Paragraph Structure — Topic, Support, Conclusion", "Essay Introduction Writing",
      "Thesis Statements — Strong vs Weak", "Body Paragraphs — PEEL Method",
      "Conclusion Writing", "Transition Words & Phrases", "Cohesion & Coherence",
      "Paraphrasing Techniques", "Summarising Skills", "Formal vs Informal Register",
      "Academic Writing Style", "Hedging Language", "Avoiding Plagiarism",
    ],
  },
];

function buildGrammarPrompt(topic: string): string {
  return `You are an expert English teacher. Teach the grammar topic: "${topic}" in comprehensive detail.

Return STRICT JSON only — no prose, no markdown fences, no text outside the JSON:
{
  "topic": "${topic}",
  "definition": "Clear, complete definition in 2-3 sentences explaining what this grammar element is",
  "when_to_use": "Explain specifically when and why to use this grammar element (2-3 sentences with context)",
  "structure": "The grammatical structure/pattern (e.g. 'Subject + had + past participle') or null if not applicable",
  "rules": [
    {"rule": "Rule name or description (short)", "explanation": "Full explanation of this rule with detail on exceptions and nuances (2-3 sentences)"},
    {"rule": "Rule 2", "explanation": "Explanation 2"},
    {"rule": "Rule 3", "explanation": "..."},
    {"rule": "Rule 4", "explanation": "..."},
    {"rule": "Rule 5", "explanation": "..."}
  ],
  "examples": [
    {"sentence": "Clear example sentence demonstrating the rule", "explanation": "Why this is correct and what rule it demonstrates (2 sentences)", "incorrect": "The wrong version of this sentence (optional)"},
    {"sentence": "Example 2 (different context or rule)", "explanation": "Explanation 2", "incorrect": "Wrong version"},
    {"sentence": "Example 3 (advanced or complex use)", "explanation": "Explanation 3"},
    {"sentence": "Example 4", "explanation": "Explanation 4"},
    {"sentence": "Example 5 (real-world context)", "explanation": "Explanation 5"}
  ],
  "common_mistakes": [
    {"wrong": "Incorrect version", "correct": "Corrected version", "explanation": "Why students make this mistake and how to remember the rule (2-3 sentences)"},
    {"wrong": "Mistake 2", "correct": "Correct 2", "explanation": "Explanation 2"},
    {"wrong": "Mistake 3", "correct": "Correct 3", "explanation": "Explanation 3"}
  ],
  "advanced_notes": [
    "Advanced note 1: a nuance, exception, or advanced usage that most textbooks don't cover (2 sentences)",
    "Advanced note 2: regional variation, formal/informal differences, or stylistic usage (2 sentences)",
    "Advanced note 3: connection to other grammar topics or historical context if relevant"
  ],
  "exercise": {
    "instruction": "Clear exercise instruction (e.g. 'Correct the error in each sentence' or 'Fill in the blank with the correct form')",
    "questions": [
      {"question": "Exercise question or sentence", "answer": "Correct answer", "hint": "Short helpful hint"},
      {"question": "Question 2", "answer": "Answer 2", "hint": "Hint 2"},
      {"question": "Question 3", "answer": "Answer 3"},
      {"question": "Question 4", "answer": "Answer 4"},
      {"question": "Question 5", "answer": "Answer 5"},
      {"question": "Question 6 (harder)", "answer": "Answer 6", "hint": "Hint 6"}
    ]
  }
}`;
}

function ExerciseItem({ q, index }: { q: GrammarData["exercise"]["questions"][0]; index: number }) {
  const [userAnswer, setUserAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const correct = checked && userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase();
  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-3">
      <div className="flex items-start gap-2.5">
        <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
        <p className="text-sm font-medium leading-relaxed">{q.question}</p>
      </div>
      <input
        value={userAnswer}
        onChange={(e) => { setUserAnswer(e.target.value); setChecked(false); }}
        onKeyDown={(e) => e.key === "Enter" && userAnswer.trim() && setChecked(true)}
        placeholder="Your answer…"
        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none transition-colors ${checked ? (correct ? "border-emerald-400 bg-emerald-50" : "border-red-400 bg-red-50") : "border-input focus:border-primary"}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setChecked(true)} disabled={!userAnswer.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40">
          Check Answer
        </button>
        {q.hint && !checked && (
          <button onClick={() => setShowHint(!showHint)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">
            {showHint ? "Hide hint" : "💡 Hint"}
          </button>
        )}
        {checked && (
          <div className={`flex items-center gap-1.5 text-xs font-bold ${correct ? "text-emerald-700" : "text-red-600"}`}>
            {correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {correct ? "Correct! Well done." : `Correct answer: "${q.answer}"`}
          </div>
        )}
      </div>
      {showHint && q.hint && !checked && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">💡 {q.hint}</p>
      )}
    </div>
  );
}

function AskPanel({ topic, category }: { topic: string; category: string }) {
  const { user } = Route.useRouteContext();
  const [as, setAs] = usePageState(`grammar-ask-${topic}`, {
    messages: [] as AskMessage[],
    input: "",
  });
  const { messages, input } = as;
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { quota, bump } = useUsageLimit(user.id, "grammar-ask");

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const SUGGESTIONS = [
    `Give me another example of ${topic}`,
    `When should I NOT use ${topic}?`,
    `How does ${topic} differ from similar grammar?`,
    `Give me a quiz question about ${topic}`,
  ];

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    const msgsWithUser: AskMessage[] = [...messages, { role: "user", content: text }];
    setAs({ messages: msgsWithUser, input: "" });
    setLoading(true);
    const system = `You are an expert English grammar teacher. The student is studying "${topic}" (${category}). Answer their grammar question clearly and helpfully. Give examples. Be educational but conversational.

FORMATTING RULES (strict):
- Use **bold** generously to highlight key grammar terms, rules, and example words/phrases — every important word or phrase should be bolded so the answer is easy to scan.
- Break your answer into short paragraphs or a numbered/bulleted list. Never write a big wall of unbroken text.
- Use *italics* for example sentences or words being discussed, to set them apart from the explanation.
- NEVER output raw HTML tags like <br>, <b>, <div> — use plain markdown (blank lines for new paragraphs, ** for bold) instead.`;
    const history = msgsWithUser.slice(-6).map(m => ({ role: m.role, content: m.content }));
    const res = await askAI(text, system, history);
    await bump();
    setAs({ messages: [...msgsWithUser, { role: "assistant", content: res.text }] });
    setLoading(false);
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
              <button key={sg} onClick={() => send(sg)} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent hover:text-foreground text-muted-foreground transition-colors">
                {sg}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="max-h-72 overflow-y-auto space-y-3 p-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              <div className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-[10px] font-bold overflow-hidden ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-white border border-primary/20"}`}>
                {m.role === "user" ? "You" : <img src={logo} alt="Assistant" className="h-full w-full object-contain p-0.5" />}
              </div>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted/50"}`}>
                {m.role === "user" ? <p>{m.content}</p> : (
                  <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-li:my-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={askMdComponents}>{m.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2">
              <div className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">AI</div>
              <div className="rounded-2xl rounded-tl-sm bg-muted/50 px-3 py-2.5">
                <div className="flex gap-1">
                  {[0,150,300].map(d => <span key={d} className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="border-t border-border p-3 flex gap-2">
        <input
          value={input}
          onChange={e => setAs({ input: e.target.value })}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder={`Ask about ${topic}…`}
          className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <button onClick={() => send()} disabled={loading || !input.trim()} className="rounded-xl bg-primary px-3 py-2 text-white disabled:opacity-40">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function GrammarPage() {
  const { user } = Route.useRouteContext();
  const [ps, set] = usePageState("grammar", {
    openCategories: [GRAMMAR_TOPICS[0].category] as string[],
    selectedTopic:   null as string | null,
    selectedCategory: "",
    grammarData:     null as GrammarData | null,
    activeSection:   "learn" as "learn" | "practice",
    provider:        null as string | null,
  });
  const { openCategories, selectedTopic, selectedCategory, grammarData, activeSection, provider } = ps;
  const [loading, setLoading] = useState(false);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "grammar");

  function toggleCategory(cat: string) {
    set({ openCategories: openCategories.includes(cat) ? openCategories.filter(c => c !== cat) : [...openCategories, cat] });
  }

  async function selectTopic(topic: string, category: string) {
    if (topic === selectedTopic) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    set({ selectedTopic: topic, selectedCategory: category, grammarData: null, activeSection: "learn" });
    setLoading(true);
    const res = await askAI(buildGrammarPrompt(topic), "Return ONLY valid JSON — no markdown, no prose.");
    set({ provider: res.provider });
    await bump();
    const parsed = extractJSON<GrammarData>(res.text);
    if (parsed) { set({ grammarData: parsed }); } else { toast.error("Could not load topic — please try again"); set({ selectedTopic: null }); }
    setLoading(false);
  }

  const cat = GRAMMAR_TOPICS.find(g => g.topics.some(t => t === selectedTopic));

  return (
    <div className="mx-auto max-w-5xl lg:max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">English Grammar</h2>
          <p className="text-sm text-muted-foreground">Complete grammar reference with rules, examples, exercises & AI chat</p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Sidebar */}
        <aside className="lg:w-72 flex-shrink-0">
          <div className="card-soft overflow-hidden">
            <div className="border-b border-border bg-muted/30 px-4 py-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Grammar Topics</p>
            </div>
            <nav className="max-h-[58vh] overflow-y-auto lg:max-h-[calc(100vh-12rem)]">
              {GRAMMAR_TOPICS.map(({ category, icon, color, topics }) => (
                <div key={category}>
                  <button onClick={() => toggleCategory(category)} className="flex w-full items-center gap-2 border-b border-border/50 px-4 py-2.5 text-left text-sm font-bold hover:bg-accent">
                    <span className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-md ${color} text-xs text-white`}>{icon}</span>
                    <span className="flex-1 truncate">{category}</span>
                    {openCategories.includes(category) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  {openCategories.includes(category) && (
                    <div className="border-b border-border/50 bg-muted/10">
                      {topics.map(topic => (
                        <button key={topic} onClick={() => selectTopic(topic, category)}
                          className={`flex w-full items-center gap-2 px-5 py-2 text-left text-xs transition-colors ${selectedTopic === topic ? `${color} text-white font-bold` : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
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

        {/* Main */}
        <div className="min-w-0 flex-1">
          {!selectedTopic ? (
            <div className="card-soft flex min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="text-5xl">📖</div>
              <div>
                <p className="font-bold text-base">Select a grammar topic</p>
                <p className="mt-1 text-sm text-muted-foreground">Rich explanations, examples, exercises & AI chat for every topic</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {["Present Perfect — Experience & Recent Past", "Passive Voice — Present, Past & Perfect", "First Conditional — Real & Possible Situations", "Their / There / They're"].map(t => (
                  <button key={t} onClick={() => selectTopic(t, GRAMMAR_TOPICS.find(g => g.topics.includes(t))?.category ?? "")}
                    className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent">
                    {t.split(" — ")[0]}
                  </button>
                ))}
              </div>
            </div>
          ) : loading ? (
            <div className="card-soft flex min-h-[300px] flex-col items-center justify-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading {selectedTopic.split(" — ")[0]}…</p>
            </div>
          ) : grammarData ? (
            <div className="space-y-4">
              {/* Header */}
              <div className={`rounded-2xl ${cat?.color ?? "bg-primary"} p-5 text-white`}>
                <p className="text-xs font-bold uppercase tracking-wider opacity-75">{selectedCategory}</p>
                <h3 className="mt-1 text-xl font-bold">{grammarData.topic}</h3>
                <p className="mt-2 text-sm leading-relaxed opacity-90">{grammarData.definition}</p>
                {grammarData.when_to_use && (
                  <p className="mt-2 text-xs leading-relaxed bg-white/15 rounded-xl px-3 py-2 opacity-90">{grammarData.when_to_use}</p>
                )}
                {grammarData.structure && (
                  <div className="mt-3 inline-block rounded-lg bg-white/20 px-3 py-1.5">
                    <span className="text-[10px] font-bold uppercase opacity-70">Structure: </span>
                    <span className="font-mono text-sm font-bold">{grammarData.structure}</span>
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <ProviderBadge provider={provider} />
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-2">
                {(["learn", "practice"] as const).map(s => (
                  <button key={s} onClick={() => set({ activeSection: s })}
                    className={`rounded-xl px-5 py-2 text-sm font-bold capitalize transition-all ${activeSection === s ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>
                    {s === "learn" ? "📚 Learn" : "✏️ Practice"}
                  </button>
                ))}
              </div>

              {activeSection === "learn" ? (
                <div className="space-y-4">
                  {/* Rules */}
                  <div className="card-soft p-4 sm:p-5">
                    <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">📌 Rules & Explanations</h4>
                    <div className="space-y-3">
                      {grammarData.rules.map((rule, i) => (
                        <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-background p-3.5">
                          <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                          <div>
                            <p className="text-sm font-bold">{rule.rule}</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{rule.explanation}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Examples */}
                  <div className="card-soft p-4 sm:p-5">
                    <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">✅ Examples</h4>
                    <div className="space-y-3">
                      {grammarData.examples.map((ex, i) => (
                        <div key={i} className="rounded-xl overflow-hidden border border-border">
                          {ex.incorrect && (
                            <div className="flex items-start gap-2 bg-red-50 px-4 py-2.5 border-b border-red-100">
                              <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-400" />
                              <p className="text-sm text-red-700 line-through">"{ex.incorrect}"</p>
                            </div>
                          )}
                          <div className="flex items-start gap-2 bg-emerald-50 px-4 py-2.5">
                            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5 text-emerald-500" />
                            <p className="text-sm font-semibold text-emerald-900">"{ex.sentence}"</p>
                          </div>
                          <div className="bg-background px-4 py-2.5">
                            <p className="text-xs leading-relaxed text-muted-foreground">{ex.explanation}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Common mistakes */}
                  <div className="card-soft p-4 sm:p-5">
                    <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">⚠️ Common Mistakes</h4>
                    <div className="space-y-3">
                      {grammarData.common_mistakes.map((m, i) => (
                        <div key={i} className="rounded-xl border border-border overflow-hidden">
                          <div className="flex items-start gap-2.5 bg-red-50 px-4 py-2.5"><XCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-500" /><p className="text-sm text-red-700 line-through">"{m.wrong}"</p></div>
                          <div className="flex items-start gap-2.5 bg-emerald-50 px-4 py-2.5"><CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5 text-emerald-500" /><p className="text-sm font-bold text-emerald-800">"{m.correct}"</p></div>
                          <p className="bg-background px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">{m.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Advanced notes */}
                  {grammarData.advanced_notes?.length > 0 && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 sm:p-5">
                      <h4 className="mb-3 text-sm font-bold text-indigo-700">🎓 Advanced Notes</h4>
                      <ul className="space-y-2">
                        {grammarData.advanced_notes.map((note, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-indigo-800 leading-relaxed">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400 flex-shrink-0" />{note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Ask AI */}
                  <AskPanel topic={grammarData.topic.split(" — ")[0]} category={selectedCategory} />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="card-soft p-4 sm:p-5 space-y-4">
                    <div>
                      <h4 className="font-bold">Practice Exercise</h4>
                      <p className="mt-0.5 text-sm text-muted-foreground">{grammarData.exercise.instruction}</p>
                    </div>
                    <div className="space-y-3">
                      {grammarData.exercise.questions.map((q, i) => <ExerciseItem key={i} q={q} index={i} />)}
                    </div>
                  </div>
                  <AskPanel topic={grammarData.topic.split(" — ")[0]} category={selectedCategory} />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
