import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2, Timer, CheckCircle2, XCircle, ChevronRight, ChevronLeft,
  RotateCcw, Trophy, BookOpen, FlaskConical, Brain,
  AlertCircle, Flag, Clock,
} from "lucide-react";
import { askAIJSON } from "@/lib/aiProvider";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge } from "@/components/ai-ui";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/mock-test")({
  component: MockTestPage,
});

type QType = "mcq" | "tf";
type Phase = "setup" | "loading" | "test" | "review";

interface Question {
  q:    string;
  type: QType;
  opts: string[];
  ans:  number;
  exp:  string;
}

const SUBJECTS = [
  "Physics", "Mathematics", "Chemistry", "Biology",
  "History", "Geography", "Economics", "Computer Science",
  "English", "Nepali", "Accounting", "Political Science",
  "Environmental Science", "Sociology", "Psychology", "Business Studies",
  "Civics", "Health Education", "English Literature", "Data Structures & Algorithms",
  "General Knowledge", "Statistics", "Agriculture Science", "Law",
];

const DIFFICULTIES = [
  { id: "easy",   label: "Easy",   color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  { id: "medium", label: "Medium", color: "text-amber-600 bg-amber-50 border-amber-200" },
  { id: "hard",   label: "Hard",   color: "text-red-600 bg-red-50 border-red-200" },
];

const Q_COUNTS  = [10, 20, 30, 40, 50];
const MIN_PER_QUESTION = 1.11;

function computeTimeSecs(qCount: number) {
  return Math.round(qCount * MIN_PER_QUESTION * 60);
}

function fmt(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function gradeInfo(pct: number) {
  if (pct >= 90) return { grade: "A+", color: "text-emerald-600", emoji: "🏆", msg: "Outstanding!" };
  if (pct >= 80) return { grade: "A",  color: "text-emerald-500", emoji: "🌟", msg: "Excellent!" };
  if (pct >= 70) return { grade: "B+", color: "text-blue-600",    emoji: "👏", msg: "Great job!" };
  if (pct >= 60) return { grade: "B",  color: "text-blue-500",    emoji: "👍", msg: "Good work!" };
  if (pct >= 50) return { grade: "C+", color: "text-amber-600",   emoji: "📚", msg: "Keep studying!" };
  if (pct >= 40) return { grade: "C",  color: "text-amber-500",   emoji: "💪", msg: "Keep going!" };
  return { grade: "F", color: "text-red-600", emoji: "📖", msg: "Needs more practice" };
}

function MockTestPage() {
  const { user } = Route.useRouteContext();
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "cerebras");

  const [phase,      setPhase]      = useState<Phase>("setup");
  const [subject,    setSubject]    = useState("Physics");
  const [topic,      setTopic]      = useState("");
  const [qCount,     setQCount]     = useState(10);
  const [difficulty, setDifficulty] = useState("medium");
  const [timeSecs,   setTimeSecs]   = useState(computeTimeSecs(10));

  useEffect(() => { setTimeSecs(computeTimeSecs(qCount)); }, [qCount]);

  const [questions, setQuestions]   = useState<Question[]>([]);
  const [current,   setCurrent]     = useState(0);
  const [answers,   setAnswers]     = useState<(number | null)[]>([]);
  const [flagged,   setFlagged]     = useState<boolean[]>([]);
  const [timeLeft,  setTimeLeft]    = useState(0);
  const [elapsed,   setElapsed]     = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef<number>(0);

  const startTimer = useCallback(() => {
    startedAt.current = Date.now();
    timerRef.current = setInterval(() => {
      const spent = Math.floor((Date.now() - startedAt.current) / 1000);
      setElapsed(spent);
      if (timeSecs > 0) {
        const left = timeSecs - spent;
        setTimeLeft(Math.max(0, left));
        if (left <= 0) submitTest();
      }
    }, 500);
  }, [timeSecs]);

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
  }

  useEffect(() => () => stopTimer(), []);

  async function generate() {
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setPhase("loading");

    const difficultyInstr = difficulty === "easy"
      ? "Require genuine conceptual understanding, not just simple one-line recall. Avoid trivially obvious questions — every question should make the student think."
      : difficulty === "medium"
      ? "Require applying concepts to new situations, multi-step reasoning, and connecting multiple ideas. Comparable to a challenging school/college exam."
      : "Require deep analysis, multi-step problem-solving, tricky edge cases, and careful reasoning to eliminate close distractors. Comparable to competitive exam or olympiad-level difficulty. Options should include plausible near-miss distractors, not obviously wrong choices.";

    const prompt = `Generate a ${difficulty} difficulty mock test on "${topic || subject}" for subject "${subject}".

Requirements:
- Exactly ${qCount} questions
- Mix of MCQ (4 options) and True/False questions (at least 70% MCQ, rest True/False)
- Questions should cover different sub-topics within "${topic || subject}" — spread across the full breadth of the topic
- Difficulty: ${difficulty} — ${difficultyInstr}
- IMPORTANT: Every question must be non-trivial and genuinely test understanding — this is a serious exam simulation, not a casual quiz
- Each question must have a clear, unambiguous correct answer
- Explanations must be 2-3 sentences explaining WHY the answer is correct and why other options are wrong

Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "questions": [
    {
      "q": "question text here",
      "type": "mcq",
      "opts": ["Option A", "Option B", "Option C", "Option D"],
      "ans": 0,
      "exp": "explanation of why this is correct"
    },
    {
      "q": "true/false question here",
      "type": "tf",
      "opts": ["True", "False"],
      "ans": 0,
      "exp": "explanation"
    }
  ]
}

The "ans" field is the 0-based index of the correct option.`;

    const { data } = await askAIJSON<{ questions: Question[] }>(prompt,
      "You are an expert exam paper setter. Return ONLY valid JSON. No markdown fences.", undefined, true);

    if (!data?.questions?.length) {
      toast.error("Failed to generate questions — please try again");
      setPhase("setup");
      return;
    }

    const qs = data.questions.slice(0, qCount);
    setQuestions(qs);
    setAnswers(new Array(qs.length).fill(null));
    setFlagged(new Array(qs.length).fill(false));
    setCurrent(0);
    setElapsed(0);
    setTimeLeft(timeSecs);
    await bump();
    setPhase("test");
    setTimeout(startTimer, 100);
  }

  function selectAnswer(idx: number) {
    setAnswers(prev => { const a = [...prev]; a[current] = idx; return a; });
  }

  function toggleFlag() {
    setFlagged(prev => { const f = [...prev]; f[current] = !f[current]; return f; });
  }

  async function submitTest() {
    stopTimer();
    const score = answers.filter((a, i) => a === questions[i].ans).length;
    const total  = questions.length;
    const pct    = Math.round((score / total) * 100);
    try {
      await supabase.from("quiz_results").insert({
        user_id:    user.id,
        topic:      `${subject}${topic ? ` — ${topic}` : ""} (Mock Test)`,
        score,
        total,
        percentage: pct,
      });
    } catch { /* non-critical */ }
    setPhase("review");
  }

  function reset() {
    stopTimer();
    setPhase("setup");
    setQuestions([]);
    setAnswers([]);
    setFlagged([]);
    setCurrent(0);
  }

  const answered  = answers.filter(a => a !== null).length;
  const score     = questions.length ? answers.filter((a, i) => a === questions[i]?.ans).length : 0;
  const pct       = questions.length ? Math.round((score / questions.length) * 100) : 0;
  const gradeData = gradeInfo(pct);
  const q         = questions[current];

  if (phase === "loading") return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="text-lg font-semibold">Building your mock test…</p>
      <p className="text-sm text-muted-foreground">Generating {qCount} {difficulty} questions on {topic || subject}</p>
    </div>
  );

  if (phase === "test" && q) return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            {current + 1} / {questions.length}
          </span>
          {flagged[current] && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-600">🚩 Flagged</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{answered}/{questions.length} answered</span>
          {timeSecs > 0 && (
            <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${timeLeft < 120 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"}`}>
              <Clock className="h-3 w-3" /> {fmt(timeLeft)}
            </span>
          )}
        </div>
      </div>

      <div className="w-full bg-muted rounded-full h-1.5">
        <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="card-soft p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold leading-relaxed flex-1">{q.q}</p>
          <button onClick={toggleFlag} title="Flag for review"
            className={`flex-shrink-0 rounded-lg p-2 transition ${flagged[current] ? "bg-amber-100 text-amber-600" : "text-muted-foreground hover:bg-accent"}`}>
            <Flag className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          {q.opts.map((opt, i) => (
            <button key={i} onClick={() => selectAnswer(i)}
              className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition flex items-center gap-3
                ${answers[current] === i
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border bg-background hover:border-primary/40 hover:bg-accent"}`}>
              <span className={`flex-shrink-0 grid h-6 w-6 place-items-center rounded-full border text-xs font-bold
                ${answers[current] === i ? "border-primary bg-primary text-white" : "border-border"}`}>
                {String.fromCharCode(65 + i)}
              </span>
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
          className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-accent transition">
          <ChevronLeft className="h-4 w-4" /> Previous
        </button>

        {current < questions.length - 1 ? (
          <button onClick={() => setCurrent(c => c + 1)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition">
            Next <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={submitTest}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition">
            <CheckCircle2 className="h-4 w-4" /> Submit Test
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {questions.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)}
            className={`h-8 w-8 rounded-lg text-xs font-bold transition border
              ${i === current
                ? "bg-primary text-white border-primary"
                : flagged[i]
                ? "bg-amber-100 border-amber-300 text-amber-700"
                : answers[i] !== null
                ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                : "border-border bg-background text-muted-foreground hover:bg-accent"}`}>
            {i + 1}
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <button onClick={submitTest}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition">
          <CheckCircle2 className="h-4 w-4" />
          Submit Test ({answered}/{questions.length} answered)
        </button>
      </div>
    </div>
  );

  if (phase === "review") return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="card-soft p-6 text-center space-y-3">
        <div className="text-5xl">{gradeData.emoji}</div>
        <h2 className="text-2xl font-bold">{gradeData.msg}</h2>
        <div className={`text-6xl font-black ${gradeData.color}`}>{gradeData.grade}</div>
        <div className="text-4xl font-bold">{score} / {questions.length}</div>
        <div className="text-lg text-muted-foreground">{pct}% correct</div>

        <div className="flex justify-center gap-6 pt-2 flex-wrap text-sm">
          <div className="flex items-center gap-1.5 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-semibold">{score} Correct</span>
          </div>
          <div className="flex items-center gap-1.5 text-red-500">
            <XCircle className="h-4 w-4" />
            <span className="font-semibold">{questions.length - score} Wrong</span>
          </div>
          <div className="flex items-center gap-1.5 text-blue-500">
            <Timer className="h-4 w-4" />
            <span className="font-semibold">{fmt(elapsed)} taken</span>
          </div>
        </div>

        <div className="w-full bg-muted rounded-full h-3 mt-2">
          <div className={`h-3 rounded-full transition-all ${pct >= 60 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${pct}%` }} />
        </div>

        <button onClick={reset}
          className="flex items-center gap-2 mx-auto rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition mt-2">
          <RotateCcw className="h-4 w-4" /> Take Another Test
        </button>
      </div>

      <div>
        <h3 className="flex items-center gap-2 text-base font-bold mb-3">
          <BookOpen className="h-5 w-5 text-primary" /> Question Review
        </h3>
        <div className="space-y-3">
          {questions.map((q, i) => {
            const userAns = answers[i];
            const correct = userAns === q.ans;
            const skipped = userAns === null;
            return (
              <div key={i} className={`rounded-xl border p-4 space-y-2.5 ${correct ? "border-emerald-200 bg-emerald-50/50" : skipped ? "border-amber-200 bg-amber-50/50" : "border-red-200 bg-red-50/50"}`}>
                <div className="flex items-start gap-2">
                  {correct
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    : skipped
                    ? <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    : <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />}
                  <p className="text-sm font-semibold leading-snug flex-1">
                    <span className="text-muted-foreground font-normal">Q{i + 1}. </span>{q.q}
                  </p>
                </div>
                <div className="grid gap-1 pl-6">
                  {q.opts.map((opt, j) => (
                    <div key={j} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs
                      ${j === q.ans ? "bg-emerald-100 text-emerald-800 font-semibold" :
                        j === userAns && !correct ? "bg-red-100 text-red-700 line-through" :
                        "text-muted-foreground"}`}>
                      <span className="font-bold w-4">{String.fromCharCode(65 + j)}.</span>
                      {opt}
                      {j === q.ans && <CheckCircle2 className="h-3 w-3 text-emerald-600 ml-auto" />}
                    </div>
                  ))}
                </div>
                <div className="ml-6 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                  <Brain className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 leading-relaxed">{q.exp}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FlaskConical className="h-5 w-5 text-primary" /> Mock Test
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Full AI-generated timed mock tests — MCQ & True/False with instant review
          </p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      <div className="card-soft p-5 space-y-5">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subject</label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUBJECTS.map(sub => (
              <button key={sub} onClick={() => setSubject(sub)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition border ${subject === sub ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background hover:bg-accent"}`}>
                {sub}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Specific Topic <span className="text-[11px] font-normal normal-case text-muted-foreground/70">(optional — leave blank for full subject test)</span>
          </label>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder={`e.g. Newton's Laws, Trigonometry, Organic Chemistry…`}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Questions</label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Q_COUNTS.map(n => (
                <button key={n} onClick={() => setQCount(n)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition border ${qCount === n ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background hover:bg-accent"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Difficulty</label>
            <div className="mt-2 flex gap-1.5">
              {DIFFICULTIES.map(d => (
                <button key={d.id} onClick={() => setDifficulty(d.id)}
                  className={`flex-1 rounded-full py-1.5 text-xs font-bold transition border ${difficulty === d.id ? d.color + " border-current" : "border-border bg-background hover:bg-accent"}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Time Limit</label>
            <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-bold text-primary">
              {fmt(timeSecs)} <span className="font-normal text-muted-foreground">({MIN_PER_QUESTION} min/question)</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-muted/40 p-4 flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span><strong>{qCount}</strong> questions</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-primary" />
            <span><strong className="capitalize">{difficulty}</strong> difficulty</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <span>{fmt(timeSecs)} minutes total</span>
          </div>
        </div>

        <button onClick={generate} disabled={phase === "loading"}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50 hover:opacity-90 transition">
          {phase === "loading"
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating Test…</>
            : <><FlaskConical className="h-4 w-4" /> Start Mock Test</>}
        </button>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-2">📋 How Mock Test works</p>
        <div className="grid gap-1 sm:grid-cols-2 text-xs text-muted-foreground">
          <span>• AI generates unique questions every time — never the same test twice</span>
          <span>• Flag questions to review before submitting</span>
          <span>• Navigate freely between questions using the number grid</span>
          <span>• After submission, see full review with explanations for every question</span>
        </div>
      </div>
    </div>
  );
}
