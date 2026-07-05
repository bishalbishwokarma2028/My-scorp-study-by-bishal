import type { Components } from "react-markdown";

// Section header color map based on emoji prefix — shared across
// Deep Research and YouTube Summarizer so both features have the same
// highlighted, bold, well-structured markdown presentation.
const SECTION_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  "🔍": { bg: "from-blue-50 to-blue-50/30",   border: "border-blue-400",   text: "text-blue-700"   },
  "📌": { bg: "from-violet-50 to-violet-50/30", border: "border-violet-400", text: "text-violet-700" },
  "📖": { bg: "from-emerald-50 to-emerald-50/30", border: "border-emerald-400", text: "text-emerald-700" },
  "📊": { bg: "from-amber-50 to-amber-50/30",  border: "border-amber-400",  text: "text-amber-700"  },
  "🌍": { bg: "from-cyan-50 to-cyan-50/30",    border: "border-cyan-400",   text: "text-cyan-700"   },
  "✅": { bg: "from-green-50 to-green-50/30",  border: "border-green-500",  text: "text-green-700"  },
  "🎯": { bg: "from-pink-50 to-pink-50/30",    border: "border-pink-400",   text: "text-pink-700"   },
  "📝": { bg: "from-indigo-50 to-indigo-50/30", border: "border-indigo-400", text: "text-indigo-700" },
};

function getSection(text: string) {
  for (const [emoji, style] of Object.entries(SECTION_STYLES)) {
    if (String(text).startsWith(emoji)) return style;
  }
  return { bg: "from-primary/5 to-primary/0", border: "border-primary", text: "text-primary" };
}

// Rich custom components for beautiful, highlighted markdown rendering.
// Used by Deep Research and the YouTube Summarizer summary tab so both
// present bold/highlighted answers in the same polished format.
export const richMarkdownComponents: Components = {
  h2: ({ children }) => {
    const s = getSection(String(children));
    return (
      <div className={`flex items-center gap-2.5 mt-7 mb-3 px-4 py-3 rounded-xl bg-gradient-to-r ${s.bg} border-l-4 ${s.border} shadow-sm`}>
        <span className={`text-sm font-bold leading-snug ${s.text}`}>{children}</span>
      </div>
    );
  },
  h3: ({ children }) => (
    <h3 className="text-sm font-bold mt-5 mb-2 pl-3 border-l-2 border-primary/50 text-foreground">{children}</h3>
  ),
  strong: ({ children }) => (
    <mark className="bg-yellow-200/80 text-yellow-900 px-0.5 rounded-sm font-semibold not-italic">{children}</mark>
  ),
  em: ({ children }) => (
    <em className="text-primary font-medium not-italic">{children}</em>
  ),
  li: ({ children }) => (
    <li className="flex items-start gap-2 my-1.5 leading-relaxed">
      <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
      <span className="flex-1 text-sm">{children}</span>
    </li>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-none pl-0 space-y-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal pl-5 space-y-1 text-sm">{children}</ol>
  ),
  p: ({ children }) => (
    <p className="text-sm leading-relaxed my-2 text-foreground/90">{children}</p>
  ),
  blockquote: ({ children }) => (
    <div className="my-3 rounded-lg border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 font-medium">
      {children}
    </div>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-border shadow-sm">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground border-b border-border">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-xs border-b border-border/60">{children}</td>
  ),
  tr: ({ children }) => (
    <tr className="even:bg-muted/20 hover:bg-accent/30 transition-colors">{children}</tr>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{children}</code>
  ),
  hr: () => <hr className="my-4 border-border/50" />,
};
