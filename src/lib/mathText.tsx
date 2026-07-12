import { Fragment, type ReactNode } from "react";

/**
 * Lightweight, dependency-free math-formatting helper.
 *
 * The app deliberately avoids KaTeX/MathJax (remark-math + rehype-katex +
 * katex crash Vite's dependency optimizer on this Replit setup — see
 * .agents/memory/esm-packages-vite.md). Instead, AI responses are prompted
 * to use plain Unicode math symbols (×, ÷, √, ², ³, π, …) plus a small set
 * of plain-text conventions:
 *   - exponents/powers as a caret, e.g. x^2, x^(n+1), r^-1
 *   - subscripts as an underscore, e.g. v_0, x_i, m_1
 *   - fractions written as "(numerator) / (denominator)"
 *
 * This module turns those plain-text conventions into properly typeset
 * <sup>/<sub>/stacked-fraction markup so equations read cleanly instead of
 * as raw caret/underscore text, without needing a full LaTeX engine.
 */

let keySeed = 0;
function nextKey(prefix: string) {
  keySeed += 1;
  return `${prefix}-${keySeed}`;
}

// Matches parens with up to one level of nesting inside, e.g.
// "(-b ± √(b² - 4ac))" — plain-text math from the AI commonly nests a
// √(...) or (...) inside the outer fraction/exponent group.
const BAL_PAREN = "\\(((?:[^()]|\\([^()]*\\))*)\\)";
const SUP_TOKEN = new RegExp(`(°|[A-Za-zΑ-Ωα-ω0-9\\)\\]])\\^(${BAL_PAREN}|-?[A-Za-z0-9+\\-.]+)`, "g");
const SUB_TOKEN = new RegExp(`([A-Za-zΑ-Ωα-ω0-9\\)\\]])_(${BAL_PAREN}|-?[A-Za-z0-9+\\-.]+)`, "g");
// "(numerator) / (denominator)" — requires the numerator to be parenthesized,
// which matches the exact convention the AI prompts already ask for, so it
// won't misfire on ordinary dates or ratios like "10/12".
const FRACTION_TOKEN = new RegExp(`${BAL_PAREN}\\s*\\/\\s*(${BAL_PAREN}|[A-Za-zΑ-Ωα-ω0-9²³πθαβγΔΣ°.\\-]+)`, "g");

function stripWrap(s: string): string {
  return s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1) : s;
}

// ── LaTeX safety net ──────────────────────────────────────────────────────
// Despite every prompt in the app explicitly forbidding raw LaTeX, models
// sometimes ignore that instruction and emit \frac{}{}, \sqrt{}, \bar{},
// Greek command names, etc. Rather than depend entirely on prompt
// compliance, convertLatexToPlainMath() rewrites common LaTeX into the same
// plain-text conventions (caret/underscore/parenthesized fraction) the rest
// of this module already understands, so it renders cleanly either way.
const GREEK_AND_SYMBOLS: Record<string, string> = {
  pi: "π", alpha: "α", beta: "β", gamma: "γ", Gamma: "Γ", delta: "δ", Delta: "Δ",
  epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", Theta: "Θ",
  iota: "ι", kappa: "κ", lambda: "λ", Lambda: "Λ", mu: "μ", nu: "ν", xi: "ξ",
  Xi: "Ξ", rho: "ρ", sigma: "σ", Sigma: "Σ", tau: "τ", phi: "φ", varphi: "φ",
  Phi: "Φ", chi: "χ", psi: "ψ", Psi: "Ψ", omega: "ω", Omega: "Ω",
  times: "×", div: "÷", cdot: "·", pm: "±", mp: "∓",
  leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠",
  approx: "≈", sim: "∼", equiv: "≡", propto: "∝",
  infty: "∞", partial: "∂", nabla: "∇",
  rightarrow: "→", to: "→", leftarrow: "←", Rightarrow: "⇒", Leftrightarrow: "⇔",
  int: "∫", oint: "∮", sum: "Σ", prod: "∏",
  circ: "°", degree: "°", perp: "⊥", parallel: "∥",
  cup: "∪", cap: "∩", forall: "∀", exists: "∃", emptyset: "∅",
  ldots: "…", cdots: "⋯", therefore: "∴", because: "∵",
  quad: "  ", qquad: "    ",
};

function findMatchingBrace(s: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function addCombining(s: string, mark: string): string {
  return s.split("").map((c) => c + mark).join("");
}

/**
 * Scans `s` for occurrences of `\name` and replaces each with
 * `build(args, optional)`, where `args` are its `{...}` brace arguments
 * (or a single bare character if not braced, e.g. `\bar x`) and `optional`
 * is a `[...]` argument if present (e.g. `\sqrt[3]{x}`).
 */
function replaceBracedCommand(
  s: string,
  name: string,
  argCount: number,
  build: (args: string[], optional: string) => string,
): string {
  const marker = `\\${name}`;
  let result = "";
  let i = 0;
  while (i < s.length) {
    const idx = s.indexOf(marker, i);
    if (idx === -1) { result += s.slice(i); break; }
    const afterCmd = idx + marker.length;
    if (/[A-Za-z]/.test(s[afterCmd] ?? "")) {
      // Not an exact command match (e.g. \fractional) — skip past and continue.
      result += s.slice(i, afterCmd);
      i = afterCmd;
      continue;
    }
    result += s.slice(i, idx);
    let pos = afterCmd;
    let optional = "";
    if (s[pos] === "[") {
      const closeB = s.indexOf("]", pos);
      if (closeB !== -1) { optional = s.slice(pos + 1, closeB); pos = closeB + 1; }
    }
    const args: string[] = [];
    let ok = true;
    for (let a = 0; a < argCount; a++) {
      while (s[pos] === " ") pos++;
      if (s[pos] === "{") {
        const close = findMatchingBrace(s, pos);
        if (close === -1) { ok = false; break; }
        args.push(s.slice(pos + 1, close));
        pos = close + 1;
      } else if (s[pos] !== undefined) {
        args.push(s[pos]);
        pos++;
      } else {
        ok = false;
        break;
      }
    }
    if (!ok) {
      // Malformed — drop just the command name and keep scanning.
      i = afterCmd;
      continue;
    }
    result += build(args, optional);
    i = pos;
  }
  return result;
}

/**
 * Best-effort LaTeX → plain-text-math converter. Idempotent on text that
 * already follows the plain conventions (no backslash commands), so it's
 * safe to run unconditionally on every AI response.
 */
export function convertLatexToPlainMath(input: string): string {
  if (!input || !input.includes("\\") && !input.includes("$")) return input;
  let s = input;

  // Unwrap math-mode delimiters — content is plain math either way.
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner: string) => inner);
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => inner);
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string) => inner);
  s = s.replace(/\$([^$\n]+)\$/g, (_m, inner: string) => inner);
  s = s.replace(/\\left/g, "").replace(/\\right/g, "");

  for (let pass = 0; pass < 4; pass++) {
    const before = s;
    s = replaceBracedCommand(s, "frac", 2, (a) => `(${a[0]}) / (${a[1]})`);
    s = replaceBracedCommand(s, "dfrac", 2, (a) => `(${a[0]}) / (${a[1]})`);
    s = replaceBracedCommand(s, "tfrac", 2, (a) => `(${a[0]}) / (${a[1]})`);
    s = replaceBracedCommand(s, "sqrt", 1, (a, opt) => (opt ? `${opt}√(${a[0]})` : `√(${a[0]})`));
    s = replaceBracedCommand(s, "bar", 1, (a) => addCombining(a[0], "\u0305"));
    s = replaceBracedCommand(s, "overline", 1, (a) => addCombining(a[0], "\u0305"));
    s = replaceBracedCommand(s, "hat", 1, (a) => addCombining(a[0], "\u0302"));
    s = replaceBracedCommand(s, "vec", 1, (a) => addCombining(a[0], "\u20d7"));
    s = replaceBracedCommand(s, "dot", 1, (a) => addCombining(a[0], "\u0307"));
    s = replaceBracedCommand(s, "text", 1, (a) => a[0]);
    s = replaceBracedCommand(s, "mathrm", 1, (a) => a[0]);
    s = replaceBracedCommand(s, "mathbf", 1, (a) => a[0]);
    s = replaceBracedCommand(s, "mathit", 1, (a) => a[0]);
    s = replaceBracedCommand(s, "boldsymbol", 1, (a) => a[0]);
    s = s.replace(/\^\{([^{}]*)\}/g, "^($1)");
    s = s.replace(/_\{([^{}]*)\}/g, "_($1)");
    if (s === before) break;
  }

  // Named symbols/Greek letters: \pi, \Delta, \times, etc.
  s = s.replace(/\\([A-Za-z]+)/g, (_m, name: string) => GREEK_AND_SYMBOLS[name] ?? name);
  s = s.replace(/\\[,;!]/g, " ");
  s = s.replace(/\\%/g, "%").replace(/\\&/g, "&");
  // Any leftover unmatched braces from unsupported commands.
  s = s.replace(/[{}]/g, "");
  return s;
}

/**
 * Converts a plain string into React nodes with proper <sup>/<sub>/fraction
 * markup applied. Safe to call on arbitrary text — patterns only match
 * explicit caret/underscore/parenthesized-fraction conventions.
 */
export function renderMathText(text: string): ReactNode[] {
  if (!text) return [text];
  text = convertLatexToPlainMath(text);

  // Pass 1: fractions (they may contain ^ / _ inside, so handle first and
  // recurse into numerator/denominator for sup/sub).
  const out: ReactNode[] = [];
  let lastIndex = 0;
  FRACTION_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  const fractionMatches: { start: number; end: number; num: string; den: string }[] = [];
  while ((m = FRACTION_TOKEN.exec(text))) {
    fractionMatches.push({ start: m.index, end: m.index + m[0].length, num: m[1], den: stripWrap(m[2]) });
  }

  if (fractionMatches.length === 0) {
    return renderSupSub(text);
  }

  for (const fm of fractionMatches) {
    if (fm.start > lastIndex) {
      out.push(...renderSupSub(text.slice(lastIndex, fm.start)));
    }
    out.push(
      <span key={nextKey("frac")} className="mx-0.5 inline-flex flex-col align-middle text-center leading-none">
        <span className="border-b border-current px-1 pb-0.5 text-[0.85em]">{renderSupSub(fm.num)}</span>
        <span className="px-1 pt-0.5 text-[0.85em]">{renderSupSub(fm.den)}</span>
      </span>,
    );
    lastIndex = fm.end;
  }
  if (lastIndex < text.length) {
    out.push(...renderSupSub(text.slice(lastIndex)));
  }
  return out;
}

function renderSupSub(text: string): ReactNode[] {
  if (!text) return [];
  // Combine sup/sub matching in a single left-to-right scan.
  const combined = new RegExp(`${SUP_TOKEN.source}|${SUB_TOKEN.source}`, "g");
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  combined.lastIndex = 0;
  while ((m = combined.exec(text))) {
    // SUP_TOKEN and SUB_TOKEN each contribute 3 capture groups (base, whole
    // exponent/subscript alternative, and BAL_PAREN's inner-content group),
    // so SUP occupies m[1..3] and SUB occupies m[4..6] in the combined regex.
    const isSup = m[1] !== undefined;
    const base = isSup ? m[1] : m[4];
    const raw = isSup ? m[2] : m[5];
    const clean = stripWrap(raw);
    out.push(text.slice(lastIndex, m.index));
    out.push(base);
    out.push(
      isSup ? (
        <sup key={nextKey("sup")}>{clean}</sup>
      ) : (
        <sub key={nextKey("sub")}>{clean}</sub>
      ),
    );
    lastIndex = m.index + m[0].length;
  }
  out.push(text.slice(lastIndex));
  return out.filter((n) => n !== "");
}

/**
 * Recursively walks react-markdown `children` (strings mixed with element
 * nodes, e.g. inside a <p> that also contains a <strong>) and runs plain
 * string leaves through renderMathText, leaving element nodes untouched.
 */
export function mapMathChildren(children: ReactNode): ReactNode {
  if (typeof children === "string") {
    return renderMathText(children).map((n, i) => <Fragment key={i}>{n}</Fragment>);
  }
  if (Array.isArray(children)) {
    return children.map((c, i) => <Fragment key={i}>{mapMathChildren(c)}</Fragment>);
  }
  return children;
}
