import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import React from "react";
import { Loader2, Delete } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askAI } from "@/lib/aiProvider";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge } from "@/components/ai-ui";

export const Route = createFileRoute("/_authenticated/dashboard/calculator")({
  component: CalculatorPage,
});

type Tab = "basic" | "scientific" | "formula" | "convert";

function CalculatorPage() {
  const { user } = Route.useRouteContext();
  const [tab, setTab] = useState<Tab>("basic");
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState("");
  const [history, setHistory] = useState<{ expr: string; result: string }[]>([]);
  const [degrees, setDegrees] = useState(true);

  function press(k: string) {
    if (k === "=") { compute(); return; }
    if (k === "C") { setExpr(""); setResult(""); return; }
    if (k === "⌫") { setExpr(e => e.slice(0, -1)); return; }
    if (k === "+/-") { setExpr(e => e.startsWith("-") ? e.slice(1) : "-" + e); return; }
    if (k === "%") {
      setExpr(e => {
        const match = e.match(/^(.*?)(-?\d+(?:\.\d+)?)$/);
        if (match) {
          const base = match[1];
          const num = parseFloat(match[2]);
          if (!isNaN(num)) return base + (num / 100);
        }
        return e + "/100";
      });
      return;
    }
    setExpr(e => e + k);
  }

  function compute() {
    if (!expr.trim()) return;
    try {
      const rad = degrees ? "Math.PI/180" : "1";
      const prelude = `const _r=${rad};
        const sin=(x)=>Math.sin(x*_r),
              cos=(x)=>Math.cos(x*_r),
              tan=(x)=>Math.tan(x*_r),
              asin=(x)=>Math.asin(x)/_r,
              acos=(x)=>Math.acos(x)/_r,
              atan=(x)=>Math.atan(x)/_r,
              log=Math.log10, ln=Math.log, sqrt=Math.sqrt,
              abs=Math.abs, pow=Math.pow, floor=Math.floor, ceil=Math.ceil,
              pi=Math.PI, e=Math.E, PI=Math.PI, E=Math.E;`;
      const sanitized = expr
        .replace(/\^/g, "**")
        .replace(/×/g, "*")
        .replace(/÷/g, "/");
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const raw = Function(`"use strict"; ${prelude} return (${sanitized})`)();
      const r = typeof raw === "number"
        ? (Number.isFinite(raw) ? (Math.abs(raw) < 1e-10 && raw !== 0 ? raw.toExponential(6) : +raw.toPrecision(12) + "") : "Error")
        : String(raw);
      setResult(r);
      setHistory(h => [{ expr, result: r }, ...h].slice(0, 15));
    } catch {
      setResult("Error");
    }
  }

  const BASIC_KEYS = [
    ["C", "+/-", "%", "÷"],
    ["7", "8", "9", "×"],
    ["4", "5", "6", "-"],
    ["1", "2", "3", "+"],
    ["0", ".", "⌫", "="],
  ];

  const SCI_EXTRA = ["sin(", "cos(", "tan(", "asin(", "acos(", "atan(", "sqrt(", "log(", "ln(", "abs(", "pi", "e", "^", "(", ")", "%"];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-white p-1.5 shadow-sm flex gap-1">
        {(["basic", "scientific", "formula", "convert"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold capitalize transition ${tab === t ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md" : "text-muted-foreground hover:bg-accent"}`}
          >
            {t === "convert" ? "Unit Converter" : t === "formula" ? "Formula Helper" : t}
          </button>
        ))}
      </div>

      {(tab === "basic" || tab === "scientific") && (
        <div className="mx-auto max-w-sm">
          <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
            <div className="bg-slate-900 px-5 py-4 text-right min-h-[96px]">
              {tab === "scientific" && (
                <button
                  onClick={() => setDegrees(d => !d)}
                  className={`mb-2 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${degrees ? "border-amber-400 text-amber-300" : "border-blue-400 text-blue-300"}`}
                >
                  {degrees ? "DEG" : "RAD"}
                </button>
              )}
              <div className="text-slate-400 text-sm font-mono min-h-[20px] truncate">{expr || "0"}</div>
              <div className="text-white text-3xl font-bold font-mono mt-1 truncate">{result || "0"}</div>
            </div>

            {tab === "scientific" && (
              <div className="grid grid-cols-4 gap-px bg-slate-200 p-px">
                {SCI_EXTRA.map((k) => (
                  <button
                    key={k}
                    onClick={() => press(k)}
                    className="bg-slate-700 text-slate-200 py-2.5 text-xs font-mono font-semibold hover:bg-slate-600 transition"
                  >
                    {k}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-4 gap-px bg-slate-200 p-px">
              {BASIC_KEYS.flat().map((k, idx) => {
                const isOp = ["÷", "×", "-", "+"].includes(k);
                const isEq = k === "=";
                const isDel = k === "C" || k === "⌫";
                return (
                  <button
                    key={`${k}-${idx}`}
                    onClick={() => press(k)}
                    onKeyDown={(e) => { if (e.key === "Enter") compute(); }}
                    className={`py-4 text-sm font-semibold transition select-none
                      ${isEq ? "bg-violet-600 text-white hover:bg-violet-500" :
                        isOp ? "bg-amber-400 text-white hover:bg-amber-300" :
                        isDel ? "bg-slate-400 text-white hover:bg-slate-300" :
                        "bg-white text-slate-900 hover:bg-slate-100"}`}
                  >
                    {k === "⌫" ? <Delete className="h-4 w-4 mx-auto" /> : k}
                  </button>
                );
              })}
            </div>
          </div>

          {history.length > 0 && (
            <div className="mt-3 rounded-xl border border-border bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">History</p>
                <button onClick={() => setHistory([])} className="text-xs text-muted-foreground hover:text-destructive">Clear</button>
              </div>
              <ul className="space-y-1">
                {history.map((h, i) => (
                  <li
                    key={i}
                    onClick={() => { setExpr(h.expr); setResult(h.result); }}
                    className="flex items-center justify-between cursor-pointer rounded-lg px-2 py-1.5 text-xs hover:bg-accent transition"
                  >
                    <span className="text-muted-foreground font-mono truncate">{h.expr}</span>
                    <span className="font-semibold font-mono ml-2 flex-shrink-0">= {h.result}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === "formula" && <FormulaHelper userId={user.id} />}
      {tab === "convert" && <UnitConverter />}
    </div>
  );
}

function FormulaHelper({ userId }: { userId: string }) {
  const [q, setQ] = useState("");
  const [ans, setAns] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { quota, quotaLoading, bump } = useUsageLimit(userId, "formula");

  async function ask() {
    if (!q.trim()) return;
    if (quota && quota.remaining <= 0) { toast.error(QUOTA_MESSAGE); return; }
    setLoading(true);
    setAns("");
    const res = await askAI(
      `Explain this formula or mathematical/scientific concept clearly and completely:

"${q}"

Use this exact structure:
## 📌 The Formula
\`\`\`
[Write the formula clearly]
\`\`\`

## 🔍 What Each Variable Means
- **Variable1 (symbol):** what it represents and its unit
- **Variable2:** ...

## 💡 Step-by-Step Example
1. [State the problem]
2. [Substitute values]
3. [Calculate step by step]
4. [Final answer with units]

## 🧠 Key Points to Remember
- **Important fact 1**
- **Important fact 2**
- **Common mistake:** ...

## ✅ Quick Recap
[2-3 sentence summary]`,
      "You are an expert math and science tutor. Always use proper markdown formatting with the exact sections requested. Never reveal AI provider names.",
    );
    setAns(res.text);
    await bump();
    setLoading(false);
  }

  const EXAMPLES = [
    "Kinetic Energy formula",
    "Quadratic formula",
    "Ohm's Law",
    "Newton's Second Law F=ma",
    "Pythagorean theorem",
    "Einstein's E=mc²",
  ];

  const mdComponents = {
    strong: ({ children }: { children?: React.ReactNode }) => (
      <mark className="bg-yellow-200 text-yellow-900 font-bold rounded px-0.5">{children}</mark>
    ),
    code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
      inline ? (
        <code className="bg-slate-100 text-violet-700 rounded px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
      ) : (
        <pre className="bg-slate-900 text-green-400 rounded-xl p-3.5 overflow-x-auto font-mono text-sm my-2 leading-relaxed">
          <code>{children}</code>
        </pre>
      ),
    h2: ({ children }: { children?: React.ReactNode }) => {
      const t = String(children).toLowerCase();
      let cls = "bg-blue-50 border-blue-300 text-blue-900";
      if (t.includes("📌") || t.includes("formula")) cls = "bg-purple-50 border-purple-300 text-purple-900";
      else if (t.includes("💡") || t.includes("example")) cls = "bg-amber-50 border-amber-300 text-amber-900";
      else if (t.includes("✅") || t.includes("recap")) cls = "bg-emerald-50 border-emerald-300 text-emerald-900";
      else if (t.includes("🧠") || t.includes("key")) cls = "bg-violet-50 border-violet-300 text-violet-900";
      return <div className={`rounded-xl border-l-4 px-3 py-2 mt-4 mb-2 ${cls}`}><h2 className="font-bold text-sm">{children}</h2></div>;
    },
    ol: ({ children }: { children?: React.ReactNode }) => {
      let counter = 0;
      const items = React.Children.map(children, (c) => {
        if (!React.isValidElement(c)) return c;
        counter++;
        return React.cloneElement(c as React.ReactElement, { "data-num": counter } as Record<string, unknown>);
      });
      return <ol className="space-y-2 my-2 pl-0 list-none">{items}</ol>;
    },
    li: ({ children, ...props }: { children?: React.ReactNode; [k: string]: unknown }) => {
      const num = (props as Record<string, unknown>)["data-num"];
      return (
        <li className="flex items-start gap-2.5 text-sm">
          {num !== undefined
            ? <span className="flex-shrink-0 grid h-5 w-5 place-items-center rounded-full bg-violet-600 text-white text-[10px] font-bold">{String(num)}</span>
            : <span className="flex-shrink-0 mt-2 h-1.5 w-1.5 rounded-full bg-violet-500" />}
          <span className="pt-0.5">{children}</span>
        </li>
      );
    },
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-foreground">🔮 Bishal's Formula Helper</h2>
          <QuotaBadge quota={quota} loading={quotaLoading} />
        </div>
        <p className="mb-4 text-xs text-muted-foreground">Ask about any formula, equation, or concept — get a full explained breakdown.</p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
            placeholder='e.g. "Formula for kinetic energy" or "Explain E=mc²"'
            className="flex-1 rounded-xl border border-border bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
          <button
            onClick={ask}
            disabled={loading || !q.trim()}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Explain"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => { setQ(ex); setTimeout(() => ask(), 50); }}
              className="rounded-full border border-border bg-white px-2.5 py-1 text-xs hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 transition"
            >
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

function UnitConverter() {
  const CATEGORIES = {
    Length:      { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, ft: 0.3048, in: 0.0254, yd: 0.9144, nm: 1e-9 },
    Weight:      { kg: 1, g: 0.001, mg: 0.000001, lb: 0.453592, oz: 0.0283495, t: 1000 },
    Speed:       { "m/s": 1, "km/h": 1/3.6, mph: 0.44704, knot: 0.514444 },
    Area:        { "m²": 1, "km²": 1e6, "cm²": 0.0001, "ft²": 0.092903, acre: 4046.86, ha: 10000 },
    Volume:      { L: 0.001, mL: 1e-6, "m³": 1, gal: 0.00378541, "fl oz": 2.957e-5, cup: 2.366e-4 },
    Temperature: { "°C": "celsius", "°F": "fahrenheit", K: "kelvin" },
    Data:        { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 },
    Time:        { s: 1, min: 60, hr: 3600, day: 86400, week: 604800 },
    Pressure:    { Pa: 1, kPa: 1000, bar: 100000, atm: 101325, psi: 6894.76 },
  } as const;

  type CatKey = keyof typeof CATEGORIES;
  const [cat, setCat] = useState<CatKey>("Length");
  const units = Object.keys(CATEGORIES[cat]);
  const [from, setFrom] = useState(units[0]);
  const [to, setTo] = useState(units[1]);
  const [val, setVal] = useState("1");

  function safeSetFrom(u: string) { setFrom(u); if (u === to) setTo(from); }
  function safeSetTo(u: string) { setTo(u); if (u === from) setFrom(to); }

  function convertTemp(v: number, fromU: string, toU: string) {
    let celsius = 0;
    if (fromU === "°C") celsius = v;
    else if (fromU === "°F") celsius = (v - 32) / 1.8;
    else celsius = v - 273.15;
    if (toU === "°C") return celsius;
    if (toU === "°F") return celsius * 1.8 + 32;
    return celsius + 273.15;
  }

  function getResult() {
    const v = parseFloat(val);
    if (isNaN(v)) return "—";
    if (cat === "Temperature") {
      return +convertTemp(v, from, to).toPrecision(8) + "";
    }
    const tbl = CATEGORIES[cat] as Record<string, number>;
    const base = v * tbl[from];
    const out = base / tbl[to];
    return +out.toPrecision(8) + "";
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-bold">⚖️ Unit Converter</h2>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(Object.keys(CATEGORIES) as CatKey[]).map((c) => (
            <button
              key={c}
              onClick={() => { setCat(c); const us = Object.keys(CATEGORIES[c]); setFrom(us[0]); setTo(us[1]); setVal("1"); }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${cat === c ? "bg-violet-600 text-white" : "border border-border hover:bg-accent"}`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <select
              value={from}
              onChange={(e) => safeSetFrom(e.target.value)}
              className="w-full rounded-xl border border-border bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:border-violet-400"
            >
              {units.map((u) => <option key={u}>{u}</option>)}
            </select>
            <input
              type="number"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="w-full rounded-xl border border-border bg-slate-50 px-3 py-2.5 text-sm font-mono outline-none focus:border-violet-400"
              placeholder="Enter value"
            />
          </div>
          <div className="space-y-2">
            <select
              value={to}
              onChange={(e) => safeSetTo(e.target.value)}
              className="w-full rounded-xl border border-border bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:border-violet-400"
            >
              {units.map((u) => <option key={u}>{u}</option>)}
            </select>
            <div className="rounded-xl border-2 border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-bold font-mono text-violet-900 min-h-[42px]">
              {getResult()}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-center text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">{val || "0"} {from}</span>
          <span className="mx-2">=</span>
          <span className="font-mono font-semibold text-violet-700">{getResult()} {to}</span>
        </div>
      </div>
    </div>
  );
}
