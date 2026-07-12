---
name: Plain-text math rendering (no KaTeX)
description: How exponents/subscripts/fractions are rendered app-wide without LaTeX, and a regex pitfall to avoid if touched again.
---

Since KaTeX/remark-math crash Vite here (see esm-packages-vite.md), math is rendered by converting AI-prompted plain-text conventions into HTML/JSX:
- `x^2`, `x^(n+1)` → `<sup>`
- `x_0`, `m_1` → `<sub>`
- `(numerator) / (denominator)` → stacked fraction

Implemented twice (must stay in sync): `src/lib/mathText.tsx` (React, used by `askMdComponents`/chat-style markdown) and `applyMathFormatting` in `dashboard.notes.tsx` (string-based, used by the PDF export HTML builder).

**Why:** A naive `\(([^()]+)\)` fraction/exponent regex fails on the AI's own common output like `(-b ± √(b² - 4ac)) / 2a`, because the numerator has a nested paren — the non-nested-char-class regex simply doesn't match at all, silently leaving the whole expression unformatted. A separate bug: giving the exponent/subscript token an *independently optional* leading `\(?` and trailing `\)?` (rather than requiring both or neither) lets a stray, unrelated closing paren from the surrounding text get swallowed into the subscript/exponent.

**How to apply:** Use a balanced-paren token that allows one level of nesting (`\(((?:[^()]|\([^()]*\))*)\)`) for the fraction/exponent/subscript groups, and make the paren-wrapping strictly all-or-nothing (match either a fully parenthesized token or a bare unparenthesized token — never mix). Before changing these regexes, sanity-test against real multi-nested-paren AI output, not just simple `x^2`-style examples.
