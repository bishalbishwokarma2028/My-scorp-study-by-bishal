import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import React from "react";
import {
  Loader2, Zap, ClipboardList, Sparkles, X, ArrowLeft, RefreshCw,
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
type VisualType =
  | "mindmap" | "process" | "cycle" | "timeline" | "tree"
  | "comparison" | "venn" | "pyramid" | "funnel"
  | "framework" | "data" | "causeeffect";

type DocSection = {
  id: number;
  type: "title" | "h2" | "paragraph" | "bullet" | "numbered";
  content: string;
  items?: string[];
};
type DocBlock = { heading: DocSection; body: DocSection[] };

type MindmapData     = { center: string; branches: { label: string; items: string[] }[] };
type ProcessData     = { title: string; steps: { label: string; description: string }[] };
type CycleData       = { title: string; stages: { label: string; description: string }[] };
type TimelineData    = { title: string; events: { label: string; detail: string }[] };
type TreeData        = { title: string; root: string; branches: { label: string; children: string[] }[] };
type ComparisonData  = { title: string; left: { label: string; points: string[] }; right: { label: string; points: string[] } };
type VennData        = { title: string; left: { label: string; items: string[] }; right: { label: string; items: string[] }; overlap: string[] };
type PyramidData     = { title: string; levels: { label: string; description: string }[] };
type FunnelData      = { title: string; stages: { label: string; detail: string }[] };
type FrameworkData   = { title: string; levels: { label: string; items: string[] }[] };
type DataFactsData   = { title: string; facts: { label: string; detail: string }[] };
type CauseEffectData = { title: string; effect: string; causes: { category: string; items: string[] }[] };

type VisualData =
  | { type: "mindmap";     data: MindmapData }
  | { type: "process";     data: ProcessData }
  | { type: "cycle";       data: CycleData }
  | { type: "timeline";    data: TimelineData }
  | { type: "tree";        data: TreeData }
  | { type: "comparison";  data: ComparisonData }
  | { type: "venn";        data: VennData }
  | { type: "pyramid";     data: PyramidData }
  | { type: "funnel";      data: FunnelData }
  | { type: "framework";   data: FrameworkData }
  | { type: "data";        data: DataFactsData }
  | { type: "causeeffect"; data: CauseEffectData };

const VISUAL_CATEGORIES: { type: VisualType; label: string; icon: string }[] = [
  { type: "mindmap",     label: "Mind Map",       icon: "🧠" },
  { type: "process",     label: "Process Flow",   icon: "⚙️" },
  { type: "cycle",       label: "Cycle",          icon: "🔄" },
  { type: "timeline",    label: "Timeline",       icon: "📅" },
  { type: "tree",        label: "Tree Diagram",   icon: "🌳" },
  { type: "comparison",  label: "Comparison",     icon: "⚖️" },
  { type: "venn",        label: "Venn Diagram",   icon: "🔵" },
  { type: "pyramid",     label: "Pyramid",        icon: "🔺" },
  { type: "funnel",      label: "Funnel",         icon: "📉" },
  { type: "framework",   label: "Framework",      icon: "🏗️" },
  { type: "data",        label: "Key Facts",      icon: "📊" },
  { type: "causeeffect", label: "Cause & Effect", icon: "🐟" },
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

// ── Auto-select best visual type based on content ─────────────────────────────
function autoPickType(heading: string, bodyText: string): VisualType {
  const t = (heading + " " + bodyText).toLowerCase();

  if (/cycle|circular|loop|recurring|repeat|rotation|rhythm|water cycle|carbon cycle|nitrogen cycle|oxygen cycle|rock cycle|life cycle|feedback loop/i.test(t))
    return "cycle";
  if (/cause|effect|reason|because|result|consequence|led to|due to|fishbone|ishikawa|factor.*affect|why.*happen/i.test(t))
    return "causeeffect";
  if (/funnel|conversion|pipeline|qualify|nurture|marketing funnel|sales funnel|filter.*stage|drip/i.test(t))
    return "funnel";
  if (/\bvs\b|versus|overlap|both.*have|in common|shared.*between|intersect|similarities.*differences|compare.*two|two.*group/i.test(t))
    return "venn";
  if (/timeline|history|historical|century|decade|year \d|era|period|chronolog|bce|bc\b|ad \d|progression.*time|over time/i.test(t))
    return "timeline";
  if (/pyramid|maslow|hierarchy of needs|priority|tier.*from|bottom to top|top to bottom|foundation.*structure|layer.*importance/i.test(t))
    return "pyramid";
  if (/classif|taxonom|branch|subdivid|types? of|kinds? of|categori|species|genus|family|tree\b.*diagram|tree\b.*structure/i.test(t))
    return "tree";
  if (/step|procedure|how to|method|phase\b|workflow|algorithm|sequen|first.*then|next step|stage.*process|implementation/i.test(t))
    return "process";
  if (/framework|layer|component|system.*level|architecture|model\b.*level|structure.*tier|strategic.*level/i.test(t))
    return "framework";
  if (/compare|contrast|difference|advantage|disadvantage|benefit|drawback|pros|cons|versus|opposing/i.test(t))
    return "comparison";
  if (/statistic|data point|fact|figure|number|metric|measure|quantit|percent|rate\b|kpi|key figure/i.test(t))
    return "data";

  return "mindmap"; // default for conceptual/overview topics
}

// ── AI visual generation ───────────────────────────────────────────────────────
async function generateVisual(context: string, heading: string, type: VisualType): Promise<VisualData | null> {
  const sys = "Return ONLY raw valid JSON. No markdown fences, no prose. JSON only.";

  const prompts: Record<VisualType, string> = {
    mindmap:
      `Create a detailed mindmap for "${heading}". Extract key concepts from: "${context}". Return JSON: {"center":"${heading.slice(0,20)}","branches":[{"label":"Concept (max 14 chars)","items":["specific detail","another detail","third detail"]}]}. Use 4-5 branches with real terms from the content.`,
    process:
      `Create a step-by-step process for "${heading}". Use actual steps from: "${context}". Return JSON: {"title":"${heading}","steps":[{"label":"Step Name","description":"Description from the text."}]}. Include 5-6 steps with real content.`,
    cycle:
      `Create a cycle diagram for "${heading}". Extract recurring stages from: "${context}". Return JSON: {"title":"${heading}","stages":[{"label":"Stage Name","description":"Brief description"}]}. Include 4-5 stages that form a complete cycle. Use real content.`,
    timeline:
      `Create a timeline for "${heading}". Extract events or phases from: "${context}". Return JSON: {"title":"${heading}","events":[{"label":"Event or Stage Name","detail":"Detail from the text."}]}. Include 5-6 events in chronological order.`,
    tree:
      `Create a tree/hierarchy diagram for "${heading}". Extract hierarchical structure from: "${context}". Return JSON: {"title":"${heading}","root":"${heading.slice(0,20)}","branches":[{"label":"Main Category","children":["subcategory 1","subcategory 2","subcategory 3"]}]}. Include 3-4 branches with 2-3 children each.`,
    comparison:
      `Create a comparison for "${heading}". Extract two contrasting aspects from: "${context}". Return JSON: {"title":"${heading}","left":{"label":"Aspect A","points":["point","point","point","point"]},"right":{"label":"Aspect B","points":["point","point","point","point"]}}. Use real contrasts from content.`,
    venn:
      `Create a Venn diagram for "${heading}". Identify two groups and their overlap from: "${context}". Return JSON: {"title":"${heading}","left":{"label":"Group A","items":["unique trait 1","unique trait 2","unique trait 3"]},"right":{"label":"Group B","items":["unique trait 1","unique trait 2","unique trait 3"]},"overlap":["shared trait 1","shared trait 2"]}. Use real content.`,
    pyramid:
      `Create a pyramid diagram for "${heading}". Identify levels from apex (top, narrow) to base (bottom, broad) from: "${context}". Return JSON: {"title":"${heading}","levels":[{"label":"Top Level","description":"brief desc"},{"label":"Middle Level","description":"brief desc"},{"label":"Base Level","description":"brief desc"}]}. Index 0 = apex/top, last = base. Include 3-5 levels.`,
    funnel:
      `Create a funnel diagram for "${heading}". Identify narrowing stages from: "${context}". Return JSON: {"title":"${heading}","stages":[{"label":"Stage Name","detail":"What happens here"}]}. Include 4-5 stages, first stage is widest (top), last is narrowest (bottom).`,
    framework:
      `Create a hierarchical framework for "${heading}". Organize content into levels from: "${context}". Return JSON: {"title":"${heading}","levels":[{"label":"Level Name","items":["item","item","item"]}]}. Include 3-4 levels with 2-3 items each. Use real content.`,
    data:
      `Create key facts visualization for "${heading}". Extract real facts from: "${context}". Return JSON: {"title":"${heading}","facts":[{"label":"Fact Title","detail":"Specific fact from the content."}]}. Include 6 facts. Use actual content.`,
    causeeffect:
      `Create a cause-and-effect (fishbone) diagram for "${heading}". Identify the main effect and cause categories from: "${context}". Return JSON: {"title":"${heading}","effect":"${heading.slice(0,20)}","causes":[{"category":"Cause Category","items":["specific cause 1","specific cause 2"]}]}. Include 4-6 cause categories with 2 items each.`,
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

// ── Visual renderers ───────────────────────────────────────────────────────────
const NODE_COLORS = ["#1e3a8a","#1e40af","#1d4ed8","#2563eb","#3b82f6","#0369a1"];

function MindmapVisual({ data }: { data: MindmapData }) {
  const cx = 300, cy = 185, radius = 140;
  const branches = (data.branches || []).slice(0, 6);
  const n = branches.length || 1;

  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 text-center">
        <span className="text-blue-900 font-bold text-sm">{data.center}</span>
      </div>
      <svg viewBox="0 0 600 370" className="w-full">
        <circle cx={cx} cy={cy} r={52} fill="#1e3a8a" />
        {data.center.split(" ").slice(0, 3).map((word, wi) => (
          <text key={wi} x={cx} y={cy - 10 + wi * 14} textAnchor="middle" fill="white" fontSize="9.5" fontWeight="bold">{word}</text>
        ))}
        {branches.map((b, i) => {
          const angle = ((i * 360) / n - 90) * (Math.PI / 180);
          const bx = cx + radius * Math.cos(angle);
          const by = cy + radius * Math.sin(angle);
          const col = NODE_COLORS[i % NODE_COLORS.length];
          return (
            <g key={i}>
              <path d={`M ${cx} ${cy} Q ${cx + (bx - cx) * 0.5} ${cy + (by - cy) * 0.5} ${bx} ${by}`}
                stroke={col} strokeWidth="1.5" fill="none" opacity="0.5" />
              <rect x={bx - 50} y={by - 14} width={100} height={28} rx="14" fill={col} />
              <text x={bx} y={by + 1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="bold">
                {(b.label || "").slice(0, 16)}
              </text>
              {(b.items || []).slice(0, 3).map((item, j) => (
                <text key={j} x={bx} y={by + 30 + j * 14} textAnchor="middle" fill="#374151" fontSize="8">
                  ∙ {item.slice(0, 28)}
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
  const steps = (data.steps || []).slice(0, 7);
  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 text-center">
        <span className="text-blue-900 font-bold text-sm">{data.title}</span>
      </div>
      <div className="p-4 space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">{i + 1}</div>
              {i < steps.length - 1 && <div className="w-px h-3 bg-blue-200 mt-0.5" />}
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

function CycleVisual({ data }: { data: CycleData }) {
  const stages = (data.stages || []).slice(0, 6);
  const n = Math.max(stages.length, 1);
  const cx = 200, cy = 140, r = 92;

  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 text-center">
        <span className="text-blue-900 font-bold text-sm">{data.title}</span>
      </div>
      <svg viewBox="0 0 400 280" className="w-full">
        <defs>
          <marker id="cyc-arr" viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#60a5fa" />
          </marker>
        </defs>
        {/* Connecting lines */}
        {stages.map((_, i) => {
          const a1 = ((-90 + (360 / n) * i) * Math.PI) / 180;
          const a2 = ((-90 + (360 / n) * ((i + 1) % n)) * Math.PI) / 180;
          const x1 = cx + r * Math.cos(a1);
          const y1 = cy + r * Math.sin(a1);
          const x2 = cx + r * Math.cos(a2);
          const y2 = cy + r * Math.sin(a2);
          // Slight inward curve
          const qx = (x1 + x2) / 2 + (cx - (x1 + x2) / 2) * 0.25;
          const qy = (y1 + y2) / 2 + (cy - (y1 + y2) / 2) * 0.25;
          return (
            <path key={i} d={`M ${x1} ${y1} Q ${qx} ${qy} ${x2} ${y2}`}
              stroke="#93c5fd" strokeWidth="1.5" fill="none" markerEnd="url(#cyc-arr)" />
          );
        })}
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={18} fill="#eff6ff" stroke="#bfdbfe" strokeWidth="1.5" />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill="#1e3a8a" fontSize="9" fontWeight="bold">cycle</text>
        {/* Stage nodes */}
        {stages.map((stage, i) => {
          const angle = ((-90 + (360 / n) * i) * Math.PI) / 180;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          const col = NODE_COLORS[i % NODE_COLORS.length];
          // Step badge
          return (
            <g key={i}>
              <rect x={x - 50} y={y - 18} width={100} height={36} rx="10" fill={col} />
              <text x={x} y={y - 6} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="8.5" fontWeight="bold">
                {(stage.label || "").slice(0, 16)}
              </text>
              <text x={x} y={y + 8} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize="7.5">
                {(stage.description || "").slice(0, 22)}
              </text>
              {/* Step number badge */}
              <circle cx={x + 42} cy={y - 16} r="7" fill="white" />
              <text x={x + 42} y={y - 16} textAnchor="middle" dominantBaseline="middle" fill={col} fontSize="7.5" fontWeight="bold">{i + 1}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TimelineVisual({ data }: { data: TimelineData }) {
  const events = (data.events || []).slice(0, 7);
  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 text-center">
        <span className="text-blue-900 font-bold text-sm">{data.title}</span>
      </div>
      <div className="p-4">
        {events.map((ev, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="h-3 w-3 rounded-full bg-blue-600 mt-1.5 flex-shrink-0 ring-2 ring-blue-200" />
              {i < events.length - 1 && <div className="w-px flex-1 bg-blue-200 mt-1 min-h-[18px]" />}
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

function TreeVisual({ data }: { data: TreeData }) {
  const branches = (data.branches || []).slice(0, 5);
  const nb = Math.max(branches.length, 1);
  const W = 480, rootX = W / 2, rootY = 32, branchY = 120, childY = 210;
  const branchXs = branches.map((_, i) =>
    nb === 1 ? rootX : 55 + ((W - 110) / (nb - 1)) * i
  );
  const childSpacing = nb >= 4 ? 38 : 46;
  const maxChildren = nb >= 4 ? 2 : 3;

  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 text-center">
        <span className="text-blue-900 font-bold text-sm">{data.title}</span>
      </div>
      <svg viewBox={`0 0 ${W} 265`} className="w-full">
        {/* Root node */}
        <rect x={rootX - 58} y={rootY - 15} width={116} height={30} rx="8" fill="#1e3a8a" />
        <text x={rootX} y={rootY + 1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9.5" fontWeight="bold">
          {(data.root || "").slice(0, 20)}
        </text>

        {branches.map((branch, i) => {
          const bx = branchXs[i];
          const col = NODE_COLORS[i % NODE_COLORS.length];
          const children = (branch.children || []).slice(0, maxChildren);
          const nc = children.length;

          return (
            <g key={i}>
              {/* Root → branch line */}
              <line x1={rootX} y1={rootY + 15} x2={bx} y2={branchY - 15} stroke="#bfdbfe" strokeWidth="1.2" />
              {/* Branch node */}
              <rect x={bx - 46} y={branchY - 15} width={92} height={30} rx="7" fill={col} />
              <text x={bx} y={branchY + 1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="bold">
                {(branch.label || "").slice(0, 15)}
              </text>

              {/* Children */}
              {children.map((child, ci) => {
                const offset = nc === 1 ? 0 : (ci - (nc - 1) / 2) * childSpacing * 2;
                const cx2 = Math.max(22, Math.min(W - 22, bx + offset));
                return (
                  <g key={ci}>
                    <line x1={bx} y1={branchY + 15} x2={cx2} y2={childY - 13} stroke="#bfdbfe" strokeWidth="1" />
                    <rect x={cx2 - 40} y={childY - 13} width={80} height={26} rx="6" fill="#dbeafe" />
                    <text x={cx2} y={childY + 1} textAnchor="middle" dominantBaseline="middle" fill="#1e3a8a" fontSize="8">
                      {(child || "").slice(0, 14)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
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

function VennVisual({ data }: { data: VennData }) {
  const leftItems  = (data.left?.items  || []).slice(0, 3);
  const rightItems = (data.right?.items || []).slice(0, 3);
  const overlap    = (data.overlap      || []).slice(0, 2);

  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 text-center">
        <span className="text-blue-900 font-bold text-sm">{data.title}</span>
      </div>
      <svg viewBox="0 0 500 230" className="w-full">
        {/* Left circle */}
        <circle cx="175" cy="113" r="92" fill="#1d4ed8" fillOpacity="0.82" />
        {/* Right circle */}
        <circle cx="325" cy="113" r="92" fill="#3b82f6" fillOpacity="0.72" />
        {/* Labels */}
        <text x="120" y="42" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">{(data.left?.label || "").slice(0, 16)}</text>
        <text x="380" y="42" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">{(data.right?.label || "").slice(0, 16)}</text>
        {/* Left-only items */}
        {leftItems.map((item, i) => (
          <text key={i} x="115" y={80 + i * 22} textAnchor="middle" fill="white" fontSize="8.5">
            {item.slice(0, 18)}
          </text>
        ))}
        {/* Right-only items */}
        {rightItems.map((item, i) => (
          <text key={i} x="385" y={80 + i * 22} textAnchor="middle" fill="white" fontSize="8.5">
            {item.slice(0, 18)}
          </text>
        ))}
        {/* Overlap items */}
        <text x="250" y="98" textAnchor="middle" fill="white" fontSize="8" fontStyle="italic" opacity="0.9">both</text>
        {overlap.map((item, i) => (
          <text key={i} x="250" y={112 + i * 18} textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">
            {item.slice(0, 18)}
          </text>
        ))}
        {/* Bottom label */}
        <text x="250" y="195" textAnchor="middle" fill="#1e3a8a" fontSize="8" fontStyle="italic">∩ shared</text>
      </svg>
    </div>
  );
}

function PyramidVisual({ data }: { data: PyramidData }) {
  // data.levels[0] = apex/top (narrow), last = base (wide)
  const levels = (data.levels || []).slice(0, 5);
  const n = Math.max(levels.length, 1);
  const W = 380, totalH = 220, padTop = 22;
  const levelH = totalH / n;
  const maxW = W - 40;
  const blues = ["#1e3a8a","#1e40af","#1d4ed8","#2563eb","#3b82f6"];

  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 text-center">
        <span className="text-blue-900 font-bold text-sm">{data.title}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${totalH + padTop + 18}`} className="w-full">
        {levels.map((level, i) => {
          // i=0 is apex (top, narrow), i=n-1 is base (wide)
          const topW = i === 0 ? 60 : maxW * (i / n);
          const botW = maxW * ((i + 1) / n);
          const y = padTop + i * levelH;
          const leftTop  = (W - topW) / 2;
          const rightTop = (W + topW) / 2;
          const leftBot  = (W - botW) / 2;
          const rightBot = (W + botW) / 2;
          const pts = `${leftTop},${y} ${rightTop},${y} ${rightBot},${y + levelH - 2} ${leftBot},${y + levelH - 2}`;
          const col = blues[i % blues.length];
          const midY = y + levelH / 2;

          return (
            <g key={i}>
              <polygon points={pts} fill={col} />
              <text x={W / 2} y={midY - 5} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9.5" fontWeight="bold">
                {(level.label || "").slice(0, 22)}
              </text>
              <text x={W / 2} y={midY + 8} textAnchor="middle" fill="rgba(255,255,255,0.78)" fontSize="8">
                {(level.description || "").slice(0, 30)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function FunnelVisual({ data }: { data: FunnelData }) {
  // stages[0] = widest (top), last = narrowest (bottom)
  const stages = (data.stages || []).slice(0, 6);
  const n = Math.max(stages.length, 1);
  const W = 380, totalH = 230, padTop = 20;
  const levelH = totalH / n;
  const maxW = W - 40;
  const minBotW = 50;
  const blues = ["#1d4ed8","#2563eb","#3b82f6","#0369a1","#0284c7","#0ea5e9"];

  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 text-center">
        <span className="text-blue-900 font-bold text-sm">{data.title}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${totalH + padTop + 10}`} className="w-full">
        {stages.map((stage, i) => {
          const topW = Math.max(maxW * (n - i) / n, minBotW);
          const botW = Math.max(maxW * (n - i - 1) / n, minBotW);
          const y = padTop + i * levelH;
          const leftTop  = (W - topW) / 2;
          const rightTop = (W + topW) / 2;
          const leftBot  = (W - botW) / 2;
          const rightBot = (W + botW) / 2;
          const pts = `${leftTop},${y} ${rightTop},${y} ${rightBot},${y + levelH - 2} ${leftBot},${y + levelH - 2}`;
          const col = blues[i % blues.length];
          const midY = y + levelH / 2;

          return (
            <g key={i}>
              <polygon points={pts} fill={col} />
              <text x={W / 2} y={midY - 4} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9.5" fontWeight="bold">
                {(stage.label || "").slice(0, 22)}
              </text>
              <text x={W / 2} y={midY + 9} textAnchor="middle" fill="rgba(255,255,255,0.78)" fontSize="8">
                {(stage.detail || "").slice(0, 28)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function FrameworkVisual({ data }: { data: FrameworkData }) {
  const bgs = ["#1e3a8a","#1e40af","#1d4ed8","#2563eb"];
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
                <span key={j} className="px-2 py-0.5 rounded-full text-xs" style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>{item}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataVisual({ data }: { data: DataFactsData }) {
  const bgColors     = ["#eff6ff","#e0f2fe","#dbeafe","#ede9fe","#f0fdf4","#fef3c7"];
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

function CauseEffectVisual({ data }: { data: CauseEffectData }) {
  const causes    = (data.causes || []).slice(0, 6);
  const topCauses = causes.filter((_, i) => i % 2 === 0).slice(0, 3);
  const botCauses = causes.filter((_, i) => i % 2 === 1).slice(0, 3);
  const spineY = 135;
  // Anchor points on spine where branches meet
  const topAnchors = [140, 255, 370];
  const botAnchors = [195, 310, 425];
  const branchLen  = 62;

  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 text-center">
        <span className="text-blue-900 font-bold text-sm">{data.title}</span>
      </div>
      <svg viewBox="0 0 500 270" className="w-full">
        <defs>
          <marker id="fe-arr" viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb" />
          </marker>
        </defs>

        {/* Spine */}
        <line x1="28" y1={spineY} x2="432" y2={spineY} stroke="#2563eb" strokeWidth="2.5" markerEnd="url(#fe-arr)" />

        {/* Effect box */}
        <rect x="435" y={spineY - 26} width="58" height="52" rx="8" fill="#1e3a8a" />
        <text x="464" y={spineY - 8} textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">
          {(data.effect || "Effect").slice(0, 10)}
        </text>
        <text x="464" y={spineY + 6} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize="7">
          {(data.effect || "").slice(10, 22)}
        </text>

        {/* Top branches */}
        {topCauses.map((cause, i) => {
          const ax = topAnchors[i] ?? 200;
          const bx = ax - branchLen;
          const by = spineY - branchLen;
          return (
            <g key={i}>
              <line x1={bx} y1={by} x2={ax} y2={spineY} stroke="#93c5fd" strokeWidth="1.5" />
              <rect x={bx - 44} y={by - 15} width={88} height={30} rx="7" fill="#1d4ed8" />
              <text x={bx} y={by - 4} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="8.5" fontWeight="bold">
                {(cause.category || "").slice(0, 14)}
              </text>
              {(cause.items || []).slice(0, 2).map((item, j) => (
                <text key={j} x={bx - 20 + j * 40} y={by - 32 - j * 0} textAnchor="middle" fill="#374151" fontSize="7.5">
                  · {item.slice(0, 14)}
                </text>
              ))}
            </g>
          );
        })}

        {/* Bottom branches */}
        {botCauses.map((cause, i) => {
          const ax = botAnchors[i] ?? 250;
          const bx = ax - branchLen;
          const by = spineY + branchLen;
          return (
            <g key={i}>
              <line x1={bx} y1={by} x2={ax} y2={spineY} stroke="#93c5fd" strokeWidth="1.5" />
              <rect x={bx - 44} y={by - 15} width={88} height={30} rx="7" fill="#2563eb" />
              <text x={bx} y={by - 4} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="8.5" fontWeight="bold">
                {(cause.category || "").slice(0, 14)}
              </text>
              {(cause.items || []).slice(0, 2).map((item, j) => (
                <text key={j} x={bx - 20 + j * 40} y={by + 22 + j * 0} textAnchor="middle" fill="#374151" fontSize="7.5">
                  · {item.slice(0, 14)}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function VisualRenderer({ visual }: { visual: VisualData }) {
  switch (visual.type) {
    case "mindmap":     return <MindmapVisual     data={visual.data as MindmapData} />;
    case "process":     return <ProcessVisual     data={visual.data as ProcessData} />;
    case "cycle":       return <CycleVisual       data={visual.data as CycleData} />;
    case "timeline":    return <TimelineVisual    data={visual.data as TimelineData} />;
    case "tree":        return <TreeVisual        data={visual.data as TreeData} />;
    case "comparison":  return <ComparisonVisual  data={visual.data as ComparisonData} />;
    case "venn":        return <VennVisual        data={visual.data as VennData} />;
    case "pyramid":     return <PyramidVisual     data={visual.data as PyramidData} />;
    case "funnel":      return <FunnelVisual      data={visual.data as FunnelData} />;
    case "framework":   return <FrameworkVisual   data={visual.data as FrameworkData} />;
    case "data":        return <DataVisual        data={visual.data as DataFactsData} />;
    case "causeeffect": return <CauseEffectVisual data={visual.data as CauseEffectData} />;
    default: return null;
  }
}

// ── Thumbnail SVGs for AI panel ────────────────────────────────────────────────
function VisualThumb({ type, active }: { type: VisualType; active?: boolean }) {
  const thumbs: Record<VisualType, React.ReactNode> = {
    mindmap: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill={active ? "#dbeafe" : "#eff6ff"} />
        <circle cx="30" cy="22" r="7" fill="#1e3a8a" />
        {[[0,-14],[13,7],[-13,7],[10,-11],[-10,-11]].map(([dx,dy],i) => (
          <g key={i}>
            <line x1="30" y1="22" x2={30+(dx||0)} y2={22+(dy||0)} stroke="#93c5fd" strokeWidth="0.8"/>
            <circle cx={30+(dx||0)} cy={22+(dy||0)} r="3.5" fill={NODE_COLORS[i]}/>
          </g>
        ))}
      </svg>
    ),
    process: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill={active ? "#dbeafe" : "#eff6ff"} />
        {[5,14,23,32].map((y,i) => (
          <g key={i}>
            <rect x="10" y={y} width="40" height="7" rx="2" fill="#1d4ed8"/>
            {i < 3 && <line x1="30" y1={y+7} x2="30" y2={y+9} stroke="#93c5fd" strokeWidth="1"/>}
          </g>
        ))}
      </svg>
    ),
    cycle: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill={active ? "#dbeafe" : "#eff6ff"} />
        {[[-1,-12],[10,6],[-10,6]].map(([dx,dy],i) => (
          <g key={i}>
            <line x1="30" y1="22" x2={30+(dx||0)*1.4} y2={22+(dy||0)*1.4} stroke="#93c5fd" strokeWidth="0.8"/>
            <rect x={30+(dx||0)*1.4-7} y={22+(dy||0)*1.4-4} width="14" height="8" rx="3" fill={NODE_COLORS[i]}/>
          </g>
        ))}
        <circle cx="30" cy="22" r="4" fill="#1e3a8a"/>
      </svg>
    ),
    timeline: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill={active ? "#dbeafe" : "#eff6ff"} />
        <line x1="20" y1="4" x2="20" y2="41" stroke="#93c5fd" strokeWidth="1.5"/>
        {[7,16,25,34].map((y,i) => (
          <g key={i}>
            <circle cx="20" cy={y} r="2.5" fill="#1d4ed8"/>
            <rect x="25" y={y-3} width="27" height="6" rx="1.5" fill="#dbeafe"/>
          </g>
        ))}
      </svg>
    ),
    tree: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill={active ? "#dbeafe" : "#eff6ff"} />
        <rect x="22" y="4" width="16" height="8" rx="2" fill="#1e3a8a"/>
        {[12,30,48].map((x,i) => (
          <g key={i}>
            <line x1="30" y1="12" x2={x} y2="20" stroke="#93c5fd" strokeWidth="0.8"/>
            <rect x={x-7} y="20" width="14" height="8" rx="2" fill={NODE_COLORS[i+1]}/>
            {[x-5,x+2].map((cx2,j) => (
              <g key={j}>
                <line x1={x} y1="28" x2={cx2} y2="35" stroke="#bfdbfe" strokeWidth="0.7"/>
                <rect x={cx2-4} y="35" width="8" height="5" rx="1" fill="#dbeafe"/>
              </g>
            ))}
          </g>
        ))}
      </svg>
    ),
    comparison: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill={active ? "#dbeafe" : "#eff6ff"} />
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
    venn: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill={active ? "#dbeafe" : "#eff6ff"} />
        <circle cx="22" cy="22" r="14" fill="#1d4ed8" fillOpacity="0.75"/>
        <circle cx="38" cy="22" r="14" fill="#3b82f6" fillOpacity="0.65"/>
        <text x="30" y="23" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="5" fontWeight="bold">∩</text>
      </svg>
    ),
    pyramid: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill={active ? "#dbeafe" : "#eff6ff"} />
        <polygon points="30,5 38,16 22,16" fill="#1e3a8a"/>
        <polygon points="22,17 38,17 46,28 14,28" fill="#1e40af"/>
        <polygon points="14,29 46,29 54,40 6,40" fill="#2563eb"/>
      </svg>
    ),
    funnel: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill={active ? "#dbeafe" : "#eff6ff"} />
        <polygon points="4,5 56,5 48,17 12,17" fill="#1d4ed8"/>
        <polygon points="12,18 48,18 42,29 18,29" fill="#2563eb"/>
        <polygon points="18,30 42,30 36,41 24,41" fill="#3b82f6"/>
      </svg>
    ),
    framework: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill={active ? "#dbeafe" : "#eff6ff"} />
        <rect x="15" y="4"  width="30" height="9"  rx="2" fill="#1e3a8a"/>
        <rect x="8"  y="16" width="44" height="9"  rx="2" fill="#1e40af"/>
        <rect x="3"  y="28" width="54" height="9"  rx="2" fill="#2563eb"/>
      </svg>
    ),
    data: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill={active ? "#dbeafe" : "#eff6ff"} />
        {([[5,5,"#1d4ed8"],[33,5,"#1e40af"],[5,25,"#2563eb"],[33,25,"#0369a1"]] as [number,number,string][]).map(([x,y,c],i) => (
          <g key={i}>
            <rect x={x} y={y} width="22" height="15" rx="2" fill={active ? "#bfdbfe" : "#dbeafe"}/>
            <rect x={x} y={y} width="3" height="15" rx="1" fill={c}/>
          </g>
        ))}
      </svg>
    ),
    causeeffect: (
      <svg viewBox="0 0 60 45" className="w-full h-full">
        <rect width="60" height="45" rx="4" fill={active ? "#dbeafe" : "#eff6ff"} />
        <line x1="8" y1="22" x2="48" y2="22" stroke="#2563eb" strokeWidth="1.5"/>
        <rect x="48" y="17" width="10" height="10" rx="2" fill="#1e3a8a"/>
        {[[14,14],[24,14],[34,14]].map(([x,y],i) => (
          <line key={i} x1={x-4} y1={y} x2={x+4} y2="22" stroke="#93c5fd" strokeWidth="1"/>
        ))}
        {[[18,30],[28,30],[38,30]].map(([x,y],i) => (
          <line key={i} x1={x-4} y1={y} x2={x+4} y2="22" stroke="#93c5fd" strokeWidth="1"/>
        ))}
      </svg>
    ),
  };
  return <div className="w-full aspect-[4/3] overflow-hidden rounded">{thumbs[type]}</div>;
}

// ── Main component ─────────────────────────────────────────────────────────────
function MemorizerPage() {
  const [mode, setMode]               = useState<Mode>("landing");
  const [blocks, setBlocks]           = useState<DocBlock[]>([]);
  const [docTitle, setDocTitle]       = useState("");
  const [topicInput, setTopicInput]   = useState("");
  const [pasteInput, setPasteInput]   = useState("");
  const [generating, setGenerating]   = useState(false);
  const [activeBlockIdx, setActiveBlockIdx] = useState<number | null>(null);
  const [activeType, setActiveType]   = useState<VisualType | null>(null);
  const [visuals, setVisuals]         = useState<Record<number, VisualData>>({});
  const [generatingVisual, setGeneratingVisual] = useState<number | null>(null);
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
        [], false, 4000
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
        // Fallback: parse as-is
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

  // ── Core visual generation helper ───────────────────────────────────────────
  async function doGenerateVisual(blockIdx: number, type: VisualType) {
    const block = blocks[blockIdx];
    if (!block) return;

    const heading  = block.heading.content;
    const bodyText = block.body
      .map(s => (s.type === "bullet" || s.type === "numbered") ? (s.items || []).join(". ") : s.content)
      .join(" ")
      .slice(0, 600);

    setGeneratingVisual(blockIdx);
    try {
      const visual = await generateVisual(bodyText, heading, type);
      if (visual) {
        setVisuals(prev => ({ ...prev, [blockIdx]: visual }));
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

  // ── Click ⚡ on a section: auto-pick type and generate immediately ──────────
  function openSuggestions(blockIdx: number) {
    const block = blocks[blockIdx];
    if (!block) return;

    const heading  = block.heading.content;
    const bodyText = block.body
      .map(s => (s.type === "bullet" || s.type === "numbered") ? (s.items || []).join(". ") : s.content)
      .join(" ")
      .slice(0, 600);

    const picked = autoPickType(heading, bodyText);
    setActiveBlockIdx(blockIdx);
    setActiveType(picked);
    doGenerateVisual(blockIdx, picked);
  }

  // ── Manual type selection from panel ────────────────────────────────────────
  async function handleSelectVisualType(type: VisualType) {
    if (activeBlockIdx === null) return;
    setActiveType(type);
    await doGenerateVisual(activeBlockIdx, type);
  }

  function reset() {
    setMode("landing");
    setBlocks([]); setVisuals({}); setTopicInput(""); setPasteInput("");
    setDocTitle(""); setActiveBlockIdx(null); setActiveType(null);
  }

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

  // ── Document view ────────────────────────────────────────────────────────────
  // Two-column layout: sticky left panel (AI Visual Generator) + scrollable right doc
  const activeBlock = activeBlockIdx !== null ? blocks[activeBlockIdx] : null;

  return (
    <div className="fixed inset-x-0 bottom-0 top-14 lg:static lg:h-full flex overflow-hidden bg-white">

      {/* ── Left panel: AI Visual Generator — always visible, never scrolls ── */}
      <div className="w-56 flex-shrink-0 border-r bg-white flex flex-col overflow-hidden" style={{ height: "100%" }}>

        {/* Panel header */}
        <div className="flex items-center gap-2 border-b px-3 py-3 flex-shrink-0 bg-blue-50">
          <Zap className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <span className="font-bold text-sm text-blue-800">Visual Generator</span>
        </div>

        {/* Active section indicator */}
        <div className="px-3 py-2 border-b flex-shrink-0 bg-white min-h-[48px] flex flex-col justify-center">
          {activeBlock ? (
            <>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Section</div>
              <div className="text-xs font-semibold text-blue-900 truncate">{activeBlock.heading.content || "Untitled"}</div>
              {activeType && (
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                    {VISUAL_CATEGORIES.find(c => c.type === activeType)?.icon}{" "}
                    {VISUAL_CATEGORIES.find(c => c.type === activeType)?.label}
                  </span>
                  {generatingVisual === activeBlockIdx && (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-500 flex-shrink-0" />
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground leading-snug">
              Click <Zap className="inline h-3 w-3 text-blue-500" /> on any section to auto-generate a visual.
            </p>
          )}
        </div>

        {/* Visual type grid — scrollable */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 px-1">
            {activeBlock ? "Change diagram type" : "All diagram types"}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {VISUAL_CATEGORIES.map(cat => {
              const isActive = cat.type === activeType && activeBlockIdx !== null;
              const isLoading = generatingVisual === activeBlockIdx && cat.type === activeType;
              return (
                <button
                  key={cat.type}
                  onClick={() => {
                    if (activeBlockIdx === null) {
                      toast("Click ⚡ on a section first to target it.");
                      return;
                    }
                    handleSelectVisualType(cat.type);
                  }}
                  disabled={generatingVisual !== null}
                  className={`group relative overflow-hidden rounded-lg border transition-all focus:outline-none disabled:opacity-50 ${
                    isActive
                      ? "border-blue-500 shadow-md ring-1 ring-blue-400"
                      : "border-border hover:border-blue-300 hover:shadow-sm"
                  }`}
                  title={cat.label}
                >
                  <VisualThumb type={cat.type} active={isActive} />
                  <div className={`py-1 text-center text-[9px] font-medium transition-colors leading-tight px-0.5 ${
                    isActive ? "text-blue-700 bg-blue-50" : "text-muted-foreground group-hover:text-blue-600"
                  }`}>
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : cat.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Right panel: Document — scrolls independently ── */}
      <div className="flex flex-1 flex-col overflow-hidden" style={{ height: "100%" }}>

        {/* Toolbar — sticky at top */}
        <div className="flex items-center justify-between border-b px-4 py-2 bg-white flex-shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={reset} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <span className="text-sm font-semibold text-gray-700 truncate">{docTitle}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
              Click <Zap className="inline h-3 w-3 text-blue-500" /> to auto-visualize a section
            </span>
            <button onClick={reset} className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors">
              <RefreshCw className="h-3 w-3" /> New
            </button>
          </div>
        </div>

        {/* Scrollable document — only this area scrolls */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto py-8 px-2">
            {blocks.map((block, blockIdx) => {
              const isTitle   = block.heading.type === "title";
              const isH2      = block.heading.type === "h2";
              const isLoading = generatingVisual === blockIdx;
              const hasVisual = !!visuals[blockIdx];
              const isActive  = activeBlockIdx === blockIdx;

              return (
                <div key={blockIdx} className={`flex ${isH2 ? "mb-8" : isTitle ? "mb-4" : "mb-2"}`}>

                  {/* Left gutter — ⚡ button */}
                  <div className="flex-shrink-0 flex flex-col items-center" style={{ width: 52 }}>
                    {isH2 && (
                      <button
                        onClick={() => openSuggestions(blockIdx)}
                        disabled={generatingVisual !== null}
                        className={`mt-4 flex h-9 w-9 items-center justify-center rounded-full text-white shadow-md active:scale-95 transition-all z-10 disabled:opacity-60 ${
                          isActive
                            ? "bg-blue-700 ring-2 ring-blue-300 ring-offset-1"
                            : "bg-blue-600 hover:bg-blue-700"
                        }`}
                        title="Auto-generate best visual for this section"
                      >
                        {isLoading
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Zap className="h-4 w-4" />}
                      </button>
                    )}
                  </div>

                  {/* Content */}
                  <div className={`flex-1 pb-7 pr-6 ${isH2 ? `border-l-2 pl-5 ${isActive ? "border-blue-500" : "border-blue-300"}` : "pl-2"}`}>

                    {isTitle && block.heading.content && (
                      <h1 className="text-3xl font-bold text-gray-900 mb-4 mt-2 flex items-center gap-3">
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-xl select-none">🧠</span>
                        {block.heading.content}
                      </h1>
                    )}

                    {isH2 && (
                      <h2 className="text-xl font-bold text-gray-800 mt-1 mb-3">{block.heading.content}</h2>
                    )}

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

                    {/* Visual loading state */}
                    {isH2 && isLoading && (
                      <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                        <Loader2 className="h-5 w-5 animate-spin flex-shrink-0" />
                        Generating {activeType ? VISUAL_CATEGORIES.find(c => c.type === activeType)?.label : "visual"} from section content…
                      </div>
                    )}

                    {/* Visual embed */}
                    {isH2 && hasVisual && !isLoading && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                            {VISUAL_CATEGORIES.find(c => c.type === visuals[blockIdx].type)?.icon}{" "}
                            {VISUAL_CATEGORIES.find(c => c.type === visuals[blockIdx].type)?.label}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openSuggestions(blockIdx)}
                              className="text-[10px] text-blue-500 hover:text-blue-700 font-medium transition-colors"
                            >
                              Regenerate
                            </button>
                            <button
                              onClick={() => setVisuals(prev => { const n = {...prev}; delete n[blockIdx]; return n; })}
                              className="text-muted-foreground hover:text-red-500 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
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
