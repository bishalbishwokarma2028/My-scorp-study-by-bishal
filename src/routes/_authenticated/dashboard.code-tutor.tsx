import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  Loader2, Code2, Bug, Zap, ClipboardCheck, ArrowRightLeft,
  BookOpen, Copy, Check, RotateCcw, Send, Sparkles, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { askAI, type HistoryMsg } from "@/lib/aiProvider";
import { ProviderBadge, QuotaBadge } from "@/components/ai-ui";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { usePageState } from "@/lib/pageState";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function numberedCode(code: string): string {
  return code.split("\n").map((l, i) => `${String(i + 1).padStart(3, " ")} | ${l}`).join("\n");
}

// ─── Deep, line-referenced prompts ────────────────────────────────────────────
function buildAnalyzePrompt(code: string, language: string, mode: Mode, targetLang: string, question: string): string {
  const lined = numberedCode(code);
  const header = `Language: ${language}\n\`\`\`\n${lined}\n\`\`\`\n\n`;
  const lineCount = code.split("\n").length;

  switch (mode) {
    case "explain":
      return `${header}You are an expert ${language} tutor. Explain this code completely — as if teaching a complete beginner. Every line must be covered. Use the line numbers shown above in your explanation (e.g. "**Line 5**:", "**Lines 3–7**:").

## 🧭 What This Code Does
(2–4 sentences: overall purpose of the program)

## 📦 Imports / Dependencies (if any)
(Explain every import/include/require — what library it is and why it is needed)

## 🔢 Line-by-Line Walkthrough
Go through ALL ${lineCount} lines in order. For every meaningful line or logical block, write:
**Line X** (or **Lines X–Y**): [exactly what this line does, why it is written this way, what would happen if it were missing or wrong]

Do NOT skip any line. Even blank lines or closing braces should be briefly mentioned when relevant.

## 🧠 Key Concepts Explained
(List every programming concept used — loops, functions, data structures, algorithms, OOP, recursion, etc. — and explain each one from scratch as if the reader never heard of it)

## 🔄 Data Flow & Execution Order
(Trace how data moves through the program from start to finish with a real example input)

## ✅ What the Output Will Be
(Show exactly what the program prints/returns for a sample input, step by step)

Be thorough. This explanation should be complete enough that someone who has never coded can follow every step.`;

    case "debug":
      return `${header}You are an expert ${language} debugger. Examine EVERY SINGLE LINE of this code. Use the line numbers shown above.

## 🔍 Line-by-Line Scan
Go through every line and classify it:
- ✅ Correct
- ⚠️ Warning / bad practice
- ❌ Bug

Format as a table:
| Line | Code | Status | Note |
|------|------|--------|------|
(fill for every line — even correct ones get ✅)

## 🐛 Bugs Found (Detailed)
For each ❌ bug found:

### Bug [N]: [Short descriptive name]
- **Line**: [exact line number]
- **Type**: Syntax / Logic / Runtime / Type / Edge-case error
- **Root Cause**: [deep explanation of WHY this is wrong]
- **Impact**: [what goes wrong when this runs]
- **Fix**:
\`\`\`${language.toLowerCase()}
[corrected line or block — exact replacement]
\`\`\`

## ⚠️ Warnings & Bad Practices
(Line-referenced list of non-fatal issues: naming, missing error handling, edge cases, etc.)

## ✅ Final Verdict
- Total bugs: [N]
- Severity: [Critical / Major / Minor]
- [1-sentence conclusion]

Be exhaustive — a missed bug is a failure.`;

    case "fix":
      return `${header}You are an expert ${language} engineer. Find and fix EVERY issue in this code. Use the line numbers shown above.

## 🔍 Issues Found
List every problem with its exact line number:
- **Line X** — [what is wrong and why]
(List ALL issues — bugs, bad practices, missing error handling, edge cases)

## ✅ Complete Fixed Code
\`\`\`${language.toLowerCase()}
[The ENTIRE corrected code — every single line. Never write "rest remains same" or omit anything.]
\`\`\`

## 📝 Changes Explained (Line by Line)
For every change made, explain:
- **Line X**: Changed \`[old code]\` → \`[new code]\` because [detailed reason]

## 🧪 Verification
(Mentally run the fixed code with a sample input and show the expected output — prove it works)

Rules:
- ALWAYS include 100% complete corrected code — nothing omitted
- If code was already correct, say so and return it unchanged with explanation`;

    case "optimize":
      return `${header}You are an expert ${language} performance engineer. Optimize this code fully. Use the line numbers shown above.

## 📊 Current Code Analysis
- **Time Complexity**: [Big-O with explanation]
- **Space Complexity**: [Big-O with explanation]
- **Performance Issues** (line-referenced):
  - **Line X**: [what is slow and why]
- **Code Quality Issues** (line-referenced):
  - **Line X**: [readability/style problem]

## ⚡ Optimized Code
\`\`\`${language.toLowerCase()}
[Complete optimized code — every line]
\`\`\`

## 📈 What Changed & Why (Line by Line)
- **Line X → New Line Y**: [what changed, why it's faster/cleaner, expected impact]

## 📊 After Optimization
- **Time Complexity**: [new Big-O]
- **Space Complexity**: [new Big-O]
- **Speed Improvement**: [estimated gain]

Apply: algorithmic improvements, language idioms, proper data structures, readable naming, reduced redundancy.`;

    case "review":
      return `${header}You are a senior ${language} engineer doing a professional code review. Use the line numbers shown above in ALL comments.

## 📋 Scorecard

| Category | Grade | Summary |
|----------|-------|---------|
| Correctness | [A–F] | [1 line] |
| Readability | [A–F] | [1 line] |
| Performance | [A–F] | [1 line] |
| Security | [A–F] | [1 line] |
| Best Practices | [A–F] | [1 line] |
| Error Handling | [A–F] | [1 line] |

**Overall Grade: [A–F]**

## 🔍 Line-by-Line Commentary
Go through every significant line or block and comment on it — what it does well, what is wrong, what could be improved. Always reference the exact line:
- **Line X**: [comment]

## 📋 Detailed Category Analysis

### Correctness
[Does the code correctly solve the problem? Reference specific lines where correctness issues exist]

### Readability & Maintainability
[Naming conventions, comments, code structure — reference specific lines]

### Performance
[Time/space complexity issues — reference specific lines]

### Security
[Injection risks, input validation, data exposure — reference specific lines]

### Best Practices
[Design patterns, error handling, testing — reference specific lines]

## 🛠️ Top Improvements (Priority Order)
For each improvement, give exact line number and corrected code:

### 1. [Title] — Line X
**Problem**: [what and why]
**Fix**:
\`\`\`${language.toLowerCase()}
[corrected snippet]
\`\`\`

(Repeat for all significant improvements)

## 💡 Conclusion
[3–4 sentences: overall code quality, biggest strength, biggest weakness, recommended next steps]`;

    case "convert":
      return `${header}Convert this ${language} code to ${targetLang} completely and correctly.

## 🔄 Converted ${targetLang} Code
\`\`\`${targetLang.toLowerCase()}
[Complete converted code — NEVER omit any part or use placeholders]
\`\`\`

## 📌 Key Differences: ${language} vs ${targetLang}
(List every language feature that required a different approach, with before/after examples)

## 🗺️ Line Mapping
| Original ${language} Line | Converted ${targetLang} | Notes |
|---|---|---|
(Map the key lines so the developer can follow the conversion)

## ⚠️ Notes & Caveats
(Behavioral differences, missing features, things the developer must know)

Rules:
- Complete code only — no "// rest of code" or omissions
- Use idiomatic ${targetLang} patterns, not literal translations`;

    default:
      if (question.trim()) {
        return `${header}The student asks: "${question}"\n\nAnswer in detail with line references (e.g. "Line 5 does X because..."). Use code examples and markdown. Explain every concept from scratch.`;
      }
      return `${header}Explain this ${language} code line by line, referencing each line number.`;
  }
}

// ─── Line highlight parser ─────────────────────────────────────────────────────
function parseHighlightedLines(text: string): Set<number> {
  const lines = new Set<number>();
  const rangeRe = /[Ll]ines?\s+(\d+)\s*[–\-]\s*(\d+)/g;
  const singleRe = /[Ll]ine\s+(\d+)/g;
  const pipeRe = /^\|\s*(\d+)\s*\|/gm;
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(text)) !== null) {
    const a = parseInt(m[1]), b = parseInt(m[2]);
    for (let i = a; i <= Math.min(b, a + 30); i++) lines.add(i);
  }
  while ((m = singleRe.exec(text)) !== null) lines.add(parseInt(m[1]));
  while ((m = pipeRe.exec(text)) !== null) lines.add(parseInt(m[1]));
  return lines;
}

// ─── Line-numbered code viewer with highlights ────────────────────────────────
function CodeViewer({ code, highlightedLines }: { code: string; highlightedLines: Set<number> }) {
  const codeLines = code.split("\n");
  return (
    <div className="rounded-lg overflow-hidden border border-slate-700 text-xs font-mono">
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto bg-slate-950">
        {codeLines.map((line, i) => {
          const n = i + 1;
          const hi = highlightedLines.has(n);
          return (
            <div key={n} className={`flex min-w-0 ${hi ? "bg-amber-400/15 border-l-2 border-amber-400" : "border-l-2 border-transparent"}`}>
              <span className={`select-none shrink-0 w-9 text-right pr-2 py-0.5 pl-1 ${hi ? "text-amber-400 font-bold" : "text-slate-600"}`}>{n}</span>
              <span className={`py-0.5 px-2 whitespace-pre flex-1 min-w-0 ${hi ? "text-amber-100" : "text-slate-200"}`}>{line || " "}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Inject inline code snippets next to line references in AI result ─────────
function injectCodeSnippets(markdown: string, code: string): string {
  if (!code.trim()) return markdown;
  const codeLines = code.split("\n");
  const total = codeLines.length;

  function snippet(start: number, end: number): string {
    start = Math.max(0, start);
    end = Math.min(total - 1, end);
    if (start > end) return "";
    return codeLines.slice(start, end + 1)
      .map((l, i) => `${String(start + i + 1).padStart(3, " ")} | ${l}`)
      .join("\n");
  }

  // Match **Lines X–Y**: or **Line X**: patterns (bold style from AI output)
  return markdown
    .replace(/(\*\*[Ll]ines?\s+(\d+)\s*[–\-]\s*(\d+)\*\*:?)/g, (m, _, rs, re) => {
      const s = snippet(parseInt(rs) - 1, parseInt(re) - 1);
      return s ? `${m}\n\`\`\`\n${s}\n\`\`\`` : m;
    })
    .replace(/(\*\*[Ll]ine\s+(\d+)\*\*:?)/g, (m, _, ln) => {
      const s = snippet(parseInt(ln) - 1, parseInt(ln) - 1);
      return s ? `${m}\n\`\`\`\n${s}\n\`\`\`` : m;
    });
}

// ─── Section colour map for h2 headings ───────────────────────────────────────
function sectionStyle(text: string): { bg: string; border: string; fg: string } {
  const t = text.toLowerCase();
  if (t.includes("🧭") || t.includes("what this"))   return { bg: "bg-blue-50",    border: "border-l-4 border-blue-400",    fg: "text-blue-800"   };
  if (t.includes("📦") || t.includes("import"))      return { bg: "bg-orange-50",  border: "border-l-4 border-orange-400",  fg: "text-orange-800" };
  if (t.includes("🔢") || t.includes("line-by"))     return { bg: "bg-emerald-50", border: "border-l-4 border-emerald-400", fg: "text-emerald-800"};
  if (t.includes("🧠") || t.includes("concept"))     return { bg: "bg-violet-50",  border: "border-l-4 border-violet-400",  fg: "text-violet-800" };
  if (t.includes("🔄") || t.includes("data flow"))   return { bg: "bg-cyan-50",    border: "border-l-4 border-cyan-400",    fg: "text-cyan-800"   };
  if (t.includes("✅") || t.includes("output"))      return { bg: "bg-teal-50",    border: "border-l-4 border-teal-400",    fg: "text-teal-800"   };
  if (t.includes("🔍") || t.includes("scan"))        return { bg: "bg-red-50",     border: "border-l-4 border-red-400",     fg: "text-red-800"    };
  if (t.includes("⚠️") || t.includes("note"))        return { bg: "bg-amber-50",   border: "border-l-4 border-amber-400",   fg: "text-amber-800"  };
  if (t.includes("💡") || t.includes("tip"))         return { bg: "bg-yellow-50",  border: "border-l-4 border-yellow-400",  fg: "text-yellow-800" };
  if (t.includes("📊") || t.includes("score"))       return { bg: "bg-indigo-50",  border: "border-l-4 border-indigo-400",  fg: "text-indigo-800" };
  if (t.includes("🔑") || t.includes("key"))         return { bg: "bg-rose-50",    border: "border-l-4 border-rose-400",    fg: "text-rose-800"   };
  return                                               { bg: "bg-slate-50",   border: "border-l-4 border-slate-400",   fg: "text-slate-800"  };
}

// ─── Rich markdown renderer for explain / analysis results ────────────────────
function RichMarkdown({ content }: { content: string }) {
  const components: Components = {
    h1: ({ children }) => (
      <div className="mt-6 mb-3 pb-2 border-b-2 border-primary/20">
        <span className="text-base font-bold text-foreground">{children}</span>
      </div>
    ),
    h2: ({ children }) => {
      const text = String(children);
      const s = sectionStyle(text);
      return (
        <div className={`flex items-start gap-3 mt-5 mb-3 px-4 py-2.5 rounded-lg ${s.bg} ${s.border}`}>
          <span className={`text-sm font-bold leading-snug ${s.fg}`}>{children}</span>
        </div>
      );
    },
    h3: ({ children }) => (
      <div className="flex items-center gap-2 mt-4 mb-1.5">
        <span className="h-3.5 w-1 rounded-full bg-primary flex-shrink-0" />
        <span className="text-sm font-semibold text-foreground">{children}</span>
      </div>
    ),
    strong: ({ children }) => (
      <strong className="bg-amber-100 text-amber-900 px-0.5 rounded font-semibold">{children}</strong>
    ),
    em: ({ children }) => (
      <em className="text-violet-700 not-italic font-medium">{children}</em>
    ),
    pre: ({ children }) => (
      <div className="my-3 rounded-xl bg-slate-900 border border-slate-700 overflow-hidden shadow-sm">
        {children}
      </div>
    ),
    code: ({ children, className }) => {
      const isBlock = Boolean(className) || String(children).includes("\n");
      if (isBlock) {
        return (
          <code className={`block p-4 text-slate-100 text-[11px] font-mono overflow-x-auto whitespace-pre leading-relaxed ${className ?? ""}`}>
            {children}
          </code>
        );
      }
      return (
        <code className="rounded-md bg-blue-50 border border-blue-200 text-blue-700 px-1.5 py-0.5 text-[11px] font-mono font-semibold">
          {children}
        </code>
      );
    },
    blockquote: ({ children }) => (
      <div className="my-3 rounded-r-lg border-l-4 border-blue-400 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        {children}
      </div>
    ),
    p: ({ children }) => (
      <p className="text-sm leading-relaxed text-foreground mb-2 break-words">{children}</p>
    ),
    ul: ({ children }) => <ul className="my-2 space-y-1 list-none pl-0">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 space-y-1 list-decimal pl-5">{children}</ol>,
    li: ({ children }) => (
      <li className="flex items-start gap-2 text-sm leading-relaxed">
        <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
        <span className="break-words min-w-0">{children}</span>
      </li>
    ),
    table: ({ children }) => (
      <div className="my-3 overflow-x-auto rounded-xl border border-border shadow-sm">
        <table className="w-full text-xs border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-slate-800 text-slate-100">{children}</thead>,
    th: ({ children }) => (
      <th className="px-3 py-2.5 text-left font-semibold text-xs tracking-wide">{children}</th>
    ),
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr className="border-b border-border even:bg-slate-50/70">{children}</tr>,
    td: ({ children }) => (
      <td className="px-3 py-2 text-sm break-words">{children}</td>
    ),
    hr: () => <hr className="my-4 border-border" />,
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}

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

  const [loading,  setLoading]  = useState(false);
  const [editMode, setEditMode] = useState(true);

  const selectedMode = MODES.find(m => m.id === s.mode)!;
  const highlightedLines = s.result ? parseHighlightedLines(s.result) : new Set<number>();
  const hasHighlights = highlightedLines.size > 0;

  async function analyze() {
    if (!s.code.trim()) return toast.error("Paste some code first");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true); set({ result: null });
    setEditMode(false);

    const prompt = buildAnalyzePrompt(s.code, s.language, s.mode, s.targetLang, s.question);
    const res = await askAI(prompt,
      `You are Bishal's Code Tutor — an expert ${s.language} programming tutor. You give deep, line-by-line explanations referencing exact line numbers from the numbered code provided. Every explanation starts from the very first line. You never skip lines. You explain every concept from scratch. Use markdown with code blocks. Be thorough and educational.`);
    set({ provider: res.provider, result: res.text });
    await bump();
    setLoading(false);
  }

  function reset() {
    set({ code: "", result: null, provider: null, question: "" });
    setEditMode(true);
  }

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:h-[calc(100vh-18rem)] lg:overflow-hidden">
      {/* Left: inputs */}
      <div className="space-y-4 overflow-x-hidden lg:overflow-y-auto lg:h-full lg:pr-1">
        <div className="card-soft p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Language</label>
            <select value={s.language} onChange={e => { set({ language: e.target.value }); setEditMode(true); }}
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

        {/* Code input — textarea OR highlighted viewer */}
        <div className="card-soft p-4 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Code</label>
            {s.result && s.code && (
              <div className="flex items-center gap-1 rounded-full border border-border bg-muted p-0.5">
                <button onClick={() => setEditMode(true)}
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${editMode ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}>
                  Edit
                </button>
                <button onClick={() => setEditMode(false)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${!editMode ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}>
                  {hasHighlights && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />}
                  View {hasHighlights ? `(${highlightedLines.size} lines highlighted)` : ""}
                </button>
              </div>
            )}
          </div>
          {editMode ? (
            <textarea value={s.code} onChange={e => set({ code: e.target.value })}
              placeholder={`Paste your ${s.language} code here…`}
              rows={14} spellCheck={false}
              className="w-full rounded-lg border border-input bg-background p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
          ) : (
            <CodeViewer code={s.code} highlightedLines={highlightedLines} />
          )}
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
          {(s.result || s.code) && (
            <button onClick={reset}
              className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>

      </div>

      {/* Right: analysis result */}
      <div className="card-soft p-4 space-y-3 min-h-[400px] overflow-x-hidden lg:overflow-y-auto lg:h-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {s.result ? `${selectedMode.label} Result` : "Output"}
            </span>
            {hasHighlights && s.result && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />
                {highlightedLines.size} lines highlighted in code
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ProviderBadge provider={s.provider} />
            {s.result && <CopyBtn text={s.result} />}
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Bishal's Code Tutor is analyzing…</p>
            <p className="text-xs text-muted-foreground">Doing a deep line-by-line analysis…</p>
          </div>
        )}
        {!loading && !s.result && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted">
              <Code2 className="h-8 w-8 opacity-40" />
            </div>
            <p className="text-sm font-medium">Paste code and choose a mode</p>
            <p className="text-xs">The AI will explain every line with exact line references</p>
          </div>
        )}
        {!loading && s.result && (
          <div className="w-full min-w-0 overflow-x-auto max-w-full">
            <RichMarkdown content={injectCodeSnippets(s.result, s.code)} />
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
