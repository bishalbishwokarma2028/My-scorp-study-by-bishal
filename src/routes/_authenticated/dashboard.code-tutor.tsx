import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Code2, Bug, Zap, ClipboardCheck, ArrowRightLeft, BookOpen, Copy, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { askAI } from "@/lib/aiProvider";
import { ProviderBadge, QuotaBadge } from "@/components/ai-ui";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const Route = createFileRoute("/_authenticated/dashboard/code-tutor")({
  component: CodeTutorPage,
});

const LANGUAGES = [
  "Python", "JavaScript", "TypeScript", "Java", "C", "C++", "C#",
  "Go", "Rust", "PHP", "Ruby", "Swift", "Kotlin", "SQL", "HTML/CSS",
  "Bash/Shell", "R", "MATLAB", "Dart", "Scala",
];

const TARGET_LANGUAGES = [
  "Python", "JavaScript", "TypeScript", "Java", "C", "C++", "C#",
  "Go", "Rust", "PHP", "Ruby", "Swift", "Kotlin",
];

type Mode = "explain" | "debug" | "fix" | "optimize" | "review" | "convert";

const MODES: { id: Mode; label: string; icon: React.ElementType; description: string; color: string }[] = [
  { id: "explain", label: "Explain", icon: BookOpen, description: "Understand what this code does line-by-line", color: "blue" },
  { id: "debug", label: "Debug", icon: Bug, description: "Find bugs and errors in the code", color: "red" },
  { id: "fix", label: "Fix & Correct", icon: ClipboardCheck, description: "Fix bugs and return corrected code", color: "green" },
  { id: "optimize", label: "Optimize", icon: Zap, description: "Improve speed, readability and efficiency", color: "amber" },
  { id: "review", label: "Code Review", icon: Code2, description: "Full professional code review with suggestions", color: "violet" },
  { id: "convert", label: "Convert", icon: ArrowRightLeft, description: "Rewrite this code in another language", color: "indigo" },
];

const MODE_COLORS: Record<string, string> = {
  blue: "border-blue-300 bg-blue-50 text-blue-700",
  red: "border-red-300 bg-red-50 text-red-700",
  green: "border-emerald-300 bg-emerald-50 text-emerald-700",
  amber: "border-amber-300 bg-amber-50 text-amber-700",
  violet: "border-violet-300 bg-violet-50 text-violet-700",
  indigo: "border-indigo-300 bg-indigo-50 text-indigo-700",
};

const MODE_ACTIVE: Record<string, string> = {
  blue: "border-blue-500 bg-blue-500 text-white",
  red: "border-red-500 bg-red-500 text-white",
  green: "border-emerald-500 bg-emerald-500 text-white",
  amber: "border-amber-500 bg-amber-500 text-white",
  violet: "border-violet-500 bg-violet-500 text-white",
  indigo: "border-indigo-500 bg-indigo-500 text-white",
};

function buildPrompt(code: string, language: string, mode: Mode, targetLang: string, question: string): string {
  const header = `Language: ${language}\n\`\`\`${language.toLowerCase()}\n${code}\n\`\`\`\n\n`;

  switch (mode) {
    case "explain":
      return `${header}Explain this ${language} code clearly for a student. Cover:
1. **Overview** — What the code does in 1-2 sentences
2. **Line-by-line breakdown** — Explain each important section
3. **Key concepts used** — List the programming concepts/patterns involved
4. **What it outputs / returns** — If applicable
Use simple language. Format with markdown headings and bullet points.`;

    case "debug":
      return `${header}Debug this ${language} code. Find ALL bugs, errors, and issues:
1. **Bugs Found** — List every bug with the line number and explanation
2. **Error Type** — Syntax error, Logic error, Runtime error, etc.
3. **Why it's wrong** — Explain each issue clearly
4. **How to fix it** — Suggest the fix for each bug
If no bugs found, state that clearly and explain why the code is correct.
Format with markdown.`;

    case "fix":
      return `${header}Fix all bugs in this ${language} code:
1. **Issues Found** — Brief list of what was wrong
2. **Fixed Code** — Provide the complete corrected code in a code block
3. **Changes Made** — Bullet list of every change you made and why
Format with markdown. Always include the full corrected code.`;

    case "optimize":
      return `${header}Optimize this ${language} code for performance, readability, and best practices:
1. **Current Issues** — What's inefficient, unclear, or not following best practices
2. **Optimized Code** — Provide the full improved code in a code block
3. **Improvements Made** — Explain each optimization
4. **Performance Impact** — Estimated improvement (if applicable)
Format with markdown.`;

    case "review":
      return `${header}Perform a professional code review of this ${language} code:
1. **Overall Quality** — Rate it (Poor / Needs Work / Good / Excellent) with a brief reason
2. **Correctness** — Does it do what it likely intends to?
3. **Code Quality** — Readability, naming, structure
4. **Performance** — Any bottlenecks or inefficiencies
5. **Security** — Any security concerns (injection, input validation, etc.)
6. **Best Practices** — Missing patterns, anti-patterns, or conventions for ${language}
7. **Suggestions** — Top 3 actionable improvements with code examples
Format with markdown headings. Be constructive and educational.`;

    case "convert":
      return `${header}Convert this ${language} code to ${targetLang}:
1. **Converted Code** — Provide the full working ${targetLang} code in a code block
2. **Key Differences** — Important differences between ${language} and ${targetLang} for this code
3. **Notes** — Any important caveats or ${targetLang}-specific considerations
Format with markdown. The converted code must be complete and runnable.`;

    default:
      if (question.trim()) {
        return `${header}The student asks: "${question}"\n\nAnswer clearly and helpfully with code examples where relevant. Format with markdown.`;
      }
      return `${header}Explain this code.`;
  }
}

function CodeTutorPage() {
  const { user } = Route.useRouteContext();
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("Python");
  const [targetLang, setTargetLang] = useState("JavaScript");
  const [mode, setMode] = useState<Mode>("explain");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "code_tutor");

  const selectedMode = MODES.find((m) => m.id === mode)!;

  async function run() {
    if (!code.trim()) return toast.error("Paste some code first");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true);
    setResult(null);
    const prompt = buildPrompt(code, language, mode, targetLang, question);
    const systemPrompt = `You are an expert programming tutor named Bishal's Code Tutor (part of ScorpStudy). 
You explain code clearly, find bugs precisely, and give professional code reviews. 
Always use markdown formatting. Always include code blocks with proper language tags.
Be educational and encouraging — your students are learning.`;
    const res = await askAI(prompt, systemPrompt);
    setProvider(res.provider);
    setResult(res.text);
    await bump();
    setLoading(false);
  }

  function reset() {
    setCode("");
    setResult(null);
    setProvider(null);
    setQuestion("");
  }

  async function copyResult() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Code2 className="h-5 w-5 text-primary" /> Code Tutor
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Paste any code — explain, debug, fix, optimize, review, or convert it with AI</p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left — Input */}
        <div className="space-y-4">
          {/* Language + Mode */}
          <div className="card-soft p-4 space-y-4">
            {/* Language selector */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Programming Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>

            {/* Mode selector */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">What do you want to do?</label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {MODES.map(({ id, label, icon: Icon, color }) => {
                  const active = mode === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setMode(id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${active ? MODE_ACTIVE[color] : MODE_COLORS[color] + " hover:opacity-80"}`}
                    >
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{selectedMode.description}</p>
            </div>

            {/* Convert target language */}
            {mode === "convert" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Convert To</label>
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  {TARGET_LANGUAGES.filter((l) => l !== language).map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Code input */}
          <div className="card-soft p-4 space-y-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Code</label>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={`Paste your ${language} code here…\n\nExample:\ndef greet(name):\n    print("Hello, " + name)\n\ngreet("World")`}
              rows={14}
              className="w-full rounded-lg border border-input bg-background p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              spellCheck={false}
            />
          </div>

          {/* Optional question */}
          <div className="card-soft p-4 space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ask a specific question <span className="normal-case text-[10px]">(optional)</span></label>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Why is this function slow? What does the lambda do?"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={run}
              disabled={loading || !code.trim()}
              className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing code…</>
              ) : (
                <><selectedMode.icon className="h-4 w-4" /> {selectedMode.label} Code</>
              )}
            </button>
            {(result || code) && (
              <button onClick={reset} className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent">
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Right — Output */}
        <div className="card-soft p-4 space-y-3 min-h-[400px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {result ? `${selectedMode.label} Result` : "Output"}
            </span>
            <div className="flex items-center gap-2">
              <ProviderBadge provider={provider} />
              {result && (
                <button onClick={copyResult} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
                  {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
            </div>
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground">Bishal's Code Tutor is analyzing your code…</p>
              <p className="text-xs text-muted-foreground/60">This usually takes a few seconds</p>
            </div>
          )}

          {!loading && !result && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center text-muted-foreground">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted">
                <Code2 className="h-8 w-8 opacity-40" />
              </div>
              <div>
                <p className="text-sm font-medium">No output yet</p>
                <p className="text-xs mt-1 opacity-70">Paste your code, choose a mode, and click the button</p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-left max-w-xs w-full">
                {MODES.map(({ id, label, icon: Icon, color }) => (
                  <button
                    key={id}
                    onClick={() => setMode(id)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${MODE_COLORS[color]} hover:opacity-80`}
                  >
                    <Icon className="h-3 w-3 flex-shrink-0" /> {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && result && (
            <div className="prose prose-sm max-w-none overflow-auto [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:text-slate-100 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_code]:text-xs [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_ul]:my-1 [&_li]:my-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      {/* Tips footer */}
      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-2">💡 Tips for best results</p>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4 text-xs text-muted-foreground">
          <span>• Select the correct language for accurate analysis</span>
          <span>• Paste complete functions or classes, not fragments</span>
          <span>• Use "Debug" to find errors, "Fix" to get corrected code</span>
          <span>• Ask a specific question for targeted help</span>
        </div>
      </div>
    </div>
  );
}
