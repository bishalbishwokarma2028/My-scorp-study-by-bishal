import { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { askMdComponents } from "@/lib/askMdComponents";

/**
 * Renders markdown content with a typing animation. Reveals the text in
 * small chunks so long answers still finish quickly, then stays fully
 * rendered once done (or immediately if `animate` is false, e.g. for
 * messages loaded from history rather than freshly generated).
 */
export function TypewriterText({
  content,
  animate = true,
  className = "prose prose-sm max-w-none",
  onDone,
  components,
}: {
  content: string;
  animate?: boolean;
  className?: string;
  onDone?: () => void;
  components?: Components;
}) {
  const [shown, setShown] = useState(animate ? "" : content);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!animate) {
      setShown(content);
      return;
    }
    doneRef.current = false;
    setShown("");
    let i = 0;
    const CHUNK = Math.max(1, Math.round(content.length / 220));
    const interval = setInterval(() => {
      i += CHUNK;
      if (i >= content.length) {
        setShown(content);
        clearInterval(interval);
        if (!doneRef.current) {
          doneRef.current = true;
          onDone?.();
        }
      } else {
        setShown(content.slice(0, i));
      }
    }, 12);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components ?? askMdComponents}>
        {shown}
      </ReactMarkdown>
    </div>
  );
}
