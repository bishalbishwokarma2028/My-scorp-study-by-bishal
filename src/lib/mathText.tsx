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

/**
 * Converts a plain string into React nodes with proper <sup>/<sub>/fraction
 * markup applied. Safe to call on arbitrary text — patterns only match
 * explicit caret/underscore/parenthesized-fraction conventions.
 */
export function renderMathText(text: string): ReactNode[] {
  if (!text) return [text];

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
