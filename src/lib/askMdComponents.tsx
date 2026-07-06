import type { ReactNode } from "react";

export const askMdComponents = {
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-bold text-primary bg-primary/10 rounded px-1 py-0.5">
      {children}
    </strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="italic text-foreground/80">{children}</em>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="my-1.5 leading-relaxed">{children}</p>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="my-1.5 space-y-1.5 pl-5 list-decimal">{children}</ol>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="my-1.5 space-y-1.5 pl-5 list-disc">{children}</ul>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-relaxed pl-1">{children}</li>
  ),
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mt-2 mb-1 text-base font-bold">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mt-2 mb-1 text-sm font-bold">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mt-2 mb-1 text-sm font-bold">{children}</h3>
  ),
  code: ({ inline, children }: { inline?: boolean; children?: ReactNode }) =>
    inline ? (
      <code className="bg-muted text-primary rounded px-1 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    ) : (
      <pre className="bg-slate-900 text-green-400 rounded-lg p-3 overflow-x-auto font-mono text-xs my-2 leading-relaxed">
        <code>{children}</code>
      </pre>
    ),
};
