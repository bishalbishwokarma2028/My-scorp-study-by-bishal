import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  Loader2, BookOpen, MessageCircle, PenLine, Star, ListChecks,
  ChevronRight, RotateCcw, Send, Check, X, ChevronDown,
  Globe, Sparkles, Volume2, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { askAI } from "@/lib/aiProvider";
import { ProviderBadge, QuotaBadge } from "@/components/ai-ui";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const Route = createFileRoute("/_authenticated/dashboard/language-learning")({
  component: LanguageLearningPage,
});

const LANGUAGES = [
  { id: "ielts",      name: "IELTS English",       flag: "🇬🇧", category: "Test Prep",    description: "Academic & General Training" },
  { id: "pte",        name: "PTE Academic",         flag: "🇦🇺", category: "Test Prep",    description: "Pearson Test of English" },
  { id: "japanese",   name: "Japanese",             flag: "🇯🇵", category: "Asian",        description: "Hiragana, Kanji, Grammar" },
  { id: "korean",     name: "Korean",               flag: "🇰🇷", category: "Asian",        description: "Hangul, K-drama vocabulary" },
  { id: "chinese",    name: "Chinese (Mandarin)",   flag: "🇨🇳", category: "Asian",        description: "Pinyin, Tones, Characters" },
  { id: "french",     name: "French",               flag: "🇫🇷", category: "European",     description: "Grammar, Vocabulary, Culture" },
  { id: "spanish",    name: "Spanish",              flag: "🇪🇸", category: "European",     description: "Latin America & Spain" },
  { id: "german",     name: "German",               flag: "🇩🇪", category: "European",     description: "Cases, Grammar, Business" },
  { id: "arabic",     name: "Arabic",               flag: "🇸🇦", category: "Middle East",  description: "Modern Standard Arabic" },
  { id: "hindi",      name: "Hindi",                flag: "🇮🇳", category: "South Asian",  description: "Devanagari & Bollywood" },
  { id: "italian",    name: "Italian",              flag: "🇮🇹", category: "European",     description: "Grammar, Culture, Travel" },
  { id: "portuguese", name: "Portuguese",           flag: "🇧🇷", category: "European",     description: "Brazilian & European" },
];

const LEVELS = ["Beginner", "Intermediate", "Advanced", "Expert"] as const;
type Level = typeof LEVELS[number];

const TABS = [
  { id: "learn",        label: "Lessons",       icon: BookOpen,      color: "blue"   },
  { id: "conversation", label: "Conversation",  icon: MessageCircle, color: "violet" },
  { id: "writing",      label: "Writing Coach", icon: PenLine,       color: "green"  },
  { id: "vocabulary",   label: "Vocabulary",    icon: Star,          color: "amber"  },
  { id: "quiz",         label: "Quiz & Drills", icon: ListChecks,    color: "red"    },
] as const;
type TabId = typeof TABS[number]["id"];

const LESSON_TOPICS: Record<string, string[]> = {
  ielts:      ["Task 1 – Academic Writing", "Task 2 – Essay Writing", "Reading Strategies", "Listening Skills", "Speaking Part 1, 2, 3", "Vocabulary for Band 7+", "Grammar for High Scores", "Cohesion & Coherence", "Paraphrasing Techniques"],
  pte:        ["Write Essay", "Summarize Written Text", "Read Aloud", "Repeat Sentence", "Describe Image", "Retell Lecture", "Answer Short Question", "Highlight Correct Summary", "Select Missing Word"],
  japanese:   ["Hiragana & Katakana", "Basic Greetings (あいさつ)", "Numbers & Counting", "N5 Grammar Patterns", "N4 Grammar Patterns", "Kanji Radicals", "Particles (は, が, を, に)", "Te-form & Verb Conjugation", "Keigo (Polite Speech)"],
  korean:     ["Hangul Basics", "Basic Greetings (인사)", "Numbers (Sino & Native)", "Topic/Subject Markers", "Verb Endings & Tenses", "Honorifics (존댓말)", "Particles Deep Dive", "K-drama Vocabulary", "TOPIK Preparation"],
  chinese:    ["Pinyin & Tones", "Basic Greetings (问候)", "Numbers & Measure Words", "Basic Sentence Structure", "HSK 1–2 Vocabulary", "HSK 3–4 Grammar", "Chengyu (成语)", "Business Chinese", "Traditional vs Simplified"],
  french:     ["French Alphabet & Pronunciation", "Basic Greetings", "Articles & Gender", "Present Tense Verbs", "Past Tenses (Passé Composé)", "Subjunctive Mood", "French Prepositions", "Formal Writing (DELF)", "Business French"],
  spanish:    ["Alphabet & Pronunciation", "Basic Greetings", "Ser vs Estar", "Preterite & Imperfect", "Subjunctive Mood", "DELE Exam Prep", "Latin American Slang", "Business Spanish", "Spanish Literature"],
  german:     ["German Cases (Nominative, Accusative…)", "Articles (der, die, das)", "Verb Conjugation", "Modal Verbs", "Separable Verbs", "Adjective Declension", "Relative Clauses", "B2 Grammar", "Business German"],
  arabic:     ["Arabic Alphabet", "Short Vowels (Harakat)", "Basic Phrases", "Roots & Patterns", "Verb Conjugation", "Dual & Plural Forms", "Formal vs Colloquial", "Numbers", "MSA Writing"],
  hindi:      ["Devanagari Script", "Basic Greetings (नमस्ते)", "Gender in Hindi", "Verb Conjugation", "Postpositions", "Honorifics (आप/तुम/तू)", "Numbers", "Daily Conversation", "Bollywood Hindi"],
  italian:    ["Alphabet & Pronunciation", "Articles & Nouns", "Present Tense", "Past Tense (Passato Prossimo)", "Subjunctive", "Italian Culture & Customs", "Food & Travel Vocabulary", "Business Italian", "CILS Exam Prep"],
  portuguese: ["Alphabet & Pronunciation", "Ser vs Estar vs Ficar", "Present Tense", "Preterite & Imperfect", "Future & Conditional", "Subjunctive", "Brazilian Slang (Gírias)", "Business Portuguese", "CELPE-Bras Prep"],
};

const QUIZ_TYPES = [
  { id: "translation",   label: "Translation",       description: "Translate phrases from/to the target language" },
  { id: "fill",          label: "Fill in the Blank",  description: "Complete sentences with the correct word" },
  { id: "mcq",           label: "Multiple Choice",    description: "Pick the correct answer from 4 options" },
  { id: "grammar",       label: "Grammar Correction", description: "Find and fix grammar mistakes" },
  { id: "listening",     label: "Listening Cues",     description: "Read the cue and write what you'd say" },
] as const;

const TAB_ACTIVE: Record<string, string> = {
  blue:   "bg-blue-600   text-white border-blue-600",
  violet: "bg-violet-600 text-white border-violet-600",
  green:  "bg-emerald-600 text-white border-emerald-600",
  amber:  "bg-amber-500   text-white border-amber-500",
  red:    "bg-rose-600   text-white border-rose-600",
};
const TAB_IDLE: Record<string, string> = {
  blue:   "border-border text-muted-foreground hover:bg-blue-50   hover:text-blue-700",
  violet: "border-border text-muted-foreground hover:bg-violet-50 hover:text-violet-700",
  green:  "border-border text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700",
  amber:  "border-border text-muted-foreground hover:bg-amber-50  hover:text-amber-700",
  red:    "border-border text-muted-foreground hover:bg-rose-50   hover:text-rose-700",
};

function mdClass() {
  return `prose prose-sm max-w-none
    [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:text-slate-100 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap
    [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5
    [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_p]:break-words [&_li]:break-words
    [&_table]:text-xs [&_table]:w-full [&_table]:block [&_table]:overflow-x-auto`;
}

// ─── Language picker ───────────────────────────────────────────────────────────
function LangPicker({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const lang = LANGUAGES.find(l => l.id === selected)!;
  const [open, setOpen] = useState(false);
  const categories = [...new Set(LANGUAGES.map(l => l.category))];

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-accent transition-colors">
        <span className="text-lg">{lang.flag}</span>
        <div className="text-left">
          <div className="font-semibold text-sm leading-tight">{lang.name}</div>
          <div className="text-[10px] text-muted-foreground">{lang.description}</div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground ml-1" />
      </button>
      {open && (
        <div className="absolute z-50 mt-2 w-80 rounded-xl border border-border bg-background shadow-xl overflow-hidden">
          <div className="p-2 max-h-96 overflow-y-auto">
            {categories.map(cat => (
              <div key={cat}>
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{cat}</div>
                {LANGUAGES.filter(l => l.category === cat).map(l => (
                  <button key={l.id} onClick={() => { onSelect(l.id); setOpen(false); }}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-left transition-colors ${selected === l.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                    <span className="text-lg flex-shrink-0">{l.flag}</span>
                    <div>
                      <div className="font-medium leading-tight">{l.name}</div>
                      <div className={`text-[10px] ${selected === l.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{l.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Lessons Tab ──────────────────────────────────────────────────────────────
function LessonsTab({ langId, langName, quota, bump }: { langId: string; langName: string; quota: ReturnType<typeof useUsageLimit>["quota"]; bump: () => Promise<void> }) {
  const topics = LESSON_TOPICS[langId] ?? [];
  const [selectedTopic, setSelectedTopic] = useState(topics[0] ?? "");
  const [customTopic, setCustomTopic] = useState("");
  const [level, setLevel] = useState<Level>("Beginner");
  const [result, setResult] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const topic = customTopic.trim() || selectedTopic;

  async function generate() {
    if (!topic) return toast.error("Choose or type a topic");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true); setResult(null);

    const isTestPrep = ["ielts", "pte"].includes(langId);
    const prompt = isTestPrep
      ? `Create a comprehensive ${langName} lesson for the topic: "${topic}" at ${level} level.

Structure the lesson as follows:
## 📘 Overview
Brief introduction to the topic and why it matters for the ${langName} exam.

## 🎯 Key Concepts
Explain the core concepts, rules, and requirements in detail. Include official band/scoring criteria if relevant.

## ✍️ Examples
Provide 2–3 fully worked examples with detailed annotations. For writing tasks, include a sample response scored Band 7+.

## ⚠️ Common Mistakes
List the 5 most common errors students make and how to avoid them.

## 📝 Practice Exercises
Give 3 practice tasks with model answers. Include tips for each.

## 💡 Examiner Tips
Secret tips and strategies that high-scoring candidates use.

## 🔑 Key Vocabulary
A table of 10 high-value academic words/phrases with definitions and example usage.`
      : `Create a comprehensive ${langName} lesson for the topic: "${topic}" at ${level} level.

Structure the lesson as follows:
## 📘 Introduction
What this topic covers and why it's important in ${langName}.

## 📖 Core Lesson
Full explanation of the grammar rule / vocabulary set / concept. Include tables, charts, or verb paradigms where relevant.

## 🗣️ Pronunciation Guide
How to pronounce key words. Include romanization (Romaji / Pinyin / Romanized Korean) and phonetics where applicable.

## ✅ Examples
At least 8 example sentences in ${langName} with:
- The ${langName} text
- Romanization (if applicable)  
- English translation

## ⚠️ Common Mistakes
Top 5 mistakes learners at ${level} level make with this topic.

## 🧠 Memory Tips
Mnemonic devices, patterns, or tricks to remember this concept.

## 📝 Practice Exercises
5 exercises with answers covering this topic.

## 🌍 Cultural Context
Relevant cultural notes about when/how native speakers use this.`;

    const res = await askAI(prompt, `You are an expert ${langName} language teacher with 20+ years of experience. You create structured, detailed, engaging lessons. For ${["ielts","pte"].includes(langId) ? "test prep" : langId} content, always include the native script, romanization where applicable, and authentic cultural context. Use markdown tables, bullet points, and code blocks generously. Be thorough — the student needs depth.`);
    setResult(res.text); setProvider(res.provider);
    await bump(); setLoading(false);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[300px,1fr]">
      <div className="space-y-4">
        <div className="card-soft p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Level</label>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {LEVELS.map(l => (
                <button key={l} onClick={() => setLevel(l)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${level === l ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Choose a Topic</label>
            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
              {topics.map(t => (
                <button key={t} onClick={() => { setSelectedTopic(t); setCustomTopic(""); }}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs text-left transition-colors ${selectedTopic === t && !customTopic ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                  <span>{t}</span>
                  <ChevronRight className="h-3 w-3 opacity-60" />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Or type your own topic</label>
            <input value={customTopic} onChange={e => setCustomTopic(e.target.value)}
              placeholder="e.g. Shopping vocabulary..."
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <button onClick={generate} disabled={loading || !topic}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : <><BookOpen className="h-4 w-4" />Generate Lesson</>}
          </button>
        </div>
      </div>

      <div className="card-soft p-5 min-h-[500px]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">{result ? topic : "Lesson Output"}</span>
            {result && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{level}</span>}
          </div>
          <ProviderBadge provider={provider} />
        </div>
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Creating your lesson…</p>
            <p className="text-xs text-muted-foreground">Building a comprehensive, structured lesson</p>
          </div>
        )}
        {!loading && !result && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-muted-foreground">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted"><BookOpen className="h-8 w-8 opacity-40" /></div>
            <p className="text-sm font-medium">Choose a topic and generate a lesson</p>
            <p className="text-xs">Deep, structured lessons with examples, exercises & cultural notes</p>
          </div>
        )}
        {!loading && result && (
          <div className={mdClass()}><ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown></div>
        )}
      </div>
    </div>
  );
}

// ─── Conversation Tab ─────────────────────────────────────────────────────────
type ConvMsg = { role: "user" | "assistant"; content: string; provider?: string; correction?: string };

function ConversationTab({ langId, langName, quota, bump }: { langId: string; langName: string; quota: ReturnType<typeof useUsageLimit>["quota"]; bump: () => Promise<void> }) {
  const [level, setLevel] = useState<Level>("Beginner");
  const [scenario, setScenario] = useState("Free Conversation");
  const [messages, setMessages] = useState<ConvMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const SCENARIOS = ["Free Conversation", "At a Restaurant", "Shopping", "Making Friends", "Job Interview", "Travel & Directions", "Expressing Opinions", "Phone Call", "Formal Meeting"];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const isTestPrep = ["ielts", "pte"].includes(langId);

  async function send() {
    if (!input.trim()) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    const userText = input.trim();
    setInput("");
    const newMsgs: ConvMsg[] = [...messages, { role: "user", content: userText }];
    setMessages(newMsgs);
    setLoading(true);

    const systemPrompt = isTestPrep
      ? `You are an IELTS/PTE speaking examiner and coach. 
When the user speaks:
1. Respond naturally as an examiner would
2. After your response, add a "**📝 Feedback:**" section that:
   - Points out grammatical errors in their message
   - Suggests better vocabulary/phrases (mark with ✨)
   - Gives a quick band-score estimate for that sentence
   - Provides a corrected version
Keep the conversation flowing naturally at ${level} level. Scenario: ${scenario}.`
      : `You are a friendly ${langName} conversation partner and teacher.
You MUST:
1. Respond in ${langName} (primary) with English translation in parentheses
2. After your response, add a "**📝 Correction:**" section that:
   - Shows their original message
   - Corrected version in ${langName} (if needed, otherwise say ✅ Perfect!)
   - Explains any mistakes clearly
3. Keep it natural and encouraging. Level: ${level}. Scenario: ${scenario}.
4. For Japanese: show Kanji + Hiragana reading + Romaji + English
5. For Chinese: show Characters + Pinyin + English
6. For Korean: show Hangul + Romanization + English
7. For Arabic: show Arabic + transliteration + English`;

    const history = newMsgs.slice(0, -1).map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
    const res = await askAI(userText, systemPrompt, history);
    setMessages([...newMsgs, { role: "assistant", content: res.text, provider: res.provider }]);
    await bump(); setLoading(false);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[240px,1fr]">
      <div className="space-y-4">
        <div className="card-soft p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Level</label>
            <div className="mt-2 space-y-1">
              {LEVELS.map(l => (
                <button key={l} onClick={() => setLevel(l)}
                  className={`w-full rounded-lg border px-3 py-1.5 text-xs font-medium text-left transition-colors ${level === l ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scenario</label>
            <div className="mt-2 space-y-1">
              {SCENARIOS.map(sc => (
                <button key={sc} onClick={() => setScenario(sc)}
                  className={`w-full rounded-lg border px-3 py-1.5 text-xs text-left transition-colors ${scenario === sc ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>
                  {sc}
                </button>
              ))}
            </div>
          </div>
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-xs text-muted-foreground hover:bg-accent">
              <RotateCcw className="h-3 w-3" /> New Conversation
            </button>
          )}
        </div>
      </div>

      <div className="card-soft flex flex-col min-h-[520px]">
        <div className="border-b border-border px-4 py-3 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-semibold">{isTestPrep ? "IELTS/PTE Speaking Practice" : `${langName} Conversation`}</span>
          <span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">{scenario}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted"><MessageCircle className="h-7 w-7 opacity-40" /></div>
              <p className="text-sm font-medium">Start a conversation!</p>
              <p className="text-xs">Type anything — I'll respond in {langName} and correct your mistakes.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`rounded-xl px-4 py-3 max-w-[85%] text-sm ${m.role === "user" ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted rounded-tl-none"}`}>
                {m.role === "assistant"
                  ? <div className={mdClass()}><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div>
                  : <p className="whitespace-pre-wrap">{m.content}</p>
                }
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-xl rounded-tl-none bg-muted px-4 py-3">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Responding…
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
              placeholder={isTestPrep ? "Speak your answer…" : `Type in ${langName} or English…`}
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            <button onClick={send} disabled={loading || !input.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Writing Coach Tab ────────────────────────────────────────────────────────
function WritingTab({ langId, langName, quota, bump }: { langId: string; langName: string; quota: ReturnType<typeof useUsageLimit>["quota"]; bump: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [prompt, setPromptText] = useState("");
  const [level, setLevel] = useState<Level>("Intermediate");
  const [result, setResult] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isTestPrep = ["ielts", "pte"].includes(langId);

  const IELTS_PROMPTS = [
    "Some people think that all university students should study whatever they like. Others believe that they should only be allowed to study subjects that will be useful in the future. Discuss both views and give your own opinion. (Task 2)",
    "The graph below shows the number of visitors to four London museums between 2000 and 2020. Summarize the information by selecting and reporting the main features. (Task 1)",
    "In many countries, the working week is getting longer. Some think this is a good idea, others believe it is harmful. What is your opinion? (Task 2)",
  ];
  const GEN_PROMPTS: Record<string, string[]> = {
    japanese:   ["Write about your daily routine in Japanese", "Describe your hometown", "Write a postcard to a friend"],
    korean:     ["Describe what you did last weekend", "Write about your favorite food", "Describe a memorable trip"],
    chinese:    ["介绍你的家庭 (Introduce your family)", "描述你的爱好 (Describe your hobbies)", "你最喜欢的季节 (Your favorite season)"],
    french:     ["Décrivez votre ville natale", "Parlez de vos loisirs", "Décrivez une personne que vous admirez"],
    spanish:    ["Describe tu ciudad natal", "Habla sobre tu familia", "¿Cuáles son tus planes para el futuro?"],
    german:     ["Beschreiben Sie Ihre Heimatstadt", "Was machen Sie in Ihrer Freizeit?", "Schreiben Sie über Ihre Familie"],
    arabic:     ["اكتب عن يومك المعتاد", "صف مدينتك", "اكتب عن هوايتك المفضلة"],
    hindi:      ["अपने परिवार के बारे में लिखें", "अपने शहर का वर्णन करें", "अपनी पसंदीदा फिल्म के बारे में लिखें"],
    italian:    ["Descrivi la tua città natale", "Parla dei tuoi hobby", "Descrivi una persona importante nella tua vita"],
    portuguese: ["Descreva sua cidade natal", "Fale sobre seus hobbies", "Descreva um dia típico na sua vida"],
  };
  const prompts = isTestPrep ? IELTS_PROMPTS : (GEN_PROMPTS[langId] ?? []);

  async function evaluate() {
    if (!text.trim()) return toast.error("Write something first!");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true); setResult(null);

    const aiPrompt = isTestPrep
      ? `You are an official ${langId.toUpperCase()} examiner. Evaluate this writing submission:

TASK/PROMPT: ${prompt || "General writing task"}

STUDENT'S WRITING:
${text}

Provide a detailed evaluation:

## 🎯 Overall Band Score: X.X / 9.0
(Give an honest estimated band score)

## 📊 Category Scores
| Criterion | Band | Comments |
|-----------|------|----------|
| Task Achievement / Response | X.X | ... |
| Coherence & Cohesion | X.X | ... |
| Lexical Resource | X.X | ... |
| Grammatical Range & Accuracy | X.X | ... |

## ✅ Strengths
What the student did well (be specific, quote their text)

## ❌ Areas for Improvement
Specific weaknesses with quotes from their text

## 🔴 Grammar & Vocabulary Errors
List every error with: ❌ Original → ✅ Corrected version + explanation

## ✍️ Rewritten Model Answer (Band 8+)
Provide a complete rewritten version of their text at Band 8+ level.

## 💡 Top 5 Tips to Improve This Piece`
      : `You are an expert ${langName} language teacher. Evaluate this student writing:

STUDENT'S LEVEL: ${level}
TASK/PROMPT: ${prompt || "Free writing"}

STUDENT'S WRITING:
${text}

Provide a comprehensive evaluation:

## ⭐ Overall Assessment
Grade (A–F), general quality comment, and encouragement.

## ✅ What's Great
Specific things done correctly (quote their text)

## 🔴 Errors Found
Every mistake listed as:
- ❌ **Original:** [their text]
- ✅ **Corrected:** [correction]  
- 📖 **Why:** [clear explanation of the rule]

## 🌟 Vocabulary Upgrade
5 phrases they used + more natural/advanced alternatives

## ✍️ Corrected Full Version
The complete text rewritten correctly in ${langName}
(With English translation below)

## 📈 Next Steps
3 specific things to practice to improve`;

    const res = await askAI(aiPrompt, `You are an expert ${langName} language evaluator. Be thorough, specific, and educational. Always quote the student's text when pointing out errors. Be encouraging but honest about the score.`);
    setResult(res.text); setProvider(res.provider);
    await bump(); setLoading(false);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="card-soft p-4 space-y-3">
          {!isTestPrep && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Level</label>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {LEVELS.map(l => (
                  <button key={l} onClick={() => setLevel(l)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${level === l ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Task / Prompt <span className="normal-case text-[10px] font-normal text-muted-foreground">(optional)</span></label>
            {prompts.length > 0 && (
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {prompts.map(p => (
                  <button key={p} onClick={() => setPromptText(p)}
                    className={`w-full rounded-lg border px-3 py-2 text-[11px] text-left transition-colors ${prompt === p ? "bg-primary/10 border-primary text-primary" : "border-border hover:bg-accent"}`}>
                    {p.length > 80 ? p.slice(0, 80) + "…" : p}
                  </button>
                ))}
              </div>
            )}
            <textarea value={prompt} onChange={e => setPromptText(e.target.value)}
              placeholder={isTestPrep ? "Paste the exam question here (optional)" : "What should the student write about? (optional)"}
              rows={2}
              className="mt-2 w-full rounded-lg border border-input bg-background p-3 text-sm resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Writing</label>
            <textarea value={text} onChange={e => setText(e.target.value)}
              placeholder={isTestPrep ? "Write your response here (aim for 250+ words for Task 2)…" : `Write in ${langName} here…`}
              rows={10} spellCheck={false}
              className="mt-1.5 w-full rounded-lg border border-input bg-background p-3 text-sm font-mono resize-none" />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">{text.trim().split(/\s+/).filter(Boolean).length} words</span>
              {isTestPrep && <span className={`text-[10px] ${text.trim().split(/\s+/).filter(Boolean).length >= 250 ? "text-emerald-600" : "text-amber-600"}`}>{text.trim().split(/\s+/).filter(Boolean).length >= 250 ? "✅ Good length" : "⚠️ Aim for 250+ words"}</span>}
            </div>
          </div>
          <button onClick={evaluate} disabled={loading || !text.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Evaluating…</> : <><PenLine className="h-4 w-4" />Get AI Feedback</>}
          </button>
        </div>
      </div>

      <div className="card-soft p-5 min-h-[500px]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-semibold">Writing Evaluation</span>
          </div>
          <ProviderBadge provider={provider} />
        </div>
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            <p className="text-sm font-medium">Evaluating your writing…</p>
            <p className="text-xs text-muted-foreground">{isTestPrep ? "Scoring against official IELTS criteria…" : "Finding errors and improvements…"}</p>
          </div>
        )}
        {!loading && !result && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-muted-foreground">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted"><PenLine className="h-8 w-8 opacity-40" /></div>
            <p className="text-sm font-medium">Write something to get feedback</p>
            <p className="text-xs">{isTestPrep ? "Get an official band score with detailed breakdown" : "Get corrections, vocabulary upgrades & a model answer"}</p>
          </div>
        )}
        {!loading && result && (
          <div className={mdClass()}><ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown></div>
        )}
      </div>
    </div>
  );
}

// ─── Vocabulary Tab ───────────────────────────────────────────────────────────
type VocabWord = { word: string; reading?: string; romanization?: string; pos: string; definition: string; example: string; example_en: string; mnemonic?: string };

function VocabularyTab({ langId, langName, quota, bump }: { langId: string; langName: string; quota: ReturnType<typeof useUsageLimit>["quota"]; bump: () => Promise<void> }) {
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<Level>("Beginner");
  const [count, setCount] = useState(15);
  const [words, setWords] = useState<VocabWord[]>([]);
  const [loading, setLoading] = useState(false);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [provider, setProvider] = useState<string | null>(null);

  const VOCAB_TOPICS: Record<string, string[]> = {
    ielts: ["Academic Vocabulary", "Environment & Climate", "Technology & Innovation", "Health & Medicine", "Education & Learning", "Society & Culture", "Economics & Business", "Politics & Governance"],
    pte:   ["Academic Vocabulary", "Science & Research", "Urban Development", "Globalization", "Media & Communication", "Biodiversity", "Renewable Energy", "Demographic Changes"],
  };
  const suggestions = VOCAB_TOPICS[langId] ?? ["Food & Dining", "Travel", "Daily Routines", "Family & Relationships", "Work & Career", "Nature & Animals", "Sports & Hobbies", "Emotions & Feelings", "Shopping", "Technology"];

  async function generate() {
    if (!topic.trim()) return toast.error("Enter a topic first");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true); setWords([]); setFlipped(new Set());

    const needsScript = ["japanese","korean","chinese","arabic","hindi"].includes(langId);
    const prompt = `Generate exactly ${count} ${langName} vocabulary words for the topic: "${topic}" at ${level} level.

Return ONLY a JSON array with NO markdown fences or extra text:
[{
  "word": "${langId === "ielts" || langId === "pte" ? "English word/phrase" : "word in " + langName}",
  ${needsScript ? `"reading": "phonetic reading or native script breakdown",` : ""}
  "romanization": "${needsScript ? "romanized pronunciation (Romaji/Pinyin/RR/transliteration)" : ""}",
  "pos": "noun/verb/adjective/etc",
  "definition": "clear definition in English",
  "example": "example sentence in ${langName}${needsScript ? " (with romanization)" : ""}",
  "example_en": "English translation of the example",
  "mnemonic": "a memorable trick or association to remember this word"
}]`;

    const res = await askAI(prompt, `You are a ${langName} vocabulary expert. Return ONLY valid JSON. For ${needsScript ? "scripts like Japanese/Korean/Chinese/Arabic/Hindi, include both native script AND romanization" : langName}, always provide authentic, natural examples.`);
    try {
      const jsonMatch = res.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) setWords(JSON.parse(jsonMatch[0]));
      else toast.error("Couldn't parse vocabulary — try again");
    } catch { toast.error("Failed to generate vocabulary — try again"); }
    setProvider(res.provider);
    await bump(); setLoading(false);
  }

  function toggleFlip(i: number) {
    setFlipped(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  return (
    <div className="space-y-5">
      <div className="card-soft p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Topic</label>
            <input value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Food, Travel, Business..."
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Level</label>
            <select value={level} onChange={e => setLevel(e.target.value as Level)}
              className="mt-1.5 rounded-lg border border-input bg-background px-3 py-2 text-sm">
              {LEVELS.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Count</label>
            <select value={count} onChange={e => setCount(Number(e.target.value))}
              className="mt-1.5 rounded-lg border border-input bg-background px-3 py-2 text-sm">
              {[10, 15, 20, 25].map(n => <option key={n}>{n}</option>)}
            </select>
          </div>
          <button onClick={generate} disabled={loading || !topic.trim()}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : <><Star className="h-4 w-4" />Generate</>}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map(s => (
            <button key={s} onClick={() => setTopic(s)}
              className="rounded-full border border-border px-3 py-0.5 text-xs hover:bg-accent transition-colors">
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <p className="text-sm font-medium">Generating {count} vocabulary words…</p>
        </div>
      )}

      {!loading && words.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">{words.length} words — click a card to reveal</span>
            <div className="flex items-center gap-2">
              <ProviderBadge provider={provider} />
              <button onClick={() => setFlipped(new Set(words.map((_, i) => i)))} className="text-xs text-muted-foreground hover:text-foreground">Reveal All</button>
              <button onClick={() => setFlipped(new Set())} className="text-xs text-muted-foreground hover:text-foreground">Hide All</button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {words.map((w, i) => {
              const isFlipped = flipped.has(i);
              return (
                <div key={i} onClick={() => toggleFlip(i)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${isFlipped ? "bg-amber-50 border-amber-200" : "bg-background border-border hover:border-amber-300 hover:bg-amber-50/40"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-base text-foreground">{w.word}</div>
                      {w.reading && <div className="text-xs text-muted-foreground mt-0.5">{w.reading}</div>}
                      {w.romanization && <div className="text-xs text-primary font-medium">{w.romanization}</div>}
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{w.pos}</span>
                  </div>
                  {isFlipped && (
                    <div className="mt-3 space-y-2 border-t border-amber-200 pt-3">
                      <p className="text-sm text-foreground">{w.definition}</p>
                      <div className="rounded-lg bg-white/70 px-3 py-2">
                        <p className="text-xs font-medium text-foreground italic">"{w.example}"</p>
                        <p className="text-xs text-muted-foreground mt-0.5">— {w.example_en}</p>
                      </div>
                      {w.mnemonic && (
                        <div className="flex items-start gap-1.5">
                          <Sparkles className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                          <p className="text-xs text-amber-700">{w.mnemonic}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && words.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted"><Star className="h-8 w-8 opacity-40" /></div>
          <p className="text-sm font-medium">Generate vocabulary flashcards</p>
          <p className="text-xs">Click cards to reveal definitions, examples & memory tricks</p>
        </div>
      )}
    </div>
  );
}

// ─── Quiz Tab ──────────────────────────────────────────────────────────────────
type Question = { question: string; options?: string[]; answer: string; explanation: string };

function QuizTab({ langId, langName, quota, bump }: { langId: string; langName: string; quota: ReturnType<typeof useUsageLimit>["quota"]; bump: () => Promise<void> }) {
  const [quizType, setQuizType] = useState<string>("translation");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<Level>("Beginner");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);

  async function generate() {
    if (!topic.trim()) return toast.error("Enter a topic first");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true); setQuestions([]); setAnswers({}); setSubmitted(false);

    const typeObj = QUIZ_TYPES.find(q => q.id === quizType)!;
    const prompt = `Create 8 ${typeObj.label} quiz questions about "${topic}" in ${langName} at ${level} level.

Return ONLY a JSON array (no markdown, no fences):
[{
  "question": "The full question text (in ${langName} where appropriate)",
  "options": ["A. option1", "B. option2", "C. option3", "D. option4"],  // ONLY for multiple choice, omit for others
  "answer": "The correct answer",
  "explanation": "Why this is correct, with grammar/vocabulary notes"
}]

Quiz type: ${typeObj.description}
Rules:
- For translation: ask to translate between ${langName} and English
- For fill-in-blank: use ___ for the blank
- For MCQ: always provide exactly 4 options labeled A–D
- For grammar: provide a sentence with an error to find and fix
- For listening cues: describe a situation and ask what to say
- Increase difficulty progressively
- All answers must be 100% correct`;

    const res = await askAI(prompt, `You are a ${langName} quiz generator. Return ONLY valid JSON array. All questions must be pedagogically sound and linguistically accurate.`);
    try {
      const match = res.text.match(/\[[\s\S]*\]/);
      if (match) setQuestions(JSON.parse(match[0]));
      else toast.error("Couldn't parse questions — try again");
    } catch { toast.error("Failed to generate quiz — try again"); }
    setProvider(res.provider);
    await bump(); setLoading(false);
  }

  function submit() {
    if (Object.keys(answers).length < questions.length) {
      toast.error("Answer all questions before submitting");
      return;
    }
    setSubmitted(true);
    const correct = questions.filter((q, i) => answers[i]?.trim().toLowerCase() === q.answer.trim().toLowerCase()).length;
    toast.success(`You got ${correct}/${questions.length} correct! ${correct === questions.length ? "🎉 Perfect!" : correct >= questions.length * 0.7 ? "Great job!" : "Keep practicing!"}`);
  }

  const score = submitted ? questions.filter((q, i) => answers[i]?.trim().toLowerCase() === q.answer.trim().toLowerCase()).length : 0;

  return (
    <div className="space-y-5">
      <div className="card-soft p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Topic</label>
            <input value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Verb conjugation, Shopping vocabulary..."
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Level</label>
            <select value={level} onChange={e => setLevel(e.target.value as Level)}
              className="mt-1.5 rounded-lg border border-input bg-background px-3 py-2 text-sm">
              {LEVELS.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Quiz Type</label>
          <div className="flex flex-wrap gap-2">
            {QUIZ_TYPES.map(qt => (
              <button key={qt.id} onClick={() => setQuizType(qt.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${quizType === qt.id ? "bg-rose-600 text-white border-rose-600" : "border-border hover:bg-accent"}`}>
                {qt.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{QUIZ_TYPES.find(q => q.id === quizType)?.description}</p>
        </div>
        <button onClick={generate} disabled={loading || !topic.trim()}
          className="flex items-center gap-2 rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : <><ListChecks className="h-4 w-4" />Generate Quiz</>}
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
          <p className="text-sm font-medium">Generating quiz questions…</p>
        </div>
      )}

      {!loading && questions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{questions.length} Questions</span>
            <div className="flex items-center gap-3">
              <ProviderBadge provider={provider} />
              {submitted && (
                <span className={`text-sm font-bold ${score === questions.length ? "text-emerald-600" : score >= questions.length * 0.7 ? "text-amber-600" : "text-rose-600"}`}>
                  Score: {score}/{questions.length}
                </span>
              )}
            </div>
          </div>
          {questions.map((q, i) => {
            const userAns = answers[i] ?? "";
            const isCorrect = submitted && userAns.trim().toLowerCase() === q.answer.trim().toLowerCase();
            const isWrong = submitted && !isCorrect;
            const isMCQ = Array.isArray(q.options) && q.options.length > 0;

            return (
              <div key={i} className={`card-soft p-4 space-y-3 border-l-4 ${submitted ? (isCorrect ? "border-emerald-400" : "border-rose-400") : "border-primary/30"}`}>
                <div className="flex items-start gap-2">
                  <span className="shrink-0 grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                  <p className="text-sm font-medium">{q.question}</p>
                </div>
                {isMCQ ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {q.options!.map(opt => {
                      const optVal = opt.replace(/^[A-D]\.\s*/, "").trim();
                      const isSelected = userAns === optVal;
                      const isCorrectOpt = submitted && q.answer.trim() === opt.trim();
                      return (
                        <button key={opt} onClick={() => !submitted && setAnswers(a => ({ ...a, [i]: optVal }))}
                          disabled={submitted}
                          className={`rounded-lg border px-3 py-2 text-xs text-left transition-colors
                            ${isCorrectOpt ? "bg-emerald-100 border-emerald-400 text-emerald-800 font-medium" :
                              isSelected && isWrong ? "bg-rose-100 border-rose-400 text-rose-800" :
                              isSelected ? "bg-primary/10 border-primary text-primary" :
                              "border-border hover:bg-accent"}`}>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input value={userAns} onChange={e => !submitted && setAnswers(a => ({ ...a, [i]: e.target.value }))}
                    disabled={submitted}
                    placeholder="Type your answer…"
                    className={`w-full rounded-lg border px-3 py-2 text-sm ${submitted ? (isCorrect ? "border-emerald-400 bg-emerald-50" : "border-rose-400 bg-rose-50") : "border-input bg-background"}`} />
                )}
                {submitted && (
                  <div className={`rounded-lg p-3 text-xs space-y-1 ${isCorrect ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                    <div className="flex items-center gap-1.5 font-semibold">
                      {isCorrect ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                      {isCorrect ? "Correct!" : `Correct answer: ${q.answer}`}
                    </div>
                    <p className="text-foreground/80">{q.explanation}</p>
                  </div>
                )}
              </div>
            );
          })}
          {!submitted ? (
            <button onClick={submit}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 py-3 text-sm font-semibold text-white">
              <ArrowRight className="h-4 w-4" /> Submit Quiz
            </button>
          ) : (
            <button onClick={() => { setQuestions([]); setAnswers({}); setSubmitted(false); }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-3 text-sm text-muted-foreground hover:bg-accent">
              <RotateCcw className="h-4 w-4" /> New Quiz
            </button>
          )}
        </div>
      )}

      {!loading && questions.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted"><ListChecks className="h-8 w-8 opacity-40" /></div>
          <p className="text-sm font-medium">Ready to practice?</p>
          <p className="text-xs">Choose a quiz type and generate interactive exercises</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
function LanguageLearningPage() {
  const { quota, bump } = useUsageLimit("language-learning");
  const [langId, setLangId] = useState("ielts");
  const [activeTab, setActiveTab] = useState<TabId>("learn");

  const lang = LANGUAGES.find(l => l.id === langId)!;

  function handleLangChange(id: string) {
    setLangId(id);
    setActiveTab("learn");
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Language Learning
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">IELTS, PTE, Japanese, Korean, Chinese & more — AI-powered</p>
        </div>
        <div className="flex items-center gap-3">
          <QuotaBadge quota={quota} />
          <LangPicker selected={langId} onSelect={handleLangChange} />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(({ id, label, icon: Icon, color }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${active ? TAB_ACTIVE[color] : TAB_IDLE[color]}`}>
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "learn"        && <LessonsTab      langId={langId} langName={lang.name} quota={quota} bump={bump} />}
      {activeTab === "conversation" && <ConversationTab langId={langId} langName={lang.name} quota={quota} bump={bump} />}
      {activeTab === "writing"      && <WritingTab      langId={langId} langName={lang.name} quota={quota} bump={bump} />}
      {activeTab === "vocabulary"   && <VocabularyTab   langId={langId} langName={lang.name} quota={quota} bump={bump} />}
      {activeTab === "quiz"         && <QuizTab         langId={langId} langName={lang.name} quota={quota} bump={bump} />}
    </div>
  );
}
