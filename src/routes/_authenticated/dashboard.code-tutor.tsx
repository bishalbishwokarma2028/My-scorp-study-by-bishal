import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  Loader2, Code2, Bug, Zap, ClipboardCheck, ArrowRightLeft,
  BookOpen, Copy, Check, RotateCcw, Send, Sparkles, ChevronDown,
  Play, Terminal, X,
} from "lucide-react";
import { toast } from "sonner";
import { askAI, type HistoryMsg } from "@/lib/aiProvider";
import { ProviderBadge, QuotaBadge } from "@/components/ai-ui";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { usePageState } from "@/lib/pageState";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { runCodeServer } from "@/lib/codeRun.functions";

export const Route = createFileRoute("/_authenticated/dashboard/code-tutor")({
  component: CodeTutorPage,
});

const LANGUAGES = [
  "Python","JavaScript","TypeScript","Java","C","C++","C#",
  "Go","Rust","PHP","Ruby","Swift","Kotlin","SQL","HTML/CSS",
  "Bash/Shell","R","MATLAB","Dart","Scala",
];

const TARGET_LANGUAGES = [
  "Python","JavaScript","TypeScript","Java","C","C++","C#",
  "Go","Rust","PHP","Ruby","Swift","Kotlin",
];

// Languages supported by Piston (public code execution API)
const PISTON_LANG: Record<string, string> = {
  Python: "python", JavaScript: "javascript", TypeScript: "typescript",
  Java: "java", C: "c", "C++": "c++", "C#": "csharp",
  Go: "go", Rust: "rust", PHP: "php", Ruby: "ruby",
  Swift: "swift", Kotlin: "kotlin", R: "r", "Bash/Shell": "bash",
  Dart: "dart", Scala: "scala",
};

type Mode = "explain" | "debug" | "fix" | "optimize" | "review" | "convert";
type Tab  = "analyze" | "generate";

const MODES: { id: Mode; label: string; icon: React.ElementType; description: string; color: string }[] = [
  { id: "explain",  label: "Explain",      icon: BookOpen,       description: "Understand what this code does, step by step",             color: "blue"   },
  { id: "debug",    label: "Debug",        icon: Bug,            description: "Find ALL bugs and errors — every line examined",           color: "red"    },
  { id: "fix",      label: "Fix & Correct",icon: ClipboardCheck, description: "Fix bugs and return complete, runnable corrected code",     color: "green"  },
  { id: "optimize", label: "Optimize",     icon: Zap,            description: "Improve speed, readability and efficiency",                color: "amber"  },
  { id: "review",   label: "Code Review",  icon: Code2,          description: "Full professional review with graded categories",          color: "violet" },
  { id: "convert",  label: "Convert",      icon: ArrowRightLeft, description: "Rewrite in another language with idiomatic patterns",       color: "indigo" },
];

const MODE_COLORS: Record<string, string> = {
  blue:   "border-blue-300 bg-blue-50 text-blue-700",
  red:    "border-red-300 bg-red-50 text-red-700",
  green:  "border-emerald-300 bg-emerald-50 text-emerald-700",
  amber:  "border-amber-300 bg-amber-50 text-amber-700",
  violet: "border-violet-300 bg-violet-50 text-violet-700",
  indigo: "border-indigo-300 bg-indigo-50 text-indigo-700",
};

const MODE_ACTIVE: Record<string, string> = {
  blue:   "border-blue-500 bg-blue-500 text-white",
  red:    "border-red-500 bg-red-500 text-white",
  green:  "border-emerald-500 bg-emerald-500 text-white",
  amber:  "border-amber-500 bg-amber-500 text-white",
  violet: "border-violet-500 bg-violet-500 text-white",
  indigo: "border-indigo-500 bg-indigo-500 text-white",
};

// ─── Improved prompts (more rigorous and production-accurate) ─────────────────
function buildAnalyzePrompt(code: string, language: string, mode: Mode, targetLang: string, question: string): string {
  const header = `Language: ${language}\n\`\`\`${language.toLowerCase()}\n${code}\n\`\`\`\n\n`;

  switch (mode) {
    case "explain":
      return `${header}Explain this ${language} code clearly and educationally. Use markdown:

## Overview
(1-2 sentences: what does this code accomplish?)

## How It Works — Step by Step
(Walk through each important section/function/block in order. For each part: what it does, how it does it, and why it matters.)

## Key Concepts & Techniques Used
(List all programming concepts, data structures, algorithms, or patterns used — with brief explanations)

## Inputs & Outputs
(What does it take in? What does it return/output/print?)

## Example Execution Trace
(Trace through 1 example run, showing how values change)

Be thorough, accurate, and educational. Use code snippets where helpful.`;

    case "debug":
      return `${header}You are a precise debugger. Examine EVERY LINE of this ${language} code meticulously.

Find ALL bugs, errors, and issues — including:
- Syntax errors (wrong brackets, missing semicolons, wrong keywords)
- Logic errors (wrong conditions, off-by-one, incorrect algorithm)
- Runtime errors (null references, division by zero, index out of bounds)
- Type errors (wrong types, missing casts)
- Edge case failures (empty input, zero, negative numbers)
- Missing error handling

Format your response in markdown:

## 🐛 Bugs Found
(If no bugs: explicitly state "No bugs found — the code is correct." Otherwise list every bug:)

### Bug 1: [Short name]
- **Line**: [line number or approximate location]
- **Type**: [Syntax / Logic / Runtime / Type error]
- **Problem**: [What is wrong and why]
- **Fix**: \`[corrected code snippet]\`

### Bug 2: ...

## 🔍 Additional Issues
(Warnings, bad practices, or potential edge cases even if not strict bugs)

## ✅ Summary
(Total bug count, severity assessment)

Be exhaustive. Missing even one bug is unacceptable.`;

    case "fix":
      return `${header}Fix ALL bugs in this ${language} code. Your fixed code must be:
- 100% correct and runnable with zero errors
- Logically equivalent to the original intent
- Following ${language} best practices

Format in markdown:

## 🔧 Issues Found & Fixed
(Bullet list of every problem that was fixed, with a brief explanation)

## ✅ Fixed Code
\`\`\`${language.toLowerCase()}
[Complete, working, corrected code — every line included, nothing omitted]
\`\`\`

## 📝 Changes Explained
(For each change: what was wrong, what you changed, and why)

Rules:
- ALWAYS include the COMPLETE corrected code — never say "rest remains the same"
- Mentally run the code before submitting — it must execute without errors
- If the code was already correct, say so and return it unchanged`;

    case "optimize":
      return `${header}Optimize this ${language} code for maximum performance, readability, and best practices.

Format in markdown:

## 📊 Current Code Analysis
- **Time Complexity**: [Big O of current code]
- **Space Complexity**: [Big O of current code]
- **Issues**: [bullet list of inefficiencies, bad practices, or readability problems]

## ⚡ Optimized Code
\`\`\`${language.toLowerCase()}
[Complete optimized code — every line included]
\`\`\`

## 📈 Improvements Made
(For each optimization: what changed, why, and the expected impact)

## 📊 After Optimization
- **Time Complexity**: [Big O of optimized code]
- **Space Complexity**: [Big O of optimized code]
- **Key Wins**: [summary of main improvements]

Apply ALL of: algorithmic improvements, language-specific idioms, proper data structures, readable naming, reduced redundancy.`;

    case "review":
      return `${header}Perform a thorough professional code review of this ${language} code. Grade each category A-F.

Format in markdown:

## 📋 Code Review Summary

| Category | Grade | Notes |
|----------|-------|-------|
| Correctness | [A-F] | [1 line] |
| Readability | [A-F] | [1 line] |
| Performance | [A-F] | [1 line] |
| Security | [A-F] | [1 line] |
| Best Practices | [A-F] | [1 line] |
| Error Handling | [A-F] | [1 line] |

**Overall: [A-F]**

## 🔍 Detailed Analysis

### Correctness
[Does the code achieve its intended purpose? Any logic errors?]

### Readability & Maintainability
[Naming, comments, structure, complexity. Reference specific lines.]

### Performance
[Algorithmic complexity, unnecessary computations, memory usage. Reference specific lines.]

### Security
[Input validation, injection risks, data exposure. If not applicable, state why.]

### Best Practices & Patterns
[Design patterns, language idioms, error handling, testing considerations.]

## 🛠️ Top 5 Actionable Improvements
(Ordered by priority — include corrected code snippets for each)

### 1. [Title]
**Problem**: ...
**Fix**:
\`\`\`${language.toLowerCase()}
[corrected snippet]
\`\`\`

...

## 💡 Conclusion
[2-3 sentence overall assessment]`;

    case "convert":
      return `${header}Convert this ${language} code to ${targetLang}. The conversion must be:
- 100% functionally equivalent — same logic, same behavior, same edge case handling
- Idiomatic ${targetLang} — use native patterns, not literal translations
- Following ${targetLang} best practices and conventions
- Complete — every function, class, and feature converted

Format in markdown:

## 🔄 Converted ${targetLang} Code
\`\`\`${targetLang.toLowerCase()}
[Complete converted code — never omit any part]
\`\`\`

## 📌 Key Differences Between ${language} and ${targetLang}
(Bullet list of important language differences that affected the conversion)

## ⚠️ Notes & Caveats
(Any behavioral differences, missing features, or things the developer should know)

Rules:
- ALWAYS write the COMPLETE converted code — never use placeholders or "// rest of code"
- Use ${targetLang} idioms (e.g., list comprehensions in Python, arrow functions in JS, etc.)
- If a direct equivalent doesn't exist, explain what you used instead and why`;

    default:
      if (question.trim()) {
        return `${header}The student asks: "${question}"\n\nAnswer clearly with code examples where helpful. Use markdown formatting. Be educational and thorough.`;
      }
      return `${header}Explain this ${language} code clearly.`;
  }
}

// ─── Execute code via server-proxied Piston API ───────────────────────────────
type RunResult = { stdout: string; stderr: string; exitCode: number } | { error: string };

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true); toast.success("Copied");
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

// ─── Analyze Tab ──────────────────────────────────────────────────────────────
type AnalyzeState = {
  code: string; language: string; targetLang: string;
  mode: Mode; question: string;
  result: string | null; provider: string | null;
};

function AnalyzeTab({ quota, bump }: { quota: ReturnType<typeof useUsageLimit>["quota"]; bump: () => Promise<void> }) {
  const [s, set] = usePageState<AnalyzeState>("code-tutor-analyze", {
    code: "", language: "Python", targetLang: "JavaScript",
    mode: "explain", question: "",
    result: null, provider: null,
  });

  const [loading,   setLoading]   = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [showRun,   setShowRun]   = useState(false);

  const selectedMode = MODES.find(m => m.id === s.mode)!;

  async function analyze() {
    if (!s.code.trim()) return toast.error("Paste some code first");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true); set({ result: null });
    setRunResult(null); setShowRun(false);

    const prompt = buildAnalyzePrompt(s.code, s.language, s.mode, s.targetLang, s.question);
    const res = await askAI(prompt,
      `You are Bishal's Code Tutor — an expert programming tutor with deep knowledge of all languages. You provide precise, accurate, production-quality analysis. Never give vague answers. Always reference specific lines. Use markdown with properly labelled code blocks. Be educational and thorough.`);
    set({ provider: res.provider, result: res.text });
    await bump();
    setLoading(false);
  }

  async function runCode() {
    if (!s.code.trim()) return toast.error("Write or paste code first");
    const lang = PISTON_LANG[s.language];
    if (!lang) return toast.error(`${s.language} is not supported for live execution.`);
    setIsRunning(true); setShowRun(true); setRunResult(null);
    try {
      const result = await runCodeServer({ data: { language: lang, code: s.code } });
      setRunResult(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setRunResult({ error: `Execution failed: ${msg}` });
    }
    setIsRunning(false);
  }

  function reset() {
    set({ code: "", result: null, provider: null, question: "" });
    setRunResult(null); setShowRun(false);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Left: inputs */}
      <div className="space-y-4">
        <div className="card-soft p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Language</label>
            <select value={s.language} onChange={e => set({ language: e.target.value })}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              {LANGUAGES.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">What do you want to do?</label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MODES.map(({ id, label, icon: Icon, color }) => {
                const active = s.mode === id;
                return (
                  <button key={id} onClick={() => set({ mode: id })}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${active ? MODE_ACTIVE[color] : MODE_COLORS[color] + " hover:opacity-80"}`}>
                    <Icon className="h-3.5 w-3.5 flex-shrink-0" /> {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{selectedMode.description}</p>
          </div>
          {s.mode === "convert" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Convert To</label>
              <select value={s.targetLang} onChange={e => set({ targetLang: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                {TARGET_LANGUAGES.filter(l => l !== s.language).map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="card-soft p-4 space-y-3">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Code</label>
          <textarea value={s.code} onChange={e => set({ code: e.target.value })}
            placeholder={`Paste your ${s.language} code here…`}
            rows={13} spellCheck={false}
            className="w-full rounded-lg border border-input bg-background p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div className="card-soft p-4 space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Specific question <span className="normal-case text-[10px]">(optional)</span>
          </label>
          <input value={s.question} onChange={e => set({ question: e.target.value })}
            placeholder="e.g. Why is this slow? What does the lambda do?"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>

        <div className="flex gap-2">
          <button onClick={analyze} disabled={loading || !s.code.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</>
              : <><selectedMode.icon className="h-4 w-4" /> {selectedMode.label} Code</>}
          </button>
          {/* Run button — only for executable languages */}
          {PISTON_LANG[s.language] && (
            <button onClick={runCode} disabled={isRunning || !s.code.trim()}
              title={`Run ${s.language} code`}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors">
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isRunning ? "Running…" : "Run"}
            </button>
          )}
          {(s.result || s.code) && (
            <button onClick={reset}
              className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Run output panel */}
        {showRun && (
          <div className="card-soft overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-slate-900">
              <div className="flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-200">
                  {s.language} Output
                </span>
                {runResult && !("error" in runResult) && (
                  <span className={`text-[10px] rounded-full px-2 py-0.5 font-mono ${runResult.exitCode === 0 ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"}`}>
                    exit {runResult.exitCode}
                  </span>
                )}
              </div>
              <button onClick={() => setShowRun(false)}>
                <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-200" />
              </button>
            </div>
            <div className="bg-slate-950 p-4 min-h-[80px] max-h-[220px] overflow-y-auto">
              {isRunning && (
                <div className="flex items-center gap-2 text-slate-400 text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Executing…
                </div>
              )}
              {!isRunning && runResult && "error" in runResult && (
                <pre className="text-xs text-red-400 whitespace-pre-wrap font-mono">{runResult.error}</pre>
              )}
              {!isRunning && runResult && !("error" in runResult) && (
                <div className="space-y-2">
                  {runResult.stdout && (
                    <pre className="text-xs text-emerald-300 whitespace-pre-wrap font-mono">{runResult.stdout}</pre>
                  )}
                  {runResult.stderr && (
                    <pre className="text-xs text-red-400 whitespace-pre-wrap font-mono">{runResult.stderr}</pre>
                  )}
                  {!runResult.stdout && !runResult.stderr && (
                    <p className="text-xs text-slate-500 italic">(no output)</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right: analysis result */}
      <div className="card-soft p-4 space-y-3 min-h-[400px] overflow-x-hidden">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {s.result ? `${selectedMode.label} Result` : "Output"}
          </span>
          <div className="flex items-center gap-2">
            <ProviderBadge provider={s.provider} />
            {s.result && <CopyBtn text={s.result} />}
          </div>
        </div>
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Bishal's Code Tutor is analyzing…</p>
          </div>
        )}
        {!loading && !s.result && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted">
              <Code2 className="h-8 w-8 opacity-40" />
            </div>
            <p className="text-sm font-medium">Paste code and choose a mode</p>
            <p className="text-xs">Or hit <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">Run</kbd> to execute your code instantly</p>
          </div>
        )}
        {!loading && s.result && (
          <div className="w-full min-w-0 overflow-x-hidden prose prose-sm max-w-none
            [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:text-slate-100 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:whitespace-pre-wrap
            [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:break-all
            [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm
            [&_table]:text-xs [&_table]:w-full [&_table]:block [&_table]:overflow-x-auto
            [&_p]:break-words [&_li]:break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.result}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Generate Tab ─────────────────────────────────────────────────────────────
type ChatMsg = { role: "user" | "assistant"; content: string; provider?: string };

type GenerateState = {
  genLanguage: string;
  messages: ChatMsg[];
};

const GEN_EXAMPLES = [
  "A Python function that reads a CSV file and calculates column averages",
  "A binary search algorithm in TypeScript",
  "A REST API endpoint in Go that handles user authentication",
  "A recursive function to solve the Tower of Hanoi in C++",
  "A SQL query to find the top 5 customers by total spending",
  "A React hook that debounces a search input",
];

function GenerateTab({ quota, bump }: { quota: ReturnType<typeof useUsageLimit>["quota"]; bump: () => Promise<void> }) {
  const [s, set] = usePageState<GenerateState>("code-tutor-generate", {
    genLanguage: "Python", messages: [],
  });
  const [input,          setInput]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [s.messages]);

  async function send() {
    if (!input.trim()) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);

    const userMsg = input.trim();
    setInput("");
    const newMessages: ChatMsg[] = [...s.messages, { role: "user", content: userMsg }];
    set({ messages: newMessages });
    setLoading(true);

    const isFirst = s.messages.length === 0;
    const prompt = isFirst
      ? `Generate ${s.genLanguage} code for the following request:\n\n"${userMsg}"\n\nRequirements:\n- Write clean, complete, well-commented ${s.genLanguage} code\n- The code must be runnable and production-quality\n- Follow ${s.genLanguage} best practices and idioms\n- Include a clear explanation of how it works\n- Add example usage at the end\n- Handle edge cases appropriately`
      : userMsg;

    const systemPrompt = `You are Bishal's Code Generator (part of ScorpStudy). You write accurate, complete, production-quality ${s.genLanguage} code.

RULES YOU MUST FOLLOW:
1. Always include the COMPLETE working code in a properly labelled code block — never truncate or use placeholders
2. Code must be correct, runnable, and follow ${s.genLanguage} best practices
3. Include clear comments explaining key sections
4. Add brief explanation after the code
5. For follow-up requests: modify ONLY what was asked, then return the complete updated code
6. If asked to add tests, error handling, or async support — implement it properly`;

    const history: HistoryMsg[] = newMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
    const res = await askAI(prompt, systemPrompt, history);
    set({ messages: [...newMessages, { role: "assistant", content: res.text, provider: res.provider }] });
    await bump();
    setLoading(false);
  }

  function copyCode(text: string) {
    const match = text.match(/```[\w]*\n([\s\S]*?)```/);
    const code = match ? match[1] : text;
    navigator.clipboard.writeText(code);
    toast.success("Code copied");
  }

  return (
    <div className="space-y-4">
      <div className="card-soft p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Generate in:</label>
            <div className="relative">
              <button onClick={() => setShowLangPicker(v => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium">
                {s.genLanguage} <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {showLangPicker && (
                <div className="absolute top-full left-0 mt-1 z-20 w-48 rounded-lg border border-border bg-background shadow-lg p-1 max-h-60 overflow-y-auto">
                  {LANGUAGES.map(l => (
                    <button key={l} onClick={() => { set({ genLanguage: l, messages: [] }); setShowLangPicker(false); }}
                      className={`w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-accent ${s.genLanguage === l ? "text-primary font-semibold" : ""}`}>
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {s.messages.length > 0 && (
            <button onClick={() => set({ messages: [] })}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent">
              <RotateCcw className="h-3 w-3" /> Clear chat
            </button>
          )}
        </div>
        {s.messages.length === 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Example requests:</p>
            <div className="flex flex-wrap gap-2">
              {GEN_EXAMPLES.map(ex => (
                <button key={ex} onClick={() => setInput(ex)}
                  className="rounded-full border border-border bg-background px-3 py-1 text-xs hover:bg-accent text-left max-w-[260px] truncate">
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {s.messages.length > 0 && (
        <div className="card-soft p-4 space-y-4 max-h-[600px] overflow-y-auto">
          {s.messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "user" ? (
                <div className="max-w-[80%] rounded-xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                  {msg.content}
                </div>
              ) : (
                <div className="w-full space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">AI</div>
                    <ProviderBadge provider={msg.provider || null} />
                  </div>
                  <div className="prose prose-sm max-w-none [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:text-slate-100 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1 [&_h2]:text-sm [&_h3]:text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => copyCode(msg.content)}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
                      <Copy className="h-3 w-3" /> Copy code
                    </button>
                    <CopyBtn text={msg.content} label="Copy all" />
                  </div>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Generating {s.genLanguage} code…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="card-soft p-3">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !loading) { e.preventDefault(); send(); } }}
            placeholder={s.messages.length === 0
              ? `Describe the ${s.genLanguage} code you want to generate…`
              : "Ask a follow-up — add error handling, convert to async, add tests…"}
            rows={3}
            className="flex-1 rounded-lg border border-input bg-background p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button onClick={send} disabled={loading || !input.trim()}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground px-1">Enter to send · Shift+Enter for new line · Ask follow-ups to refine the code</p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
function CodeTutorPage() {
  const { user } = Route.useRouteContext();
  const [s, set] = usePageState("code-tutor-page", { activeTab: "analyze" as Tab });
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "code_tutor");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Code2 className="h-5 w-5 text-primary" /> Code Tutor
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Analyze existing code or generate new code — with live execution via the Run button
          </p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1 w-fit">
        <button onClick={() => set({ activeTab: "analyze" })}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${s.activeTab === "analyze" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Bug className="h-4 w-4" /> Analyze Code
        </button>
        <button onClick={() => set({ activeTab: "generate" })}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${s.activeTab === "generate" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Sparkles className="h-4 w-4" /> Generate Code
        </button>
      </div>

      {s.activeTab === "analyze"
        ? <AnalyzeTab quota={quota} bump={bump} />
        : <GenerateTab quota={quota} bump={bump} />}

      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-2">
          {s.activeTab === "analyze" ? "💡 Analyze tips" : "💡 Generate tips"}
        </p>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4 text-xs text-muted-foreground">
          {s.activeTab === "analyze" ? <>
            <span>• Select the correct language for accurate analysis</span>
            <span>• Use <strong>Debug</strong> + <strong>Fix</strong> together for full bug resolution</span>
            <span>• Hit <strong>▶ Run</strong> to execute code directly in the browser</span>
            <span>• Add a specific question for targeted help</span>
          </> : <>
            <span>• Be specific — "Python function that…" beats "make a function"</span>
            <span>• Ask follow-ups to add tests, error handling, or async support</span>
            <span>• Use the language picker to switch languages — chat resets cleanly</span>
            <span>• Copy the code block, then paste into VS Code or your IDE</span>
          </>}
        </div>
      </div>
    </div>
  );
}
