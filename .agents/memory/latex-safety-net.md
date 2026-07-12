---
    name: LaTeX safety-net rendering
    description: Why raw LaTeX still leaked through despite prompts forbidding it, and how it's mitigated
    ---

    ## Rule
    Never rely solely on prompt instructions ("never output raw LaTeX") to keep AI responses free of literal \frac{}{}, \sqrt{}, \bar{}, etc. Models disobey this instruction often enough that a rendering-layer safety net is required.

    **Why:** Screenshots showed models outputting \frac{3}{2}kT, \sqrt{2}, \bar{c} verbatim in Image Solver and other AI features even with explicit "never output raw LaTeX" prompt text present.

    **How to apply:** src/lib/mathText.tsx exports convertLatexToPlainMath(), a dependency-free parser that expands \frac/\sqrt/\bar/\hat/\vec/Greek letters/operators/math-mode delimiters into the app's existing plain-text math convention (caret exponents, underscore subscripts, "(num) / (den)" fractions, Unicode symbols), which the existing sup/sub/fraction renderer then picks up. It's called at the top of renderMathText() (React path) and mirrored into any string-based HTML builders (e.g. Smart Notes' PDF export applyMathFormatting()) — keep both in sync if either changes. Idempotent and safe to run unconditionally since it's a no-op on text without backslashes/$.
    