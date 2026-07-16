import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import React from "react";
import {
  Loader2, Zap, ClipboardList, Sparkles, X, Search,
  ArrowLeft, RefreshCw, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { askAI, askAIJSON } from "@/lib/aiProvider";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge } from "@/components/ai-ui";

export const Route = createFileRoute("/_authenticated/dashboard/memorizer")({
  component: MemorizerPage,
});

// ── Types ──────────────────────────────────────────────────────────────────────
type Mode = "landing" | "paste-input" | "describe-input" | "document";
type VisualType = "mindmap" | "process" | "data" | "timeline" | "comparison" | "framework";

type DocSection = {
  id: number;
  type: "title" | "h2" | "paragraph" | "bullet" | "numbered";
  content: string;
  items?: string[];
};
type DocBlock = { heading: DocSection; body: DocSection[] };

type MindmapData   = { center: string; branches: { label: string; items: string[] }[] };
type ProcessData   = { title: string; steps: { label: string; description: string }[] };
type DataFactsData = { title: string; facts: { label: string; detail: string }[] };
type TimelineData  = { title: string; events: { label: string; detail: string }[] };
type ComparisonData = { title: string; left: { label: string; points: string[] }; right: { label: string; points: string[] } };
type FrameworkData = { title: string; levels: { label: string; items: string[] }[] };

type VisualData =
  | { type: "mindmap";    data: MindmapData }
  | { type: "process";    data: ProcessData }
  | { type: "data";       data: DataFactsData }
  | { type: "timeline";   data: TimelineData }
  | { type: "comparison"; data: ComparisonData }
  | { type: "framework";  data: FrameworkData };

const VISUAL_CATEGORIES: { type: VisualType; label: string }[] = [
  { type: "mindmap",    label: "Mindmap" },
  { type: "process",   label: "Process" },
  { type: "data",      label: "Data" },
  { type: "timeline",  label: "Timelines" },
  { type: "comparison",label: "Comparison" },
  { type: "framework", label: "Business Frameworks" },
];

// ── Markdown parser → blocks ───────────────────────────────────────────────────
function parseMarkdown(text: string): DocBlock[] {
  const lines = text.split("\n");
  const raw: DocSection[] = [];
  let id = 0, i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    if (line.startsWith("# ")) {
      raw.push({ id: id++, type: "title", content: line.slice(2).trim() });
      i++;
    } else if (line.startsWith("## ")) {
      raw.push({ id: id++, type: "h2", content: line.slice(3).trim() });
      i++;
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) {
        items.push(lines[i].trim().slice(2).trim());
        i++;
      }
      if (items.length) raw.push({ id: id++, type: "bullet", content: "", items });
    } else if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s/, "").trim());
        i++;
      }
      if (items.length) raw.push({ id: id++, type: "numbered", content: "", items });
    } else {
      const parts: string[] = [];
      while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith("#")) {
        parts.push(lines[i].trim());
        i++;
      }
      const content = parts.join(" ");
      if (content) raw.push({ id: id++, type: "paragraph", content });
    }
  }

  const blocks: DocBlock[] = [];
  let cur: DocBlock | null = null;
  for (const sec of raw) {
    if (sec.type === "title" || sec.type === "h2") {
      if (cur) blocks.push(cur);
      cur = { heading: sec, body: [] };
    } else {
      if (!cur) cur = { heading: { id: id++, type: "paragraph", content: "" }, body: [] };
      cur.body.push(sec);
    }
  }
  if (cur) blocks.push(cur);
  return blocks;
}

// ── AI visual generation ───────────────────────────────────────────────────────
async function generateVisual(context: string, heading: string, type: VisualType): Promise<VisualData | null> {
  const sys = "Return ONLY raw valid JSON. No markdown fences, no prose. JSON only.";

  const prompts: Record<VisualType, string> = {
    mindmap:    `Create a detailed educational mindmap for "${heading}". Extract key concepts DIRECTLY from this content: "${context}". Return JSON: {"center":"${heading.slice(0,20)}","branches":[{"label":"Key Concept (max 14 chars)","items":["specific point from text","another point","third point"]}]}. Use 4-5 branches. Extract real terms and facts from the content above.`,
    process:    `Create a step-by-step process for "${heading}". Use ACTUAL steps and details from this content: "${context}". Return JSON: {"title":"${heading}","steps":[{"label":"Step Name","description":"Description using actual content from the text above."}]}. Include 5-6 steps. Use real content, not generic placeholders.`,
    data:       `Create key facts visualization for "${heading}". Extract REAL facts and key points from this content: "${context}". Return JSON: {"title":"${heading}","facts":[{"label":"Fact Title from the text","detail":"Specific fact or detail extracted from the content above."}]}. Include 6 facts. Use actual content.`,
    timeline:   `Create a timeline for "${heading}". Extract ACTUAL events, stages, or phases from this content: "${context}". Return JSON: {"title":"${heading}","events":[{"label":"Stage or Event Name from content","detail":"Detail taken directly from the text above."}]}. Include 5-6 events. Use real content.`,
    comparison: `Create a comparison for "${heading}". Extract TWO contrasting aspects from this content: "${context}". Return JSON: {"title":"${heading}","left":{"label":"Aspect A (from content)","points":["point from text","point from text","point from text","point from text"]},"right":{"label":"Aspect B (from content)","points":["point from text","point from text","point from text","point from text"]}}. Use real contrasts from the content.`,
    framework:  `Create a hierarchical framework for "${heading}". Organize the ACTUAL content from this text: "${context}" into levels. Return JSON: {"title":"${heading}","levels":[{"label":"Level Name from content","items":["item from text","item from text","item from text"]}]}. Include 3-4 levels, 2-3 items each. Use real content.`,
  };

  try {
    const { data } = await askAIJSON<any>(prompts[type], sys, [], false, 800);
    if (!data) return null;
    return { type, data } as VisualData;
  } catch { return null; }
}

// ── Inline markdown → React ────────────────────────────────────────────────────
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**")
          ? <strong key={i} className="font-semibold text-gray-900">{p.slice(2, -2)}</strong>
          : <React.Fragment key={i}>{p}</React.Fragment>
      )}
    </>
  );
}

// ── Visual renderers — White + Blue theme ──────────────────────────────────────
function MindmapVisual({ data }: { data: MindmapData }) {
  const cx = 300, cy = 185, radius = 140;
  const branches = (data.branches || []).slice(0, 6);
  const n = branches.length || 1;
  const nodeColors = ["#1d4ed8","#2563eb","#3b82f6","#1e40af","#0369a1","#0284c7"];

  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 text-center">
        <span className="text-blue-900 font-bold text-sm">{data.center}</span>
      </div>
      <svg viewBox="0 0 600 370" className="w-full">
        {/* Center circle */}
        <circle cx={cx} cy={cy} r={50} fill="#1e3a8a" />
        {data.center.split(" ").slice(0, 3).map((word, wi) => (
          <text key={wi} x={cx} y={cy - 8 + wi * 14} textAnchor="middle" fill="white" fontSize="9.5" fontWeight="bold">{word}</text>
        ))}
        {branches.map((b, i) => {
          const angle = ((i * 360) / n - 90) * (Math.PI / 180);
          const bx = cx + radius * Math.cos(angle);
          const by = cy + radius * Math.sin(angle);
          const mx = cx + (radius * 0.5) * Math.cos(angle);
          const my = cy + (radius * 0.5) * Math.sin(angle);
          const col = nodeColors[i % nodeColors.length];
          return (
            <g key={i}>
              <path d={`M ${cx} ${cy} Q ${mx} ${my} ${bx} ${by}`} stroke={col} strokeWidth="1.5" fill="none" opacity="0.6" />
              <rect x={bx - 48} y={by - 13} width={96} height={26} rx="13" fill={col} />
              <text x={bx} y={by + 1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="bold">
                {(b.label || "").slice(0, 15)}
              </text>
              {(b.items || []).slice(0, 3).map((item, j) => (
                <text key={j} x={bx} y={by + 28 + j * 14} textAnchor="middle" fill="#374151" fontSize="8">
                  ∙ {item.slice(0, 26)}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ProcessVisual({ data }: { data: ProcessData }) {
  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 text-center">
        <span className="text-blue-900 font-bold text-sm">{data.title}</span>
      </div>
      <div className="p-4 space-y-2">
        {(data.steps || []).map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">{i + 1}</div>
              {i < (data.steps.length - 1) && <div className="w-px h-3 bg-blue-200 mt-0.5" />}
            </div>
            <div className="flex-1 pb-1 min-w-0">
              <div className="text-blue-900 font-semibold text-sm">{step.label}</div>
              <div className="text-gray-600 text-xs mt-0.5 leading-relaxed">{step.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataVisual({ data }: { data: DataFactsData }) {
  const bgColors = ["#eff6ff","#e0f2fe","#dbeafe","#ede9fe","#f0fdf4","#fef3c7"];
  const borderColors = ["#2563eb","#0284c7","#1d4ed8","#7c3aed","#16a34a","#d97706"];
  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 text-center">
        <span className="text-blue-900 font-bold text-sm">{data.title}</span>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        {(data.facts || []).map((fact, i) => (
          <div key={i} className="rounded-lg p-2.5" style={{ background: bgColors[i % bgColors.length], borderLeft: `3px solid ${borderColors[i % borderColors.length]}` }}>
            <div className="text-blue-900 font-semibold text-xs mb-1">{fact.label}</div>
            <div className="text-gray-600 text-xs leading-relaxed">{fact.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineVisual({ data }: { data: TimelineData }) {
  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 text-center">
        <span className="text-blue-900 font-bold text-sm">{data.title}</span>
      </div>
      <div className="p-4">
        {(data.events || []).map((ev, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="h-3 w-3 rounded-full bg-blue-600 mt-1.5 flex-shrink-0 ring-2 ring-blue-200" />
              {i < (data.events.length - 1) && <div className="w-px flex-1 bg-blue-200 mt-1 min-h-[18px]" />}
            </div>
            <div className="pb-3 min-w-0">
              <div className="text-blue-900 font-semibold text-sm">{ev.label}</div>
              <div className="text-gray-600 text-xs mt-0.5 leading-relaxed">{ev.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparisonVisual({ data }: { data: ComparisonData }) {
  const sides = [data.left, data.right];
  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 text-center">
        <span className="text-blue-900 font-bold text-sm">{data.title}</span>
      </div>
      <div className="p-3 grid grid-cols-2 gap-3">
        {sides.map((side, si) => (
          <div key={si}>
            <div className={`text-center font-bold text-xs mb-2 py-1.5 rounded-lg text-white ${si === 0 ? "bg-blue-600" : "bg-blue-800"}`}>
              {(side || {}).label || "Side"}
            </div>
            <ul className="space-y-1.5">
              {((side || {}).points || []).map((pt, pi) => (
                <li key={pi} className="flex items-start gap-1.5 text-xs text-gray-700">
                  <span className="text-blue-500 flex-shrink-0 mt-0.5 font-bold">•</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function FrameworkVisual({ data }: { data: FrameworkData }) {
  const bgs   = ["#1e3a8a","#1e40af","#1d4ed8","#2563eb"];
  const texts  = ["white","white","white","white"];
  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 text-center">
        <span className="text-blue-900 font-bold text-sm">{data.title}</span>
      </div>
      <div className="p-3 space-y-2">
        {(data.levels || []).map((level, i) => (
          <div key={i} className="rounded-lg px-3 py-2.5" style={{ background: bgs[i % bgs.length] }}>
            <div className="text-white font-bold text-xs mb-1.5">{level.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {(level.items || []).map((item, j) => (
                <span key={j} className="px-2 py-0.5 rounded-full text-xs" style={{ background: "rgba(255,255,255,0.15)", color: texts[i % texts.length] }}>{item}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VisualRenderer({ visual }: { visual: VisualData }) {
  switch (visual.type) {
    case "mindmap":    return <MindmapVisual    data={visual.data as MindmapData} />;
    case "process":    return <ProcessVisual    data={visual.data as ProcessData} />;
    case "data":       return <DataVisual       data={visual.data as DataFactsData} />;
    case "timeline":   return <TimelineVisual   data={visual.data as TimelineData} />;
    case "comparison": return <ComparisonVisual data={visual.data as ComparisonData} />;
    case "framework":  return <FrameworkVisual  data={visual.data as FrameworkData} />;
    default: return null;
  }
}

// ── Thumbnail SVGs for AI Suggestions panel ────────────────────────────────────
function VisualThumb({ type }: { type: VisualType }) {
  const content: Record<VisualType, React.ReactNode> = {
    mindmap: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill="#eff6ff"/>
        <circle cx="30" cy="22" r="7" fill="#1e3a8a"/>
        {[[0,-14],[13,7],[-13,7],[10,-11],[-10,-11]].map(([dx,dy],i) => (
          <g key={i}>
            <line x1="30" y1="22" x2={30+(dx||0)} y2={22+(dy||0)} stroke="#93c5fd" strokeWidth="0.8"/>
            <circle cx={30+(dx||0)} cy={22+(dy||0)} r="3.5" fill={["#1d4ed8","#2563eb","#3b82f6","#1e40af","#0369a1"][i]}/>
          </g>
        ))}
      </svg>
    ),
    process: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill="#eff6ff"/>
        {[5,14,23,32].map((y,i) => (
          <g key={i}>
            <rect x="10" y={y} width="40" height="7" rx="2" fill="#1d4ed8"/>
            {i < 3 && <line x1="30" y1={y+7} x2="30" y2={y+9} stroke="#93c5fd" strokeWidth="1"/>}
          </g>
        ))}
      </svg>
    ),
    data: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill="#eff6ff"/>
        {([[5,5,"#1d4ed8"],[33,5,"#1e40af"],[5,25,"#2563eb"],[33,25,"#0369a1"]] as [number,number,string][]).map(([x,y,c],i) => (
          <g key={i}>
            <rect x={x} y={y} width="22" height="15" rx="2" fill="#dbeafe"/>
            <rect x={x} y={y} width="3" height="15" rx="1" fill={c}/>
          </g>
        ))}
      </svg>
    ),
    timeline: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill="#eff6ff"/>
        <line x1="20" y1="4" x2="20" y2="41" stroke="#93c5fd" strokeWidth="1.5"/>
        {[7,16,25,34].map((y,i) => (
          <g key={i}>
            <circle cx="20" cy={y} r="2.5" fill="#1d4ed8"/>
            <rect x="25" y={y-3} width="27" height="6" rx="1.5" fill="#dbeafe"/>
          </g>
        ))}
      </svg>
    ),
    comparison: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill="#eff6ff"/>
        <line x1="30" y1="4" x2="30" y2="41" stroke="#93c5fd" strokeWidth="0.8"/>
        <rect x="3" y="4" width="24" height="7" rx="2" fill="#1d4ed8"/>
        <rect x="33" y="4" width="24" height="7" rx="2" fill="#1e3a8a"/>
        {[15,22,29,36].map((y) => (
          <g key={y}>
            <rect x="4" y={y} width="22" height="4.5" rx="1" fill="#dbeafe"/>
            <rect x="34" y={y} width="22" height="4.5" rx="1" fill="#bfdbfe"/>
          </g>
        ))}
      </svg>
    ),
    framework: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill="#eff6ff"/>
        <rect x="15" y="4"  width="30" height="9"  rx="2" fill="#1e3a8a"/>
        <rect x="8"  y="16" width="44" height="9"  rx="2" fill="#1e40af"/>
        <rect x="3"  y="28" width="54" height="9"  rx="2" fill="#2563eb"/>
      </svg>
    ),
  };
  return <div className="w-full aspect-[4/3] overflow-hidden rounded">{content[type]}</div>;
}

// ── Main component ─────────────────────────────────────────────────────────────
function MemorizerPage() {
  const [mode, setMode]                   = useState<Mode>("landing");
  const [blocks, setBlocks]               = useState<DocBlock[]>([]);
  const [docTitle, setDocTitle]           = useState("");
  const [topicInput, setTopicInput]       = useState("");
  const [pasteInput, setPasteInput]       = useState("");
  const [generating, setGenerating]       = useState(false);
  const [activeBlockIdx, setActiveBlockIdx] = useState<number | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [visuals, setVisuals]             = useState<Record<number, VisualData>>({});
  const [generatingVisual, setGeneratingVisual] = useState<number | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const { quota, bump } = useUsageLimit("memorizer");

  // ── Document generation from topic ─────────────────────────────────────────
  async function handleDescribe() {
    if (!topicInput.trim()) return toast.error("Please describe your idea or topic");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setGenerating(true);
    try {
      const res = await askAI(
        `Write a VERY comprehensive, long-form educational document about: "${topicInput.trim()}"

You MUST write at least 1500 words. Do NOT stop early. Complete every section fully.

Use this EXACT markdown format:
# ${topicInput.trim()}

## Introduction
[4-5 sentence introductory paragraph. Be thorough.]

## [Core Concept 1 — name it specifically for the topic]
[3-4 full paragraphs, 4-6 sentences each, key terms in **bold**]
- Detailed bullet point 1 with explanation
- Detailed bullet point 2 with explanation
- Detailed bullet point 3 with explanation
- Detailed bullet point 4 with explanation

## [Core Concept 2 — name it specifically for the topic]
[3-4 full paragraphs]
1. Detailed numbered item 1 with full explanation
2. Detailed numbered item 2 with full explanation
3. Detailed numbered item 3 with full explanation
4. Detailed numbered item 4 with full explanation

## [Core Concept 3 — name it specifically for the topic]
[3 full paragraphs with key terms in **bold**]

## [Applications / Types / Examples relevant to the topic]
[3-4 full paragraphs, specific real-world examples]

## [Benefits / Advantages / Impact]
[2 full paragraphs + bullet list with at least 5 items]

## [Challenges / Limitations / Criticisms]
[2 full paragraphs + bullet list with at least 4 items]

## [Future Outlook / Modern Relevance]
[3 full paragraphs]

## Conclusion
[4-5 sentence complete wrap-up. Do NOT cut the conclusion short.]

CRITICAL: Write every section fully. Do not truncate or summarize. Use **bold** for all key terms. Never use LaTeX or math notation. Minimum 1500 words.`,
        "You are an expert academic writer. Generate very comprehensive, detailed educational documents of at least 1500 words. NEVER stop in the middle of a sentence or section — always complete the full document including the Conclusion section. Use **bold** for key terms. Never use LaTeX.",
        [],
        false,
        4000
      );
      await bump();
      const parsed = parseMarkdown(res.text);
      setBlocks(parsed);
      setDocTitle(topicInput.trim());
      setMode("document");
    } catch {
      toast.error("Failed to generate document. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  // ── Document from pasted text ───────────────────────────────────────────────
  async function handlePaste() {
    if (!pasteInput.trim()) return toast.error("Please paste some text first");

    let text = pasteInput.trim();
    const hasHeadings = /^## /m.test(text);

    if (!hasHeadings) {
      // No ## headings — use AI to add proper section structure
      setGenerating(true);
      try {
        const firstLine = text.split("\n")[0].replace(/^#+\s*/, "").trim();
        const res = await askAI(
          `Organize the following text into a structured educational document with clear section headings. Keep ALL original content — do not remove or summarize any text.

Format rules:
- First line: # [title] (use "${firstLine}" if appropriate)
- Each logical section starts with: ## [Section Heading]
- Keep all paragraphs, bullet points, and numbered lists as they are under the appropriate section
- Create at least 3-5 sections based on topic shifts in the text

Text to structure:
${text.slice(0, 4000)}`,
          "You are a document organizer. Add proper markdown headings (# for title, ## for sections) to the given text. Preserve every word of original content — never delete or condense it. Return only the formatted markdown document.",
          [], false, 3000
        );
        text = res.text.trim();
      } catch {
        // Fallback: parse as-is (will show without section bolts)
      } finally {
        setGenerating(false);
      }
    }

    const firstLine = text.split("\n")[0].replace(/^#+\s*/, "").trim();
    const parsed = parseMarkdown(text);
    setBlocks(parsed);
    setDocTitle(firstLine || "Your Document");
    setMode("document");
  }

  // ── Visual generation ───────────────────────────────────────────────────────
  function openSuggestions(blockIdx: number) {
    setActiveBlockIdx(blockIdx);
    setShowSuggestions(true);
  }

  async function handleSelectVisualType(type: VisualType) {
    if (activeBlockIdx === null) return;
    const block = blocks[activeBlockIdx];
    if (!block) return;

    const heading = block.heading.content;
    const bodyText = block.body.map(s =>
      (s.type === "bullet" || s.type === "numbered") ? (s.items || []).join(". ") : s.content
    ).join(" ").slice(0, 600);

    setGeneratingVisual(activeBlockIdx);
    setShowSuggestions(false);

    try {
      const visual = await generateVisual(bodyText, heading, type);
      if (visual) {
        setVisuals(prev => ({ ...prev, [activeBlockIdx]: visual }));
        toast.success("Visual generated!");
      } else {
        toast.error("Could not generate visual. Try again.");
      }
    } catch {
      toast.error("Visual generation failed.");
    } finally {
      setGeneratingVisual(null);
    }
  }

  function reset() {
    setMode("landing"); setBlocks([]); setVisuals({}); setTopicInput("");
    setPasteInput(""); setDocTitle(""); setShowSuggestions(false); setActiveBlockIdx(null);
  }

  const filteredCats = VISUAL_CATEGORIES.filter(c =>
    !categorySearch || c.label.toLowerCase().includes(categorySearch.toLowerCase())
  );

  // ── Landing ─────────────────────────────────────────────────────────────────
  if (mode === "landing") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b px-5 py-3 flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Memorizer</h1>
            <p className="text-xs text-muted-foreground">Transform any content into rich visual study documents</p>
          </div>
          <QuotaBadge feature="memorizer" />
        </div>
        <div className="flex flex-1 items-center justify-center p-8 overflow-y-auto">
          <div className="w-full max-w-xl">
            <h2 className="text-center text-2xl font-bold text-gray-800 mb-1">How would you like to start?</h2>
            <p className="text-center text-sm text-muted-foreground mb-8">Choose your method to create a visual memory document</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <button
                onClick={() => setMode("paste-input")}
                className="group relative overflow-hidden rounded-2xl p-6 text-left transition-transform hover:scale-[1.03] hover:shadow-xl focus:outline-none"
                style={{ background: "linear-gradient(135deg,#e879f9 0%,#a855f7 55%,#9333ea 100%)" }}
              >
                <div className="pointer-events-none absolute right-3 top-3 h-20 w-20 rounded-full bg-white/15" />
                <div className="pointer-events-none absolute right-8 top-8 h-10 w-10 rounded-full bg-white/10" />
                <ClipboardList className="mb-4 h-10 w-10 text-white/90" />
                <h3 className="text-white font-bold text-base mb-1">By pasting my text</h3>
                <p className="text-purple-100 text-sm leading-snug">Create from notes, an outline or existing content.</p>
              </button>
              <button
                onClick={() => setMode("describe-input")}
                className="group relative overflow-hidden rounded-2xl p-6 text-left transition-transform hover:scale-[1.03] hover:shadow-xl focus:outline-none"
                style={{ background: "linear-gradient(135deg,#818cf8 0%,#7c3aed 55%,#6d28d9 100%)" }}
              >
                <div className="pointer-events-none absolute right-3 top-3 h-20 w-20 rounded-full bg-white/15" />
                <div className="pointer-events-none absolute right-8 top-8 h-10 w-10 rounded-full bg-white/10" />
                <Sparkles className="mb-4 h-10 w-10 text-white/90" />
                <h3 className="text-white font-bold text-base mb-1">By describing my idea</h3>
                <p className="text-purple-100 text-sm leading-snug">Describe what visual and text content you have in mind.</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Paste input ─────────────────────────────────────────────────────────────
  if (mode === "paste-input") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 border-b px-5 py-3 flex-shrink-0">
          <button onClick={() => setMode("landing")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-base font-bold text-gray-900">Paste Your Text</h1>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-8 overflow-y-auto">
          <div className="w-full max-w-2xl space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Paste your notes, outline, or any text content
            </label>
            <textarea
              value={pasteInput}
              onChange={e => setPasteInput(e.target.value)}
              placeholder={"Paste your text here…\n\nYou can use plain text or markdown (# Heading, ## Section, **bold**, - bullets).\nThe more structured your text, the better the document will look."}
              className="w-full h-64 rounded-xl border border-border bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
            />
            <button
              onClick={handlePaste}
              disabled={!pasteInput.trim() || generating}
              className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 px-6 py-3 font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {generating
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Structuring your document…</>
                : "Create Visual Document"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Describe input ──────────────────────────────────────────────────────────
  if (mode === "describe-input") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 border-b px-5 py-3 flex-shrink-0">
          <button onClick={() => setMode("landing")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-base font-bold text-gray-900">Describe Your Idea</h1>
          <div className="ml-auto"><QuotaBadge feature="memorizer" /></div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-8 overflow-y-auto">
          <div className="w-full max-w-2xl space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              What topic or idea would you like to explore?
            </label>
            <textarea
              value={topicInput}
              onChange={e => setTopicInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !generating) handleDescribe(); }}
              placeholder={"e.g. 'The impact of globalization on developing economies'\ne.g. 'How photosynthesis works'\ne.g. 'Machine learning fundamentals'\ne.g. 'The causes of World War I'"}
              className="w-full h-36 rounded-xl border border-border bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              disabled={generating}
            />
            <button
              onClick={handleDescribe}
              disabled={generating || !topicInput.trim()}
              className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-6 py-3 font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {generating
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating comprehensive document…</>
                : <><Sparkles className="h-4 w-4" /> Generate Document</>}
            </button>
            <p className="text-center text-xs text-muted-foreground">Tip: Press Ctrl+Enter to generate</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Document view ───────────────────────────────────────────────────────────
  // Uses a 2-column sticky layout: left panel (AI suggestions) + right (scrollable doc)
  // fixed inset pattern mirrors chat/whiteboard so the parent height is always resolved
  return (
    <div className="fixed inset-x-0 bottom-0 top-14 lg:static lg:h-full flex overflow-hidden bg-white">

      {/* ── Left panel: AI Suggestions — sticky, does NOT scroll ── */}
      <div
        className={`flex-shrink-0 border-r bg-white flex flex-col overflow-hidden transition-all duration-200 ${showSuggestions ? "w-72" : "w-0"}`}
        style={{ height: "100%" }}
      >
        {showSuggestions && (
          <>
            <div className="flex items-center justify-between border-b px-4 py-3 flex-shrink-0">
              <div className="flex items-center gap-2 font-semibold text-sm text-blue-700">
                <Zap className="h-4 w-4" /> AI Suggestions
              </div>
              <button onClick={() => setShowSuggestions(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Thumbnail grid */}
            <div className="p-3 border-b flex-shrink-0">
              <div className="grid grid-cols-2 gap-2">
                {VISUAL_CATEGORIES.map(cat => (
                  <button
                    key={cat.type}
                    onClick={() => handleSelectVisualType(cat.type)}
                    className="group overflow-hidden rounded-lg border border-border hover:border-blue-400 hover:shadow-md transition-all focus:outline-none"
                    title={cat.label}
                  >
                    <VisualThumb type={cat.type} />
                    <div className="py-1 text-center text-[10px] text-muted-foreground group-hover:text-blue-600 font-medium transition-colors">
                      {cat.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Category list — scrolls within its own column */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="text-sm font-semibold text-gray-700 mb-2.5">⊞ Categories</div>
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 mb-3 bg-gray-50">
                <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <input
                  value={categorySearch}
                  onChange={e => setCategorySearch(e.target.value)}
                  placeholder="Search (e.g. Mindmap...)"
                  className="flex-1 bg-transparent text-xs text-gray-700 focus:outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div className="space-y-0.5">
                {filteredCats.map(cat => (
                  <button
                    key={cat.type}
                    onClick={() => handleSelectVisualType(cat.type)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  >
                    <span>{cat.label}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Right panel: Document — scrolls independently ── */}
      <div className="flex flex-1 flex-col overflow-hidden" style={{ height: "100%" }}>

        {/* Toolbar — sticky at top of right panel */}
        <div className="flex items-center justify-between border-b px-4 py-2 bg-white flex-shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={reset} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <span className="text-sm font-semibold text-gray-700 truncate">{docTitle}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
              Click <Zap className="inline h-3 w-3 text-blue-500" /> to visualize a section
            </span>
            <button onClick={reset} className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors">
              <RefreshCw className="h-3 w-3" /> New
            </button>
          </div>
        </div>

        {/* Scrollable document — only this scrolls */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto py-8 px-2">
            {blocks.map((block, blockIdx) => {
              const isTitle   = block.heading.type === "title";
              const isH2      = block.heading.type === "h2";
              const isLoading = generatingVisual === blockIdx;
              const hasVisual = !!visuals[blockIdx];

              return (
                <div key={blockIdx} className={`flex ${isH2 ? "mb-8" : isTitle ? "mb-4" : "mb-2"}`}>
                  {/* Left gutter (48px) — lightning bolt, scrolls with content so it stays aligned */}
                  <div className="flex-shrink-0 flex flex-col items-center" style={{ width: 52 }}>
                    {isH2 && (
                      <button
                        onClick={() => openSuggestions(blockIdx)}
                        className="mt-4 flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-md hover:bg-blue-700 active:scale-95 transition-all z-10"
                        title="Generate visual for this section"
                      >
                        {isLoading
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Zap className="h-4 w-4" />}
                      </button>
                    )}
                  </div>

                  {/* Content with blue left border on h2 blocks */}
                  <div className={`flex-1 pb-7 pr-6 ${isH2 ? "border-l-2 border-blue-400 pl-5" : "pl-2"}`}>

                    {/* Title heading */}
                    {isTitle && block.heading.content && (
                      <h1 className="text-3xl font-bold text-gray-900 mb-4 mt-2 flex items-center gap-3">
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-xl select-none">🧠</span>
                        {block.heading.content}
                      </h1>
                    )}

                    {/* Section heading */}
                    {isH2 && (
                      <h2 className="text-xl font-bold text-gray-800 mt-1 mb-3">{block.heading.content}</h2>
                    )}

                    {/* Body — paragraphs, bullets, numbered lists */}
                    {block.body.map(sec => {
                      if (sec.type === "paragraph") return (
                        <p key={sec.id} className="text-gray-700 text-sm leading-relaxed mb-3">
                          <Inline text={sec.content} />
                        </p>
                      );
                      if (sec.type === "bullet") return (
                        <ul key={sec.id} className="list-disc pl-5 mb-3 space-y-1.5">
                          {(sec.items || []).map((item, ii) => (
                            <li key={ii} className="text-gray-700 text-sm leading-relaxed"><Inline text={item} /></li>
                          ))}
                        </ul>
                      );
                      if (sec.type === "numbered") return (
                        <ol key={sec.id} className="list-decimal pl-5 mb-3 space-y-1.5">
                          {(sec.items || []).map((item, ii) => (
                            <li key={ii} className="text-gray-700 text-sm leading-relaxed"><Inline text={item} /></li>
                          ))}
                        </ol>
                      );
                      return null;
                    })}

                    {/* Visual loading state — inside the border line */}
                    {isH2 && isLoading && (
                      <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                        <Loader2 className="h-5 w-5 animate-spin flex-shrink-0" />
                        Generating visual from section content…
                      </div>
                    )}

                    {/* Visual embed — inside the border line, full width of content area */}
                    {isH2 && hasVisual && !isLoading && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">AI Generated Visual</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openSuggestions(blockIdx)}
                              className="text-[10px] text-blue-500 hover:text-blue-700 font-medium transition-colors"
                            >
                              Change type
                            </button>
                            <button
                              onClick={() => setVisuals(prev => { const n = {...prev}; delete n[blockIdx]; return n; })}
                              className="text-muted-foreground hover:text-red-500 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {/* Visual rendered inside the section's border-left container */}
                        <VisualRenderer visual={visuals[blockIdx]} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
