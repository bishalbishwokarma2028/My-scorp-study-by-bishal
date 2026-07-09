import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import React from "react";
import { Loader2, Delete, ArrowLeftRight, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askAI } from "@/lib/aiProvider";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge } from "@/components/ai-ui";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/calculator")({
  component: CalculatorPage,
});

type Tab = "basic" | "scientific" | "formula" | "convert";
type AngleMode = "DEG" | "RAD" | "GRAD";

/* ─── math helpers ────────────────────────────────────────────────────── */
function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  if (n === 0 || n === 1) return 1;
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
function nPr(n: number, r: number): number {
  if (r > n || n < 0 || r < 0) return NaN;
  return factorial(n) / factorial(n - r);
}
function nCr(n: number, r: number): number {
  if (r > n || n < 0 || r < 0) return NaN;
  return factorial(n) / (factorial(r) * factorial(n - r));
}

/* ─── exact/fraction display for trig & common irrational results ──────── */
function decimalToFraction(x: number, tolerance = 1e-9, maxDenom = 1000): string | null {
  const sign = x < 0 ? "-" : "";
  const ax = Math.abs(x);
  if (Math.abs(ax - Math.round(ax)) < tolerance) return null;
  let h1 = 1, h2 = 0, k1 = 0, k2 = 1, b = ax;
  for (let i = 0; i < 25; i++) {
    const a = Math.floor(b);
    const th1 = a * h1 + h2; h2 = h1; h1 = th1;
    const tk1 = a * k1 + k2; k2 = k1; k1 = tk1;
    if (k1 > maxDenom) break;
    if (Math.abs(ax - h1 / k1) < tolerance) break;
    const frac = b - a;
    if (frac < 1e-12) break;
    b = 1 / frac;
  }
  if (k1 <= 1 || k1 > maxDenom || h1 > maxDenom) return null;
  if (Math.abs(ax - h1 / k1) > 1e-6) return null;
  return `${sign}${h1}/${k1}`;
}

const NICE_VALUES: [number, string][] = [
  [0, "0"], [1, "1"], [-1, "-1"],
  [0.5, "1/2"], [-0.5, "-1/2"],
  [Math.sqrt(3) / 2, "√3/2"], [-Math.sqrt(3) / 2, "-√3/2"],
  [Math.sqrt(2) / 2, "√2/2"], [-Math.sqrt(2) / 2, "-√2/2"],
  [Math.sqrt(3), "√3"], [-Math.sqrt(3), "-√3"],
  [1 / Math.sqrt(3), "√3/3"], [-1 / Math.sqrt(3), "-√3/3"],
  [Math.sqrt(2), "√2"], [-Math.sqrt(2), "-√2"],
  [Math.PI, "π"], [Math.PI / 2, "π/2"], [Math.PI / 3, "π/3"], [Math.PI / 4, "π/4"], [Math.PI / 6, "π/6"],
  [2 * Math.PI, "2π"],
];

function toNiceForm(x: number): string | null {
  if (!Number.isFinite(x)) return null;
  for (const [v, label] of NICE_VALUES) {
    if (Math.abs(x - v) < 1e-9) return label;
  }
  return decimalToFraction(x);
}

/* ─── Main page ───────────────────────────────────────────────────────── */
function CalculatorPage() {
  const { user } = Route.useRouteContext();
  const [tab, setTab] = useState<Tab>("basic");
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState("");
  const [niceResult, setNiceResult] = useState<string | null>(null);
  const [history, setHistory] = useState<{ expr: string; result: string }[]>([]);
  const [angleMode, setAngleMode] = useState<AngleMode>("DEG");
  const [inv, setInv] = useState(false);
  const [memory, setMemory] = useState(0);
  const [copied, setCopied] = useState(false);

  function compute() {
    if (!expr.trim()) return;
    try {
      const rad = angleMode === "DEG" ? "Math.PI/180" : angleMode === "GRAD" ? "Math.PI/200" : "1";
      const prelude = `const _r=${rad};
        const sin=(x)=>Math.sin(x*_r), cos=(x)=>Math.cos(x*_r), tan=(x)=>Math.tan(x*_r),
              asin=(x)=>Math.asin(x)/_r, acos=(x)=>Math.acos(x)/_r, atan=(x)=>Math.atan(x)/_r,
              sinh=Math.sinh, cosh=Math.cosh, tanh=Math.tanh,
              log=Math.log10, ln=Math.log, sqrt=Math.sqrt, cbrt=Math.cbrt,
              abs=Math.abs, pow=Math.pow, floor=Math.floor, ceil=Math.ceil,
              round=Math.round, sign=Math.sign,
              pi=Math.PI, e=Math.E, PI=Math.PI, E=Math.E,
              fact=(n)=>${factorial.toString().replace("function factorial", "function fact")}(n),
              nPr=(n,r)=>${nPr.toString()}(n,r),
              nCr=(n,r)=>${nCr.toString()}(n,r),
              log2=Math.log2, exp=(x)=>Math.exp(x), tenX=(x)=>Math.pow(10,x);`;
      const sanitized = expr
        .replace(/\^/g, "**").replace(/×/g, "*").replace(/÷/g, "/")
        .replace(/mod/g, "%").replace(/π/g, "pi");
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const raw = Function(`"use strict"; ${prelude} return (${sanitized})`)();
      let r: string;
      let nice: string | null = null;
      if (typeof raw === "number") {
        if (!Number.isFinite(raw)) {
          r = raw === Infinity ? "∞" : raw === -Infinity ? "-∞" : "Error";
        } else {
          nice = toNiceForm(raw);
          r = Math.abs(raw) < 1e-10 && raw !== 0 ? raw.toExponential(6) : +raw.toPrecision(12) + "";
        }
      } else {
        r = String(raw);
      }
      setResult(r);
      setNiceResult(nice && nice !== r ? nice : null);
      setHistory(h => [{ expr, result: nice && nice !== r ? `${r} = ${nice}` : r }, ...h].slice(0, 20));
    } catch { setResult("Error"); setNiceResult(null); }
  }

  function press(k: string) {
    if (k === "=")   { compute(); return; }
    if (k === "C")   { setExpr(""); setResult(""); setNiceResult(null); return; }
    if (k === "⌫")   { setExpr(e => e.slice(0, -1)); return; }
    if (k === "x²")  { setExpr(e => `(${e || result})^2`); return; }
    if (k === "x³")  { setExpr(e => `(${e || result})^3`); return; }
    if (k === "1/x") { setExpr(e => `1/(${e || result})`); return; }
    if (k === "n!")  { setExpr(e => `fact(${e || result})`); return; }
    if (k === "10^x") { setExpr(e => `tenX(${e || result})`); return; }
    if (k === "e^x")  { setExpr(e => `exp(${e || result})`); return; }
    if (k === "%") {
      setExpr(e => {
        const match = e.match(/^(.*?)(-?\d+(?:\.\d+)?)$/);
        if (match) {
          const base = match[1], num = parseFloat(match[2]);
          if (!isNaN(num)) return base + (num / 100);
        }
        return e + "/100";
      });
      return;
    }
    if (k === "+/-") { setExpr(e => e.startsWith("-") ? e.slice(1) : "-" + e); return; }
    setExpr(e => e + k);
  }

  function memClear()  { setMemory(0); toast.success("Memory cleared"); }
  function memRecall() { if (memory !== 0) setExpr(e => e + memory); }
  function memAdd()    { const v = parseFloat(result); if (!isNaN(v)) { setMemory(m => m + v); toast.success(`M+ ${v}`); } }
  function memSub()    { const v = parseFloat(result); if (!isNaN(v)) { setMemory(m => m - v); toast.success(`M− ${v}`); } }

  function copyResult() {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success("Result copied!");
    setTimeout(() => setCopied(false), 1500);
  }

  /* keyboard support */
  useEffect(() => {
    if (tab !== "basic" && tab !== "scientific") return;
    function onKey(ev: KeyboardEvent) {
      const target = ev.target as HTMLElement;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const k = ev.key;
      if (/^[0-9.]$/.test(k)) { press(k); return; }
      if (k === "+" || k === "-" ) { press(k); return; }
      if (k === "*") { press("×"); return; }
      if (k === "/") { ev.preventDefault(); press("÷"); return; }
      if (k === "^") { press("^"); return; }
      if (k === "(" || k === ")") { press(k); return; }
      if (k === "%") { press("%"); return; }
      if (k === "Enter" || k === "=") { ev.preventDefault(); compute(); return; }
      if (k === "Backspace") { press("⌫"); return; }
      if (k === "Escape") { press("C"); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const BASIC_KEYS = [
    ["C", "+/-", "%", "÷"],
    ["7", "8", "9", "×"],
    ["4", "5", "6", "-"],
    ["1", "2", "3", "+"],
    ["0", ".", "⌫", "="],
  ];

  const SCI_ROWS: string[][] = inv
    ? [
        ["asin(", "acos(", "atan(", "10^x", "e^x", "abs("],
        ["x²",    "x³",    "n!",    "π",    "e",   "%"   ],
        ["(",     ")",     "^",     "mod",  "nCr(","nPr("],
        ["sinh(", "cosh(", "tanh(", "floor(","ceil(","1/x"],
      ]
    : [
        ["sin(",  "cos(",  "tan(",  "log(",  "ln(",  "abs("],
        ["sqrt(", "cbrt(", "n!",    "π",     "e",    "%"   ],
        ["(",     ")",     "^",     "mod",   "nCr(", "nPr("],
        ["sinh(", "cosh(", "tanh(", "floor(","ceil(","1/x" ],
      ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-white p-1.5 shadow-sm flex gap-1 overflow-x-auto">
        {(["basic", "scientific", "formula", "convert"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold capitalize transition whitespace-nowrap ${tab === t ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md" : "text-muted-foreground hover:bg-accent"}`}>
            {t === "convert" ? "Unit Converter" : t === "formula" ? "Formula Helper" : t === "scientific" ? "Scientific" : "Basic"}
          </button>
        ))}
      </div>

      {(tab === "basic" || tab === "scientific") && (
        <div className={`mx-auto ${tab === "scientific" ? "max-w-lg" : "max-w-sm"}`}>
          <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
            <div className="bg-slate-900 px-5 py-4 text-right min-h-[104px]">
              <div className="flex items-center justify-between mb-2">
                {tab === "scientific" ? (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setAngleMode(m => m === "DEG" ? "RAD" : m === "RAD" ? "GRAD" : "DEG")}
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border transition ${angleMode === "DEG" ? "border-amber-400 text-amber-300" : angleMode === "RAD" ? "border-blue-400 text-blue-300" : "border-emerald-400 text-emerald-300"}`}>
                      {angleMode}
                    </button>
                    <button onClick={() => setInv(v => !v)}
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border transition ${inv ? "border-fuchsia-400 text-fuchsia-300 bg-fuchsia-950" : "border-slate-600 text-slate-400"}`}>
                      INV
                    </button>
                  </div>
                ) : <div />}
                <div className="flex items-center gap-2">
                  {memory !== 0 && <span className="text-[10px] font-bold text-cyan-300">M={+memory.toPrecision(6)}</span>}
                  <button onClick={() => setHistory([])} className="text-[10px] text-slate-500 hover:text-slate-300">Clear history</button>
                </div>
              </div>
              <div className="text-slate-400 text-sm font-mono min-h-[20px] truncate text-right">{expr || "0"}</div>
              <div className="flex items-center justify-end gap-2 mt-1">
                {result && (
                  <button onClick={copyResult} className="text-slate-500 hover:text-slate-300 flex-shrink-0">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                )}
                <div className="text-white text-3xl font-bold font-mono truncate">{result || "0"}</div>
              </div>
              {niceResult && (
                <div className="text-fuchsia-300 text-sm font-mono mt-0.5">= {niceResult}</div>
              )}
            </div>

            <div className="grid grid-cols-4 gap-px bg-slate-700 p-px">
              {["MC", "MR", "M+", "M-"].map(m => (
                <button key={m} onClick={() => m === "MC" ? memClear() : m === "MR" ? memRecall() : m === "M+" ? memAdd() : memSub()}
                  className="bg-slate-800 hover:bg-slate-700 text-cyan-300 py-2 text-[11px] font-mono font-bold transition">
                  {m}
                </button>
              ))}
            </div>

            {tab === "scientific" && (
              <div className="bg-slate-800 p-1">
                {SCI_ROWS.map((row, ri) => (
                  <div key={ri} className="grid grid-cols-6 gap-px mb-px">
                    {row.map((k) => (
                      <button key={k} onClick={() => press(k)}
                        className="bg-slate-700 hover:bg-slate-600 text-slate-200 py-2.5 text-[11px] font-mono font-semibold transition rounded-sm">
                        {k}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-4 gap-px bg-slate-200 p-px">
              {BASIC_KEYS.flat().map((k, idx) => {
                const isOp  = ["÷","×","-","+"].includes(k);
                const isEq  = k === "=";
                const isDel = k === "C" || k === "⌫";
                return (
                  <button key={`${k}-${idx}`} onClick={() => press(k)}
                    className={`py-4 text-sm font-semibold transition select-none
                      ${isEq  ? "bg-violet-600 text-white hover:bg-violet-500" :
                        isOp  ? "bg-amber-400 text-white hover:bg-amber-300" :
                        isDel ? "bg-slate-400 text-white hover:bg-slate-300" :
                                "bg-white text-slate-900 hover:bg-slate-100"}`}>
                    {k === "⌫" ? <Delete className="h-4 w-4 mx-auto" /> : k}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            ⌨️ Keyboard supported — type numbers & operators, Enter to calculate
          </p>

          {history.length > 0 && (
            <div className="mt-3 rounded-xl border border-border bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">History</p>
                <button onClick={() => setHistory([])} className="text-xs text-muted-foreground hover:text-destructive">Clear</button>
              </div>
              <ul className="space-y-1">
                {history.map((h, i) => (
                  <li key={i} onClick={() => { setExpr(h.expr); setResult(h.result.split(" = ")[0]); }}
                    className="flex items-center justify-between cursor-pointer rounded-lg px-2 py-1.5 text-xs hover:bg-accent transition">
                    <span className="text-muted-foreground font-mono truncate">{h.expr}</span>
                    <span className="font-semibold font-mono ml-2 flex-shrink-0">= {h.result}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === "formula"  && <FormulaHelper userId={user.id} />}
      {tab === "convert"  && <UnitConverter />}
    </div>
  );
}

/* ─── Formula Helper ──────────────────────────────────────────────────── */
function FormulaHelper({ userId }: { userId: string }) {
  const [q, setQ] = useState("");
  const [ans, setAns] = useState("");
  const [loading, setLoading] = useState(false);
  const { quota, quotaLoading, bump } = useUsageLimit(userId, "cerebras");

  async function ask() {
    if (!q.trim()) return;
    if (quota && quota.remaining <= 0) { toast.error(QUOTA_MESSAGE); return; }
    setLoading(true); setAns("");
    const res = await askAI(
      `Explain this formula or mathematical/scientific concept in FULL, LONG-FORM detail — do not be brief:\n\n"${q}"\n\nUse this exact structure:\n\n## 📌 The Formula\n\`\`\`\n[Write the formula clearly]\n\`\`\`\n[2-3 sentences on what this formula is used for and where it comes from]\n\n## 🔍 What Each Variable Means\n- **Variable1 (symbol):** what it represents, its unit, and typical values\n(cover every variable/constant in the formula)\n\n## 🧮 Derivation\nDerive this formula from first principles, step by step. Show at least 6-8 derivation steps, formatted as a NUMBERED LIST like "1. **Step title.** Explanation sentence(s) for why this step is valid." — put the bolded step title and its explanation IN THE SAME numbered list item, not as a separate heading line above a separate paragraph. If the formula is definitional rather than derivable, explain the reasoning and physical/mathematical intuition behind why it is defined this way instead, using the same numbered format.\n\n## 💡 Step-by-Step Example (Easy)\n1. [State the problem]\n2. [Substitute values]\n3. [Calculate step by step]\n4. [Final answer with units]\n\n## 🔥 Hard Example (Challenging)\nGive a genuinely challenging, multi-step problem that requires combining this formula with at least one other concept or multiple steps of algebra/reasoning. Solve it completely as a numbered list, step by step, explaining the reasoning at each step, and give the final answer with correct units.\n\n## 🧠 Key Points to Remember\n- **Important fact**\n- **Common mistake:** ...\n(list at least 4-5 points)\n\n## ✅ Quick Recap\n[3-4 sentence summary]\n\nBe thorough and detailed throughout — long, complete explanations are required, not short ones. Use **bold** for every key term, variable, and important number.\n\nFORMATTING RULE (very important): NEVER put a bolded title/label as its own standalone line immediately followed by a separate paragraph of explanation directly underneath it with no list marker — this creates cramped, hard-to-read text. Instead, always combine a bolded label with its explanation in the SAME numbered-list item or the same paragraph/sentence, e.g. "1. **Define the electric field.** The electric field is..." NOT "**Define the electric field.**" on its own line followed by a new paragraph below.\n\nMATH NOTATION RULES (very important, follow exactly):\n- NEVER use LaTeX syntax of any kind. Do NOT write \\text{}, \\times, \\left, \\right, \\approx, \\cdot, ^{...}, _{...}, \\frac{}{}, dollar signs, or square/curly-bracket math delimiters like [ ... ] or \\( ... \\).\n- Write all math using plain, readable Unicode symbols instead: × for multiply, ÷ for divide, √ for square root, ± , ≈, ≤, ≥, ≠, π, Δ, °, and superscripts like ², ³, ⁴, or "^2" written as "squared"/"to the power of 2" in words when a superscript character isn't available.\n- Write exponents and scientific notation in plain readable form, e.g. "3.0 × 10⁸ m/s" not "3 \\times 10^{8}".\n- Write units normally in plain text, e.g. "kg", "m/s²", "J" — never wrap them in \\text{...}.\n- Every equation must read like normal sentence/line text a student could read aloud with no special rendering needed, e.g. "E = m × c²" not "E = mc^{2}" or "$E=mc^2$".`,
      "You are an expert math and science tutor who writes long, thorough, complete explanations — never brief ones. Always use proper markdown formatting with bold for key terms. Never place a bold label on its own line directly above a separate paragraph — always combine a bold label with its explanation inside the same numbered-list item or paragraph so the text reads with clear, comfortable spacing. NEVER output raw LaTeX syntax (no \\text{}, \\times, \\frac, ^{}, _{}, or $ delimiters) — always write equations using plain Unicode math symbols (×, ÷, √, ², ³, π, etc.) so they are readable without a math renderer. Never reveal AI provider names.",
      undefined, true,
    );
    setAns(res.text); await bump(); setLoading(false);
  }

  const EXAMPLES = ["Kinetic Energy formula","Quadratic formula","Ohm's Law","Newton's Second Law F=ma","Pythagorean theorem","Einstein's E=mc²"];
  const mdComponents = {
    strong: ({ children }: { children?: React.ReactNode }) => (
      <mark className="bg-yellow-200 text-yellow-900 font-bold rounded px-0.5">{children}</mark>
    ),
    code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
      inline
        ? <code className="bg-slate-100 text-violet-700 rounded px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
        : <pre className="bg-slate-900 text-green-400 rounded-xl p-3.5 overflow-x-auto font-mono text-sm my-2 leading-relaxed"><code>{children}</code></pre>,
    h2: ({ children }: { children?: React.ReactNode }) => {
      const t = String(children).toLowerCase();
      let cls = "bg-blue-50 border-blue-300 text-blue-900";
      if (t.includes("📌") || t.includes("formula")) cls = "bg-purple-50 border-purple-300 text-purple-900";
      else if (t.includes("💡") || t.includes("example")) cls = "bg-amber-50 border-amber-300 text-amber-900";
      else if (t.includes("✅") || t.includes("recap")) cls = "bg-emerald-50 border-emerald-300 text-emerald-900";
      else if (t.includes("🧠") || t.includes("key")) cls = "bg-violet-50 border-violet-300 text-violet-900";
      return <div className={`rounded-xl border-l-4 px-3 py-2 mt-5 mb-3 ${cls}`}><h2 className="font-bold text-sm">{children}</h2></div>;
    },
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="my-3 leading-relaxed">{children}</p>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="my-3 space-y-3 pl-5 list-decimal">{children}</ol>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="my-3 space-y-2 pl-5 list-disc">{children}</ul>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li className="leading-relaxed pl-1">{children}</li>
    ),
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold">🔮 Bishal's Formula Helper</h2>
          <QuotaBadge quota={quota} loading={quotaLoading} />
        </div>
        <p className="mb-4 text-xs text-muted-foreground">Ask about any formula — get a full explained breakdown with example.</p>
        <div className="flex gap-2">
          <input ref={useRef<HTMLInputElement>(null)} value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") ask(); }}
            placeholder='e.g. "Formula for kinetic energy" or "Explain E=mc²"'
            className="flex-1 rounded-xl border border-border bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
          <button onClick={ask} disabled={loading || !q.trim()}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Explain"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map(ex => (
            <button key={ex} onClick={() => { setQ(ex); setTimeout(() => ask(), 50); }}
              className="rounded-full border border-border bg-white px-2.5 py-1 text-xs hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 transition">
              {ex}
            </button>
          ))}
        </div>
      </div>
      {loading && (
        <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-violet-600" />
          <p className="mt-3 text-sm text-muted-foreground">Bishal's Assistant is explaining…</p>
        </div>
      )}
      {ans && !loading && (
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{ans}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Improved Unit Converter ─────────────────────────────────────────── */
function UnitConverter() {
  const CATEGORIES = {
    Length: {
      m: 1, km: 1000, cm: 0.01, mm: 0.001, µm: 1e-6,
      mi: 1609.344, ft: 0.3048, "in": 0.0254, yd: 0.9144,
      nm: 1e-9, nmi: 1852,
    },
    Weight: {
      kg: 1, g: 0.001, mg: 1e-6, µg: 1e-9,
      lb: 0.453592, oz: 0.0283495, t: 1000,
      stone: 6.35029, carat: 0.0002,
    },
    Temperature: { "°C": "celsius", "°F": "fahrenheit", K: "kelvin" },
    Area: {
      "m²": 1, "km²": 1e6, "cm²": 1e-4, "mm²": 1e-6,
      "ft²": 0.092903, "in²": 6.4516e-4,
      acre: 4046.86, ha: 10000, "mi²": 2.58999e6,
    },
    Volume: {
      "m³": 1, L: 0.001, mL: 1e-6, "cm³": 1e-6,
      gal: 0.00378541, qt: 9.4635e-4, pt: 4.7318e-4,
      "fl oz": 2.9574e-5, cup: 2.3659e-4, tsp: 4.9289e-6, tbsp: 1.4787e-5,
    },
    Speed: {
      "m/s": 1, "km/h": 1/3.6, mph: 0.44704,
      knot: 0.514444, "ft/s": 0.3048, "mi/min": 26.8224,
    },
    Time: {
      s: 1, ms: 0.001, µs: 1e-6,
      min: 60, hr: 3600, day: 86400,
      week: 604800, month: 2.628e6, year: 3.156e7,
    },
    Energy: {
      J: 1, kJ: 1000, MJ: 1e6,
      cal: 4.184, kcal: 4184,
      Wh: 3600, kWh: 3.6e6,
      BTU: 1055.06, "ft·lbf": 1.35582, eV: 1.602e-19,
    },
    Power: {
      W: 1, kW: 1000, MW: 1e6, GW: 1e9,
      HP: 745.7, "BTU/h": 0.29307, "ft·lbf/s": 1.35582,
    },
    Pressure: {
      Pa: 1, kPa: 1000, MPa: 1e6,
      bar: 1e5, atm: 101325, psi: 6894.76,
      mmHg: 133.322, torr: 133.322, inHg: 3386.39,
    },
    Data: {
      B: 1, KB: 1024, MB: 1048576, GB: 1073741824,
      TB: 1.0995e12, PB: 1.1259e15,
      Kbit: 125, Mbit: 125000, Gbit: 125000000,
    },
    Force: {
      N: 1, kN: 1000, MN: 1e6,
      lbf: 4.44822, kgf: 9.80665, dyn: 1e-5, "kip": 4448.22,
    },
    Angle: {
      "°": 1, rad: 180 / Math.PI, grad: 0.9,
      arcmin: 1/60, arcsec: 1/3600, turn: 360,
    },
    Frequency: {
      Hz: 1, kHz: 1e3, MHz: 1e6, GHz: 1e9, THz: 1e12,
      rpm: 1/60,
    },
    "Fuel Economy": {
      "km/L": 1, "L/100km": -1, mpg: 0.425144,
    },
  } as const;

  type CatKey = keyof typeof CATEGORIES;
  const [cat, setCat] = useState<CatKey>("Length");
  const units = Object.keys(CATEGORIES[cat]);
  const [from, setFrom] = useState(units[0]);
  const [to, setTo]     = useState(units[1]);
  const [val, setVal]   = useState("1");

  function switchCat(c: CatKey) {
    setCat(c);
    const us = Object.keys(CATEGORIES[c]);
    setFrom(us[0]); setTo(us[1]); setVal("1");
  }

  function swap() {
    const prev = from;
    setFrom(to);
    setTo(prev);
  }

  function convertTemp(v: number, fu: string, tu: string) {
    let c = fu === "°C" ? v : fu === "°F" ? (v - 32) / 1.8 : v - 273.15;
    return tu === "°C" ? c : tu === "°F" ? c * 1.8 + 32 : c + 273.15;
  }

  function getResult(): string {
    const v = parseFloat(val);
    if (isNaN(v)) return "—";
    if (cat === "Temperature") return +convertTemp(v, from, to).toPrecision(8) + "";
    if (cat === "Fuel Economy") {
      const tbl = CATEGORIES[cat] as Record<string, number>;
      if (from === "L/100km" && to !== "L/100km") return +(100 / v * tbl[to]).toPrecision(6) + "";
      if (to === "L/100km" && from !== "L/100km")  return +(100 / (v * tbl[from])).toPrecision(6) + "";
      if (from === "L/100km" && to === "L/100km")  return String(v);
    }
    const tbl = CATEGORIES[cat] as Record<string, number>;
    const out = (v * tbl[from]) / tbl[to];
    return +out.toPrecision(8) + "";
  }

  const CAT_ICONS: Record<string, string> = {
    Length: "📏", Weight: "⚖️", Temperature: "🌡️", Area: "□", Volume: "🫙",
    Speed: "💨", Time: "⏱️", Energy: "⚡", Power: "🔌", Pressure: "🌬️",
    Data: "💾", Force: "💪", Angle: "📐", Frequency: "〰️", "Fuel Economy": "⛽",
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-bold text-base">⚖️ Unit Converter</h2>

        <div className="flex flex-wrap gap-1.5 mb-5">
          {(Object.keys(CATEGORIES) as CatKey[]).map(c => (
            <button key={c} onClick={() => switchCat(c)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${cat === c ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>
              {CAT_ICONS[c]} {c}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">From</label>
              <select value={from} onChange={e => { const v = e.target.value; setFrom(v); if (v === to) setTo(from); }}
                className="w-full rounded-xl border border-border bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:border-primary">
                {units.map(u => <option key={u}>{u}</option>)}
              </select>
              <input type="number" value={val} onChange={e => setVal(e.target.value)}
                className="w-full rounded-xl border border-border bg-slate-50 px-3 py-2.5 text-sm font-mono outline-none focus:border-primary"
                placeholder="Enter value" />
            </div>

            <button onClick={swap} title="Swap units"
              className="mb-1 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white shadow-sm hover:bg-accent transition">
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
            </button>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">To</label>
              <select value={to} onChange={e => { const v = e.target.value; setTo(v); if (v === from) setFrom(to); }}
                className="w-full rounded-xl border border-border bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:border-primary">
                {units.map(u => <option key={u}>{u}</option>)}
              </select>
              <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-3 py-2.5 text-sm font-bold font-mono text-primary min-h-[42px] flex items-center">
                {getResult()}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-center">
            <span className="font-mono font-semibold">{val || "0"} {from}</span>
            <span className="mx-2 text-muted-foreground">=</span>
            <span className="font-mono font-semibold text-primary">{getResult()} {to}</span>
          </div>

          {cat === "Temperature" && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {["°C","°F","K"].map(u => {
                const v = parseFloat(val) || 0;
                const c = from === "°C" ? v : from === "°F" ? (v-32)/1.8 : v-273.15;
                const r = u === "°C" ? c : u === "°F" ? c*1.8+32 : c+273.15;
                return (
                  <div key={u} className="rounded-lg border border-border bg-white p-2">
                    <div className="font-bold text-sm">{+r.toPrecision(6)}</div>
                    <div className="text-muted-foreground">{u}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
