import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useCallback } from "react";
import React from "react";
import {
  Loader2, Zap, ClipboardList, Sparkles, X, ArrowLeft, RefreshCw, ChevronRight,
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
  | "comparison" | "venn" | "pyramid" | "funnel" | "framework"
  | "data" | "causeeffect" | "roadmap" | "matrix" | "network"
  | "staircase" | "hexcluster" | "concentric" | "swimlane" | "chevron";

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
type RoadmapData     = { title: string; milestones: { phase: string; label: string; items: string[] }[] };
type MatrixData      = { title: string; xAxis: string; yAxis: string; quadrants: { label: string; items: string[] }[] };
type NetworkData     = { title: string; center: string; nodes: { label: string; relation: string }[] };
type StaircaseData   = { title: string; steps: { label: string; detail: string }[] };
type HexclusterData  = { title: string; center: string; hexes: { label: string; detail: string }[] };
type ConcentricData  = { title: string; rings: { label: string; description: string }[] };
type SwimlaneData    = { title: string; lanes: { actor: string; steps: string[] }[] };
type ChevronData     = { title: string; steps: { label: string; detail: string }[] };

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
  | { type: "causeeffect"; data: CauseEffectData }
  | { type: "roadmap";     data: RoadmapData }
  | { type: "matrix";      data: MatrixData }
  | { type: "network";     data: NetworkData }
  | { type: "staircase";   data: StaircaseData }
  | { type: "hexcluster";  data: HexclusterData }
  | { type: "concentric";  data: ConcentricData }
  | { type: "swimlane";    data: SwimlaneData }
  | { type: "chevron";     data: ChevronData };

// ── Color Palettes ─────────────────────────────────────────────────────────────
type Palette = { id: number; name: string; swatch: string; bg: string; surface: string; surface2: string; accent: string; accent2: string; accent3: string; textPrimary: string; textSecondary: string; line: string };

const PALETTES: Palette[] = [
  { id: 0, name: "Midnight",  swatch: "#7c3aed", bg: "#0f1929", surface: "#1a2744", surface2: "#243560", accent: "#7c3aed", accent2: "#a78bfa", accent3: "#c4b5fd", textPrimary: "#f1f5f9", textSecondary: "#94a3b8", line: "#334155" },
  { id: 1, name: "Ocean",     swatch: "#0ea5e9", bg: "#071c2c", surface: "#0c2f4a", surface2: "#0e4272", accent: "#0ea5e9", accent2: "#38bdf8", accent3: "#7dd3fc", textPrimary: "#f0f9ff", textSecondary: "#94a3b8", line: "#1e3a5f" },
  { id: 2, name: "Slate",     swatch: "#2563eb", bg: "#f8fafc", surface: "#e2e8f0", surface2: "#cbd5e1", accent: "#2563eb", accent2: "#3b82f6", accent3: "#93c5fd", textPrimary: "#0f172a", textSecondary: "#475569", line: "#cbd5e1" },
  { id: 3, name: "Forest",    swatch: "#16a34a", bg: "#071a0c", surface: "#0f2d1a", surface2: "#1a4528", accent: "#16a34a", accent2: "#22c55e", accent3: "#86efac", textPrimary: "#f0fdf4", textSecondary: "#86efac", line: "#1a4528" },
  { id: 4, name: "Ember",     swatch: "#ea580c", bg: "#1a0d06", surface: "#2d1a0c", surface2: "#4a2a12", accent: "#ea580c", accent2: "#f97316", accent3: "#fdba74", textPrimary: "#fff7ed", textSecondary: "#fdba74", line: "#4a2a12" },
  { id: 5, name: "Crimson",   swatch: "#dc2626", bg: "#130608", surface: "#2d1015", surface2: "#4a1a22", accent: "#dc2626", accent2: "#ef4444", accent3: "#fca5a5", textPrimary: "#fff1f2", textSecondary: "#fca5a5", line: "#4a1a22" },
];

const VISUAL_CATEGORIES: { type: VisualType; label: string; icon: string }[] = [
  { type: "mindmap",    label: "Mind Map",      icon: "🧠" },
  { type: "process",    label: "Process",       icon: "⚙️" },
  { type: "cycle",      label: "Cycle",         icon: "🔄" },
  { type: "timeline",   label: "Timeline",      icon: "📅" },
  { type: "tree",       label: "Tree",          icon: "🌳" },
  { type: "comparison", label: "Comparison",    icon: "⚖️" },
  { type: "venn",       label: "Venn",          icon: "⭕" },
  { type: "pyramid",    label: "Pyramid",       icon: "🔺" },
  { type: "funnel",     label: "Funnel",        icon: "📉" },
  { type: "framework",  label: "Framework",     icon: "🏗️" },
  { type: "data",       label: "Key Facts",     icon: "📊" },
  { type: "causeeffect",label: "Cause & Effect",icon: "🐟" },
  { type: "roadmap",    label: "Roadmap",       icon: "🗺️" },
  { type: "matrix",     label: "Matrix",        icon: "🔲" },
  { type: "network",    label: "Network",       icon: "🕸️" },
  { type: "staircase",  label: "Staircase",     icon: "🪜" },
  { type: "hexcluster", label: "Hex Cluster",   icon: "⬡" },
  { type: "concentric", label: "Concentric",    icon: "🎯" },
  { type: "swimlane",   label: "Swim Lane",     icon: "🏊" },
  { type: "chevron",    label: "Chevron",       icon: "▶" },
];

// ── Markdown parser ────────────────────────────────────────────────────────────
function parseMarkdown(text: string): DocBlock[] {
  const lines = text.split("\n");
  const raw: DocSection[] = [];
  let id = 0, i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (line.startsWith("# ")) { raw.push({ id: id++, type: "title", content: line.slice(2).trim() }); i++; }
    else if (line.startsWith("## ")) { raw.push({ id: id++, type: "h2", content: line.slice(3).trim() }); i++; }
    else if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) { items.push(lines[i].trim().slice(2).trim()); i++; }
      if (items.length) raw.push({ id: id++, type: "bullet", content: "", items });
    } else if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\.\s/, "").trim()); i++; }
      if (items.length) raw.push({ id: id++, type: "numbered", content: "", items });
    } else {
      const parts: string[] = [];
      while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith("#")) { parts.push(lines[i].trim()); i++; }
      const content = parts.join(" ");
      if (content) raw.push({ id: id++, type: "paragraph", content });
    }
  }
  const blocks: DocBlock[] = [];
  let cur: DocBlock | null = null;
  for (const sec of raw) {
    if (sec.type === "title" || sec.type === "h2") { if (cur) blocks.push(cur); cur = { heading: sec, body: [] }; }
    else { if (!cur) cur = { heading: { id: id++, type: "paragraph", content: "" }, body: [] }; cur.body.push(sec); }
  }
  if (cur) blocks.push(cur);
  return blocks;
}

// ── Auto-pick best visual type ────────────────────────────────────────────────
function autoPickType(heading: string, bodyText: string): VisualType {
  const t = (heading + " " + bodyText).toLowerCase();
  if (/stair|step.*up|progress.*level|climb|ascend|level.*up/i.test(t)) return "staircase";
  if (/roadmap|milestone|phase.*plan|plan.*phase|quarter|q1|q2|q3|q4|sprint|release plan/i.test(t)) return "roadmap";
  if (/matrix|quadrant|2x2|grid.*category|bcg|eisenhower|swot/i.test(t)) return "matrix";
  if (/network|relationship|connection|link.*between|interact.*between|node/i.test(t)) return "network";
  if (/swim|lane|actor|department.*process|role.*process|who.*does/i.test(t)) return "swimlane";
  if (/chevron|arrow.*flow|sequential.*step|banner.*step/i.test(t)) return "chevron";
  if (/hex|cluster.*concept|web.*concept|surrounding.*idea/i.test(t)) return "hexcluster";
  if (/concentric|circle.*layer|ring|inner.*outer|layer.*around/i.test(t)) return "concentric";
  if (/cycle|circular|loop|recurring|repeat|rotation|water cycle|life cycle|feedback/i.test(t)) return "cycle";
  if (/cause|effect|reason|because|result|consequence|fishbone|ishikawa|factor.*affect/i.test(t)) return "causeeffect";
  if (/funnel|conversion|pipeline|qualify|nurture|marketing funnel|sales funnel/i.test(t)) return "funnel";
  if (/\bvs\b|versus|overlap|both.*have|in common|intersect|similarities.*differences/i.test(t)) return "venn";
  if (/timeline|history|historical|century|decade|year \d|era|chronolog|bce|bc\b|ad \d/i.test(t)) return "timeline";
  if (/pyramid|maslow|hierarchy.*need|priority|tier.*from|bottom to top|top to bottom/i.test(t)) return "pyramid";
  if (/classif|taxonom|branch|subdivid|types? of|kinds? of|categori|species|genus|tree.*diagram/i.test(t)) return "tree";
  if (/step|procedure|how to|method|phase\b|workflow|algorithm|sequen|first.*then|next step/i.test(t)) return "process";
  if (/framework|layer|component|architecture|model\b.*level|structure.*tier/i.test(t)) return "framework";
  if (/compare|contrast|difference|advantage|disadvantage|benefit|drawback|pros|cons/i.test(t)) return "comparison";
  if (/statistic|data point|fact|figure|number|metric|percent|rate\b|kpi/i.test(t)) return "data";
  return "mindmap";
}

// ── Visual generation prompts ──────────────────────────────────────────────────
async function generateVisual(context: string, heading: string, type: VisualType): Promise<VisualData | null> {
  const sys = "Return ONLY raw valid JSON. No markdown fences, no prose. JSON only.";
  const prompts: Record<VisualType, string> = {
    mindmap:    `Mindmap for "${heading}". Content: "${context}". JSON: {"center":"${heading.slice(0,20)}","branches":[{"label":"Concept","items":["detail","detail","detail"]}]}. 4-5 branches, real content.`,
    process:    `Process steps for "${heading}". Content: "${context}". JSON: {"title":"${heading}","steps":[{"label":"Step","description":"desc"}]}. 5-6 steps.`,
    cycle:      `Cycle stages for "${heading}". Content: "${context}". JSON: {"title":"${heading}","stages":[{"label":"Stage","description":"desc"}]}. 4-5 stages forming complete cycle.`,
    timeline:   `Timeline for "${heading}". Content: "${context}". JSON: {"title":"${heading}","events":[{"label":"Event","detail":"detail"}]}. 5-6 chronological events.`,
    tree:       `Tree hierarchy for "${heading}". Content: "${context}". JSON: {"title":"${heading}","root":"${heading.slice(0,20)}","branches":[{"label":"Category","children":["child1","child2","child3"]}]}. 3-4 branches.`,
    comparison: `Comparison for "${heading}". Content: "${context}". JSON: {"title":"${heading}","left":{"label":"Aspect A","points":["pt","pt","pt","pt"]},"right":{"label":"Aspect B","points":["pt","pt","pt","pt"]}}.`,
    venn:       `Venn diagram for "${heading}". Content: "${context}". JSON: {"title":"${heading}","left":{"label":"Group A","items":["trait","trait","trait"]},"right":{"label":"Group B","items":["trait","trait","trait"]},"overlap":["shared1","shared2"]}.`,
    pyramid:    `Pyramid for "${heading}". Index 0=apex/top narrow, last=base wide. Content: "${context}". JSON: {"title":"${heading}","levels":[{"label":"Level","description":"desc"}]}. 3-5 levels.`,
    funnel:     `Funnel for "${heading}". First=widest top, last=narrowest. Content: "${context}". JSON: {"title":"${heading}","stages":[{"label":"Stage","detail":"what happens"}]}. 4-5 stages.`,
    framework:  `Framework for "${heading}". Content: "${context}". JSON: {"title":"${heading}","levels":[{"label":"Level","items":["item","item","item"]}]}. 3-4 levels.`,
    data:       `Key facts for "${heading}". Content: "${context}". JSON: {"title":"${heading}","facts":[{"label":"Fact Title","detail":"Specific fact."}]}. 6 real facts.`,
    causeeffect:`Fishbone diagram for "${heading}". Content: "${context}". JSON: {"title":"${heading}","effect":"${heading.slice(0,20)}","causes":[{"category":"Category","items":["cause1","cause2"]}]}. 4-6 categories.`,
    roadmap:    `Roadmap for "${heading}". Content: "${context}". JSON: {"title":"${heading}","milestones":[{"phase":"Phase 1","label":"Milestone Name","items":["task1","task2"]}]}. 4-5 milestones.`,
    matrix:     `2x2 matrix for "${heading}". Content: "${context}". JSON: {"title":"${heading}","xAxis":"Low → High X","yAxis":"Low → High Y","quadrants":[{"label":"Q1 name","items":["item"]},{"label":"Q2 name","items":["item"]},{"label":"Q3 name","items":["item"]},{"label":"Q4 name","items":["item"]}]}. 4 quadrants exactly.`,
    network:    `Network/relationship diagram for "${heading}". Content: "${context}". JSON: {"title":"${heading}","center":"${heading.slice(0,20)}","nodes":[{"label":"Node Name","relation":"relates via"}]}. 5-7 nodes.`,
    staircase:  `Staircase steps for "${heading}". Content: "${context}". JSON: {"title":"${heading}","steps":[{"label":"Step Name","detail":"description"}]}. 4-6 ascending steps.`,
    hexcluster: `Hex cluster for "${heading}". Content: "${context}". JSON: {"title":"${heading}","center":"${heading.slice(0,16)}","hexes":[{"label":"Concept","detail":"description"}]}. 5-6 hexes around center.`,
    concentric: `Concentric rings for "${heading}". Innermost=most core. Content: "${context}". JSON: {"title":"${heading}","rings":[{"label":"Innermost","description":"core concept"},{"label":"Middle","description":"desc"},{"label":"Outer","description":"desc"}]}. 3-4 rings.`,
    swimlane:   `Swim lane diagram for "${heading}". Content: "${context}". JSON: {"title":"${heading}","lanes":[{"actor":"Actor/Role","steps":["step1","step2","step3"]}]}. 2-3 lanes with 3-4 steps each.`,
    chevron:    `Chevron/arrow process for "${heading}". Content: "${context}". JSON: {"title":"${heading}","steps":[{"label":"Step","detail":"desc"}]}. 4-5 sequential chevron steps.`,
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

// ── Visual Renderers (palette-aware) ───────────────────────────────────────────
function MindmapVisual({ data, p }: { data: MindmapData; p: Palette }) {
  const cx = 300, cy = 185, radius = 142;
  const branches = (data.branches || []).slice(0, 6);
  const n = branches.length || 1;
  const accents = [p.accent, p.accent2, p.accent3, p.accent, p.accent2, p.accent3];
  return (
    <svg viewBox="0 0 600 370" className="w-full rounded-xl" style={{ background: p.bg }}>
      <circle cx={cx} cy={cy} r={55} fill={p.surface2} stroke={p.accent} strokeWidth="1.5" />
      {data.center.split(" ").slice(0, 3).map((word, wi) => (
        <text key={wi} x={cx} y={cy - 10 + wi * 14} textAnchor="middle" fill={p.textPrimary} fontSize="9.5" fontWeight="bold">{word}</text>
      ))}
      {branches.map((b, i) => {
        const angle = ((i * 360) / n - 90) * (Math.PI / 180);
        const bx = cx + radius * Math.cos(angle);
        const by = cy + radius * Math.sin(angle);
        const col = accents[i % accents.length];
        return (
          <g key={i}>
            <path d={`M ${cx} ${cy} Q ${cx + (bx - cx) * 0.5} ${cy} ${bx} ${by}`} stroke={col} strokeWidth="1.5" fill="none" opacity="0.6" />
            <rect x={bx - 52} y={by - 15} width={104} height={30} rx="14" fill={p.surface} stroke={col} strokeWidth="1" />
            <text x={bx} y={by + 1} textAnchor="middle" dominantBaseline="middle" fill={p.textPrimary} fontSize="9" fontWeight="bold">{(b.label || "").slice(0, 16)}</text>
            {(b.items || []).slice(0, 3).map((item, j) => (
              <text key={j} x={bx} y={by + 32 + j * 13} textAnchor="middle" fill={p.textSecondary} fontSize="7.5">∙ {item.slice(0, 26)}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function ProcessVisual({ data, p }: { data: ProcessData; p: Palette }) {
  const steps = (data.steps || []).slice(0, 6);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: p.bg }}>
      <div className="px-4 py-3 text-center border-b" style={{ borderColor: p.line }}>
        <span className="font-bold text-sm" style={{ color: p.accent2 }}>{data.title}</span>
      </div>
      <div className="p-4 space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: i === 0 ? p.accent : p.surface2, color: p.textPrimary }}>{i + 1}</div>
              {i < steps.length - 1 && <div className="w-px h-3 mt-0.5" style={{ background: p.line }} />}
            </div>
            <div className="flex-1 pb-1">
              <div className="font-semibold text-sm" style={{ color: p.accent2 }}>{step.label}</div>
              <div className="text-xs mt-0.5 leading-relaxed" style={{ color: p.textSecondary }}>{step.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CycleVisual({ data, p }: { data: CycleData; p: Palette }) {
  const stages = (data.stages || []).slice(0, 6);
  const n = Math.max(stages.length, 1);
  const cx = 200, cy = 140, r = 95;
  const accents = [p.accent, p.accent2, p.accent3, p.accent, p.accent2, p.accent3];
  return (
    <svg viewBox="0 0 400 280" className="w-full rounded-xl" style={{ background: p.bg }}>
      <defs><marker id={`ca${p.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill={p.accent2} /></marker></defs>
      {stages.map((_, i) => {
        const a1 = ((-90 + (360 / n) * i) * Math.PI) / 180;
        const a2 = ((-90 + (360 / n) * ((i + 1) % n)) * Math.PI) / 180;
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
        const qx = (x1 + x2) / 2 + (cx - (x1 + x2) / 2) * 0.2;
        const qy = (y1 + y2) / 2 + (cy - (y1 + y2) / 2) * 0.2;
        return <path key={i} d={`M ${x1} ${y1} Q ${qx} ${qy} ${x2} ${y2}`} stroke={p.accent} strokeWidth="1.5" fill="none" markerEnd={`url(#ca${p.id})`} />;
      })}
      <circle cx={cx} cy={cy} r={20} fill={p.surface2} stroke={p.accent} strokeWidth="1.5" />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill={p.accent2} fontSize="8" fontWeight="bold">cycle</text>
      {stages.map((stage, i) => {
        const angle = ((-90 + (360 / n) * i) * Math.PI) / 180;
        const x = cx + r * Math.cos(angle), y = cy + r * Math.sin(angle);
        const col = accents[i % accents.length];
        return (
          <g key={i}>
            <rect x={x - 52} y={y - 20} width={104} height={40} rx="10" fill={p.surface} stroke={col} strokeWidth="1" />
            <text x={x} y={y - 6} textAnchor="middle" dominantBaseline="middle" fill={p.textPrimary} fontSize="8.5" fontWeight="bold">{(stage.label || "").slice(0, 16)}</text>
            <text x={x} y={y + 9} textAnchor="middle" fill={p.textSecondary} fontSize="7.5">{(stage.description || "").slice(0, 22)}</text>
            <circle cx={x + 44} cy={y - 18} r="7" fill={col} />
            <text x={x + 44} y={y - 18} textAnchor="middle" dominantBaseline="middle" fill={p.bg} fontSize="7.5" fontWeight="bold">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

function TimelineVisual({ data, p }: { data: TimelineData; p: Palette }) {
  const events = (data.events || []).slice(0, 7);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: p.bg }}>
      <div className="px-4 py-3 text-center border-b" style={{ borderColor: p.line }}>
        <span className="font-bold text-sm" style={{ color: p.accent2 }}>{data.title}</span>
      </div>
      <div className="p-4">
        {events.map((ev, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="h-3.5 w-3.5 rounded-full mt-1 ring-2 flex-shrink-0" style={{ background: p.accent, ringColor: p.accent2 }} />
              {i < events.length - 1 && <div className="w-px flex-1 mt-1 min-h-[18px]" style={{ background: p.line }} />}
            </div>
            <div className="pb-3">
              <div className="font-semibold text-sm" style={{ color: p.accent2 }}>{ev.label}</div>
              <div className="text-xs mt-0.5 leading-relaxed" style={{ color: p.textSecondary }}>{ev.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TreeVisual({ data, p }: { data: TreeData; p: Palette }) {
  const branches = (data.branches || []).slice(0, 5);
  const nb = Math.max(branches.length, 1);
  const W = 480, rootX = W / 2, rootY = 32, branchY = 120, childY = 210;
  const branchXs = branches.map((_, i) => nb === 1 ? rootX : 55 + ((W - 110) / (nb - 1)) * i);
  const childSpacing = nb >= 4 ? 38 : 46;
  const maxChildren = nb >= 4 ? 2 : 3;
  const accents = [p.accent, p.accent2, p.accent3, p.accent, p.accent2];
  return (
    <svg viewBox={`0 0 ${W} 265`} className="w-full rounded-xl" style={{ background: p.bg }}>
      <rect x={rootX - 58} y={rootY - 15} width={116} height={30} rx="8" fill={p.accent} />
      <text x={rootX} y={rootY + 1} textAnchor="middle" dominantBaseline="middle" fill={p.bg} fontSize="9.5" fontWeight="bold">{(data.root || "").slice(0, 20)}</text>
      {branches.map((branch, i) => {
        const bx = branchXs[i];
        const col = accents[i % accents.length];
        const children = (branch.children || []).slice(0, maxChildren);
        const nc = children.length;
        return (
          <g key={i}>
            <line x1={rootX} y1={rootY + 15} x2={bx} y2={branchY - 15} stroke={p.line} strokeWidth="1.2" />
            <rect x={bx - 46} y={branchY - 15} width={92} height={30} rx="7" fill={p.surface} stroke={col} strokeWidth="1" />
            <text x={bx} y={branchY + 1} textAnchor="middle" dominantBaseline="middle" fill={p.textPrimary} fontSize="9" fontWeight="bold">{(branch.label || "").slice(0, 15)}</text>
            {children.map((child, ci) => {
              const offset = nc === 1 ? 0 : (ci - (nc - 1) / 2) * childSpacing * 2;
              const cx2 = Math.max(22, Math.min(W - 22, bx + offset));
              return (
                <g key={ci}>
                  <line x1={bx} y1={branchY + 15} x2={cx2} y2={childY - 13} stroke={p.line} strokeWidth="1" />
                  <rect x={cx2 - 40} y={childY - 13} width={80} height={26} rx="6" fill={p.surface2} />
                  <text x={cx2} y={childY + 1} textAnchor="middle" dominantBaseline="middle" fill={p.textSecondary} fontSize="8">{(child || "").slice(0, 14)}</text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function ComparisonVisual({ data, p }: { data: ComparisonData; p: Palette }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: p.bg }}>
      <div className="px-4 py-3 text-center border-b" style={{ borderColor: p.line }}>
        <span className="font-bold text-sm" style={{ color: p.accent2 }}>{data.title}</span>
      </div>
      <div className="p-3 grid grid-cols-2 gap-3">
        {[data.left, data.right].map((side, si) => (
          <div key={si}>
            <div className="text-center font-bold text-xs mb-2 py-1.5 rounded-lg" style={{ background: si === 0 ? p.accent : p.surface2, color: p.bg }}>
              {(side || {}).label || "Side"}
            </div>
            <ul className="space-y-1.5">
              {((side || {}).points || []).map((pt, pi) => (
                <li key={pi} className="flex items-start gap-1.5 text-xs" style={{ color: p.textSecondary }}>
                  <span className="flex-shrink-0 mt-0.5 font-bold" style={{ color: p.accent }}>•</span>
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

function VennVisual({ data, p }: { data: VennData; p: Palette }) {
  const leftItems = (data.left?.items || []).slice(0, 3);
  const rightItems = (data.right?.items || []).slice(0, 3);
  const overlap = (data.overlap || []).slice(0, 2);
  return (
    <svg viewBox="0 0 500 240" className="w-full rounded-xl" style={{ background: p.bg }}>
      <circle cx="175" cy="118" r="94" fill={p.accent} fillOpacity="0.5" stroke={p.accent} strokeWidth="1.5" />
      <circle cx="325" cy="118" r="94" fill={p.accent2} fillOpacity="0.4" stroke={p.accent2} strokeWidth="1.5" />
      <text x="108" y="44" textAnchor="middle" fill={p.textPrimary} fontSize="10" fontWeight="bold">{(data.left?.label || "").slice(0, 16)}</text>
      <text x="392" y="44" textAnchor="middle" fill={p.textPrimary} fontSize="10" fontWeight="bold">{(data.right?.label || "").slice(0, 16)}</text>
      {leftItems.map((item, i) => <text key={i} x="108" y={80 + i * 22} textAnchor="middle" fill={p.textPrimary} fontSize="8.5">{item.slice(0, 18)}</text>)}
      {rightItems.map((item, i) => <text key={i} x="392" y={80 + i * 22} textAnchor="middle" fill={p.textPrimary} fontSize="8.5">{item.slice(0, 18)}</text>)}
      <text x="250" y="100" textAnchor="middle" fill={p.textPrimary} fontSize="8" fontStyle="italic" opacity="0.9">both</text>
      {overlap.map((item, i) => <text key={i} x="250" y={116 + i * 18} textAnchor="middle" fill={p.textPrimary} fontSize="8.5" fontWeight="bold">{item.slice(0, 18)}</text>)}
      <text x="250" y="202" textAnchor="middle" fill={p.textSecondary} fontSize="8" fontStyle="italic">∩ shared</text>
    </svg>
  );
}

function PyramidVisual({ data, p }: { data: PyramidData; p: Palette }) {
  const levels = (data.levels || []).slice(0, 5);
  const n = Math.max(levels.length, 1);
  const W = 380, totalH = 220, padTop = 22;
  const levelH = totalH / n;
  const maxW = W - 40;
  return (
    <svg viewBox={`0 0 ${W} ${totalH + padTop + 18}`} className="w-full rounded-xl" style={{ background: p.bg }}>
      {levels.map((level, i) => {
        const topW = i === 0 ? 60 : maxW * (i / n);
        const botW = maxW * ((i + 1) / n);
        const y = padTop + i * levelH;
        const leftTop = (W - topW) / 2, rightTop = (W + topW) / 2;
        const leftBot = (W - botW) / 2, rightBot = (W + botW) / 2;
        const pts = `${leftTop},${y} ${rightTop},${y} ${rightBot},${y + levelH - 2} ${leftBot},${y + levelH - 2}`;
        const opacity = 0.9 - i * 0.12;
        const midY = y + levelH / 2;
        return (
          <g key={i}>
            <polygon points={pts} fill={p.accent} opacity={opacity} />
            <line x1={leftTop} y1={y} x2={rightTop} y2={y} stroke={p.bg} strokeWidth="1.5" />
            <text x={W / 2} y={midY - 4} textAnchor="middle" dominantBaseline="middle" fill={p.textPrimary} fontSize="9.5" fontWeight="bold">{(level.label || "").slice(0, 22)}</text>
            <text x={W / 2} y={midY + 9} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="8">{(level.description || "").slice(0, 30)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function FunnelVisual({ data, p }: { data: FunnelData; p: Palette }) {
  const stages = (data.stages || []).slice(0, 6);
  const n = Math.max(stages.length, 1);
  const W = 380, totalH = 230, padTop = 20;
  const levelH = totalH / n;
  const maxW = W - 40, minBotW = 50;
  return (
    <svg viewBox={`0 0 ${W} ${totalH + padTop + 10}`} className="w-full rounded-xl" style={{ background: p.bg }}>
      {stages.map((stage, i) => {
        const topW = Math.max(maxW * (n - i) / n, minBotW);
        const botW = Math.max(maxW * (n - i - 1) / n, minBotW);
        const y = padTop + i * levelH;
        const leftTop = (W - topW) / 2, rightTop = (W + topW) / 2;
        const leftBot = (W - botW) / 2, rightBot = (W + botW) / 2;
        const pts = `${leftTop},${y} ${rightTop},${y} ${rightBot},${y + levelH - 2} ${leftBot},${y + levelH - 2}`;
        const opacity = 1 - i * 0.12;
        const midY = y + levelH / 2;
        return (
          <g key={i}>
            <polygon points={pts} fill={p.accent} opacity={opacity} />
            <line x1={leftTop} y1={y} x2={rightTop} y2={y} stroke={p.bg} strokeWidth="1" />
            <text x={W / 2} y={midY - 4} textAnchor="middle" dominantBaseline="middle" fill={p.textPrimary} fontSize="9.5" fontWeight="bold">{(stage.label || "").slice(0, 22)}</text>
            <text x={W / 2} y={midY + 9} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="8">{(stage.detail || "").slice(0, 28)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function FrameworkVisual({ data, p }: { data: FrameworkData; p: Palette }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: p.bg }}>
      <div className="px-4 py-3 text-center border-b" style={{ borderColor: p.line }}>
        <span className="font-bold text-sm" style={{ color: p.accent2 }}>{data.title}</span>
      </div>
      <div className="p-3 space-y-2">
        {(data.levels || []).map((level, i) => (
          <div key={i} className="rounded-lg px-3 py-2.5 border" style={{ background: p.surface, borderColor: i === 0 ? p.accent : p.line }}>
            <div className="font-bold text-xs mb-1.5" style={{ color: p.accent2 }}>{level.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {(level.items || []).map((item, j) => (
                <span key={j} className="px-2 py-0.5 rounded-full text-xs" style={{ background: p.surface2, color: p.textSecondary }}>{item}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataVisual({ data, p }: { data: DataFactsData; p: Palette }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: p.bg }}>
      <div className="px-4 py-3 text-center border-b" style={{ borderColor: p.line }}>
        <span className="font-bold text-sm" style={{ color: p.accent2 }}>{data.title}</span>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        {(data.facts || []).map((fact, i) => (
          <div key={i} className="rounded-lg p-2.5 border-l-2" style={{ background: p.surface, borderLeftColor: i % 2 === 0 ? p.accent : p.accent2 }}>
            <div className="font-semibold text-xs mb-1" style={{ color: p.accent2 }}>{fact.label}</div>
            <div className="text-xs leading-relaxed" style={{ color: p.textSecondary }}>{fact.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CauseEffectVisual({ data, p }: { data: CauseEffectData; p: Palette }) {
  const causes = (data.causes || []).slice(0, 6);
  const topCauses = causes.filter((_, i) => i % 2 === 0).slice(0, 3);
  const botCauses = causes.filter((_, i) => i % 2 === 1).slice(0, 3);
  const spineY = 135;
  const topAnchors = [140, 255, 370], botAnchors = [195, 310, 425], branchLen = 62;
  return (
    <svg viewBox="0 0 500 270" className="w-full rounded-xl" style={{ background: p.bg }}>
      <defs><marker id={`fe${p.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill={p.accent} /></marker></defs>
      <line x1="28" y1={spineY} x2="432" y2={spineY} stroke={p.accent} strokeWidth="2.5" markerEnd={`url(#fe${p.id})`} />
      <rect x="435" y={spineY - 26} width="58" height="52" rx="8" fill={p.surface} stroke={p.accent} strokeWidth="1" />
      <text x="464" y={spineY - 8} textAnchor="middle" fill={p.accent2} fontSize="8" fontWeight="bold">{(data.effect || "Effect").slice(0, 10)}</text>
      <text x="464" y={spineY + 6} textAnchor="middle" fill={p.textSecondary} fontSize="7">{(data.effect || "").slice(10, 22)}</text>
      {topCauses.map((cause, i) => {
        const ax = topAnchors[i] ?? 200, bx = ax - branchLen, by = spineY - branchLen;
        return (
          <g key={i}>
            <line x1={bx} y1={by} x2={ax} y2={spineY} stroke={p.line} strokeWidth="1.5" />
            <rect x={bx - 44} y={by - 15} width={88} height={30} rx="7" fill={p.surface} stroke={p.accent2} strokeWidth="0.8" />
            <text x={bx} y={by - 4} textAnchor="middle" dominantBaseline="middle" fill={p.textPrimary} fontSize="8.5" fontWeight="bold">{(cause.category || "").slice(0, 14)}</text>
            {(cause.items || []).slice(0, 2).map((item, j) => (
              <text key={j} x={bx - 20 + j * 40} y={by - 32} textAnchor="middle" fill={p.textSecondary} fontSize="7.5">· {item.slice(0, 14)}</text>
            ))}
          </g>
        );
      })}
      {botCauses.map((cause, i) => {
        const ax = botAnchors[i] ?? 250, bx = ax - branchLen, by = spineY + branchLen;
        return (
          <g key={i}>
            <line x1={bx} y1={by} x2={ax} y2={spineY} stroke={p.line} strokeWidth="1.5" />
            <rect x={bx - 44} y={by - 15} width={88} height={30} rx="7" fill={p.surface} stroke={p.accent2} strokeWidth="0.8" />
            <text x={bx} y={by - 4} textAnchor="middle" dominantBaseline="middle" fill={p.textPrimary} fontSize="8.5" fontWeight="bold">{(cause.category || "").slice(0, 14)}</text>
            {(cause.items || []).slice(0, 2).map((item, j) => (
              <text key={j} x={bx - 20 + j * 40} y={by + 22} textAnchor="middle" fill={p.textSecondary} fontSize="7.5">· {item.slice(0, 14)}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function RoadmapVisual({ data, p }: { data: RoadmapData; p: Palette }) {
  const ms = (data.milestones || []).slice(0, 5);
  const n = Math.max(ms.length, 1);
  const W = 520, railY = 90, spacing = (W - 60) / n;
  return (
    <svg viewBox={`0 0 ${W} 230`} className="w-full rounded-xl" style={{ background: p.bg }}>
      <text x={W / 2} y="22" textAnchor="middle" fill={p.accent2} fontSize="11" fontWeight="bold">{data.title}</text>
      <line x1="30" y1={railY} x2={W - 30} y2={railY} stroke={p.line} strokeWidth="3" strokeLinecap="round" />
      {ms.map((m, i) => {
        const x = 30 + spacing * i + spacing / 2;
        const above = i % 2 === 0;
        const labelY = above ? railY - 56 : railY + 56;
        const lineY2 = above ? railY - 16 : railY + 16;
        return (
          <g key={i}>
            <line x1={x} y1={railY} x2={x} y2={lineY2} stroke={p.accent} strokeWidth="2" strokeDasharray="3,2" />
            <circle cx={x} cy={railY} r="10" fill={p.accent} />
            <text x={x} y={railY + 1} textAnchor="middle" dominantBaseline="middle" fill={p.bg} fontSize="7.5" fontWeight="bold">{i + 1}</text>
            <rect x={x - 48} y={labelY - 30} width={96} height={60} rx="8" fill={p.surface} stroke={p.accent} strokeWidth="0.8" />
            <text x={x} y={labelY - 14} textAnchor="middle" fill={p.accent2} fontSize="8.5" fontWeight="bold">{(m.phase || "").slice(0, 12)}</text>
            <text x={x} y={labelY + 0} textAnchor="middle" fill={p.textPrimary} fontSize="8">{(m.label || "").slice(0, 16)}</text>
            {(m.items || []).slice(0, 2).map((it, j) => (
              <text key={j} x={x} y={labelY + 14 + j * 11} textAnchor="middle" fill={p.textSecondary} fontSize="7">· {it.slice(0, 14)}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function MatrixVisual({ data, p }: { data: MatrixData; p: Palette }) {
  const qs = (data.quadrants || []).slice(0, 4);
  const quadData = [
    { q: qs[0], x: 0, y: 0 }, { q: qs[1], x: 1, y: 0 },
    { q: qs[2], x: 0, y: 1 }, { q: qs[3], x: 1, y: 1 },
  ];
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: p.bg }}>
      <div className="px-4 py-3 text-center border-b" style={{ borderColor: p.line }}>
        <span className="font-bold text-sm" style={{ color: p.accent2 }}>{data.title}</span>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-2 gap-px" style={{ background: p.line }}>
          {quadData.map(({ q, x, y }, i) => (
            <div key={i} className="p-2.5" style={{ background: (x + y) % 2 === 0 ? p.surface : p.surface2 }}>
              <div className="font-bold text-xs mb-1.5" style={{ color: i === 0 || i === 3 ? p.accent2 : p.textSecondary }}>{q?.label || `Q${i + 1}`}</div>
              {(q?.items || []).slice(0, 3).map((item, j) => (
                <div key={j} className="text-[10px] mb-0.5" style={{ color: p.textSecondary }}>· {item}</div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1 text-[9px]" style={{ color: p.textSecondary }}>
          <span>← {(data.xAxis || "").split("→")[0]?.trim()}</span>
          <span>{(data.xAxis || "").split("→")[1]?.trim()} →</span>
        </div>
      </div>
    </div>
  );
}

function NetworkVisual({ data, p }: { data: NetworkData; p: Palette }) {
  const nodes = (data.nodes || []).slice(0, 7);
  const n = Math.max(nodes.length, 1);
  const cx = 240, cy = 140, r = 110;
  return (
    <svg viewBox="0 0 480 280" className="w-full rounded-xl" style={{ background: p.bg }}>
      <text x={cx} y="20" textAnchor="middle" fill={p.accent2} fontSize="10" fontWeight="bold">{data.title}</text>
      {nodes.map((_, i) => {
        const angle = ((i * 360) / n - 90) * Math.PI / 180;
        const nx = cx + r * Math.cos(angle), ny = cy + r * Math.sin(angle);
        return <line key={i} x1={cx} y1={cy} x2={nx} y2={ny} stroke={p.line} strokeWidth="1.5" strokeDasharray="4,3" />;
      })}
      <circle cx={cx} cy={cy} r={38} fill={p.accent} />
      {data.center.split(" ").slice(0, 2).map((w, i) => (
        <text key={i} x={cx} y={cy - 4 + i * 13} textAnchor="middle" fill={p.bg} fontSize="9" fontWeight="bold">{w}</text>
      ))}
      {nodes.map((node, i) => {
        const angle = ((i * 360) / n - 90) * Math.PI / 180;
        const nx = cx + r * Math.cos(angle), ny = cy + r * Math.sin(angle);
        return (
          <g key={i}>
            <circle cx={nx} cy={ny} r={24} fill={p.surface} stroke={p.accent2} strokeWidth="1" />
            {node.label.split(" ").slice(0, 2).map((w, j) => (
              <text key={j} x={nx} y={ny - 3 + j * 11} textAnchor="middle" dominantBaseline="middle" fill={p.textPrimary} fontSize="8" fontWeight="bold">{w.slice(0, 10)}</text>
            ))}
            <text x={nx} y={ny + 32} textAnchor="middle" fill={p.textSecondary} fontSize="7">{(node.relation || "").slice(0, 16)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function StaircaseVisual({ data, p }: { data: StaircaseData; p: Palette }) {
  const steps = (data.steps || []).slice(0, 6);
  const n = Math.max(steps.length, 1);
  const W = 500, H = 220, stepW = W / n, stepH = H / n;
  return (
    <svg viewBox={`0 0 ${W} ${H + 40}`} className="w-full rounded-xl" style={{ background: p.bg }}>
      <text x={W / 2} y="20" textAnchor="middle" fill={p.accent2} fontSize="11" fontWeight="bold">{data.title}</text>
      {steps.map((step, i) => {
        const x = i * stepW, y = H - (i + 1) * stepH;
        const opacity = 0.5 + (i / n) * 0.5;
        return (
          <g key={i}>
            <rect x={x} y={y + 28} width={stepW * (n - i)} height={stepH * (i + 1)} fill={p.accent} opacity={opacity} />
            <rect x={x} y={y + 28} width={stepW} height={stepH} fill={p.accent2} opacity={0.9} />
            <text x={x + stepW / 2} y={y + 28 + stepH / 2} textAnchor="middle" dominantBaseline="middle" fill={p.bg} fontSize="8" fontWeight="bold">{(step.label || "").slice(0, 14)}</text>
            <text x={x + stepW / 2} y={y + 20} textAnchor="middle" fill={p.textSecondary} fontSize="7">{(step.detail || "").slice(0, 18)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function HexclusterVisual({ data, p }: { data: HexclusterData; p: Palette }) {
  const hexes = (data.hexes || []).slice(0, 6);
  const n = Math.max(hexes.length, 1);
  const cx = 240, cy = 140, r = 100, hr = 36;
  function hexPath(hx: number, hy: number, hr: number) {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return `${hx + hr * Math.cos(a)},${hy + hr * Math.sin(a)}`;
    });
    return `M ${pts.join(" L ")} Z`;
  }
  return (
    <svg viewBox="0 0 480 280" className="w-full rounded-xl" style={{ background: p.bg }}>
      <text x={cx} y="18" textAnchor="middle" fill={p.accent2} fontSize="10" fontWeight="bold">{data.title}</text>
      <path d={hexPath(cx, cy, 44)} fill={p.accent} />
      {data.center.split(" ").slice(0, 2).map((w, i) => (
        <text key={i} x={cx} y={cy - 4 + i * 12} textAnchor="middle" dominantBaseline="middle" fill={p.bg} fontSize="9" fontWeight="bold">{w}</text>
      ))}
      {hexes.map((hex, i) => {
        const angle = ((i * 360) / n - 90) * Math.PI / 180;
        const hx = cx + r * Math.cos(angle), hy = cy + r * Math.sin(angle);
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={hx} y2={hy} stroke={p.line} strokeWidth="1" />
            <path d={hexPath(hx, hy, hr)} fill={p.surface} stroke={p.accent2} strokeWidth="1" />
            {hex.label.split(" ").slice(0, 2).map((w, j) => (
              <text key={j} x={hx} y={hy - 4 + j * 11} textAnchor="middle" dominantBaseline="middle" fill={p.textPrimary} fontSize="8.5" fontWeight="bold">{w.slice(0, 10)}</text>
            ))}
            <text x={hx} y={hy + 28} textAnchor="middle" fill={p.textSecondary} fontSize="7">{(hex.detail || "").slice(0, 16)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ConcentricVisual({ data, p }: { data: ConcentricData; p: Palette }) {
  const rings = (data.rings || []).slice(0, 4);
  const n = Math.max(rings.length, 1);
  const cx = 200, cy = 140, maxR = 120;
  return (
    <svg viewBox="0 0 400 280" className="w-full rounded-xl" style={{ background: p.bg }}>
      <text x={cx} y="18" textAnchor="middle" fill={p.accent2} fontSize="10" fontWeight="bold">{data.title}</text>
      {[...rings].reverse().map((ring, ri) => {
        const i = n - 1 - ri;
        const r = maxR * ((i + 1) / n);
        const opacity = 0.35 + (i / n) * 0.55;
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r} fill={p.accent} opacity={opacity} />
            <text x={cx + r * 0.68} y={cy} textAnchor="start" dominantBaseline="middle" fill={p.textPrimary} fontSize="8.5" fontWeight="bold">{(ring.label || "").slice(0, 16)}</text>
            <text x={cx + r * 0.68} y={cy + 12} textAnchor="start" fill={p.textSecondary} fontSize="7.5">{(ring.description || "").slice(0, 20)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function SwimlaneVisual({ data, p }: { data: SwimlaneData; p: Palette }) {
  const lanes = (data.lanes || []).slice(0, 3);
  const maxSteps = Math.max(...lanes.map(l => (l.steps || []).length), 1);
  const laneH = 72, headerW = 80, stepW = Math.min(100, (420 - headerW) / maxSteps);
  const W = headerW + stepW * maxSteps + 20;
  const H = laneH * lanes.length + 30;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl" style={{ background: p.bg }}>
      <text x={W / 2} y="16" textAnchor="middle" fill={p.accent2} fontSize="10" fontWeight="bold">{data.title}</text>
      {lanes.map((lane, li) => {
        const y = 24 + li * laneH;
        return (
          <g key={li}>
            <rect x={0} y={y} width={headerW} height={laneH} fill={li % 2 === 0 ? p.accent : p.surface2} />
            {lane.actor.split(" ").slice(0, 2).map((w, j) => (
              <text key={j} x={headerW / 2} y={y + laneH / 2 - 4 + j * 12} textAnchor="middle" fill={p.bg} fontSize="8.5" fontWeight="bold">{w}</text>
            ))}
            <rect x={headerW} y={y} width={W - headerW} height={laneH} fill={li % 2 === 0 ? p.surface : p.bg} />
            <line x1={0} y1={y} x2={W} y2={y} stroke={p.line} strokeWidth="1" />
            {(lane.steps || []).slice(0, maxSteps).map((step, si) => {
              const sx = headerW + 10 + si * stepW;
              return (
                <g key={si}>
                  <rect x={sx} y={y + 10} width={stepW - 8} height={laneH - 20} rx="5" fill={p.surface2} stroke={p.accent} strokeWidth="0.5" />
                  <text x={sx + (stepW - 8) / 2} y={y + laneH / 2} textAnchor="middle" dominantBaseline="middle" fill={p.textPrimary} fontSize="7.5">{step.slice(0, 14)}</text>
                  {si < (lane.steps || []).length - 1 && (
                    <line x1={sx + stepW - 8} y1={y + laneH / 2} x2={sx + stepW - 2} y2={y + laneH / 2} stroke={p.accent} strokeWidth="1" markerEnd="url(#sw-arr)" />
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
      <line x1={0} y1={24 + lanes.length * laneH} x2={W} y2={24 + lanes.length * laneH} stroke={p.line} strokeWidth="1" />
    </svg>
  );
}

function ChevronVisual({ data, p }: { data: ChevronData; p: Palette }) {
  const steps = (data.steps || []).slice(0, 5);
  const n = Math.max(steps.length, 1);
  const W = 500, H = 80, chevW = W / n, overlap = 14;
  return (
    <svg viewBox={`0 0 ${W} ${H + 60}`} className="w-full rounded-xl" style={{ background: p.bg }}>
      <text x={W / 2} y="20" textAnchor="middle" fill={p.accent2} fontSize="11" fontWeight="bold">{data.title}</text>
      {steps.map((step, i) => {
        const x = i * (chevW - overlap / n);
        const half = H / 2;
        const opacity = 0.6 + (i / n) * 0.4;
        const pts = i === n - 1
          ? `${x},28 ${x + chevW},28 ${x + chevW},${28 + H} ${x},${28 + H}`
          : `${x},28 ${x + chevW},28 ${x + chevW + 16},${28 + half} ${x + chevW},${28 + H} ${x},${28 + H}${i > 0 ? ` ${x + 16},${28 + half}` : ""}`;
        return (
          <g key={i}>
            <polygon points={pts} fill={p.accent} opacity={opacity} />
            <text x={x + chevW / 2 + (i === 0 ? 4 : 10)} y={28 + half - 6} textAnchor="middle" dominantBaseline="middle" fill={p.textPrimary} fontSize="8.5" fontWeight="bold">{(step.label || "").slice(0, 12)}</text>
            <text x={x + chevW / 2 + (i === 0 ? 4 : 10)} y={28 + half + 7} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="7">{(step.detail || "").slice(0, 14)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function VisualRenderer({ visual, palette }: { visual: VisualData; palette: Palette }) {
  const p = palette;
  switch (visual.type) {
    case "mindmap":    return <MindmapVisual    data={visual.data as MindmapData}    p={p} />;
    case "process":    return <ProcessVisual    data={visual.data as ProcessData}    p={p} />;
    case "cycle":      return <CycleVisual      data={visual.data as CycleData}      p={p} />;
    case "timeline":   return <TimelineVisual   data={visual.data as TimelineData}   p={p} />;
    case "tree":       return <TreeVisual       data={visual.data as TreeData}       p={p} />;
    case "comparison": return <ComparisonVisual data={visual.data as ComparisonData} p={p} />;
    case "venn":       return <VennVisual       data={visual.data as VennData}       p={p} />;
    case "pyramid":    return <PyramidVisual    data={visual.data as PyramidData}    p={p} />;
    case "funnel":     return <FunnelVisual     data={visual.data as FunnelData}     p={p} />;
    case "framework":  return <FrameworkVisual  data={visual.data as FrameworkData}  p={p} />;
    case "data":       return <DataVisual       data={visual.data as DataFactsData}  p={p} />;
    case "causeeffect":return <CauseEffectVisual data={visual.data as CauseEffectData} p={p} />;
    case "roadmap":    return <RoadmapVisual    data={visual.data as RoadmapData}    p={p} />;
    case "matrix":     return <MatrixVisual     data={visual.data as MatrixData}     p={p} />;
    case "network":    return <NetworkVisual    data={visual.data as NetworkData}    p={p} />;
    case "staircase":  return <StaircaseVisual  data={visual.data as StaircaseData}  p={p} />;
    case "hexcluster": return <HexclusterVisual data={visual.data as HexclusterData} p={p} />;
    case "concentric": return <ConcentricVisual data={visual.data as ConcentricData} p={p} />;
    case "swimlane":   return <SwimlaneVisual   data={visual.data as SwimlaneData}   p={p} />;
    case "chevron":    return <ChevronVisual    data={visual.data as ChevronData}    p={p} />;
    default: return null;
  }
}

// ── Thumbnail mini-SVGs ─────────────────────────────────────────────────────────
function VisualThumb({ type, active }: { type: VisualType; active?: boolean }) {
  const bg = active ? "#1e3a8a" : "#0f1929";
  const acc = active ? "#a78bfa" : "#7c3aed";
  const acc2 = active ? "#c4b5fd" : "#a78bfa";
  const surf = active ? "#243560" : "#1a2744";
  const dim = active ? "#6366f1" : "#334155";

  const thumbs: Record<VisualType, React.ReactNode> = {
    mindmap: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><circle cx="30" cy="22" r="7" fill={acc}/>{[[0,-13],[12,7],[-12,7],[10,-10],[-10,-10]].map(([dx,dy],i)=>(<g key={i}><line x1="30" y1="22" x2={30+(dx||0)} y2={22+(dy||0)} stroke={dim} strokeWidth="0.8"/><circle cx={30+(dx||0)} cy={22+(dy||0)} r="3.5" fill={i%2===0?acc:acc2}/></g>))}</svg>),
    process: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/>{[5,13,21,29].map((y,i)=>(<g key={i}><rect x="8" y={y} width="44" height="7" rx="2" fill={i===0?acc:surf}/>{i<3&&<line x1="30" y1={y+7} x2="30" y2={y+9} stroke={acc} strokeWidth="1"/>}</g>))}</svg>),
    cycle: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><circle cx="30" cy="22" r="14" fill="none" stroke={acc} strokeWidth="1.5" strokeDasharray="4,2"/>{[[-1,-12],[10,7],[-10,7]].map(([dx,dy],i)=>(<g key={i}><rect x={30+(dx||0)*1.5-7} y={22+(dy||0)*1.5-4} width="14" height="8" rx="3" fill={i===0?acc:surf}/></g>))}<circle cx="30" cy="22" r="4" fill={acc2}/></svg>),
    timeline: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><line x1="18" y1="4" x2="18" y2="41" stroke={acc} strokeWidth="1.5"/>{[7,15,23,31].map((y,i)=>(<g key={i}><circle cx="18" cy={y} r="2.5" fill={i===0?acc:acc2}/><rect x="23" y={y-3} width="30" height="6" rx="1.5" fill={surf}/></g>))}</svg>),
    tree: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><rect x="22" y="3" width="16" height="8" rx="2" fill={acc}/>{[12,30,48].map((x,i)=>(<g key={i}><line x1="30" y1="11" x2={x} y2="19" stroke={dim} strokeWidth="0.8"/><rect x={x-7} y="19" width="14" height="8" rx="2" fill={surf}/>{[x-5,x+2].map((cx2,j)=>(<g key={j}><line x1={x} y1="27" x2={cx2} y2="34" stroke={dim} strokeWidth="0.6"/><rect x={cx2-4} y="34" width="8" height="5" rx="1" fill={dim}/></g>))}</g>))}</svg>),
    comparison: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><line x1="30" y1="3" x2="30" y2="42" stroke={dim} strokeWidth="0.8"/><rect x="2" y="3" width="25" height="7" rx="2" fill={acc}/><rect x="33" y="3" width="25" height="7" rx="2" fill={surf}/>{[14,20,27,34].map((y)=>(<g key={y}><rect x="3" y={y} width="23" height="4.5" rx="1" fill={surf}/><rect x="34" y={y} width="23" height="4.5" rx="1" fill={dim}/></g>))}</svg>),
    venn: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><circle cx="22" cy="22" r="14" fill={acc} fillOpacity="0.6"/><circle cx="38" cy="22" r="14" fill={acc2} fillOpacity="0.5"/><text x="30" y="23" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="5" fontWeight="bold">∩</text></svg>),
    pyramid: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><polygon points="30,4 37,14 23,14" fill={acc}/><polygon points="23,15 37,15 44,25 16,25" fill={surf}/><polygon points="16,26 44,26 51,36 9,36" fill={dim}/></svg>),
    funnel: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><polygon points="3,4 57,4 49,15 11,15" fill={acc}/><polygon points="11,16 49,16 43,27 17,27" fill={surf}/><polygon points="17,28 43,28 38,39 22,39" fill={dim}/></svg>),
    framework: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><rect x="18" y="4" width="24" height="9" rx="2" fill={acc}/><rect x="10" y="16" width="40" height="9" rx="2" fill={surf}/><rect x="4" y="28" width="52" height="9" rx="2" fill={dim}/></svg>),
    data: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/>{([[4,4],[32,4],[4,24],[32,24]] as [number,number][]).map(([x,y],i)=>(<g key={i}><rect x={x} y={y} width="24" height="16" rx="2" fill={surf}/><rect x={x} y={y} width="3" height="16" rx="1" fill={i%2===0?acc:acc2}/></g>))}</svg>),
    causeeffect: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><line x1="6" y1="22" x2="48" y2="22" stroke={acc} strokeWidth="1.5"/><rect x="48" y="17" width="10" height="10" rx="2" fill={surf}/>{[[13,14],[22,14],[31,14]].map(([x,y],i)=>(<line key={i} x1={x-4} y1={y} x2={x+4} y2="22" stroke={acc2} strokeWidth="1"/>))}{[[17,30],[26,30],[35,30]].map(([x,y],i)=>(<line key={i} x1={x-4} y1={y} x2={x+4} y2="22" stroke={acc2} strokeWidth="1"/>))}</svg>),
    roadmap: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><line x1="4" y1="22" x2="56" y2="22" stroke={dim} strokeWidth="2"/>{[10,22,34,46].map((x,i)=>(<g key={i}><circle cx={x} cy="22" r="5" fill={i%2===0?acc:acc2}/><rect x={x-8} y={i%2===0?5:28} width="16" height="12" rx="2" fill={surf}/></g>))}</svg>),
    matrix: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><line x1="30" y1="4" x2="30" y2="41" stroke={dim} strokeWidth="0.8"/><line x1="4" y1="22" x2="56" y2="22" stroke={dim} strokeWidth="0.8"/><rect x="4" y="4" width="24" height="16" rx="1" fill={acc} fillOpacity="0.5"/><rect x="32" y="4" width="24" height="16" rx="1" fill={surf}/><rect x="4" y="24" width="24" height="16" rx="1" fill={surf}/><rect x="32" y="24" width="24" height="16" rx="1" fill={acc} fillOpacity="0.3"/></svg>),
    network: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><circle cx="30" cy="22" r="7" fill={acc}/>{[[8,10],[52,10],[4,34],[56,34],[30,4]].map(([nx,ny],i)=>(<g key={i}><line x1="30" y1="22" x2={nx} y2={ny} stroke={dim} strokeWidth="0.8"/><circle cx={nx} cy={ny} r="4" fill={surf}/></g>))}</svg>),
    staircase: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/>{[0,1,2,3].map(i=>(<rect key={i} x={i*13+4} y={42-(i+1)*9} width={60-(i*13+4)} height={(i+1)*9} fill={acc} opacity={0.4+i*0.15}/>))}{[0,1,2,3].map(i=>(<rect key={i} x={i*13+4} y={42-(i+1)*9} width="13" height="9" fill={acc2} opacity={0.9}/>))}</svg>),
    hexcluster: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><polygon points="30,8 37,13 37,22 30,27 23,22 23,13" fill={acc}/>{[[9,16],[9,30],[30,38],[51,30],[51,16]].map(([hx,hy],i)=>(<g key={i}><line x1="30" y1="18" x2={hx} y2={hy} stroke={dim} strokeWidth="0.8"/><polygon points={`${hx},${hy-6} ${hx+5},${hy-3} ${hx+5},${hy+3} ${hx},${hy+6} ${hx-5},${hy+3} ${hx-5},${hy-3}`} fill={surf}/></g>))}</svg>),
    concentric: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><circle cx="30" cy="22" r="18" fill={acc} opacity="0.25"/><circle cx="30" cy="22" r="12" fill={acc} opacity="0.45"/><circle cx="30" cy="22" r="6" fill={acc} opacity="0.9"/></svg>),
    swimlane: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><rect x="0" y="4" width="14" height="18" fill={acc}/><rect x="0" y="23" width="14" height="18" fill={surf}/><rect x="14" y="4" width="46" height="18" fill={dim}/><rect x="14" y="23" width="46" height="18" fill={bg}/>{[20,30,40,50].map((x,i)=>(<rect key={i} x={x-3} y={i%2===0?7:26} width="10" height="12" rx="2" fill={i%2===0?surf:dim}/>))}</svg>),
    chevron: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/>{[0,1,2,3].map(i=>{const x=i*14,op=0.5+i*0.15;return(<polygon key={i} points={`${x+2},14 ${x+14},14 ${x+18},22 ${x+14},30 ${x+2},30${i>0?` ${x+6},22`:""}`} fill={acc} opacity={op}/>)})}</svg>),
  };
  return <div className="w-full aspect-[4/3] overflow-hidden rounded">{thumbs[type]}</div>;
}

// ── Scanning animation overlay ─────────────────────────────────────────────────
function ScanAnimation({ height }: { height: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none z-10" style={{ height }}>
      <div className="absolute inset-0 bg-blue-500/5 rounded-lg border border-blue-400/30" />
      <div
        className="absolute left-0 right-0 h-1"
        style={{
          background: "linear-gradient(90deg, transparent 0%, #3b82f6 30%, #8b5cf6 50%, #3b82f6 70%, transparent 100%)",
          boxShadow: "0 0 12px 3px rgba(99,102,241,0.4)",
          animation: "scanline 1.4s linear infinite",
          top: 0,
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-2 shadow-lg border border-blue-200">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
          <span className="text-xs font-semibold text-blue-700">Analyzing section…</span>
        </div>
      </div>
      <style>{`@keyframes scanline{from{top:0%}to{top:100%}}`}</style>
    </div>
  );
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
  const [palettes, setPalettes]       = useState<Record<number, number>>({}); // blockIdx → palette id
  const [generatingVisual, setGeneratingVisual] = useState<number | null>(null);
  const [panelY, setPanelY]           = useState(80);
  const [scanHeights, setScanHeights] = useState<Record<number, number>>({});
  const blockElsRef                   = useRef<Record<number, HTMLDivElement | null>>({});
  const { quota, bump }               = useUsageLimit("memorizer");

  const setBlockRef = useCallback((idx: number) => (el: HTMLDivElement | null) => {
    blockElsRef.current[idx] = el;
  }, []);

  // ── Document generation ─────────────────────────────────────────────────────
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

CRITICAL: Write every section fully. Minimum 1500 words. Use **bold** for key terms. Never use LaTeX.`,
        "You are an expert academic writer. Generate very comprehensive, detailed educational documents of at least 1500 words. NEVER stop in the middle — always complete the full document including the Conclusion. Use **bold** for key terms. Never use LaTeX.",
        [], false, 4000
      );
      await bump();
      const parsed = parseMarkdown(res.text);
      setBlocks(parsed);
      setDocTitle(topicInput.trim());
      setMode("document");
    } catch {
      toast.error("Failed to generate document. Please try again.");
    } finally { setGenerating(false); }
  }

  async function handlePaste() {
    if (!pasteInput.trim()) return toast.error("Please paste some text first");
    let text = pasteInput.trim();
    const hasHeadings = /^## /m.test(text);
    if (!hasHeadings) {
      setGenerating(true);
      try {
        const firstLine = text.split("\n")[0].replace(/^#+\s*/, "").trim();
        const res = await askAI(
          `Organize the following text into a structured educational document with clear section headings. Keep ALL original content.

Format rules:
- First line: # [title] (use "${firstLine}" if appropriate)
- Each logical section starts with: ## [Section Heading]
- Keep all paragraphs, bullet points, and numbered lists as they are
- Create at least 3-5 sections

Text to structure:
${text.slice(0, 4000)}`,
          "You are a document organizer. Add proper markdown headings (# title, ## sections). Preserve every word of original content. Return only the formatted markdown.",
          [], false, 3000
        );
        text = res.text.trim();
      } catch { /* use as-is */ } finally { setGenerating(false); }
    }
    const firstLine = text.split("\n")[0].replace(/^#+\s*/, "").trim();
    const parsed = parseMarkdown(text);
    setBlocks(parsed);
    setDocTitle(firstLine || "Your Document");
    setMode("document");
  }

  // ── Visual generation ───────────────────────────────────────────────────────
  async function doGenerateVisual(blockIdx: number, type: VisualType) {
    const block = blocks[blockIdx];
    if (!block) return;
    const heading  = block.heading.content;
    const bodyText = block.body
      .map(s => (s.type === "bullet" || s.type === "numbered") ? (s.items || []).join(". ") : s.content)
      .join(" ").slice(0, 600);
    setGeneratingVisual(blockIdx);
    // Capture the section height for the scan animation
    const el = blockElsRef.current[blockIdx];
    if (el) setScanHeights(prev => ({ ...prev, [blockIdx]: el.offsetHeight }));
    try {
      const visual = await generateVisual(bodyText, heading, type);
      if (visual) {
        setVisuals(prev => ({ ...prev, [blockIdx]: visual }));
        // Assign a random palette if not yet assigned
        setPalettes(prev => ({ ...prev, [blockIdx]: prev[blockIdx] ?? Math.floor(Math.random() * PALETTES.length) }));
        toast.success("Visual generated!");
      } else {
        toast.error("Could not generate visual. Try again.");
      }
    } catch { toast.error("Visual generation failed."); }
    finally { setGeneratingVisual(null); setScanHeights(prev => { const n = {...prev}; delete n[blockIdx]; return n; }); }
  }

  // ── Click ⚡ — anchor panel near click position ────────────────────────────
  function openSuggestions(blockIdx: number, e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const wh = window.innerHeight;
    // Panel is ~420px tall; keep it inside viewport
    const top = Math.max(60, Math.min(rect.top - 20, wh - 440));
    setPanelY(top);

    const block = blocks[blockIdx];
    if (!block) return;
    const heading  = block.heading.content;
    const bodyText = block.body
      .map(s => (s.type === "bullet" || s.type === "numbered") ? (s.items || []).join(". ") : s.content)
      .join(" ").slice(0, 600);
    const picked = autoPickType(heading, bodyText);
    setActiveBlockIdx(blockIdx);
    setActiveType(picked);
    doGenerateVisual(blockIdx, picked);
  }

  async function handleSelectVisualType(type: VisualType) {
    if (activeBlockIdx === null) return;
    setActiveType(type);
    await doGenerateVisual(activeBlockIdx, type);
  }

  function changePalette(blockIdx: number, paletteId: number) {
    setPalettes(prev => ({ ...prev, [blockIdx]: paletteId }));
  }

  function reset() {
    setMode("landing");
    setBlocks([]); setVisuals({}); setPalettes({});
    setTopicInput(""); setPasteInput("");
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
              <button onClick={() => setMode("paste-input")} className="group relative overflow-hidden rounded-2xl p-6 text-left transition-transform hover:scale-[1.03] hover:shadow-xl focus:outline-none" style={{ background: "linear-gradient(135deg,#e879f9 0%,#a855f7 55%,#9333ea 100%)" }}>
                <div className="pointer-events-none absolute right-3 top-3 h-20 w-20 rounded-full bg-white/15" />
                <ClipboardList className="mb-4 h-10 w-10 text-white/90" />
                <h3 className="text-white font-bold text-base mb-1">By pasting my text</h3>
                <p className="text-purple-100 text-sm leading-snug">Create from notes, an outline or existing content.</p>
              </button>
              <button onClick={() => setMode("describe-input")} className="group relative overflow-hidden rounded-2xl p-6 text-left transition-transform hover:scale-[1.03] hover:shadow-xl focus:outline-none" style={{ background: "linear-gradient(135deg,#818cf8 0%,#7c3aed 55%,#6d28d9 100%)" }}>
                <div className="pointer-events-none absolute right-3 top-3 h-20 w-20 rounded-full bg-white/15" />
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
          <button onClick={() => setMode("landing")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="h-4 w-4" /> Back</button>
          <h1 className="text-base font-bold text-gray-900">Paste Your Text</h1>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-8 overflow-y-auto">
          <div className="w-full max-w-2xl space-y-3">
            <label className="block text-sm font-medium text-gray-700">Paste your notes, outline, or any text content</label>
            <textarea value={pasteInput} onChange={e => setPasteInput(e.target.value)} placeholder={"Paste your text here…\n\nYou can use plain text or markdown (# Heading, ## Section, **bold**, - bullets).\nThe more structured your text, the better the document will look."} className="w-full h-64 rounded-xl border border-border bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none" />
            <button onClick={handlePaste} disabled={!pasteInput.trim() || generating} className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 px-6 py-3 font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2">
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Structuring your document…</> : "Create Visual Document"}
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
          <button onClick={() => setMode("landing")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="h-4 w-4" /> Back</button>
          <h1 className="text-base font-bold text-gray-900">Describe Your Idea</h1>
          <div className="ml-auto"><QuotaBadge feature="memorizer" /></div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-8 overflow-y-auto">
          <div className="w-full max-w-2xl space-y-3">
            <label className="block text-sm font-medium text-gray-700">What topic or idea would you like to explore?</label>
            <textarea value={topicInput} onChange={e => setTopicInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !generating) handleDescribe(); }} placeholder={"e.g. 'The impact of globalization on developing economies'\ne.g. 'How photosynthesis works'\ne.g. 'Machine learning fundamentals'"} className="w-full h-36 rounded-xl border border-border bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none" disabled={generating} />
            <button onClick={handleDescribe} disabled={generating || !topicInput.trim()} className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-6 py-3 font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2">
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating comprehensive document…</> : <><Sparkles className="h-4 w-4" /> Generate Document</>}
            </button>
            <p className="text-center text-xs text-muted-foreground">Tip: Press Ctrl+Enter to generate</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Document view ────────────────────────────────────────────────────────────
  const activeBlock = activeBlockIdx !== null ? blocks[activeBlockIdx] : null;

  return (
    <div className="fixed inset-x-0 bottom-0 top-14 lg:static lg:h-full flex overflow-hidden bg-gray-50">

      {/* ── Floating contextual panel — positioned near the clicked ⚡ ── */}
      {activeBlockIdx !== null && (
        <div
          className="fixed z-50 w-56 bg-[#0f1929] border border-[#334155] shadow-2xl rounded-xl overflow-hidden flex flex-col"
          style={{ left: 8, top: panelY, maxHeight: "calc(100vh - 80px)" }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#334155] bg-[#1a2744] flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
              <span className="font-bold text-xs text-violet-200">AI Suggestions</span>
            </div>
            <button onClick={() => setActiveBlockIdx(null)} className="text-slate-400 hover:text-white transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Active section + selected type */}
          <div className="px-3 py-2 border-b border-[#334155] flex-shrink-0">
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Section</div>
            <div className="text-[11px] font-semibold text-slate-200 truncate">{activeBlock?.heading.content || "Untitled"}</div>
            {activeType && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-900 text-violet-300 font-medium border border-violet-700">
                  {VISUAL_CATEGORIES.find(c => c.type === activeType)?.icon}{" "}
                  {VISUAL_CATEGORIES.find(c => c.type === activeType)?.label}
                </span>
                {generatingVisual === activeBlockIdx && <Loader2 className="h-3 w-3 animate-spin text-violet-400 flex-shrink-0" />}
              </div>
            )}
          </div>

          {/* Diagram type grid — scrollable */}
          <div className="flex-1 overflow-y-auto p-2 min-h-0">
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1.5 px-1">
              {generatingVisual !== null ? "Generating…" : "Choose diagram type"}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {VISUAL_CATEGORIES.map(cat => {
                const isActive = cat.type === activeType;
                const isLoading = generatingVisual === activeBlockIdx && cat.type === activeType;
                return (
                  <button
                    key={cat.type}
                    onClick={() => handleSelectVisualType(cat.type)}
                    disabled={generatingVisual !== null}
                    className={`group relative overflow-hidden rounded-lg border transition-all focus:outline-none disabled:opacity-40 ${
                      isActive ? "border-violet-500 ring-1 ring-violet-400" : "border-[#334155] hover:border-violet-500"
                    }`}
                    title={cat.label}
                  >
                    <VisualThumb type={cat.type} active={isActive} />
                    <div className={`py-1 text-center text-[8px] font-medium leading-tight px-0.5 ${
                      isActive ? "text-violet-300 bg-violet-950" : "text-slate-400 group-hover:text-violet-300"
                    }`}>
                      {isLoading ? <Loader2 className="h-3 w-3 animate-spin mx-auto text-violet-400" /> : cat.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Palette picker — shown when visual exists */}
          {visuals[activeBlockIdx] && (
            <div className="px-3 py-2.5 border-t border-[#334155] flex-shrink-0">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1.5">Color theme</div>
              <div className="flex gap-1.5 flex-wrap">
                {PALETTES.map(pal => (
                  <button
                    key={pal.id}
                    onClick={() => changePalette(activeBlockIdx!, pal.id)}
                    className={`h-5 w-5 rounded-full transition-all ${palettes[activeBlockIdx!] === pal.id ? "ring-2 ring-white ring-offset-1 ring-offset-[#0f1929] scale-110" : "opacity-70 hover:opacity-100"}`}
                    style={{ background: pal.swatch }}
                    title={pal.name}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Scrollable document panel ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b px-4 py-2 bg-white flex-shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={reset} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <span className="text-sm font-semibold text-gray-700 truncate">{docTitle}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
              Click <Zap className="inline h-3 w-3 text-blue-500" /> to auto-visualize
            </span>
            <button onClick={reset} className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors">
              <RefreshCw className="h-3 w-3" /> New
            </button>
          </div>
        </div>

        {/* Scrollable document */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto py-8 px-4">
            {blocks.map((block, blockIdx) => {
              const isTitle   = block.heading.type === "title";
              const isH2      = block.heading.type === "h2";
              const isLoading = generatingVisual === blockIdx;
              const hasVisual = !!visuals[blockIdx];
              const isActive  = activeBlockIdx === blockIdx;
              const palette   = PALETTES[palettes[blockIdx] ?? 0];

              return (
                <div key={blockIdx} className={`flex ${isH2 ? "mb-10" : isTitle ? "mb-4" : "mb-2"}`}>
                  {/* Gutter with ⚡ button */}
                  <div className="flex-shrink-0 flex flex-col items-center" style={{ width: 52 }}>
                    {isH2 && (
                      <button
                        onClick={(e) => openSuggestions(blockIdx, e)}
                        disabled={generatingVisual !== null}
                        className={`mt-4 flex h-9 w-9 items-center justify-center rounded-full text-white shadow-md active:scale-95 transition-all z-10 disabled:opacity-60 ${
                          isActive
                            ? "bg-violet-700 ring-2 ring-violet-300 ring-offset-1"
                            : "bg-violet-600 hover:bg-violet-700"
                        }`}
                        title="Auto-generate best visual for this section"
                      >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      </button>
                    )}
                  </div>

                  {/* Content area */}
                  <div
                    ref={setBlockRef(blockIdx)}
                    className={`flex-1 pb-7 pr-6 ${isH2 ? `border-l-2 pl-5 ${isActive ? "border-violet-500" : "border-violet-300"}` : "pl-2"}`}
                  >
                    {isTitle && block.heading.content && (
                      <h1 className="text-3xl font-bold text-gray-900 mb-4 mt-2 flex items-center gap-3">
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-violet-50 text-xl select-none">🧠</span>
                        {block.heading.content}
                      </h1>
                    )}
                    {isH2 && (
                      <h2 className="text-xl font-bold text-gray-800 mt-1 mb-3">{block.heading.content}</h2>
                    )}

                    {/* Section body text */}
                    {block.body.map(sec => {
                      if (sec.type === "paragraph") return (
                        <p key={sec.id} className="text-gray-700 text-sm leading-relaxed mb-3"><Inline text={sec.content} /></p>
                      );
                      if (sec.type === "bullet") return (
                        <ul key={sec.id} className="list-disc pl-5 mb-3 space-y-1.5">
                          {(sec.items || []).map((item, ii) => <li key={ii} className="text-gray-700 text-sm leading-relaxed"><Inline text={item} /></li>)}
                        </ul>
                      );
                      if (sec.type === "numbered") return (
                        <ol key={sec.id} className="list-decimal pl-5 mb-3 space-y-1.5">
                          {(sec.items || []).map((item, ii) => <li key={ii} className="text-gray-700 text-sm leading-relaxed"><Inline text={item} /></li>)}
                        </ol>
                      );
                      return null;
                    })}

                    {/* Scanning animation overlay — covers only this section */}
                    {isH2 && isLoading && scanHeights[blockIdx] && (
                      <div className="relative" style={{ marginTop: 4 }}>
                        <ScanAnimation height={Math.max(scanHeights[blockIdx] - 40, 80)} />
                        <div style={{ height: Math.max(scanHeights[blockIdx] - 40, 80) }} />
                      </div>
                    )}

                    {/* Visual embed — BELOW section content, never overlapping */}
                    {isH2 && hasVisual && !isLoading && (
                      <div className="mt-5 rounded-xl overflow-hidden shadow-lg border border-[#334155]">
                        {/* Visual header bar */}
                        <div className="flex items-center justify-between px-3 py-2" style={{ background: "#0f1929", borderBottom: "1px solid #334155" }}>
                          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            {VISUAL_CATEGORIES.find(c => c.type === visuals[blockIdx].type)?.icon}{" "}
                            {VISUAL_CATEGORIES.find(c => c.type === visuals[blockIdx].type)?.label}
                          </span>
                          <div className="flex items-center gap-2">
                            {/* Inline palette quick-switch */}
                            <div className="flex gap-1">
                              {PALETTES.map(pal => (
                                <button
                                  key={pal.id}
                                  onClick={() => changePalette(blockIdx, pal.id)}
                                  className={`h-3.5 w-3.5 rounded-full transition-all ${palettes[blockIdx] === pal.id ? "ring-1 ring-white scale-110" : "opacity-50 hover:opacity-100"}`}
                                  style={{ background: pal.swatch }}
                                  title={pal.name}
                                />
                              ))}
                            </div>
                            <button
                              onClick={(e) => openSuggestions(blockIdx, e)}
                              className="text-[10px] text-violet-400 hover:text-violet-200 font-medium transition-colors"
                            >
                              Regen
                            </button>
                            <button
                              onClick={() => setVisuals(prev => { const n = {...prev}; delete n[blockIdx]; return n; })}
                              className="text-slate-500 hover:text-red-400 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {/* Visual content */}
                        <VisualRenderer visual={visuals[blockIdx]} palette={palette} />
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
