import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  Loader2, Code2, Bug, Zap, ClipboardCheck, ArrowRightLeft,
  BookOpen, Copy, Check, RotateCcw, Send, Sparkles, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON, type HistoryMsg } from "@/lib/aiProvider";
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
type Tab = "analyze" | "generate";

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

function buildAnalyzePrompt(code: string, language: string, mode: Mode, targetLang: string, question: string): string {
  const header = `Language: ${language}\n\`\`\`${language.toLowerCase()}\n${code}\n\`\`\`\n\n`;
  switch (mode) {
    case "explain": return `${header}Explain this ${language} code clearly for a student. Cover:\n1. **Overview** — What the code does in 1-2 sentences\n2. **Line-by-line breakdown** — Explain each important section\n3. **Key concepts used** — List the programming concepts/patterns involved\n4. **What it outputs / returns** — If applicable\nUse simple language. Format with markdown headings and bullet points.`;
    case "debug": return `${header}Debug this ${language} code. Find ALL bugs, errors, and issues:\n1. **Bugs Found** — List every bug with the line number and explanation\n2. **Error Type** — Syntax error, Logic error, Runtime error, etc.\n3. **Why it's wrong** — Explain each issue clearly\n4. **How to fix it** — Suggest the fix for each bug\nIf no bugs found, state that clearly.\nFormat with markdown.`;
    case "fix": return `${header}Fix all bugs in this ${language} code:\n1. **Issues Found** — Brief list of what was wrong\n2. **Fixed Code** — Provide the complete corrected code in a code block\n3. **Changes Made** — Bullet list of every change and why\nFormat with markdown. Always include the full corrected code.`;
    case "optimize": return `${header}Optimize this ${language} code:\n1. **Current Issues** — What's inefficient or not best practice\n2. **Optimized Code** — Provide the full improved code in a code block\n3. **Improvements Made** — Explain each optimization\n4. **Performance Impact** — Estimated improvement if applicable\nFormat with markdown.`;
    case "review": return `${header}Perform a professional code review of this ${language} code:\n1. **Overall Quality** — Rate it (Poor/Needs Work/Good/Excellent) with reason\n2. **Correctness** — Does it do what it likely intends?\n3. **Code Quality** — Readability, naming, structure\n4. **Performance** — Bottlenecks or inefficiencies\n5. **Security** — Any security concerns\n6. **Best Practices** — Missing patterns or anti-patterns\n7. **Top 3 Suggestions** — Actionable improvements with code examples\nFormat with markdown. Be constructive and educational.`;
    case "convert": return `${header}Convert this ${language} code to ${targetLang}:\n1. **Converted Code** — Provide the full working ${targetLang} code in a code block\n2. **Key Differences** — Important differences between ${language} and ${targetLang}\n3. **Notes** — Any important caveats\nFormat with markdown.`;
    default:
      if (question.trim()) return `${header}The student asks: "${question}"\nAnswer clearly with code examples. Format with markdown.`;
      return `${header}Explain this code.`;
  }
}

// ─── Copy button helper ───────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── Analyze Tab ──────────────────────────────────────────────────────────────
function AnalyzeTab({ quota, quotaLoading, bump }: { quota: ReturnType<typeof useUsageLimit>["quota"]; quotaLoading: boolean; bump: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("Python");
  const [targetLang, setTargetLang] = useState("JavaScript");
  const [mode, setMode] = useState<Mode>("explain");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  const selectedMode = MODES.find((m) => m.id === mode)!;

  async function run() {
    if (!code.trim()) return toast.error("Paste some code first");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true); setResult(null);
    const prompt = buildAnalyzePrompt(code, language, mode, targetLang, question);
    const res = await askAI(prompt,
      "You are an expert programming tutor named Bishal's Code Tutor (part of ScorpStudy). Explain code clearly, find bugs precisely, and give professional code reviews. Always use markdown formatting with code blocks using proper language tags. Be educational and encouraging.");
    setProvider(res.provider);
    setResult(res.text);
    await bump();
    setLoading(false);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="card-soft p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">What do you want to do?</label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MODES.map(({ id, label, icon: Icon, color }) => {
                const active = mode === id;
                return (
                  <button key={id} onClick={() => setMode(id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${active ? MODE_ACTIVE[color] : MODE_COLORS[color] + " hover:opacity-80"}`}>
                    <Icon className="h-3.5 w-3.5 flex-shrink-0" /> {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{selectedMode.description}</p>
          </div>
          {mode === "convert" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Convert To</label>
              <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                {TARGET_LANGUAGES.filter((l) => l !== language).map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="card-soft p-4 space-y-3">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Code</label>
          <textarea value={code} onChange={(e) => setCode(e.target.value)}
            placeholder={`Paste your ${language} code here…`}
            rows={13} spellCheck={false}
            className="w-full rounded-lg border border-input bg-background p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="card-soft p-4 space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Specific question <span className="normal-case text-[10px]">(optional)</span>
          </label>
          <input value={question} onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Why is this slow? What does the lambda do?"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-2">
          <button onClick={run} disabled={loading || !code.trim()}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</> : <><selectedMode.icon className="h-4 w-4" /> {selectedMode.label} Code</>}
          </button>
          {(result || code) && (
            <button onClick={() => { setCode(""); setResult(null); setProvider(null); setQuestion(""); }}
              className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="card-soft p-4 space-y-3 min-h-[400px]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{result ? `${selectedMode.label} Result` : "Output"}</span>
          <div className="flex items-center gap-2">
            <ProviderBadge provider={provider} />
            {result && <CopyBtn text={result} />}
          </div>
        </div>
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Bishal's Code Tutor is analyzing…</p>
          </div>
        )}
        {!loading && !result && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted">
              <Code2 className="h-8 w-8 opacity-40" />
            </div>
            <p className="text-sm font-medium">Paste code and choose a mode</p>
          </div>
        )}
        {!loading && result && (
          <div className="prose prose-sm max-w-none overflow-auto [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:text-slate-100 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Generate Tab ─────────────────────────────────────────────────────────────
type ChatMsg = { role: "user" | "assistant"; content: string; provider?: string };

const GEN_EXAMPLES = [
  "A Python function that reads a CSV file and calculates column averages",
  "A binary search algorithm in TypeScript",
  "A REST API endpoint in Go that handles user authentication",
  "A recursive function to solve the Tower of Hanoi in C++",
  "A SQL query to find the top 5 customers by total spending",
  "A React hook that debounces a search input",
];

function GenerateTab({ quota, quotaLoading, bump }: { quota: ReturnType<typeof useUsageLimit>["quota"]; quotaLoading: boolean; bump: () => Promise<void> }) {
  const [genLanguage, setGenLanguage] = useState("Python");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    if (!input.trim()) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);

    const userMsg = input.trim();
    setInput("");
    const newMessages: ChatMsg[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    const isFirst = messages.length === 0;
    const prompt = isFirst
      ? `Generate ${genLanguage} code for the following request:\n\n"${userMsg}"\n\nRequirements:\n- Write clean, well-commented ${genLanguage} code\n- Include a brief explanation of how it works\n- Add example usage at the end if applicable\n- Use best practices for ${genLanguage}`
      : userMsg;

    const systemPrompt = `You are Bishal's Code Generator (part of ScorpStudy). You write clean, well-commented, production-quality ${genLanguage} code. 
Always include:
1. The complete working code in a properly labeled code block
2. A brief explanation of how it works
3. Example usage where applicable
Be educational and explain key concepts for students.`;

    const history: HistoryMsg[] = newMessages.slice(0, -1).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const res = await askAI(prompt, systemPrompt, history);
    setMessages([...newMessages, { role: "assistant", content: res.text, provider: res.provider }]);
    await bump();
    setLoading(false);
  }

  function useExample(ex: string) {
    setInput(ex);
    setMessages([]);
  }

  function copyCode(text: string) {
    const match = text.match(/```[\w]*\n([\s\S]*?)```/);
    const code = match ? match[1] : text;
    navigator.clipboard.writeText(code);
    toast.success("Code copied");
  }

  return (
    <div className="space-y-4">
      {/* Language + examples */}
      <div className="card-soft p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Generate in:</label>
            <div className="relative">
              <button onClick={() => setShowLangPicker(v => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium">
                {genLanguage} <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {showLangPicker && (
                <div className="absolute top-full left-0 mt-1 z-20 w-48 rounded-lg border border-border bg-background shadow-lg p-1 max-h-60 overflow-y-auto">
                  {LANGUAGES.map(l => (
                    <button key={l} onClick={() => { setGenLanguage(l); setShowLangPicker(false); setMessages([]); }}
                      className={`w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-accent ${genLanguage === l ? "text-primary font-semibold" : ""}`}>
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {messages.length > 0 && (
            <button onClick={() => setMessages([])}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent">
              <RotateCcw className="h-3 w-3" /> Clear chat
            </button>
          )}
        </div>
        {messages.length === 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Example requests:</p>
            <div className="flex flex-wrap gap-2">
              {GEN_EXAMPLES.map(ex => (
                <button key={ex} onClick={() => useExample(ex)}
                  className="rounded-full border border-border bg-background px-3 py-1 text-xs hover:bg-accent text-left max-w-[260px] truncate">
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chat window */}
      {messages.length > 0 && (
        <div className="card-soft p-4 space-y-4 max-h-[600px] overflow-y-auto">
          {messages.map((msg, i) => (
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
                    <CopyBtn text={msg.content} />
                  </div>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Generating {genLanguage} code…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input box */}
      <div className="card-soft p-3">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !loading) { e.preventDefault(); send(); } }}
            placeholder={messages.length === 0
              ? `Describe the ${genLanguage} code you want to generate…`
              : "Ask a follow-up — add error handling, convert to async, add tests…"}
            rows={3}
            className="flex-1 rounded-lg border border-input bg-background p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button onClick={send} disabled={loading || !input.trim()}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground px-1">Press Enter to send · Shift+Enter for new line · Ask follow-ups to refine the code</p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
function CodeTutorPage() {
  const { user } = Route.useRouteContext();
  const [activeTab, setActiveTab] = useState<Tab>("analyze");
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "code_tutor");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Code2 className="h-5 w-5 text-primary" /> Code Tutor
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Analyze existing code or generate new code in any programming language
          </p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1 w-fit">
        <button onClick={() => setActiveTab("analyze")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === "analyze" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Bug className="h-4 w-4" /> Analyze Code
        </button>
        <button onClick={() => setActiveTab("generate")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === "generate" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Sparkles className="h-4 w-4" /> Generate Code
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "analyze"
        ? <AnalyzeTab quota={quota} quotaLoading={quotaLoading} bump={bump} />
        : <GenerateTab quota={quota} quotaLoading={quotaLoading} bump={bump} />}

      {/* Tips */}
      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-2">
          {activeTab === "analyze" ? "💡 Analyze tips" : "💡 Generate tips"}
        </p>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4 text-xs text-muted-foreground">
          {activeTab === "analyze" ? <>
            <span>• Select the correct language for accurate analysis</span>
            <span>• Paste complete functions — not fragments</span>
            <span>• Use "Debug" to find errors, "Fix" for corrected code</span>
            <span>• Ask a specific question for targeted help</span>
          </> : <>
            <span>• Be specific — describe inputs, outputs, and edge cases</span>
            <span>• Ask follow-ups: "add error handling", "make it async"</span>
            <span>• Request tests: "write unit tests for this"</span>
            <span>• Ask to convert: "rewrite this in TypeScript"</span>
          </>}
        </div>
      </div>
    </div>
  );
}
