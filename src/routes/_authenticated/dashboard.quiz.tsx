import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Check, X as XIcon, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON } from "@/lib/aiProvider";
import { supabase } from "@/integrations/supabase/client";
import { ProviderBadge } from "@/components/ai-ui";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge } from "@/components/ai-ui";

export const Route = createFileRoute("/_authenticated/dashboard/quiz")({
  component: QuizPage,
});

type Difficulty = "Easy" | "Medium" | "Hard" | "Mixed";
type QType =
  | "MCQ"
  | "True/False"
  | "Fill in the Blank"
  | "Mixed"
  | "Very Short Answer"
  | "Short Answer"
  | "Long Answer"
  | "Very Long Answer";

type Q = { question: string; options?: string[]; answer: string; explanation: string };

const OPEN_ENDED_TYPES: QType[] = ["Very Short Answer", "Short Answer", "Long Answer", "Very Long Answer"];

function isOpenEnded(type: QType) {
  return OPEN_ENDED_TYPES.includes(type);
}

function buildPrompt(topic: string, difficulty: string, type: QType, count: number): string {
  if (type === "Very Short Answer") {
    return `Create ${count} ${difficulty.toLowerCase()} very short answer questions about: "${topic}".
Each answer must be 1–5 words only (a key term, date, name, or figure).
Return STRICT JSON array: [{"question":"...","answer":"1-5 word answer","explanation":"1-2 sentences"}].
No prose outside JSON.`;
  }
  if (type === "Short Answer") {
    return `Create ${count} ${difficulty.toLowerCase()} short answer questions about: "${topic}".
Each answer must be 1–3 sentences.
Return STRICT JSON array: [{"question":"...","answer":"1-3 sentence answer","explanation":"1-2 sentences"}].
No prose outside JSON.`;
  }
  if (type === "Long Answer") {
    return `Create ${count} ${difficulty.toLowerCase()} long answer questions about: "${topic}".
Each answer must be a well-structured paragraph (5–8 sentences) covering key concepts clearly.
Return STRICT JSON array: [{"question":"...","answer":"detailed paragraph answer","explanation":"2-3 sentences"}].
No prose outside JSON.`;
  }
  if (type === "Very Long Answer") {
    return `Create ${count} ${difficulty.toLowerCase()} essay/very long answer questions about: "${topic}".
Each answer must be comprehensive and detailed (10+ sentences), covering all aspects of the topic with examples and key points.
Return STRICT JSON array: [{"question":"...","answer":"comprehensive essay-style answer","explanation":"2-3 sentences"}].
No prose outside JSON.`;
  }
  if (type === "MCQ") {
    return `Create exactly ${count} ${difficulty.toLowerCase()} multiple-choice questions about: "${topic}".
STRICT RULES:
- Each question must have EXACTLY 4 answer options.
- The "answer" field must be the exact text of the correct option (copy it word-for-word from options).
- Options must be full answer phrases, NOT letters like "A", "B", "C", "D".
Return STRICT JSON array only — no prose, no markdown:
[{"question":"question text","options":["option 1","option 2","option 3","option 4"],"answer":"exact correct option text","explanation":"1-2 sentences"}]`;
  }
  if (type === "True/False") {
    return `Create exactly ${count} ${difficulty.toLowerCase()} True/False questions about: "${topic}".
STRICT RULES:
- Each question must be a declarative statement (NOT a question ending in "?").
- The statement is either factually True or factually False.
- The "options" array must be EXACTLY ["True", "False"] — nothing else.
- The "answer" must be exactly "True" or "False".
Return STRICT JSON array only — no prose, no markdown:
[{"question":"declarative statement","options":["True","False"],"answer":"True","explanation":"1-2 sentences explaining why"}]`;
  }
  if (type === "Fill in the Blank") {
    return `Create exactly ${count} ${difficulty.toLowerCase()} fill-in-the-blank questions about: "${topic}".
STRICT RULES:
- Each question is a sentence with one blank shown as "___".
- Do NOT include an "options" field — leave it out entirely.
- The "answer" is the exact word or short phrase that fills the blank.
Return STRICT JSON array only — no prose, no markdown:
[{"question":"sentence with ___ blank","answer":"word or phrase","explanation":"1-2 sentences"}]`;
  }
  if (type === "Mixed") {
    return `Create exactly ${count} ${difficulty.toLowerCase()} questions about: "${topic}".
Mix question types: some MCQ (4 options), some True/False (options: ["True","False"]), some fill-in-the-blank (no options field).
STRICT RULES:
- MCQ: "options" has exactly 4 items; "answer" is the exact correct option text.
- True/False: "options" is exactly ["True","False"]; "answer" is "True" or "False"; question is a statement not a "?" question.
- Fill in the Blank: no "options" field; question has "___"; "answer" fills the blank.
Return STRICT JSON array only — no prose, no markdown:
[{"question":"...","options":["opt1","opt2",...] or omit,"answer":"correct answer","explanation":"1-2 sentences"}]`;
  }
  return `Create exactly ${count} ${difficulty.toLowerCase()} questions about: "${topic}".
Return STRICT JSON array only: [{"question":"...","options":["opt1","opt2","opt3","opt4"],"answer":"correct option text","explanation":"1-2 sentences"}]`;
}

function QuizPage() {
  const { user } = Route.useRouteContext();
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [type, setType] = useState<QType>("MCQ");
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [showAnswers, setShowAnswers] = useState<boolean[]>([]);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "quiz");

  useEffect(() => {
    const seed = sessionStorage.getItem("scorp_quiz_topic");
    if (seed) {
      setTopic(seed);
      sessionStorage.removeItem("scorp_quiz_topic");
    }
  }, []);

  async function generate() {
    if (!topic.trim()) return toast.error("Enter a topic");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true); setQuestions(null); setDone(false); setCurrent(0); setAnswers([]); setShowAnswers([]);
    const prompt = buildPrompt(topic, difficulty, type, count);
    const res = await askAI(prompt, "Output only valid JSON arrays. No code fences.");
    setProvider(res.provider);
    await bump();
    const parsed = extractJSON<Q[]>(res.text);
    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
      toast.error("Couldn't parse questions, try again");
    } else {
      setQuestions(parsed);
      setAnswers(Array(parsed.length).fill(""));
      setShowAnswers(Array(parsed.length).fill(false));
    }
    setLoading(false);
  }

  function answer(val: string) {
    const next = [...answers]; next[current] = val; setAnswers(next);
  }

  function nextQ() {
    if (!questions) return;
    if (current < questions.length - 1) setCurrent(current + 1);
    else finish();
  }

  function toggleShowAnswer(i: number) {
    const next = [...showAnswers]; next[i] = !next[i]; setShowAnswers(next);
  }

  async function finish() {
    setDone(true);
    if (!questions) return;
    const open = isOpenEnded(type);
    const score = open ? 0 : answers.filter((a, i) => normalize(a) === normalize(questions[i].answer)).length;
    const pct = open ? 0 : (score / questions.length) * 100;
    await supabase.from("quiz_results").insert({
      user_id: user.id, topic, score, total: questions.length, percentage: pct, difficulty,
      questions: questions.map((q, i) => ({ ...q, userAnswer: answers[i] })) as never,
    });
  }

  function normalize(s: string) { return s?.trim().toLowerCase(); }

  if (done && questions) {
    const open = isOpenEnded(type);
    const score = open ? null : answers.filter((a, i) => normalize(a) === normalize(questions[i].answer)).length;
    const pct = score !== null ? Math.round((score / questions.length) * 100) : null;
    return (
      <div className="space-y-6">
        <div className="card-soft p-5 text-center sm:p-8">
          {pct !== null ? (
            <>
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-primary text-3xl font-bold text-primary-foreground">{pct}%</div>
              <h2 className="mt-4 text-2xl font-bold">{pct >= 60 ? "Passed!" : "Keep practicing"}</h2>
              <p className="text-muted-foreground">You scored {score} out of {questions.length}</p>
            </>
          ) : (
            <>
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-primary text-3xl">📝</div>
              <h2 className="mt-4 text-2xl font-bold">Practice Complete!</h2>
              <p className="text-muted-foreground">Review the model answers below</p>
            </>
          )}
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => { setQuestions(null); }} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"><RefreshCw className="mr-1 inline h-3 w-3" /> New quiz</button>
            {pct !== null && (
              <button onClick={() => { navigator.clipboard.writeText(`I scored ${pct}% on a ${topic} quiz with ScorpStudy by Bishal!`); toast.success("Copied to clipboard"); }} className="rounded-lg border border-border px-4 py-2 text-sm">Share score</button>
            )}
          </div>
        </div>
        <div className="card-soft p-5">
          <h3 className="mb-3 font-semibold">Review</h3>
          {questions.map((q, i) => {
            const correct = !open && normalize(answers[i]) === normalize(q.answer);
            return (
              <div key={i} className="border-t border-border py-4 first:border-t-0">
                <div className="flex items-start gap-2">
                  {!open && (correct ? <Check className="h-4 w-4 mt-0.5 flex-shrink-0 text-success" /> : <XIcon className="h-4 w-4 mt-0.5 flex-shrink-0 text-destructive" />)}
                  {open && <span className="h-5 w-5 mt-0.5 flex-shrink-0 text-xs font-bold text-muted-foreground">{i + 1}.</span>}
                  <div className="flex-1 space-y-1">
                    <p className="font-medium text-sm">{q.question}</p>
                    {open ? (
                      <>
                        {answers[i] && <p className="text-xs text-muted-foreground">Your answer: {answers[i]}</p>}
                        <button onClick={() => toggleShowAnswer(i)} className="text-xs text-primary underline">
                          {showAnswers[i] ? "Hide model answer" : "Show model answer"}
                        </button>
                        {showAnswers[i] && (
                          <div className="mt-1 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">{q.answer}</div>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-xs">Your answer: <span className={correct ? "text-success" : "text-destructive"}>{answers[i] || "(skipped)"}</span></p>
                        {!correct && <p className="text-xs">Correct: <span className="text-success">{q.answer}</span></p>}
                      </>
                    )}
                    <p className="text-xs text-muted-foreground">{q.explanation}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (questions) {
    const q = questions[current];
    const open = isOpenEnded(type);
    return (
      <div className="card-soft mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
        <div>
          <div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>Question {current + 1} of {questions.length}</span><ProviderBadge provider={provider} /></div>
          <div className="h-1.5 overflow-hidden rounded bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${((current + 1) / questions.length) * 100}%` }} /></div>
        </div>
        {open && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
            <span>📝</span> {type}
          </div>
        )}
        <h3 className="text-lg font-semibold">{q.question}</h3>
        {q.options ? (
          <div className="space-y-2">
            {q.options.map((opt) => (
              <button key={opt} onClick={() => answer(opt)} className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${answers[current] === opt ? "border-primary bg-accent" : "border-border hover:bg-accent"}`}>
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <textarea
            value={answers[current] || ""}
            onChange={(e) => answer(e.target.value)}
            placeholder={open ? (type === "Very Short Answer" ? "1–5 words…" : type === "Short Answer" ? "1–3 sentences…" : "Write your answer…") : "Your answer…"}
            rows={open && (type === "Long Answer" || type === "Very Long Answer") ? 6 : 3}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
          />
        )}
        <button onClick={nextQ} disabled={!answers[current]} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{current < questions.length - 1 ? "Next" : "Finish"}</button>
      </div>
    );
  }

  const TYPE_GROUPS = [
    { label: "Multiple Choice", types: ["MCQ", "True/False", "Fill in the Blank", "Mixed"] as QType[] },
    { label: "Written Answer", types: ["Very Short Answer", "Short Answer", "Long Answer", "Very Long Answer"] as QType[] },
  ];

  return (
    <div className="card-soft mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Generate a quiz</h2>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>
      <div>
        <label className="text-sm font-medium">Topic or notes</label>
        <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={4} placeholder="e.g. 'Cell biology — mitosis and meiosis'" className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Questions</label>
          <select value={count} onChange={(e) => setCount(+e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2 text-sm">
            {[5, 10, 15, 20].map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Difficulty</label>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2 text-sm">
            {["Easy", "Medium", "Hard", "Mixed"].map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Question Type</label>
        <div className="mt-2 space-y-2">
          {TYPE_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{group.label}</p>
              <div className="flex flex-wrap gap-2">
                {group.types.map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${type === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {isOpenEnded(type) && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800">
          📝 <strong>{type}</strong> — AI will generate questions with detailed written answers. You'll write your response and compare with the model answer at the end.
        </div>
      )}
      <button onClick={generate} disabled={loading} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {loading ? <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Bishal's Assistant is thinking…</> : "Generate Quiz"}
      </button>
    </div>
  );
}
