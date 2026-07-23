import { createFileRoute } from "@tanstack/react-router";
import { useState, useLayoutEffect, useRef, useCallback } from "react";
import React from "react";
import { usePageState } from "@/lib/pageState";
import {
  Loader2, Zap, ClipboardList, Sparkles, X, ArrowLeft, RefreshCw, ChevronDown, LayoutTemplate, ChevronUp,
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

// Each template = a (type + variant) combo with its own label/tags/thumbnail
type VisualTemplate = {
  id: string; label: string; icon: string;
  baseType: VisualType; variant: number; tags: string[];
};

type DocSection = {
  id: number; type: "title" | "h2" | "paragraph" | "bullet" | "numbered";
  content: string; items?: string[];
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
  | { type: "mindmap";     data: MindmapData     }
  | { type: "process";     data: ProcessData     }
  | { type: "cycle";       data: CycleData       }
  | { type: "timeline";    data: TimelineData    }
  | { type: "tree";        data: TreeData        }
  | { type: "comparison";  data: ComparisonData  }
  | { type: "venn";        data: VennData        }
  | { type: "pyramid";     data: PyramidData     }
  | { type: "funnel";      data: FunnelData      }
  | { type: "framework";   data: FrameworkData   }
  | { type: "data";        data: DataFactsData   }
  | { type: "causeeffect"; data: CauseEffectData }
  | { type: "roadmap";     data: RoadmapData     }
  | { type: "matrix";      data: MatrixData      }
  | { type: "network";     data: NetworkData     }
  | { type: "staircase";   data: StaircaseData   }
  | { type: "hexcluster";  data: HexclusterData  }
  | { type: "concentric";  data: ConcentricData  }
  | { type: "swimlane";    data: SwimlaneData    }
  | { type: "chevron";     data: ChevronData     };

// ── Color Palettes ─────────────────────────────────────────────────────────────
type Palette = {
  id: number; name: string; swatch: string;
  bg: string; surface: string; surface2: string;
  accent: string; accent2: string; accent3: string;
  textPrimary: string; textSecondary: string; line: string;
};
const PALETTES: Palette[] = [
  { id:0, name:"Midnight", swatch:"#7c3aed", bg:"#0f1929", surface:"#1a2744", surface2:"#243560", accent:"#7c3aed", accent2:"#a78bfa", accent3:"#c4b5fd", textPrimary:"#f1f5f9", textSecondary:"#94a3b8", line:"#334155" },
  { id:1, name:"Ocean",    swatch:"#0ea5e9", bg:"#071c2c", surface:"#0c2f4a", surface2:"#0e4272", accent:"#0ea5e9", accent2:"#38bdf8", accent3:"#7dd3fc", textPrimary:"#f0f9ff", textSecondary:"#94a3b8", line:"#1e3a5f" },
  { id:2, name:"Slate",    swatch:"#2563eb", bg:"#f8fafc", surface:"#e2e8f0", surface2:"#cbd5e1", accent:"#2563eb", accent2:"#3b82f6", accent3:"#93c5fd", textPrimary:"#0f172a", textSecondary:"#475569", line:"#cbd5e1" },
  { id:3, name:"Forest",   swatch:"#16a34a", bg:"#071a0c", surface:"#0f2d1a", surface2:"#1a4528", accent:"#16a34a", accent2:"#22c55e", accent3:"#86efac", textPrimary:"#f0fdf4", textSecondary:"#86efac", line:"#1a4528" },
  { id:4, name:"Ember",    swatch:"#ea580c", bg:"#1a0d06", surface:"#2d1a0c", surface2:"#4a2a12", accent:"#ea580c", accent2:"#f97316", accent3:"#fdba74", textPrimary:"#fff7ed", textSecondary:"#fdba74", line:"#4a2a12" },
  { id:5, name:"Crimson",  swatch:"#dc2626", bg:"#130608", surface:"#2d1015", surface2:"#4a1a22", accent:"#dc2626", accent2:"#ef4444", accent3:"#fca5a5", textPrimary:"#fff1f2", textSecondary:"#fca5a5", line:"#4a1a22" },
];

// ── Template Catalog (160 templates) ──────────────────────────────────────────
const TEMPLATES: VisualTemplate[] = [
  // ── Mind Map family ─
  { id:"mindmap-radial",   label:"Mind Map",          icon:"🧠", baseType:"mindmap",    variant:0, tags:["concept","overview","topic","introduction","idea","summary"] },
  { id:"mindmap-bubble",   label:"Bubble Map",        icon:"💭", baseType:"mindmap",    variant:1, tags:["brainstorm","idea","creative","thought","theme"] },
  { id:"mindmap-spider",   label:"Spider Diagram",    icon:"🕷️", baseType:"mindmap",    variant:2, tags:["web","connection","radial","explore","relate"] },
  { id:"mindmap-horiz",    label:"Horizontal Map",    icon:"↔️", baseType:"mindmap",    variant:3, tags:["expand","branch","breakdown","concept map"] },
  { id:"mindmap-flower",   label:"Flower Diagram",    icon:"🌸", baseType:"mindmap",    variant:4, tags:["bloom","petal","aspects","qualities","attribute"] },
  { id:"mindmap-sunburst", label:"Sunburst",          icon:"☀️", baseType:"mindmap",    variant:5, tags:["radial","hierarchy","drill","category","nested"] },
  { id:"mindmap-cloud",    label:"Concept Cloud",     icon:"☁️", baseType:"mindmap",    variant:6, tags:["cloud","word","term","vocabulary","keyword"] },

  // ── Process / Flow family ─
  { id:"process-steps",    label:"Step by Step",      icon:"📋", baseType:"process",    variant:0, tags:["step","procedure","how to","guide","method","instruction"] },
  { id:"process-cards",    label:"Card Steps",        icon:"🃏", baseType:"process",    variant:1, tags:["card","numbered","list","phase","stage","sequential"] },
  { id:"process-horizontal",label:"H-Flow",           icon:"➡️", baseType:"process",    variant:2, tags:["horizontal","flow","left to right","sequence","pipeline"] },
  { id:"process-circle",   label:"Circular Flow",     icon:"🔃", baseType:"process",    variant:3, tags:["circle","circular","round","loop","recurring process"] },
  { id:"process-diamond",  label:"Decision Flow",     icon:"🔷", baseType:"process",    variant:4, tags:["decision","if then","branch","choice","condition","flowchart"] },
  { id:"process-swim2",    label:"Swim Lane (2)",     icon:"🏊", baseType:"swimlane",   variant:0, tags:["swim lane","lane","actor","role","department","who does"] },
  { id:"process-swim3",    label:"Swim Lane (3)",     icon:"🏊‍♀️", baseType:"swimlane",  variant:1, tags:["three actor","three role","cross functional","handoff"] },
  { id:"process-value",    label:"Value Chain",       icon:"⛓️", baseType:"chevron",    variant:0, tags:["value chain","value","chain","porter","activity"] },
  { id:"process-kanban",   label:"Kanban Board",      icon:"📌", baseType:"framework",  variant:3, tags:["kanban","board","column","todo","doing","done","sprint"] },
  { id:"process-checklist",label:"Checklist",         icon:"✅", baseType:"process",    variant:5, tags:["checklist","check","tick","task","to-do","requirement"] },
  { id:"process-workflow",  label:"Workflow",         icon:"⚙️", baseType:"process",    variant:6, tags:["workflow","automate","trigger","action","result","system"] },
  { id:"process-sipoc",    label:"SIPOC",             icon:"📦", baseType:"swimlane",   variant:2, tags:["sipoc","supplier","input","output","customer","process map"] },
  { id:"process-journey",  label:"Customer Journey",  icon:"🗺️", baseType:"timeline",   variant:4, tags:["customer journey","touchpoint","experience","emotion","path"] },
  { id:"process-arch",     label:"Architecture",      icon:"🏛️", baseType:"framework",  variant:4, tags:["architecture","system","component","layer","technical"] },

  // ── Cycle family ─
  { id:"cycle-circle",     label:"Cycle",             icon:"🔄", baseType:"cycle",      variant:0, tags:["cycle","circular","loop","recurring","repeat","rotation","season"] },
  { id:"cycle-gear",       label:"Gear Cycle",        icon:"⚙️", baseType:"cycle",      variant:1, tags:["gear","mechanism","interdependent","system","interlock"] },
  { id:"cycle-life",       label:"Life Cycle",        icon:"🔁", baseType:"cycle",      variant:2, tags:["life cycle","birth","growth","death","natural","biological"] },
  { id:"cycle-agile",      label:"Agile Sprint",      icon:"🏃", baseType:"cycle",      variant:3, tags:["agile","sprint","scrum","iterate","feedback loop","dev cycle"] },
  { id:"cycle-feedback",   label:"Feedback Loop",     icon:"🔊", baseType:"cycle",      variant:4, tags:["feedback","reinforcing","balancing","loop","system dynamics"] },
  { id:"cycle-water",      label:"Natural Cycle",     icon:"💧", baseType:"cycle",      variant:5, tags:["water cycle","carbon cycle","nitrogen","rock cycle","nature"] },

  // ── Timeline family ─
  { id:"timeline-vert",    label:"Timeline",          icon:"📅", baseType:"timeline",   variant:0, tags:["timeline","history","event","date","era","chronological","year"] },
  { id:"timeline-horiz",   label:"H-Timeline",        icon:"⏩", baseType:"timeline",   variant:1, tags:["horizontal timeline","milestones","roadmap time","past present future"] },
  { id:"timeline-branch",  label:"Branching",         icon:"🌿", baseType:"timeline",   variant:2, tags:["branch","split","fork","parallel","alternate","diverge"] },
  { id:"timeline-gantt",   label:"Gantt Chart",       icon:"📊", baseType:"timeline",   variant:3, tags:["gantt","project plan","schedule","duration","deadline"] },
  { id:"timeline-adoption",label:"Adoption Curve",    icon:"📈", baseType:"timeline",   variant:5, tags:["adoption","innovation","early adopter","diffusion","curve","s-curve"] },
  { id:"timeline-bridge",  label:"Bridge Diagram",    icon:"🌉", baseType:"timeline",   variant:6, tags:["bridge","gap","from to","before after","transition","transformation"] },
  { id:"timeline-sprint",  label:"Sprint Timeline",   icon:"🏁", baseType:"timeline",   variant:7, tags:["sprint","iteration","release","version","milestone","delivery"] },

  // ── Tree / Hierarchy family ─
  { id:"tree-topdown",     label:"Tree Diagram",      icon:"🌳", baseType:"tree",       variant:0, tags:["tree","hierarchy","structure","parent child","org","branch","category"] },
  { id:"tree-leftright",   label:"Horizontal Tree",   icon:"🌲", baseType:"tree",       variant:1, tags:["horizontal tree","left right","expand right","breakdown"] },
  { id:"tree-org",         label:"Org Chart",         icon:"👥", baseType:"tree",       variant:2, tags:["org chart","organisation","reporting","team","people","management"] },
  { id:"tree-decision",    label:"Decision Tree",     icon:"🔀", baseType:"tree",       variant:3, tags:["decision tree","yes no","if else","branch decision","choice tree"] },
  { id:"tree-classify",    label:"Classification",    icon:"📁", baseType:"tree",       variant:4, tags:["classification","taxonomy","species","genus","family","type","kind"] },
  { id:"tree-sitemap",     label:"Sitemap",           icon:"🗺️", baseType:"tree",       variant:5, tags:["sitemap","website","page","navigation","url","content map"] },
  { id:"tree-breakdown",   label:"WBS",               icon:"📐", baseType:"tree",       variant:6, tags:["wbs","work breakdown","deliverable","task decompose","project breakdown"] },

  // ── Comparison family ─
  { id:"compare-2col",     label:"Comparison",        icon:"⚖️", baseType:"comparison", variant:0, tags:["compare","contrast","versus","vs","difference","advantage","disadvantage"] },
  { id:"compare-3col",     label:"3-Way Compare",     icon:"⚖️", baseType:"comparison", variant:1, tags:["three way","triple compare","three options","three choices"] },
  { id:"compare-tchart",   label:"T-Chart",           icon:"📝", baseType:"comparison", variant:2, tags:["t chart","pros cons","for against","strengths weaknesses","simple compare"] },
  { id:"compare-procon",   label:"Pros & Cons",       icon:"👍", baseType:"comparison", variant:3, tags:["pros cons","benefit drawback","advantage disadvantage","for against"] },
  { id:"compare-features", label:"Feature Matrix",    icon:"📋", baseType:"comparison", variant:4, tags:["feature","capability","function","spec","product compare","plan"] },
  { id:"compare-forcefield",label:"Force Field",      icon:"🔀", baseType:"comparison", variant:5, tags:["force field","driving force","restraining force","change","lewin"] },
  { id:"compare-pmi",      label:"PMI Analysis",      icon:"➕", baseType:"comparison", variant:6, tags:["pmi","plus minus interesting","de bono","critical thinking"] },

  // ── Venn family ─
  { id:"venn-2",           label:"Venn Diagram",      icon:"⭕", baseType:"venn",       variant:0, tags:["venn","overlap","shared","intersection","two groups","common"] },
  { id:"venn-3",           label:"3-Circle Venn",     icon:"⭕", baseType:"venn",       variant:1, tags:["three circle","triple venn","three sets","three groups","triple overlap"] },
  { id:"venn-overlap",     label:"Overlap Map",       icon:"🔵", baseType:"venn",       variant:2, tags:["overlap","relationship","shared attribute","intersect","blend"] },

  // ── Pyramid family ─
  { id:"pyramid-maslow",   label:"Pyramid",           icon:"🔺", baseType:"pyramid",    variant:0, tags:["pyramid","hierarchy needs","maslow","layer","tier","foundation","apex"] },
  { id:"pyramid-inverted", label:"Inverted Pyramid",  icon:"🔻", baseType:"pyramid",    variant:1, tags:["inverted pyramid","journalism","most important first","taper","wide base top"] },
  { id:"pyramid-diamond",  label:"Diamond Layers",    icon:"💎", baseType:"pyramid",    variant:2, tags:["diamond","wide middle","bi-directional","balanced","center focus"] },
  { id:"pyramid-iceberg",  label:"Iceberg Model",     icon:"🧊", baseType:"pyramid",    variant:3, tags:["iceberg","visible hidden","above below","surface beneath","implicit explicit"] },
  { id:"pyramid-trophy",   label:"Trophy/Rank",       icon:"🏆", baseType:"pyramid",    variant:4, tags:["rank","trophy","award","top","winner","tier","leaderboard","ranking"] },
  { id:"pyramid-abstraction",label:"Abstraction",     icon:"🏗️", baseType:"pyramid",    variant:5, tags:["abstraction","level","layer","low high","technical layer","osi"] },

  // ── Funnel family ─
  { id:"funnel-top",       label:"Funnel",            icon:"📉", baseType:"funnel",     variant:0, tags:["funnel","conversion","pipeline","qualify","filter","narrow","marketing funnel"] },
  { id:"funnel-reverse",   label:"Reverse Funnel",    icon:"📈", baseType:"funnel",     variant:1, tags:["reverse funnel","expand","grow","diverge","broaden","scale"] },
  { id:"funnel-hourglass", label:"Hourglass",         icon:"⏳", baseType:"funnel",     variant:2, tags:["hourglass","bottleneck","narrow then expand","constraint","pinch point"] },
  { id:"funnel-sales",     label:"Sales Funnel",      icon:"💰", baseType:"funnel",     variant:3, tags:["sales funnel","lead","prospect","opportunity","close","deal","crm"] },
  { id:"funnel-drip",      label:"Drip Flow",         icon:"💧", baseType:"funnel",     variant:4, tags:["drip","email sequence","nurture","sequence","drip marketing","flow down"] },

  // ── Framework / Layer family ─
  { id:"framework-stack",  label:"Framework Stack",   icon:"🏗️", baseType:"framework",  variant:0, tags:["framework","layer","component","stack","architecture","model","level"] },
  { id:"framework-nested", label:"Nested Boxes",      icon:"📦", baseType:"framework",  variant:1, tags:["nested","box","contain","inner outer","russian doll","scope"] },
  { id:"framework-columns",label:"Column Layout",     icon:"🏛️", baseType:"framework",  variant:2, tags:["column","pillar","three pillar","four pillar","foundation pillar"] },
  { id:"framework-swot",   label:"SWOT Analysis",     icon:"🎯", baseType:"matrix",     variant:2, tags:["swot","strength","weakness","opportunity","threat","strategic"] },
  { id:"framework-pestle", label:"PESTLE Analysis",   icon:"🌍", baseType:"matrix",     variant:5, tags:["pestle","political","economic","social","technology","legal","environment"] },
  { id:"framework-steep",  label:"STEEP Analysis",    icon:"📊", baseType:"matrix",     variant:6, tags:["steep","social","technological","economic","environmental","political"] },
  { id:"framework-bmc",    label:"Business Model",    icon:"💼", baseType:"framework",  variant:5, tags:["business model canvas","bmc","value proposition","customer segment","revenue"] },
  { id:"framework-3horizon",label:"Three Horizons",   icon:"🌄", baseType:"framework",  variant:6, tags:["three horizon","h1 h2 h3","mckinsey horizon","innovation horizon","future"] },
  { id:"framework-tech",   label:"Tech Stack",        icon:"💻", baseType:"framework",  variant:7, tags:["tech stack","technology","frontend backend","database","infrastructure"] },

  // ── Data / Facts family ─
  { id:"data-facts",       label:"Key Facts",         icon:"📊", baseType:"data",       variant:0, tags:["fact","statistic","key point","figure","number","metric","data point"] },
  { id:"data-stats",       label:"Stat Cards",        icon:"💡", baseType:"data",       variant:1, tags:["stat","number","kpi","percent","rate","measure","indicator"] },
  { id:"data-highlights",  label:"Highlight Cards",   icon:"⭐", baseType:"data",       variant:2, tags:["highlight","important","key takeaway","insight","callout","notable"] },
  { id:"data-definitions", label:"Definitions",       icon:"📖", baseType:"data",       variant:3, tags:["definition","term","glossary","meaning","vocabulary","concept explanation"] },
  { id:"data-checklist",   label:"Key Points List",   icon:"✅", baseType:"data",       variant:4, tags:["key points","summary","main points","takeaway","conclusion","learn"] },
  { id:"data-hbar",        label:"Horizontal Bars",   icon:"📏", baseType:"data",       variant:5, tags:["bar chart","horizontal bar","ranking","compare values","magnitude"] },
  { id:"data-progress",    label:"Progress Bars",     icon:"⬜", baseType:"data",       variant:6, tags:["progress","completion","percentage","done","achievement","score"] },
  { id:"data-metrics",     label:"Metrics Dashboard", icon:"🎛️", baseType:"data",       variant:7, tags:["dashboard","metric","kpi","performance","score","measure","benchmark"] },
  { id:"data-quote",       label:"Quote Cards",       icon:"💬", baseType:"data",       variant:8, tags:["quote","saying","principle","rule","law","theorem","statement"] },
  { id:"data-scorecard",   label:"Scorecard",         icon:"🏅", baseType:"data",       variant:9, tags:["scorecard","rating","score","grade","evaluation","assessment","criteria"] },

  // ── Cause & Effect family ─
  { id:"cause-fishbone",   label:"Fishbone",          icon:"🐟", baseType:"causeeffect",variant:0, tags:["cause","effect","fishbone","ishikawa","reason","why","root cause","factor"] },
  { id:"cause-5why",       label:"5 Whys",            icon:"❓", baseType:"causeeffect",variant:1, tags:["5 why","five whys","root cause","drill down","because","reason chain"] },
  { id:"cause-impact",     label:"Impact Map",        icon:"💥", baseType:"causeeffect",variant:2, tags:["impact","consequence","result","effect","outcome","lead to"] },
  { id:"cause-rootcause",  label:"Root Cause Tree",   icon:"🌱", baseType:"causeeffect",variant:3, tags:["root cause","tree","source","origin","underlying","fundamental cause"] },

  // ── Roadmap family ─
  { id:"roadmap-horiz",    label:"Roadmap",           icon:"🗺️", baseType:"roadmap",    variant:0, tags:["roadmap","milestone","phase","plan","quarter","q1 q2","release","strategy"] },
  { id:"roadmap-vert",     label:"V-Roadmap",         icon:"📍", baseType:"roadmap",    variant:1, tags:["vertical roadmap","timeline plan","vertical milestone","project stages"] },
  { id:"roadmap-phases",   label:"Phase Gates",       icon:"🚪", baseType:"roadmap",    variant:2, tags:["phase gate","stage gate","approval","checkpoint","gate","phase plan"] },
  { id:"roadmap-sprint",   label:"Sprint Plan",       icon:"🏃", baseType:"roadmap",    variant:3, tags:["sprint plan","velocity","backlog","iteration","agile roadmap"] },
  { id:"roadmap-story",    label:"Story Map",         icon:"📖", baseType:"roadmap",    variant:4, tags:["story map","user story","epic","feature","user journey map"] },

  // ── Matrix family ─
  { id:"matrix-2x2",       label:"2×2 Matrix",        icon:"🔲", baseType:"matrix",     variant:0, tags:["matrix","quadrant","2x2","four quadrant","bcg","strategic","position"] },
  { id:"matrix-3x3",       label:"3×3 Grid",          icon:"⬛", baseType:"matrix",     variant:1, tags:["3x3","nine box","grid","nine quadrant","three by three"] },
  { id:"matrix-eisenhower",label:"Eisenhower",         icon:"📋", baseType:"matrix",     variant:3, tags:["eisenhower","urgent important","priority","time management","urgent"] },
  { id:"matrix-responsibility",label:"RACI",          icon:"👤", baseType:"matrix",     variant:7, tags:["raci","responsibility","accountable","consulted","informed","who does what"] },
  { id:"matrix-impact-effort",label:"Impact/Effort",  icon:"🎯", baseType:"matrix",     variant:8, tags:["impact effort","priority","quick win","big bet","low hanging fruit"] },
  { id:"matrix-portfolio", label:"Portfolio Grid",    icon:"💼", baseType:"matrix",     variant:9, tags:["portfolio","product grid","stars cows","bcg matrix","grow prune"] },
  { id:"matrix-skill",     label:"Skill Matrix",      icon:"💪", baseType:"matrix",     variant:10, tags:["skill matrix","competency","team skill","capability map","skill gap"] },

  // ── Network family ─
  { id:"network-hub",      label:"Hub & Spoke",       icon:"🕸️", baseType:"network",    variant:0, tags:["hub spoke","central","connect","relationship","node","link","dependency"] },
  { id:"network-mesh",     label:"Mesh Network",      icon:"🌐", baseType:"network",    variant:1, tags:["mesh","interconnect","fully connected","distributed","peer","graph"] },
  { id:"network-stakeholder",label:"Stakeholder Map", icon:"👥", baseType:"network",    variant:2, tags:["stakeholder","influence","interest","actor","player","participant"] },
  { id:"network-ecosystem",label:"Ecosystem",         icon:"🌍", baseType:"network",    variant:3, tags:["ecosystem","environment","partner","supplier","competitor","value network"] },
  { id:"network-concept",  label:"Concept Map",       icon:"💡", baseType:"network",    variant:4, tags:["concept map","idea connection","knowledge map","semantic","linked ideas"] },

  // ── Staircase family ─
  { id:"stair-up",         label:"Staircase Up",      icon:"🪜", baseType:"staircase",  variant:0, tags:["staircase","ascend","climb","progress","level up","escalate","grow step"] },
  { id:"stair-down",       label:"Cascade Down",      icon:"⬇️", baseType:"staircase",  variant:1, tags:["cascade","descend","waterfall","trickle down","hierarchy down","level down"] },
  { id:"stair-wave",       label:"Wave Steps",        icon:"🌊", baseType:"staircase",  variant:2, tags:["wave","undulate","alternating","zigzag","back forth","wave pattern"] },
  { id:"stair-sigmoid",    label:"S-Curve",           icon:"📈", baseType:"staircase",  variant:3, tags:["s-curve","sigmoid","growth curve","adoption","slow fast slow","inflection"] },

  // ── Hex Cluster family ─
  { id:"hex-cluster",      label:"Hex Cluster",       icon:"⬡", baseType:"hexcluster",  variant:0, tags:["hexagon","hex","cluster","honeycomb","surround","topic cluster"] },
  { id:"hex-honeycomb",    label:"Honeycomb",         icon:"🍯", baseType:"hexcluster",  variant:1, tags:["honeycomb","pattern","grid hex","tessellate","structured cluster"] },
  { id:"hex-pentagon",     label:"Pentagon Map",      icon:"⬠", baseType:"hexcluster",  variant:2, tags:["pentagon","five point","five aspect","five element","five force"] },
  { id:"hex-radar",        label:"Radar Chart",       icon:"📡", baseType:"hexcluster",  variant:3, tags:["radar","spider chart","web chart","competency","skill radar","dimension"] },
  { id:"hex-lotus",        label:"Lotus Diagram",     icon:"🪷", baseType:"hexcluster",  variant:4, tags:["lotus","petal","bloom","expand","8 petal","creative brainstorm lotus"] },
  { id:"hex-star",         label:"Star Diagram",      icon:"⭐", baseType:"hexcluster",  variant:5, tags:["star","five star","six point","dimension","attribute","quality"] },

  // ── Concentric family ─
  { id:"concentric-rings", label:"Concentric Rings",  icon:"🎯", baseType:"concentric", variant:0, tags:["concentric","ring","circle","onion","layer","core","inner outer"] },
  { id:"concentric-onion", label:"Onion Diagram",     icon:"🧅", baseType:"concentric", variant:1, tags:["onion","peel","layer","surrounding","context","environment"] },
  { id:"concentric-target",label:"Target Diagram",    icon:"🎯", baseType:"concentric", variant:2, tags:["target","goal","objective","bulls eye","aim","priority center"] },
  { id:"concentric-donut", label:"Donut Chart",       icon:"🍩", baseType:"concentric", variant:3, tags:["donut","pie","proportion","share","percentage","part whole"] },
  { id:"concentric-scope", label:"Scope Diagram",     icon:"🔭", baseType:"concentric", variant:4, tags:["scope","boundary","in scope out scope","context boundary","system boundary"] },

  // ── Chevron / Banner family ─
  { id:"chevron-banner",   label:"Chevron Steps",     icon:"▶▶", baseType:"chevron",    variant:0, tags:["chevron","arrow","banner","sequential","phase step","process phase"] },
  { id:"chevron-ribbon",   label:"Ribbon Flow",       icon:"🎀", baseType:"chevron",    variant:1, tags:["ribbon","banner","scroll","wave banner","flowing step","colorful step"] },
  { id:"chevron-arrow",    label:"Arrow Flow",        icon:"➡️", baseType:"chevron",    variant:2, tags:["arrow","direction","linear flow","forward","pointing","direction step"] },
  { id:"chevron-bowtie",   label:"Bowtie",            icon:"🎗️", baseType:"chevron",    variant:3, tags:["bowtie","converge diverge","risks opportunities","two funnel","meet middle"] },
  { id:"chevron-wave",     label:"Wave Process",      icon:"〰️", baseType:"chevron",    variant:4, tags:["wave","undulate","flowing process","smooth step","gentle","curved process"] },

  // ── Specialty ─
  { id:"spec-empathy",     label:"Empathy Map",       icon:"❤️", baseType:"matrix",     variant:11, tags:["empathy map","think feel","say do","hear see","user research","ux"] },
  { id:"spec-kwl",         label:"KWL Chart",         icon:"📚", baseType:"comparison", variant:7, tags:["kwl","know want learn","learning","prior knowledge","lesson plan"] },
  { id:"spec-6w",          label:"5W1H",              icon:"🔍", baseType:"data",       variant:10, tags:["who what when where why how","5w1h","six w","journalist","analysis"] },
  { id:"spec-double-diamond",label:"Double Diamond",  icon:"💎", baseType:"funnel",     variant:5, tags:["double diamond","design thinking","diverge converge","discover define","uk design"] },
  { id:"spec-value-prop",  label:"Value Proposition", icon:"💡", baseType:"framework",  variant:8, tags:["value proposition","pain gain","job to be done","customer value","product fit"] },
  { id:"spec-golden-circle",label:"Golden Circle",    icon:"⭕", baseType:"concentric", variant:5, tags:["golden circle","why how what","simon sinek","purpose","inspire","brand"] },
  { id:"spec-okr",         label:"OKR Map",           icon:"🎯", baseType:"framework",  variant:9, tags:["okr","objective","key result","goal","target","measure success"] },
  { id:"spec-dependency",  label:"Dependency Map",    icon:"🔗", baseType:"network",    variant:5, tags:["dependency","depend on","rely","prerequisite","blocker","coupling"] },
  { id:"spec-prioritize",  label:"Priority List",     icon:"🔢", baseType:"data",       variant:11, tags:["priority","rank","order","most important","critical path","order of work"] },
  { id:"spec-tradeoff",    label:"Tradeoff Map",      icon:"🔄", baseType:"comparison", variant:8, tags:["tradeoff","trade off","cost benefit","risk reward","balance","dilemma"] },
];

const PAGE_SIZE = 24;

// ── Auto-pick best template ────────────────────────────────────────────────────
function autoPickTemplate(heading: string, bodyText: string): VisualTemplate {
  const t = (heading + " " + bodyText).toLowerCase();
  let best = TEMPLATES[0];
  let bestScore = 0;
  for (const tmpl of TEMPLATES) {
    let score = 0;
    for (const tag of tmpl.tags) {
      if (t.includes(tag)) score += tag.split(" ").length; // longer tag matches score more
    }
    if (score > bestScore) { bestScore = score; best = tmpl; }
  }
  return best;
}

// ── AI visual generation ───────────────────────────────────────────────────────
async function generateVisual(context: string, heading: string, type: VisualType): Promise<VisualData | null> {
  const sys = "Return ONLY raw valid JSON. No markdown fences, no prose. JSON only.";
  const prompts: Record<VisualType, string> = {
    mindmap:     `Mindmap for "${heading}". Context: "${context}". Return JSON: {"center":"${heading.slice(0,22)}","branches":[{"label":"Key Concept (short)","items":["specific detail","another detail","third point"]}]}. Use 4-5 branches with REAL content from context. Labels max 15 chars.`,
    process:     `Step-by-step process for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","steps":[{"label":"Short Step Name","description":"One clear sentence describing this step."}]}. Include 5-6 concrete steps with real content.`,
    cycle:       `Cycle/loop for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","stages":[{"label":"Stage Name","description":"What happens"}]}. Include 4-5 stages forming a complete cycle. Use real terms.`,
    timeline:    `Timeline for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","events":[{"label":"Event/Period Name","detail":"Brief factual detail."}]}. Include 5-6 events in ORDER. Use real dates/periods if available.`,
    tree:        `Hierarchy tree for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","root":"${heading.slice(0,18)}","branches":[{"label":"Main Category","children":["subcategory 1","subcategory 2","subcategory 3"]}]}. Use 3-4 branches, 2-3 children each.`,
    comparison:  `Comparison for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","left":{"label":"Concept A","points":["distinct point","distinct point","distinct point","distinct point"]},"right":{"label":"Concept B","points":["distinct point","distinct point","distinct point","distinct point"]}}. Use real contrasts.`,
    venn:        `Venn diagram for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","left":{"label":"Group A","items":["unique to A","unique to A","unique to A"]},"right":{"label":"Group B","items":["unique to B","unique to B","unique to B"]},"overlap":["shared by both","also shared"]}. Use real content.`,
    pyramid:     `Pyramid for "${heading}". Index 0=apex/top (narrowest), last=base (widest). Context: "${context}". Return JSON: {"title":"${heading}","levels":[{"label":"Top Level","description":"brief desc"}]}. 3-5 levels. IMPORTANT: start narrow at top, broad at base.`,
    funnel:      `Funnel for "${heading}". Stage 0=widest/top, last=narrowest/bottom. Context: "${context}". Return JSON: {"title":"${heading}","stages":[{"label":"Stage Name","detail":"What happens/filters here"}]}. 4-5 stages.`,
    framework:   `Framework/layers for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","levels":[{"label":"Layer Name","items":["item","item","item"]}]}. 3-4 layers with 2-4 items each. Use real content.`,
    data:        `Key facts/insights for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","facts":[{"label":"Short Title","detail":"One specific, memorable fact from content."}]}. Include 6 real facts. Each fact must be distinct and important.`,
    causeeffect: `Cause & effect for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","effect":"${heading.slice(0,22)}","causes":[{"category":"Cause Area","items":["specific cause","another cause"]}]}. 4-5 cause categories with 2 specific items each.`,
    roadmap:     `Roadmap for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","milestones":[{"phase":"Phase 1","label":"Milestone Name","items":["key task","key task"]}]}. 4-5 milestones in order.`,
    matrix:      `2×2 matrix for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","xAxis":"Low → High X","yAxis":"Low → High Y","quadrants":[{"label":"Q name","items":["item"]},{"label":"Q name","items":["item"]},{"label":"Q name","items":["item"]},{"label":"Q name","items":["item"]}]}. Exactly 4 quadrants.`,
    network:     `Network/relationship for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","center":"${heading.slice(0,18)}","nodes":[{"label":"Node Name","relation":"how it relates"}]}. 5-6 nodes with real relationships.`,
    staircase:   `Staircase progression for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","steps":[{"label":"Step Name","detail":"What this step achieves"}]}. 4-5 ascending steps from basic to advanced.`,
    hexcluster:  `Hex cluster for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","center":"${heading.slice(0,16)}","hexes":[{"label":"Concept","detail":"brief description"}]}. 5-6 key concepts around center.`,
    concentric:  `Concentric rings for "${heading}". INNERMOST ring is the most core/fundamental; outer rings are broader/supporting. Context: "${context}". Return JSON: {"title":"${heading}","rings":[{"label":"Core (innermost)","description":"The most fundamental concept"},{"label":"Middle ring","description":"Supporting concept"},{"label":"Outer ring","description":"Broad context"}]}. 3-4 rings. Make sure each ring label is SHORT (max 15 chars).`,
    swimlane:    `Swim lane for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","lanes":[{"actor":"Short Role Name","steps":["action 1","action 2","action 3"]}]}. 2-3 lanes with 3-4 short steps each.`,
    chevron:     `Chevron steps for "${heading}". Context: "${context}". Return JSON: {"title":"${heading}","steps":[{"label":"Step Name","detail":"brief description"}]}. 4-5 sequential steps.`,
  };
  try {
    const { data } = await askAIJSON<any>(prompts[type], sys, [], false, 800);
    if (!data) return null;
    return { type, data } as VisualData;
  } catch { return null; }
}

// ── Inline markdown ───────────────────────────────────────────────────────────
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**")
          ? <strong key={i} className="font-semibold text-gray-900">{p.slice(2,-2)}</strong>
          : <React.Fragment key={i}>{p}</React.Fragment>
      )}
    </>
  );
}

// ── Markdown parser ────────────────────────────────────────────────────────────
function parseMarkdown(text: string): DocBlock[] {
  const lines = text.split("\n");
  const raw: DocSection[] = [];
  let id = 0, i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (line.startsWith("# ")) { raw.push({ id:id++, type:"title", content:line.slice(2).trim() }); i++; }
    else if (line.startsWith("## ")) { raw.push({ id:id++, type:"h2", content:line.slice(3).trim() }); i++; }
    else if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) { items.push(lines[i].trim().slice(2).trim()); i++; }
      if (items.length) raw.push({ id:id++, type:"bullet", content:"", items });
    } else if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\.\s/,"").trim()); i++; }
      if (items.length) raw.push({ id:id++, type:"numbered", content:"", items });
    } else {
      const parts: string[] = [];
      while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith("#")) { parts.push(lines[i].trim()); i++; }
      const content = parts.join(" ");
      if (content) raw.push({ id:id++, type:"paragraph", content });
    }
  }
  const blocks: DocBlock[] = [];
  let cur: DocBlock | null = null;
  for (const sec of raw) {
    if (sec.type === "title" || sec.type === "h2") { if (cur) blocks.push(cur); cur = { heading:sec, body:[] }; }
    else { if (!cur) cur = { heading:{ id:id++, type:"paragraph", content:"" }, body:[] }; cur.body.push(sec); }
  }
  if (cur) blocks.push(cur);
  return blocks;
}

// ── Text-wrap helper: splits long text into SVG-safe lines ───────────────────
function svgLines(text: string, cpl: number, maxL = 3): string[] {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= cpl) { cur = next; }
    else { if (cur) lines.push(cur); cur = w.length > cpl ? w.slice(0, cpl) : w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxL);
}

// ══════════════════════════════════════════════════════════════════════════════
// Visual Renderers — palette-aware, complete text, visually distinct types
// ══════════════════════════════════════════════════════════════════════════════

function MindmapVisual({ data, p }: { data: MindmapData; p: Palette }) {
  const branches = (data.branches || []).slice(0, 6);
  const n = branches.length || 1;
  const cx = 350, cy = 240, r = 172, CW = 120, CH = 68;
  const cols = [p.accent, p.accent2, p.accent3, p.accent, p.accent2, p.accent3];
  return (
    <svg viewBox="0 0 700 480" className="w-full" style={{ background: p.bg }}>
      <text x={cx} y="22" textAnchor="middle" fill={p.accent2} fontSize="12" fontWeight="bold">{(data.center || '').slice(0, 42)}</text>
      <circle cx={cx} cy={cy} r={52} fill={p.surface2} stroke={p.accent} strokeWidth="2"/>
      {svgLines(data.center || '', 11, 3).map((w, wi) => (
        <text key={wi} x={cx} y={cy - 14 + wi * 14} textAnchor="middle" dominantBaseline="middle" fill={p.textPrimary} fontSize="9.5" fontWeight="bold">{w}</text>
      ))}
      {branches.map((b, i) => {
        const angle = ((i / n) * 360 - 90) * Math.PI / 180;
        const bx = cx + r * Math.cos(angle), by = cy + r * Math.sin(angle);
        const col = cols[i % cols.length];
        const lbl = svgLines(b.label || '', 15, 2);
        const items = (b.items || []).slice(0, 3);
        return (
          <g key={i}>
            <line x1={cx + 52 * Math.cos(angle)} y1={cy + 52 * Math.sin(angle)}
                  x2={bx - 60 * Math.cos(angle)} y2={by - 34 * Math.sin(angle)}
                  stroke={col} strokeWidth="1.5" opacity="0.5"/>
            <rect x={bx - CW / 2} y={by - CH / 2} width={CW} height={CH} rx="12" fill={p.surface} stroke={col} strokeWidth="1.5"/>
            {lbl.map((ln, j) => (
              <text key={j} x={bx} y={by - CH / 2 + 14 + j * 13} textAnchor="middle" fill={p.textPrimary} fontSize="9" fontWeight="bold">{ln}</text>
            ))}
            {items.map((item, j) => (
              <text key={j} x={bx} y={by - CH / 2 + 14 + lbl.length * 13 + 6 + j * 12} textAnchor="middle" fill={p.textSecondary} fontSize="7.5">· {(item || '').slice(0, 20)}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function ProcessVisual({ data, p, variant }: { data: ProcessData; p: Palette; variant?: number }) {
  const steps = (data.steps || []).slice(0, 6);
  if (variant === 2) {
    return (
      <div className="rounded-xl overflow-hidden" style={{ background: p.bg }}>
        <div className="px-4 py-3 text-center border-b" style={{ borderColor: p.line }}>
          <span className="font-bold text-sm" style={{ color: p.accent2 }}>{data.title}</span>
        </div>
        <div className="p-3 flex gap-2 overflow-x-auto">
          {steps.map((step, i) => (
            <div key={i} className="flex-shrink-0 flex flex-col items-center gap-1 w-32">
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: i === 0 ? p.accent : p.surface2, color: p.bg }}>{i + 1}</div>
              <div className="text-center px-2 py-1.5 rounded-lg w-full" style={{ background: p.surface, border: `1px solid ${p.line}` }}>
                <div className="text-xs font-semibold" style={{ color: p.accent2 }}>{step.label}</div>
                <div className="text-[10px] mt-0.5 leading-tight" style={{ color: p.textSecondary }}>{step.description}</div>
              </div>
              {i < steps.length - 1 && <div className="text-xs" style={{ color: p.accent }}>→</div>}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: p.bg }}>
      <div className="px-4 py-3 text-center border-b" style={{ borderColor: p.line }}>
        <span className="font-bold text-sm" style={{ color: p.accent2 }}>{data.title}</span>
      </div>
      <div className="p-4 space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: i === 0 ? p.accent : p.surface2, color: p.bg }}>{i + 1}</div>
              {i < steps.length - 1 && <div className="w-px h-3 mt-0.5" style={{ background: p.line }}/>}
            </div>
            <div className="flex-1 min-w-0 pb-1">
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
  const cx = 350, cy = 235, r = 158, CW = 148, CH = 80;
  const cols = [p.accent, p.accent2, p.accent3, p.accent, p.accent2, p.accent3];
  return (
    <svg viewBox="0 0 700 470" className="w-full" style={{ background: p.bg }}>
      <text x={cx} y="22" textAnchor="middle" fill={p.accent2} fontSize="12" fontWeight="bold">{(data.title || '').slice(0, 52)}</text>
      <defs>
        <marker id={`ca${p.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={p.accent2}/>
        </marker>
      </defs>
      {stages.map((_, i) => {
        const a1 = ((-90 + (360 / n) * i) * Math.PI / 180);
        const a2 = ((-90 + (360 / n) * ((i + 1) % n)) * Math.PI / 180);
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
        const qx = (x1 + x2) / 2 + (cx - (x1 + x2) / 2) * 0.22;
        const qy = (y1 + y2) / 2 + (cy - (y1 + y2) / 2) * 0.22;
        return <path key={i} d={`M ${x1} ${y1} Q ${qx} ${qy} ${x2} ${y2}`} stroke={p.accent2} strokeWidth="1.8" fill="none" markerEnd={`url(#ca${p.id})`} opacity="0.45"/>;
      })}
      <circle cx={cx} cy={cy} r={27} fill={p.surface2} stroke={p.accent} strokeWidth="2"/>
      <text x={cx} y={cy + 4} textAnchor="middle" dominantBaseline="middle" fill={p.accent2} fontSize="9" fontWeight="bold">↻</text>
      {stages.map((stage, i) => {
        const angle = ((-90 + (360 / n) * i) * Math.PI / 180);
        const sx = cx + r * Math.cos(angle), sy = cy + r * Math.sin(angle);
        const col = cols[i % cols.length];
        const lbl = svgLines(stage.label || '', 18, 2);
        const desc = svgLines(stage.description || '', 22, 3);
        const textY = sy - CH / 2 + 16;
        return (
          <g key={i}>
            <rect x={sx - CW / 2} y={sy - CH / 2} width={CW} height={CH} rx="10" fill={p.surface} stroke={col} strokeWidth="1.5"/>
            <circle cx={sx + CW / 2 - 11} cy={sy - CH / 2 + 11} r="11" fill={col}/>
            <text x={sx + CW / 2 - 11} y={sy - CH / 2 + 12} textAnchor="middle" dominantBaseline="middle" fill={p.bg} fontSize="8" fontWeight="bold">{i + 1}</text>
            {lbl.map((ln, j) => <text key={j} x={sx} y={textY + j * 13} textAnchor="middle" fill={p.textPrimary} fontSize="9" fontWeight="bold">{ln}</text>)}
            {desc.map((ln, j) => <text key={j} x={sx} y={textY + lbl.length * 13 + 5 + j * 11} textAnchor="middle" fill={p.textSecondary} fontSize="7.5">{ln}</text>)}
          </g>
        );
      })}
    </svg>
  );
}

function TimelineVisual({ data, p, variant }: { data: TimelineData; p: Palette; variant?: number }) {
  const events = (data.events || []).slice(0, 7);
  if (variant === 1) {
    const n = Math.max(events.length, 1);
    const W = 640, railY = 105, sp = (W - 60) / n;
    return (
      <svg viewBox={`0 0 ${W} 250`} className="w-full" style={{ background: p.bg }}>
        <text x={W / 2} y="20" textAnchor="middle" fill={p.accent2} fontSize="11" fontWeight="bold">{data.title}</text>
        <line x1="30" y1={railY} x2={W - 30} y2={railY} stroke={p.line} strokeWidth="2.5" strokeLinecap="round"/>
        {events.map((ev, i) => {
          const x = 30 + sp * i + sp / 2, above = i % 2 === 0;
          const lbl = svgLines(ev.label || '', 14, 2);
          const det = svgLines(ev.detail || '', 16, 2);
          const labelBase = above ? railY - 46 : railY + 46;
          return (
            <g key={i}>
              <circle cx={x} cy={railY} r="9" fill={p.accent}/>
              <text x={x} y={railY + 1} textAnchor="middle" dominantBaseline="middle" fill={p.bg} fontSize="7" fontWeight="bold">{i + 1}</text>
              <line x1={x} y1={above ? railY - 9 : railY + 9} x2={x} y2={above ? railY - 34 : railY + 34} stroke={p.accent} strokeWidth="1.2" strokeDasharray="3,2"/>
              {lbl.map((ln, j) => <text key={j} x={x} y={labelBase + j * 12} textAnchor="middle" fill={p.textPrimary} fontSize="8" fontWeight="bold">{ln}</text>)}
              {det.map((ln, j) => <text key={j} x={x} y={labelBase + lbl.length * 12 + 2 + j * 11} textAnchor="middle" fill={p.textSecondary} fontSize="7">{ln}</text>)}
            </g>
          );
        })}
      </svg>
    );
  }
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: p.bg }}>
      <div className="px-4 py-3 text-center border-b" style={{ borderColor: p.line }}>
        <span className="font-bold text-sm" style={{ color: p.accent2 }}>{data.title}</span>
      </div>
      <div className="p-4">
        {events.map((ev, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="h-5 w-5 rounded-full mt-0.5 flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: p.accent, color: p.bg }}>{i + 1}</div>
              {i < events.length - 1 && <div className="w-px flex-1 mt-1 min-h-[20px]" style={{ background: p.line }}/>}
            </div>
            <div className="pb-3 min-w-0">
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
  const W = 640, rootX = W / 2, rootY = 38, branchY = 132, childY = 226;
  const bxs = branches.map((_, i) => nb === 1 ? rootX : 56 + ((W - 112) / (nb - 1)) * i);
  const maxC = nb >= 4 ? 2 : 3, cSpacing = nb >= 4 ? 42 : 52;
  const cols = [p.accent, p.accent2, p.accent3, p.accent, p.accent2];
  return (
    <svg viewBox={`0 0 ${W} 285`} className="w-full" style={{ background: p.bg }}>
      <text x={W / 2} y="18" textAnchor="middle" fill={p.accent2} fontSize="11" fontWeight="bold">{data.title}</text>
      <rect x={rootX - 70} y={rootY - 16} width={140} height={32} rx="8" fill={p.accent}/>
      {svgLines(data.root || '', 20, 1).map((ln, j) => (
        <text key={j} x={rootX} y={rootY + 2 + j * 13} textAnchor="middle" dominantBaseline="middle" fill={p.bg} fontSize="10" fontWeight="bold">{ln}</text>
      ))}
      {branches.map((branch, i) => {
        const bx = bxs[i], col = cols[i % cols.length];
        const children = (branch.children || []).slice(0, maxC), nc = children.length;
        const lbl = svgLines(branch.label || '', 14, 2);
        return (
          <g key={i}>
            <line x1={rootX} y1={rootY + 16} x2={bx} y2={branchY - 16} stroke={p.line} strokeWidth="1.2"/>
            <rect x={bx - 54} y={branchY - 16} width={108} height={32 + Math.max(lbl.length - 1, 0) * 12} rx="7" fill={p.surface} stroke={col} strokeWidth="1.5"/>
            {lbl.map((ln, j) => <text key={j} x={bx} y={branchY - 1 + j * 13} textAnchor="middle" dominantBaseline="middle" fill={p.textPrimary} fontSize="9" fontWeight="bold">{ln}</text>)}
            {children.map((child, ci) => {
              const off = nc === 1 ? 0 : (ci - (nc - 1) / 2) * cSpacing * 2;
              const cx2 = Math.max(30, Math.min(W - 30, bx + off));
              const cLbl = svgLines(child || '', 13, 2);
              const cH = 24 + Math.max(cLbl.length - 1, 0) * 11;
              return (
                <g key={ci}>
                  <line x1={bx} y1={branchY + 16} x2={cx2} y2={childY - cH / 2} stroke={p.line} strokeWidth="1"/>
                  <rect x={cx2 - 46} y={childY - cH / 2} width={92} height={cH + 4} rx="6" fill={p.surface2}/>
                  {cLbl.map((ln, j) => <text key={j} x={cx2} y={childY - cH / 2 + 13 + j * 11} textAnchor="middle" dominantBaseline="middle" fill={p.textSecondary} fontSize="8">{ln}</text>)}
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
      <div className="p-4 grid grid-cols-2 gap-4">
        {[data.left, data.right].map((side, si) => (
          <div key={si} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${si === 0 ? p.accent : p.line}` }}>
            <div className="text-center font-bold text-xs py-2" style={{ background: si === 0 ? p.accent : p.surface2, color: si === 0 ? p.bg : p.textPrimary }}>{(side || {}).label || 'Side'}</div>
            <div className="p-2.5 space-y-1.5">
              {((side || {}).points || []).map((pt, pi) => (
                <div key={pi} className="flex items-start gap-1.5 text-xs" style={{ color: p.textSecondary }}>
                  <span style={{ color: p.accent }} className="font-bold flex-shrink-0">•</span>
                  <span>{pt}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VennVisual({ data, p }: { data: VennData; p: Palette }) {
  const li = (data.left?.items || []).slice(0, 4), ri = (data.right?.items || []).slice(0, 4), ov = (data.overlap || []).slice(0, 3);
  return (
    <svg viewBox="0 0 600 280" className="w-full" style={{ background: p.bg }}>
      <text x="300" y="22" textAnchor="middle" fill={p.accent2} fontSize="12" fontWeight="bold">{data.title}</text>
      <circle cx="210" cy="150" r="110" fill={p.accent} fillOpacity="0.38" stroke={p.accent} strokeWidth="2"/>
      <circle cx="390" cy="150" r="110" fill={p.accent2} fillOpacity="0.32" stroke={p.accent2} strokeWidth="2"/>
      <text x="133" y="70" textAnchor="middle" fill={p.textPrimary} fontSize="10" fontWeight="bold">{(data.left?.label || '').slice(0, 14)}</text>
      {li.map((item, i) => {
        const lines = svgLines(item, 14, 2);
        return lines.map((ln, j) => <text key={`${i}-${j}`} x="133" y={88 + i * 26 + j * 13} textAnchor="middle" fill={p.textPrimary} fontSize="8.5">{ln}</text>);
      })}
      <text x="467" y="70" textAnchor="middle" fill={p.textPrimary} fontSize="10" fontWeight="bold">{(data.right?.label || '').slice(0, 14)}</text>
      {ri.map((item, i) => {
        const lines = svgLines(item, 14, 2);
        return lines.map((ln, j) => <text key={`${i}-${j}`} x="467" y={88 + i * 26 + j * 13} textAnchor="middle" fill={p.textPrimary} fontSize="8.5">{ln}</text>);
      })}
      <text x="300" y="118" textAnchor="middle" fill={p.textPrimary} fontSize="8" fontStyle="italic" opacity="0.75">both</text>
      {ov.map((item, i) => {
        const lines = svgLines(item, 13, 2);
        return lines.map((ln, j) => <text key={`${i}-${j}`} x="300" y={132 + i * 26 + j * 13} textAnchor="middle" fill={p.textPrimary} fontSize="8.5" fontWeight="bold">{ln}</text>);
      })}
    </svg>
  );
}

// Pyramid: triangular wedge shape, widening toward base — labels INSIDE each band
function PyramidVisual({ data, p }: { data: PyramidData; p: Palette }) {
  const levels = (data.levels || []).slice(0, 5);
  const n = Math.max(levels.length, 1);
  const W = 520, totalH = 260, padTop = 30, levelH = totalH / n, maxW = W - 60;
  return (
    <svg viewBox={`0 0 ${W} ${totalH + padTop + 30}`} className="w-full" style={{ background: p.bg }}>
      <text x={W / 2} y="22" textAnchor="middle" fill={p.accent2} fontSize="11" fontWeight="bold">{data.title}</text>
      {levels.map((level, i) => {
        const topW = i === 0 ? 60 : maxW * (i / n), botW = maxW * ((i + 1) / n);
        const y = padTop + i * levelH;
        const lT = (W - topW) / 2, rT = (W + topW) / 2, lB = (W - botW) / 2, rB = (W + botW) / 2;
        const opacity = 0.95 - i * 0.11, midY = y + levelH / 2;
        const lbl = svgLines(level.label || '', 24, 1);
        const desc = svgLines(level.description || '', 34, 2);
        return (
          <g key={i}>
            <polygon points={`${lT},${y} ${rT},${y} ${rB},${y + levelH - 2} ${lB},${y + levelH - 2}`} fill={p.accent} opacity={opacity}/>
            <line x1={lT} y1={y} x2={rT} y2={y} stroke={p.bg} strokeWidth="1.5"/>
            {lbl.map((ln, j) => <text key={j} x={W / 2} y={midY - 5 - (desc.length - 1) * 5 + j * 13} textAnchor="middle" dominantBaseline="middle" fill={p.textPrimary} fontSize="9.5" fontWeight="bold">{ln}</text>)}
            {desc.map((ln, j) => <text key={j} x={W / 2} y={midY + 9 + j * 11} textAnchor="middle" fill="rgba(255,255,255,0.78)" fontSize="8">{ln}</text>)}
          </g>
        );
      })}
    </svg>
  );
}

// Funnel: visually DISTINCT from Pyramid — labels outside on the RIGHT with leader lines; spout at bottom
function FunnelVisual({ data, p }: { data: FunnelData; p: Palette }) {
  const stages = (data.stages || []).slice(0, 6);
  const n = Math.max(stages.length, 1);
  const fX = 28, fW = 210, padTop = 30, lH = 44, totalH = lH * n, minW = 34;
  const W = 600;
  const cols = [p.accent, p.accent2, p.accent3, p.accent, p.accent2, p.accent3];
  return (
    <svg viewBox={`0 0 ${W} ${totalH + padTop + 28}`} className="w-full" style={{ background: p.bg }}>
      <text x={W / 2} y="22" textAnchor="middle" fill={p.accent2} fontSize="11" fontWeight="bold">{data.title}</text>
      {stages.map((stage, i) => {
        const topW = Math.max(fW - i * (fW - minW) / n, minW);
        const botW = Math.max(fW - (i + 1) * (fW - minW) / n, minW);
        const y = padTop + i * lH;
        const lT = fX + (fW - topW) / 2, rT = fX + (fW + topW) / 2;
        const lB = fX + (fW - botW) / 2, rB = fX + (fW + botW) / 2;
        const midY = y + lH / 2, col = cols[i % cols.length];
        const lbl = svgLines(stage.label || '', 22, 2);
        const det = svgLines(stage.detail || '', 26, 2);
        return (
          <g key={i}>
            <polygon points={`${lT},${y} ${rT},${y} ${rB},${y + lH - 1} ${lB},${y + lH - 1}`} fill={col} opacity={0.78 - i * 0.06}/>
            <text x={lT + 10} y={midY + 4} dominantBaseline="middle" fill={p.bg} fontSize="8" fontWeight="bold" opacity="0.9">{i + 1}</text>
            <line x1={rT} y1={midY} x2={fX + fW + 14} y2={midY} stroke={col} strokeWidth="1" opacity="0.65"/>
            {lbl.map((ln, j) => <text key={j} x={fX + fW + 18} y={midY - 4 + j * 12} fill={p.textPrimary} fontSize="9" fontWeight="bold">{ln}</text>)}
            {det.map((ln, j) => <text key={j} x={fX + fW + 18} y={midY - 4 + lbl.length * 12 + 4 + j * 11} fill={p.textSecondary} fontSize="7.5">{ln}</text>)}
          </g>
        );
      })}
      <line x1={fX + fW / 2 - 17} y1={padTop + totalH} x2={fX + fW / 2 - 9} y2={padTop + totalH + 14} stroke={p.accent2} strokeWidth="1.5"/>
      <line x1={fX + fW / 2 + 17} y1={padTop + totalH} x2={fX + fW / 2 + 9} y2={padTop + totalH + 14} stroke={p.accent2} strokeWidth="1.5"/>
      <circle cx={fX + fW / 2} cy={padTop + totalH + 20} r="7" fill={p.accent2}/>
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

function DataVisual({ data, p, variant }: { data: DataFactsData; p: Palette; variant?: number }) {
  if (variant === 5) {
    return (
      <div className="rounded-xl overflow-hidden" style={{ background: p.bg }}>
        <div className="px-4 py-3 text-center border-b" style={{ borderColor: p.line }}>
          <span className="font-bold text-sm" style={{ color: p.accent2 }}>{data.title}</span>
        </div>
        <div className="p-4 space-y-3">
          {(data.facts || []).slice(0, 6).map((fact, i) => {
            const pct = Math.max(20, 100 - i * 12);
            return (
              <div key={i}>
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: p.textPrimary }}>{fact.label}</span>
                  <span className="text-xs" style={{ color: p.textSecondary }}>{fact.detail.slice(0, 28)}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: p.surface2 }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: i % 2 === 0 ? p.accent : p.accent2 }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: p.bg }}>
      <div className="px-4 py-3 text-center border-b" style={{ borderColor: p.line }}>
        <span className="font-bold text-sm" style={{ color: p.accent2 }}>{data.title}</span>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        {(data.facts || []).map((fact, i) => (
          <div key={i} className="rounded-lg p-3 border-l-2" style={{ background: p.surface, borderLeftColor: i % 2 === 0 ? p.accent : p.accent2 }}>
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
  const top = causes.filter((_, i) => i % 2 === 0).slice(0, 3);
  const bot = causes.filter((_, i) => i % 2 === 1).slice(0, 3);
  const spY = 152, anchT = [110, 270, 430], anchB = [190, 350, 490], bLen = 60;
  return (
    <svg viewBox="0 0 620 310" className="w-full" style={{ background: p.bg }}>
      <text x="310" y="20" textAnchor="middle" fill={p.accent2} fontSize="11" fontWeight="bold">{data.title}</text>
      <defs><marker id={`fe${p.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill={p.accent}/></marker></defs>
      <line x1="26" y1={spY} x2="518" y2={spY} stroke={p.accent} strokeWidth="2.5" markerEnd={`url(#fe${p.id})`}/>
      <rect x="522" y={spY - 34} width="92" height="68" rx="8" fill={p.surface} stroke={p.accent} strokeWidth="1.5"/>
      {svgLines(data.effect || 'Effect', 11, 3).map((w, j) => (
        <text key={j} x="568" y={spY - 15 + j * 16} textAnchor="middle" fill={p.textPrimary} fontSize="9" fontWeight="bold">{w}</text>
      ))}
      {top.map((cat, i) => {
        const ax = anchT[i] ?? 110, bx = ax, by = spY - bLen;
        const lbl = svgLines(cat.category || '', 14, 2);
        const items = (cat.items || []).slice(0, 2);
        return (
          <g key={i}>
            <line x1={bx} y1={by} x2={ax} y2={spY} stroke={p.line} strokeWidth="1.5"/>
            <rect x={bx - 56} y={by - 46 - Math.max(lbl.length - 1, 0) * 12} width={112} height={46 + Math.max(lbl.length - 1, 0) * 12} rx="7" fill={p.surface} stroke={p.accent2} strokeWidth="1"/>
            {lbl.map((ln, j) => <text key={j} x={bx} y={by - 32 + j * 13} textAnchor="middle" fill={p.accent2} fontSize="8.5" fontWeight="bold">{ln}</text>)}
            {items.map((it, j) => {
              const il = svgLines(it, 16, 1);
              return il.map((ln, k) => <text key={`${j}-${k}`} x={bx} y={by - 13 + j * 12 + k * 12} textAnchor="middle" fill={p.textSecondary} fontSize="7.5">· {ln}</text>);
            })}
          </g>
        );
      })}
      {bot.map((cat, i) => {
        const ax = anchB[i] ?? 190, bx = ax, by = spY + bLen;
        const lbl = svgLines(cat.category || '', 14, 2);
        const items = (cat.items || []).slice(0, 2);
        return (
          <g key={i}>
            <line x1={bx} y1={by} x2={ax} y2={spY} stroke={p.line} strokeWidth="1.5"/>
            <rect x={bx - 56} y={by} width={112} height={46 + Math.max(lbl.length - 1, 0) * 12} rx="7" fill={p.surface} stroke={p.accent2} strokeWidth="1"/>
            {lbl.map((ln, j) => <text key={j} x={bx} y={by + 14 + j * 13} textAnchor="middle" fill={p.accent2} fontSize="8.5" fontWeight="bold">{ln}</text>)}
            {items.map((it, j) => {
              const il = svgLines(it, 16, 1);
              return il.map((ln, k) => <text key={`${j}-${k}`} x={bx} y={by + 30 + lbl.length * 13 + j * 12 + k * 12} textAnchor="middle" fill={p.textSecondary} fontSize="7.5">· {ln}</text>);
            })}
          </g>
        );
      })}
    </svg>
  );
}

function RoadmapVisual({ data, p }: { data: RoadmapData; p: Palette }) {
  const ms = (data.milestones || []).slice(0, 5);
  const n = Math.max(ms.length, 1);
  const W = 640, railY = 110, sp = (W - 60) / n;
  return (
    <svg viewBox={`0 0 ${W} 290`} className="w-full" style={{ background: p.bg }}>
      <text x={W / 2} y="22" textAnchor="middle" fill={p.accent2} fontSize="12" fontWeight="bold">{data.title}</text>
      <line x1="30" y1={railY} x2={W - 30} y2={railY} stroke={p.line} strokeWidth="3" strokeLinecap="round"/>
      {ms.map((m, i) => {
        const x = 30 + sp * i + sp / 2, above = i % 2 === 0;
        const phase = svgLines(m.phase || '', 10, 1);
        const lbl = svgLines(m.label || '', 15, 2);
        const items = (m.items || []).slice(0, 2);
        const boxH = 18 + phase.length * 11 + lbl.length * 12 + items.length * 12;
        const boxY = above ? railY - boxH - 14 : railY + 14;
        return (
          <g key={i}>
            <circle cx={x} cy={railY} r="12" fill={i % 2 === 0 ? p.accent : p.accent2} stroke={p.bg} strokeWidth="2"/>
            <text x={x} y={railY + 1} textAnchor="middle" dominantBaseline="middle" fill={p.bg} fontSize="8" fontWeight="bold">{i + 1}</text>
            <line x1={x} y1={above ? railY - 12 : railY + 12} x2={x} y2={above ? boxY + boxH : boxY} stroke={p.line} strokeWidth="1" strokeDasharray="3,2"/>
            <rect x={x - 62} y={boxY} width={124} height={boxH} rx="8" fill={p.surface} stroke={i % 2 === 0 ? p.accent : p.accent2} strokeWidth="1.5"/>
            {phase.map((ln, j) => <text key={j} x={x} y={boxY + 12 + j * 11} textAnchor="middle" fill={i % 2 === 0 ? p.accent : p.accent2} fontSize="7.5" fontWeight="bold">{ln}</text>)}
            {lbl.map((ln, j) => <text key={j} x={x} y={boxY + 12 + phase.length * 11 + 2 + j * 12} textAnchor="middle" fill={p.textPrimary} fontSize="9" fontWeight="bold">{ln}</text>)}
            {items.map((it, j) => {
              const il = svgLines(it, 17, 1);
              return il.map((ln, k) => <text key={`${j}-${k}`} x={x} y={boxY + 12 + phase.length * 11 + 2 + lbl.length * 12 + 4 + j * 12 + k * 12} textAnchor="middle" fill={p.textSecondary} fontSize="7.5">· {ln}</text>);
            })}
          </g>
        );
      })}
    </svg>
  );
}

function MatrixVisual({ data, p }: { data: MatrixData; p: Palette }) {
  const qs = (data.quadrants || []).slice(0, 4);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: p.bg }}>
      <div className="px-4 py-3 text-center border-b" style={{ borderColor: p.line }}>
        <span className="font-bold text-sm" style={{ color: p.accent2 }}>{data.title}</span>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-2 gap-px rounded-lg overflow-hidden" style={{ background: p.line }}>
          {[{ q: qs[0] }, { q: qs[1] }, { q: qs[2] }, { q: qs[3] }].map(({ q }, i) => (
            <div key={i} className="p-3 min-h-[90px]" style={{ background: i % 2 === 0 ? p.surface : p.surface2 }}>
              <div className="font-bold text-xs mb-2" style={{ color: [p.accent2, p.accent, p.textSecondary, p.accent3][i] }}>{q?.label || `Q${i + 1}`}</div>
              {(q?.items || []).map((item, j) => (
                <div key={j} className="text-[10px] mb-0.5 leading-snug" style={{ color: p.textSecondary }}>· {item}</div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 px-1">
          <span className="text-[9px]" style={{ color: p.textSecondary }}>← {(data.xAxis || '').split('→')[0]?.trim()}</span>
          <span className="text-[9px]" style={{ color: p.textSecondary }}>{(data.xAxis || '').split('→')[1]?.trim() || ''} →</span>
        </div>
      </div>
    </div>
  );
}

// Network: DISTINCT from MindMap — diamond center, square peripheral nodes, edge labels on connecting lines
function NetworkVisual({ data, p }: { data: NetworkData; p: Palette }) {
  const nodes = (data.nodes || []).slice(0, 7);
  const n = Math.max(nodes.length, 1);
  const cx = 300, cy = 162, r = 122;
  const positions = nodes.map((_, i) => {
    const angle = (i / n * 360 - 90) * Math.PI / 180;
    const rv = r + (i % 2 === 0 ? 0 : 28);
    return { x: cx + rv * Math.cos(angle), y: cy + rv * Math.sin(angle) };
  });
  return (
    <svg viewBox="0 0 600 324" className="w-full" style={{ background: p.bg }}>
      <text x={cx} y="20" textAnchor="middle" fill={p.accent2} fontSize="11" fontWeight="bold">{data.title}</text>
      {positions.map((pos, i) => {
        const rel = svgLines(nodes[i].relation || '', 13, 1);
        const mx = (cx + pos.x) / 2, my = (cy + pos.y) / 2;
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={pos.x} y2={pos.y} stroke={p.line} strokeWidth="1.5" strokeDasharray="4,3"/>
            {rel.map((ln, j) => (
              <text key={j} x={mx} y={my - 3 + j * 10} textAnchor="middle" fill={p.textSecondary} fontSize="7" opacity="0.85">{ln}</text>
            ))}
          </g>
        );
      })}
      {/* Center: diamond shape — visually distinct from MindMap's circle */}
      <polygon points={`${cx},${cy - 38} ${cx + 38},${cy} ${cx},${cy + 38} ${cx - 38},${cy}`} fill={p.accent} stroke={p.bg} strokeWidth="2"/>
      {svgLines(data.center || '', 10, 2).map((w, j) => (
        <text key={j} x={cx} y={cy - 6 + j * 14} textAnchor="middle" dominantBaseline="middle" fill={p.bg} fontSize="9" fontWeight="bold">{w}</text>
      ))}
      {/* Peripheral nodes: sharp-cornered rectangles — distinct from MindMap's rounded pill */}
      {positions.map((pos, i) => {
        const lbl = svgLines(nodes[i].label || '', 12, 2);
        return (
          <g key={i}>
            <rect x={pos.x - 40} y={pos.y - 24} width={80} height={48} rx="4" fill={p.surface} stroke={p.accent2} strokeWidth="1.5"/>
            {lbl.map((ln, j) => <text key={j} x={pos.x} y={pos.y - 7 + j * 14} textAnchor="middle" dominantBaseline="middle" fill={p.textPrimary} fontSize="8.5" fontWeight="bold">{ln}</text>)}
          </g>
        );
      })}
    </svg>
  );
}

function StaircaseVisual({ data, p }: { data: StaircaseData; p: Palette }) {
  const steps = (data.steps || []).slice(0, 6);
  const n = Math.max(steps.length, 1);
  const W = 600, H = 210, sW = W / n, sH = H / n;
  return (
    <svg viewBox={`0 0 ${W} ${H + 70}`} className="w-full" style={{ background: p.bg }}>
      <text x={W / 2} y="22" textAnchor="middle" fill={p.accent2} fontSize="11" fontWeight="bold">{data.title}</text>
      {steps.map((step, i) => {
        const x = i * sW, y = H - (i + 1) * sH + 32, opacity = 0.42 + i * 0.11;
        const lbl = svgLines(step.label || '', 13, 2);
        const det = svgLines(step.detail || '', 15, 2);
        return (
          <g key={i}>
            <rect x={x} y={y} width={sW * (n - i)} height={sH * (i + 1)} fill={p.accent} opacity={opacity}/>
            <rect x={x} y={y} width={sW} height={sH * (i + 1)} fill={p.accent2} opacity={0.90}/>
            {lbl.map((ln, j) => <text key={j} x={x + sW / 2} y={y + sH / 2 - 8 + j * 13} textAnchor="middle" dominantBaseline="middle" fill={p.bg} fontSize="8.5" fontWeight="bold">{ln}</text>)}
            {det.map((ln, j) => <text key={j} x={x + sW / 2} y={y + sH / 2 + 12 + lbl.length * 4 + j * 11} textAnchor="middle" fill={p.bg} fontSize="7" opacity="0.85">{ln}</text>)}
            <text x={x + sW / 2} y={y - 7} textAnchor="middle" fill={p.textSecondary} fontSize="8">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

// HexCluster: TRUE honeycomb grid — adjacent hexes touching, DISTINCT from Network hub-spoke
function HexclusterVisual({ data, p }: { data: HexclusterData; p: Palette }) {
  const hexes = (data.hexes || []).slice(0, 6);
  const HR = 46;
  const hexH = HR * Math.sqrt(3);
  function hexPts(hx: number, hy: number, hr: number) {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      return `${hx + hr * Math.cos(a)},${hy + hr * Math.sin(a)}`;
    }).join(' ');
  }
  const cx = 300, cy = 196;
  const ring = [
    { x: cx, y: cy },
    { x: cx + HR * 1.5, y: cy - hexH / 2 },
    { x: cx + HR * 1.5, y: cy + hexH / 2 },
    { x: cx, y: cy - hexH },
    { x: cx - HR * 1.5, y: cy - hexH / 2 },
    { x: cx - HR * 1.5, y: cy + hexH / 2 },
    { x: cx, y: cy + hexH },
  ];
  const centerPos = ring[0];
  const periPos = ring.slice(1, hexes.length + 1);
  return (
    <svg viewBox="0 0 600 392" className="w-full" style={{ background: p.bg }}>
      <text x={cx} y="22" textAnchor="middle" fill={p.accent2} fontSize="11" fontWeight="bold">{data.title}</text>
      <polygon points={hexPts(centerPos.x, centerPos.y, HR)} fill={p.accent} stroke={p.bg} strokeWidth="2"/>
      {svgLines(data.center || '', 10, 2).map((w, j) => (
        <text key={j} x={centerPos.x} y={centerPos.y - 5 + j * 14} textAnchor="middle" dominantBaseline="middle" fill={p.bg} fontSize="10" fontWeight="bold">{w}</text>
      ))}
      {hexes.map((hex, i) => {
        const pos = periPos[i];
        if (!pos) return null;
        const lbl = svgLines(hex.label || '', 10, 2);
        const det = svgLines(hex.detail || '', 13, 2);
        const col = i % 2 === 0 ? p.accent2 : p.surface2;
        const textCol = i % 2 === 0 ? p.bg : p.textPrimary;
        const detCol = i % 2 === 0 ? p.bg : p.textSecondary;
        return (
          <g key={i}>
            <polygon points={hexPts(pos.x, pos.y, HR)} fill={col} stroke={p.accent} strokeWidth="1.5"/>
            {lbl.map((ln, j) => <text key={j} x={pos.x} y={pos.y - 8 + j * 13} textAnchor="middle" dominantBaseline="middle" fill={textCol} fontSize="8.5" fontWeight="bold">{ln}</text>)}
            {det.map((ln, j) => <text key={j} x={pos.x} y={pos.y + 18 + j * 11} textAnchor="middle" fill={detCol} fontSize="7.5" opacity="0.88">{ln}</text>)}
          </g>
        );
      })}
    </svg>
  );
}

function ConcentricVisual({ data, p }: { data: ConcentricData; p: Palette }) {
  const rings = (data.rings || []).slice(0, 4);
  const n = Math.max(rings.length, 1);
  const cx = 232, cy = 162, maxR = 130;
  const directions = [1, -1, 1, -1];
  return (
    <svg viewBox="0 0 590 324" className="w-full" style={{ background: p.bg }}>
      <text x="295" y="22" textAnchor="middle" fill={p.accent2} fontSize="11" fontWeight="bold">{data.title}</text>
      {[...rings].reverse().map((_, ri) => {
        const i = n - 1 - ri;
        const r = maxR * ((i + 1) / n);
        return <circle key={i} cx={cx} cy={cy} r={r} fill={p.accent} opacity={0.20 + (i / n) * 0.60} stroke={p.bg} strokeWidth="1.5"/>;
      })}
      {rings.map((ring, i) => {
        const r = maxR * ((i + 1) / n);
        const dir = directions[i % directions.length];
        const lx = cx + dir * (r + 20);
        const ly = cy + (i - Math.floor(n / 2)) * 44;
        const lbl = svgLines(ring.label || '', 17, 2);
        const desc = svgLines(ring.description || '', 20, 2);
        const boxH = 14 + lbl.length * 12 + desc.length * 11;
        return (
          <g key={i}>
            <line x1={cx + dir * r} y1={cy} x2={cx + dir * (r + 16)} y2={ly} stroke={p.accent2} strokeWidth="1" opacity="0.55"/>
            <rect x={dir > 0 ? lx : lx - 132} y={ly - boxH / 2} width={132} height={boxH} rx="6" fill={p.surface} stroke={p.accent2} strokeWidth="0.8"/>
            {lbl.map((ln, j) => <text key={j} x={dir > 0 ? lx + 66 : lx - 66} y={ly - boxH / 2 + 12 + j * 12} textAnchor="middle" fill={p.textPrimary} fontSize="9" fontWeight="bold">{ln}</text>)}
            {desc.map((ln, j) => <text key={j} x={dir > 0 ? lx + 66 : lx - 66} y={ly - boxH / 2 + 12 + lbl.length * 12 + 4 + j * 11} textAnchor="middle" fill={p.textSecondary} fontSize="8">{ln}</text>)}
          </g>
        );
      })}
    </svg>
  );
}

// SwimlaneVisual: HTML table — full text, no SVG truncation
function SwimlaneVisual({ data, p }: { data: SwimlaneData; p: Palette }) {
  const lanes = (data.lanes || []).slice(0, 4);
  const maxSteps = Math.max(...lanes.map(l => (l.steps || []).length), 1);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: p.bg }}>
      <div className="px-4 py-2 text-center border-b" style={{ borderColor: p.line }}>
        <span className="font-bold text-sm" style={{ color: p.accent2 }}>{data.title}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs" style={{ minWidth: 380 }}>
          <tbody>
            {lanes.map((lane, li) => (
              <tr key={li} style={{ borderBottom: `1px solid ${p.line}` }}>
                <td className="px-3 py-2 font-bold whitespace-nowrap" style={{ width: 96, background: li % 2 === 0 ? p.accent : p.surface2, color: li % 2 === 0 ? p.bg : p.textPrimary, verticalAlign: 'middle', fontSize: 11 }}>
                  {lane.actor}
                </td>
                {Array.from({ length: maxSteps }).map((_, si) => {
                  const step = (lane.steps || [])[si];
                  return (
                    <td key={si} className="px-2 py-2" style={{ background: li % 2 === 0 ? p.surface : p.bg, verticalAlign: 'top', borderLeft: `1px solid ${p.line}` }}>
                      {step && (
                        <div className="rounded px-2 py-1.5" style={{ background: p.surface2, border: `1px solid ${p.accent}30` }}>
                          <span style={{ color: p.textPrimary, lineHeight: 1.4, fontSize: 11 }}>{step}</span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChevronVisual({ data, p }: { data: ChevronData; p: Palette }) {
  const steps = (data.steps || []).slice(0, 5);
  const n = Math.max(steps.length, 1);
  const W = 580, H = 96, cW = W / n, overlap = 20, y0 = 32;
  return (
    <svg viewBox={`0 0 ${W} ${H + 64}`} className="w-full" style={{ background: p.bg }}>
      <text x={W / 2} y="22" textAnchor="middle" fill={p.accent2} fontSize="11" fontWeight="bold">{data.title}</text>
      {steps.map((step, i) => {
        const x = i * (cW - overlap / n), half = H / 2;
        const opacity = 0.52 + (i / n) * 0.44;
        const cx2 = x + cW / 2 + (i === 0 ? 0 : 11);
        const pts = i === n - 1
          ? `${x},${y0} ${x + cW},${y0} ${x + cW},${y0 + H} ${x},${y0 + H}${i > 0 ? ` ${x + 22},${y0 + half}` : ''}`
          : `${x},${y0} ${x + cW},${y0} ${x + cW + 22},${y0 + half} ${x + cW},${y0 + H} ${x},${y0 + H}${i > 0 ? ` ${x + 22},${y0 + half}` : ''}`;
        const lbl = svgLines(step.label || '', 12, 2);
        const det = svgLines(step.detail || '', 14, 2);
        return (
          <g key={i}>
            <polygon points={pts} fill={p.accent} opacity={opacity}/>
            {lbl.map((ln, j) => <text key={j} x={cx2} y={y0 + half - 12 + j * 13} textAnchor="middle" fill={p.textPrimary} fontSize="8.5" fontWeight="bold">{ln}</text>)}
            {det.map((ln, j) => <text key={j} x={cx2} y={y0 + half + 10 + lbl.length * 3 + j * 11} textAnchor="middle" fill="rgba(255,255,255,0.78)" fontSize="7.5">{ln}</text>)}
          </g>
        );
      })}
    </svg>
  );
}


function VisualRenderer({ visual, palette, variant }: { visual: VisualData; palette: Palette; variant?: number }) {
  const p = palette, v = variant ?? 0;
  switch (visual.type) {
    case "mindmap":    return <MindmapVisual    data={visual.data as MindmapData}    p={p} />;
    case "process":    return <ProcessVisual    data={visual.data as ProcessData}    p={p} variant={v} />;
    case "cycle":      return <CycleVisual      data={visual.data as CycleData}      p={p} />;
    case "timeline":   return <TimelineVisual   data={visual.data as TimelineData}   p={p} variant={v} />;
    case "tree":       return <TreeVisual       data={visual.data as TreeData}       p={p} />;
    case "comparison": return <ComparisonVisual data={visual.data as ComparisonData} p={p} />;
    case "venn":       return <VennVisual       data={visual.data as VennData}       p={p} />;
    case "pyramid":    return <PyramidVisual    data={visual.data as PyramidData}    p={p} />;
    case "funnel":     return <FunnelVisual     data={visual.data as FunnelData}     p={p} />;
    case "framework":  return <FrameworkVisual  data={visual.data as FrameworkData}  p={p} />;
    case "data":       return <DataVisual       data={visual.data as DataFactsData}  p={p} variant={v} />;
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

// ── Thumbnail SVGs ─────────────────────────────────────────────────────────────
function VisualThumb({ type, active }: { type: VisualType; active?: boolean }) {
  const bg=active?"#1e3a8a":"#0f1929", acc=active?"#a78bfa":"#7c3aed", acc2=active?"#c4b5fd":"#a78bfa";
  const surf=active?"#243560":"#1a2744", dim=active?"#6366f1":"#334155";
  const thumbs: Record<VisualType, React.ReactNode> = {
    mindmap:    (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><circle cx="30" cy="22" r="7" fill={acc}/>{[[0,-13],[12,7],[-12,7],[10,-10],[-10,-10]].map(([dx,dy],i)=>(<g key={i}><line x1="30" y1="22" x2={30+(dx||0)} y2={22+(dy||0)} stroke={dim} strokeWidth="0.8"/><circle cx={30+(dx||0)} cy={22+(dy||0)} r="3.5" fill={i%2===0?acc:acc2}/></g>))}</svg>),
    process:    (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/>{[5,13,21,29].map((y,i)=>(<g key={i}><rect x="8" y={y} width="44" height="7" rx="2" fill={i===0?acc:surf}/>{i<3&&<line x1="30" y1={y+7} x2="30" y2={y+9} stroke={acc} strokeWidth="1"/>}</g>))}</svg>),
    cycle:      (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><circle cx="30" cy="22" r="14" fill="none" stroke={acc} strokeWidth="1.5" strokeDasharray="4,2"/>{[[-1,-12],[10,7],[-10,7]].map(([dx,dy],i)=>(<rect key={i} x={30+(dx||0)*1.5-7} y={22+(dy||0)*1.5-4} width="14" height="8" rx="3" fill={i===0?acc:surf}/>))}<circle cx="30" cy="22" r="4" fill={acc2}/></svg>),
    timeline:   (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><line x1="18" y1="4" x2="18" y2="41" stroke={acc} strokeWidth="1.5"/>{[7,15,23,31].map((y,i)=>(<g key={i}><circle cx="18" cy={y} r="2.5" fill={i===0?acc:acc2}/><rect x="23" y={y-3} width="30" height="6" rx="1.5" fill={surf}/></g>))}</svg>),
    tree:       (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><rect x="22" y="3" width="16" height="8" rx="2" fill={acc}/>{[12,30,48].map((x,i)=>(<g key={i}><line x1="30" y1="11" x2={x} y2="19" stroke={dim} strokeWidth="0.8"/><rect x={x-7} y="19" width="14" height="8" rx="2" fill={surf}/>{[x-5,x+2].map((cx2,j)=>(<g key={j}><line x1={x} y1="27" x2={cx2} y2="34" stroke={dim} strokeWidth="0.6"/><rect x={cx2-4} y="34" width="8" height="5" rx="1" fill={dim}/></g>))}</g>))}</svg>),
    comparison: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><line x1="30" y1="3" x2="30" y2="42" stroke={dim} strokeWidth="0.8"/><rect x="2" y="3" width="25" height="7" rx="2" fill={acc}/><rect x="33" y="3" width="25" height="7" rx="2" fill={surf}/>{[14,20,27,34].map((y)=>(<g key={y}><rect x="3" y={y} width="23" height="4.5" rx="1" fill={surf}/><rect x="34" y={y} width="23" height="4.5" rx="1" fill={dim}/></g>))}</svg>),
    venn:       (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><circle cx="22" cy="22" r="14" fill={acc} fillOpacity="0.6"/><circle cx="38" cy="22" r="14" fill={acc2} fillOpacity="0.5"/><text x="30" y="23" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="5" fontWeight="bold">∩</text></svg>),
    pyramid:    (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><polygon points="30,4 37,14 23,14" fill={acc}/><polygon points="23,15 37,15 44,25 16,25" fill={surf}/><polygon points="16,26 44,26 51,36 9,36" fill={dim}/></svg>),
    funnel:     (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><polygon points="3,4 57,4 49,15 11,15" fill={acc}/><polygon points="11,16 49,16 43,27 17,27" fill={surf}/><polygon points="17,28 43,28 38,39 22,39" fill={dim}/></svg>),
    framework:  (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><rect x="18" y="4" width="24" height="9" rx="2" fill={acc}/><rect x="10" y="16" width="40" height="9" rx="2" fill={surf}/><rect x="4" y="28" width="52" height="9" rx="2" fill={dim}/></svg>),
    data:       (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/>{([[4,4],[32,4],[4,24],[32,24]] as [number,number][]).map(([x,y],i)=>(<g key={i}><rect x={x} y={y} width="24" height="16" rx="2" fill={surf}/><rect x={x} y={y} width="3" height="16" rx="1" fill={i%2===0?acc:acc2}/></g>))}</svg>),
    causeeffect:(<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><line x1="6" y1="22" x2="48" y2="22" stroke={acc} strokeWidth="1.5"/><rect x="48" y="17" width="10" height="10" rx="2" fill={surf}/>{[[13,14],[22,14],[31,14]].map(([x,y],i)=>(<line key={i} x1={x-4} y1={y} x2={x+4} y2="22" stroke={acc2} strokeWidth="1"/>))}{[[17,30],[26,30],[35,30]].map(([x,y],i)=>(<line key={i} x1={x-4} y1={y} x2={x+4} y2="22" stroke={acc2} strokeWidth="1"/>))}</svg>),
    roadmap:    (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><line x1="4" y1="22" x2="56" y2="22" stroke={dim} strokeWidth="2"/>{[10,22,34,46].map((x,i)=>(<g key={i}><circle cx={x} cy="22" r="5" fill={i%2===0?acc:acc2}/><rect x={x-8} y={i%2===0?5:28} width="16" height="12" rx="2" fill={surf}/></g>))}</svg>),
    matrix:     (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><line x1="30" y1="4" x2="30" y2="41" stroke={dim} strokeWidth="0.8"/><line x1="4" y1="22" x2="56" y2="22" stroke={dim} strokeWidth="0.8"/><rect x="4" y="4" width="24" height="16" rx="1" fill={acc} fillOpacity="0.5"/><rect x="32" y="4" width="24" height="16" rx="1" fill={surf}/><rect x="4" y="24" width="24" height="16" rx="1" fill={surf}/><rect x="32" y="24" width="24" height="16" rx="1" fill={acc} fillOpacity="0.3"/></svg>),
    network:    (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><circle cx="30" cy="22" r="7" fill={acc}/>{[[8,10],[52,10],[4,34],[56,34],[30,4]].map(([nx,ny],i)=>(<g key={i}><line x1="30" y1="22" x2={nx} y2={ny} stroke={dim} strokeWidth="0.8"/><circle cx={nx} cy={ny} r="4" fill={surf}/></g>))}</svg>),
    staircase:  (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/>{[0,1,2,3].map(i=>(<rect key={i} x={i*13+4} y={42-(i+1)*9} width={60-(i*13+4)} height={(i+1)*9} fill={acc} opacity={0.4+i*0.15}/>))}{[0,1,2,3].map(i=>(<rect key={i} x={i*13+4} y={42-(i+1)*9} width="13" height="9" fill={acc2} opacity={0.9}/>))}</svg>),
    hexcluster: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><polygon points="30,8 37,13 37,22 30,27 23,22 23,13" fill={acc}/>{[[9,16],[9,30],[30,38],[51,30],[51,16]].map(([hx,hy],i)=>(<g key={i}><line x1="30" y1="18" x2={hx} y2={hy} stroke={dim} strokeWidth="0.8"/><polygon points={`${hx},${hy-6} ${hx+5},${hy-3} ${hx+5},${hy+3} ${hx},${hy+6} ${hx-5},${hy+3} ${hx-5},${hy-3}`} fill={surf}/></g>))}</svg>),
    concentric: (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><circle cx="30" cy="22" r="19" fill={acc} opacity="0.25"/><circle cx="30" cy="22" r="13" fill={acc} opacity="0.5"/><circle cx="30" cy="22" r="6" fill={acc} opacity="0.95"/></svg>),
    swimlane:   (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/><rect x="0" y="4" width="14" height="18" fill={acc}/><rect x="0" y="23" width="14" height="18" fill={surf}/><rect x="14" y="4" width="46" height="18" fill={dim}/><rect x="14" y="23" width="46" height="18" fill={bg}/>{[20,30,40,50].map((x,i)=>(<rect key={i} x={x-3} y={i%2===0?7:26} width="10" height="12" rx="2" fill={i%2===0?surf:dim}/>))}</svg>),
    chevron:    (<svg viewBox="0 0 60 45" className="w-full h-full"><rect width="60" height="45" rx="3" fill={bg}/>{[0,1,2,3].map(i=>{const x=i*14,op=0.5+i*0.15;return(<polygon key={i} points={`${x+2},14 ${x+14},14 ${x+18},22 ${x+14},30 ${x+2},30${i>0?` ${x+6},22`:""}`} fill={acc} opacity={op}/>)})}</svg>),
  };
  return <div className="w-full aspect-[4/3] overflow-hidden rounded">{thumbs[type] ?? <div/>}</div>;
}

// ── Scan animation ─────────────────────────────────────────────────────────────
function ScanAnimation() {
  return (
    <div className="relative rounded-xl overflow-hidden border border-violet-400/30 bg-violet-500/5" style={{ minHeight:100 }}>
      <div className="absolute left-0 right-0 h-0.5" style={{ background:"linear-gradient(90deg,transparent,#8b5cf6,#a78bfa,#8b5cf6,transparent)", boxShadow:"0 0 12px 3px rgba(139,92,246,0.4)", animation:"scanline 1.4s linear infinite", top:0 }}/>
      <div className="flex items-center justify-center py-6 gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-violet-500"/>
        <span className="text-xs font-semibold text-violet-600">Scanning section & generating visual…</span>
      </div>
      <style>{`@keyframes scanline{from{top:0%}to{top:100%}}`}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Page Component
// ══════════════════════════════════════════════════════════════════════════════
function MemorizerPage() {
  const { user } = Route.useRouteContext();

  // ── Persistent state — survives route changes within the same session ──────
  const [doc, setDoc] = usePageState("memorizer", {
    mode:            "landing" as Mode,
    blocks:          [] as DocBlock[],
    docTitle:        "",
    topicInput:      "",
    pasteInput:      "",
    activeBlockIdx:  null as number | null,
    activeTemplate:  null as VisualTemplate | null,
    visuals:         {} as Record<number, VisualData>,
    templates:       {} as Record<number, VisualTemplate>,
    palettes:        {} as Record<number, number>,
    templatePage:    0,
  });

  const {
    mode, blocks, docTitle, topicInput, pasteInput,
    activeBlockIdx, activeTemplate, visuals, templates, palettes, templatePage,
  } = doc;

  // ── Transient state — reset on every mount ────────────────────────────────
  const [generating, setGenerating]             = useState(false);
  const [generatingVisual, setGeneratingVisual] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen]           = useState(false);

  // If the user navigated away while a generation was in flight, reset the spinners.
  useLayoutEffect(() => {
    if (generating)             setGenerating(false);
    if (generatingVisual !== null) setGeneratingVisual(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "groq");

  const visibleTemplates = TEMPLATES.slice(0, (templatePage + 1) * PAGE_SIZE);
  const hasMore = visibleTemplates.length < TEMPLATES.length;

  // ── Document generation ───────────────────────────────────────────────────
  async function handleDescribe() {
    if (!topicInput.trim()) return toast.error("Please describe your idea or topic");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setGenerating(true);
    try {
      const res = await askAI(
        `Write a VERY comprehensive, long-form educational document about: "${topicInput.trim()}"

You MUST write at least 1500 words. Do NOT stop early. Complete every section fully.

Format:
# ${topicInput.trim()}

## Introduction
[4-5 sentence paragraph]

## [Core Concept 1 — specific name]
[3-4 paragraphs with key terms in **bold**]
- Detailed bullet 1
- Detailed bullet 2
- Detailed bullet 3

## [Core Concept 2 — specific name]
[3-4 paragraphs]
1. Numbered item 1
2. Numbered item 2
3. Numbered item 3

## [Core Concept 3]
[3 paragraphs]

## [Applications / Examples]
[3-4 paragraphs with real examples]

## [Benefits / Impact]
[2 paragraphs + 5 bullet points]

## [Challenges / Limitations]
[2 paragraphs + 4 bullet points]

## [Future / Modern Relevance]
[3 paragraphs]

## Conclusion
[4-5 sentence wrap-up]

CRITICAL: Write every section FULLY. Minimum 1500 words. Never use LaTeX.`,
        "You are an expert academic writer. Write comprehensive educational documents of at least 1500 words. Never stop mid-section. Use **bold** for key terms. Never use LaTeX.",
        [], false, 4000
      );
      await bump();
      setDoc({ blocks: parseMarkdown(res.text), docTitle: topicInput.trim(), mode: "document" });
    } catch { toast.error("Failed to generate. Please try again."); }
    finally { setGenerating(false); }
  }

  async function handlePaste() {
    if (!pasteInput.trim()) return toast.error("Please paste some text first");
    let text = pasteInput.trim();
    if (!/^## /m.test(text)) {
      setGenerating(true);
      try {
        const res = await askAI(
          `Organize the following text into a structured educational document with headings. Keep ALL original content.
Format: # [title]\n## [Section]\n[content]\n## [Section]\n...
Create at least 3-5 sections.
Text:\n${text.slice(0,4000)}`,
          "You are a document organizer. Add proper markdown headings. Preserve every word of original content.",
          [], false, 3000
        );
        text = res.text.trim();
      } catch {} finally { setGenerating(false); }
    }
    const firstLine = text.split("\n")[0].replace(/^#+\s*/,"").trim();
    setDoc({ blocks: parseMarkdown(text), docTitle: firstLine || "Your Document", mode: "document" });
  }

  // ── Visual generation ─────────────────────────────────────────────────────
  async function doGenerate(blockIdx: number, tmpl: VisualTemplate) {
    const block = blocks[blockIdx];
    if (!block) return;
    const heading  = block.heading.content;
    const bodyText = block.body
      .map(s=>(s.type==="bullet"||s.type==="numbered")?(s.items||[]).join(". "):s.content)
      .join(" ").slice(0,600);
    setGeneratingVisual(blockIdx);
    try {
      const visual = await generateVisual(bodyText, heading, tmpl.baseType);
      if (visual) {
        // Only one visual generates at a time (buttons disabled during generation),
        // so reading `visuals/templates/palettes` from the closure is safe.
        setDoc({
          visuals:   { ...visuals,   [blockIdx]: visual },
          templates: { ...templates, [blockIdx]: tmpl  },
          palettes:  { ...palettes,  [blockIdx]: palettes[blockIdx] ?? Math.floor(Math.random() * PALETTES.length) },
        });
        toast.success("Visual generated!");
      } else { toast.error("Could not generate visual. Try again."); }
    } catch { toast.error("Visual generation failed."); }
    finally { setGeneratingVisual(null); }
  }

  function openSection(blockIdx: number) {
    const block = blocks[blockIdx];
    if (!block) return;
    const heading  = block.heading.content;
    const bodyText = block.body
      .map(s=>(s.type==="bullet"||s.type==="numbered")?(s.items||[]).join(". "):s.content)
      .join(" ").slice(0,600);
    const picked = autoPickTemplate(heading, bodyText);
    setDoc({ activeBlockIdx: blockIdx, activeTemplate: picked, templatePage: 0 });
    doGenerate(blockIdx, picked);
  }

  function reset() {
    setDoc({
      mode: "landing", blocks: [], visuals: {}, templates: {}, palettes: {},
      topicInput: "", pasteInput: "", docTitle: "",
      activeBlockIdx: null, activeTemplate: null, templatePage: 0,
    });
  }

  // ── Sidebar inner content (shared by desktop panel + mobile drawer) ─────────
  function SidebarInner() {
    return (
      <>
        {/* Active section info */}
        <div className="px-3 py-2.5 border-b border-[#1e3a5f] flex-shrink-0">
          {activeBlockIdx !== null && blocks[activeBlockIdx] ? (
            <div>
              <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Active section</div>
              <div className="text-[11px] font-semibold text-slate-200 truncate">{blocks[activeBlockIdx].heading.content||"Untitled"}</div>
              {activeTemplate && (
                <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full border" style={{ background:"#2d1d5e", borderColor:"#6d28d9", color:"#c4b5fd" }}>
                    {activeTemplate.icon} {activeTemplate.label}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 leading-snug flex items-start gap-1.5 pt-1">
              <Zap className="h-3 w-3 text-violet-500 flex-shrink-0 mt-0.5"/>
              Tap ⚡ on any section below to generate a visual
            </p>
          )}
        </div>

        {/* Palette picker */}
        {activeBlockIdx !== null && visuals[activeBlockIdx] && (
          <div className="px-3 py-2 border-b border-[#1e3a5f] flex-shrink-0">
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1.5">Color theme</div>
            <div className="flex gap-2 flex-wrap">
              {PALETTES.map(pal => (
                <button key={pal.id} onClick={()=>setDoc({ palettes: { ...palettes, [activeBlockIdx!]: pal.id } })}
                  className={`h-6 w-6 rounded-full transition-all ${palettes[activeBlockIdx!]===pal.id?"ring-2 ring-white ring-offset-1 ring-offset-[#0c1523] scale-125":"opacity-60 hover:opacity-100"}`}
                  style={{ background:pal.swatch }} title={pal.name}/>
              ))}
            </div>
          </div>
        )}

        {/* Template grid */}
        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-2 px-1">
            {activeBlockIdx !== null ? "Choose diagram type" : "All diagram types"} ({TEMPLATES.length})
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-2 gap-1.5">
            {visibleTemplates.map(tmpl => {
              const isActive = activeTemplate?.id === tmpl.id && activeBlockIdx !== null;
              const isLoading = generatingVisual === activeBlockIdx && isActive;
              return (
                <button key={tmpl.id}
                  onClick={()=>{
                    if (activeBlockIdx === null) { toast("Tap ⚡ on a section first to target it."); return; }
                    setDoc({ activeTemplate: tmpl });
                    doGenerate(activeBlockIdx, tmpl);
                    setSidebarOpen(false);
                  }}
                  disabled={generatingVisual !== null}
                  className={`group relative overflow-hidden rounded-lg border transition-all focus:outline-none disabled:opacity-40 ${isActive?"border-violet-500 ring-1 ring-violet-400":"border-[#1e3a5f] hover:border-violet-600"}`}
                  title={tmpl.label}
                >
                  <VisualThumb type={tmpl.baseType} active={isActive}/>
                  <div className={`py-1 text-center text-[8px] font-medium leading-tight px-0.5 ${isActive?"text-violet-300 bg-violet-950":"text-slate-400 group-hover:text-violet-300"}`}>
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin mx-auto text-violet-400"/> : tmpl.label}
                  </div>
                </button>
              );
            })}
          </div>
          {hasMore && (
            <button onClick={()=>setDoc({ templatePage: templatePage + 1 })}
              className="mt-3 w-full text-center text-[10px] text-slate-400 hover:text-violet-300 py-2 border border-dashed border-[#1e3a5f] rounded-lg transition-colors flex items-center justify-center gap-1">
              <ChevronDown className="h-3 w-3"/> More ({TEMPLATES.length - visibleTemplates.length} remaining)
            </button>
          )}
        </div>
      </>
    );
  }

  // ── Landing ───────────────────────────────────────────────────────────────
  if (mode === "landing") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b px-4 py-3 flex-shrink-0">
          <div>
            <h1 className="text-base font-bold text-gray-900">Memorizer</h1>
            <p className="text-xs text-muted-foreground">Transform any content into rich visual study documents</p>
          </div>
          <QuotaBadge quota={quota} loading={quotaLoading}/>
        </div>
        <div className="flex flex-1 items-center justify-center p-4 sm:p-8 overflow-y-auto">
          <div className="w-full max-w-xl">
            <h2 className="text-center text-xl sm:text-2xl font-bold text-gray-800 mb-1">How would you like to start?</h2>
            <p className="text-center text-sm text-muted-foreground mb-6">Choose your method to create a visual memory document</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button onClick={()=>setDoc({ mode:"paste-input" })} className="group relative overflow-hidden rounded-2xl p-5 text-left transition-transform active:scale-95 hover:scale-[1.02] hover:shadow-xl focus:outline-none" style={{ background:"linear-gradient(135deg,#e879f9 0%,#a855f7 55%,#9333ea 100%)" }}>
                <div className="pointer-events-none absolute right-3 top-3 h-16 w-16 rounded-full bg-white/15"/>
                <ClipboardList className="mb-3 h-9 w-9 text-white/90"/>
                <h3 className="text-white font-bold text-base mb-1">By pasting my text</h3>
                <p className="text-purple-100 text-sm leading-snug">Create from notes, an outline or existing content.</p>
              </button>
              <button onClick={()=>setDoc({ mode:"describe-input" })} className="group relative overflow-hidden rounded-2xl p-5 text-left transition-transform active:scale-95 hover:scale-[1.02] hover:shadow-xl focus:outline-none" style={{ background:"linear-gradient(135deg,#818cf8 0%,#7c3aed 55%,#6d28d9 100%)" }}>
                <div className="pointer-events-none absolute right-3 top-3 h-16 w-16 rounded-full bg-white/15"/>
                <Sparkles className="mb-3 h-9 w-9 text-white/90"/>
                <h3 className="text-white font-bold text-base mb-1">By describing my idea</h3>
                <p className="text-purple-100 text-sm leading-snug">Describe what visual and text content you have in mind.</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Paste input ───────────────────────────────────────────────────────────
  if (mode === "paste-input") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 border-b px-4 py-3 flex-shrink-0">
          <button onClick={()=>setDoc({ mode:"landing" })} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground flex-shrink-0">
            <ArrowLeft className="h-4 w-4"/> Back
          </button>
          <h1 className="text-base font-bold text-gray-900 truncate">Paste Your Text</h1>
        </div>
        <div className="flex flex-1 flex-col items-center justify-start sm:justify-center p-4 sm:p-8 overflow-y-auto">
          <div className="w-full max-w-2xl space-y-3 py-2">
            <label className="block text-sm font-medium text-gray-700">Paste your notes, outline, or any text content</label>
            <textarea
              value={pasteInput}
              onChange={e=>setDoc({ pasteInput: e.target.value })}
              placeholder={"Paste your text here…\n\nYou can use plain text or markdown:\n# Heading\n## Section\n**bold**, - bullets"}
              className="w-full h-48 sm:h-64 rounded-xl border border-border bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
            />
            <button onClick={handlePaste} disabled={!pasteInput.trim()||generating} className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 px-6 py-3 font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2">
              {generating?<><Loader2 className="h-4 w-4 animate-spin"/>Structuring your document…</>:"Create Visual Document"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Describe input ─────────────────────────────────────────────────────────
  if (mode === "describe-input") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 border-b px-4 py-3 flex-shrink-0">
          <button onClick={()=>setDoc({ mode:"landing" })} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground flex-shrink-0">
            <ArrowLeft className="h-4 w-4"/> Back
          </button>
          <h1 className="text-base font-bold text-gray-900 truncate">Describe Your Idea</h1>
          <div className="ml-auto flex-shrink-0"><QuotaBadge quota={quota} loading={quotaLoading}/></div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-start sm:justify-center p-4 sm:p-8 overflow-y-auto">
          <div className="w-full max-w-2xl space-y-3 py-2">
            <label className="block text-sm font-medium text-gray-700">What topic or idea would you like to explore?</label>
            <textarea
              value={topicInput}
              onChange={e=>setDoc({ topicInput: e.target.value })}
              onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)&&!generating)handleDescribe();}}
              placeholder={"e.g. The impact of globalization on developing economies\ne.g. How photosynthesis works\ne.g. Machine learning fundamentals"}
              className="w-full h-36 sm:h-44 rounded-xl border border-border bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              disabled={generating}
            />
            <button onClick={handleDescribe} disabled={generating||!topicInput.trim()} className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-6 py-3 font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2">
              {generating?<><Loader2 className="h-4 w-4 animate-spin"/>Generating comprehensive document…</>:<><Sparkles className="h-4 w-4"/>Generate Document</>}
            </button>
            <p className="text-center text-xs text-muted-foreground">Tip: Press Ctrl+Enter to generate</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Document view ──────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-x-0 bottom-0 top-14 lg:static lg:h-full flex overflow-hidden bg-gray-50">

      {/* ── DESKTOP LEFT SIDEBAR ── */}
      <div className="hidden lg:flex w-60 flex-shrink-0 border-r flex-col overflow-hidden" style={{ background:"#0c1523" }}>
        <div className="flex items-center gap-2 px-3 py-3 border-b border-[#1e3a5f] flex-shrink-0">
          <Zap className="h-4 w-4 text-violet-400 flex-shrink-0"/>
          <span className="font-bold text-sm text-violet-200">AI Suggestions</span>
          {generatingVisual !== null && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400 ml-auto"/>}
        </div>
        <SidebarInner/>
      </div>

      {/* ── MOBILE BOTTOM DRAWER ── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Scrim */}
          <div className="absolute inset-0 bg-black/60" onClick={()=>setSidebarOpen(false)}/>
          {/* Sheet */}
          <div className="relative flex flex-col rounded-t-2xl overflow-hidden" style={{ background:"#0c1523", maxHeight:"78vh" }}>
            {/* Sheet handle + header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e3a5f] flex-shrink-0">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-violet-400"/>
                <span className="font-bold text-sm text-violet-200">AI Diagram Templates</span>
                {generatingVisual !== null && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400"/>}
              </div>
              <button onClick={()=>setSidebarOpen(false)} className="rounded-full p-1 hover:bg-white/10">
                <X className="h-5 w-5 text-slate-300"/>
              </button>
            </div>
            <SidebarInner/>
          </div>
        </div>
      )}

      {/* ── RIGHT: Scrollable document ── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">

        {/* Toolbar */}
        <div className="flex items-center justify-between border-b px-3 sm:px-4 py-2 bg-white flex-shrink-0 z-10 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={reset} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground flex-shrink-0">
              <ArrowLeft className="h-3.5 w-3.5"/>
              <span className="hidden sm:inline">Back</span>
            </button>
            <span className="text-sm font-semibold text-gray-700 truncate">{docTitle}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Mobile-only: open templates drawer */}
            <button
              onClick={()=>setSidebarOpen(true)}
              className="lg:hidden flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 active:scale-95 transition-all"
            >
              <LayoutTemplate className="h-3.5 w-3.5"/>
              Templates
            </button>
            <button onClick={reset} className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">
              <RefreshCw className="h-3 w-3"/>
              <span className="hidden sm:inline">New</span>
            </button>
          </div>
        </div>

        {/* Document scroll area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto py-5 sm:py-8 px-3 sm:px-6">
            {blocks.map((block, blockIdx) => {
              const isTitle  = block.heading.type === "title";
              const isH2     = block.heading.type === "h2";
              const isLoading= generatingVisual === blockIdx;
              const hasVisual= !!visuals[blockIdx];
              const isActive = activeBlockIdx === blockIdx;
              const palette  = PALETTES[palettes[blockIdx] ?? 0];
              const tmpl     = templates[blockIdx];

              return (
                <div key={blockIdx} className={`${isH2?"mb-8":isTitle?"mb-4":"mb-2"}`}>

                  {/* Title block */}
                  {isTitle && block.heading.content && (
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 mt-2 flex items-center gap-3 flex-wrap">
                      <span className="flex h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-full bg-violet-50 text-xl select-none">🧠</span>
                      <span className="flex-1 min-w-0">{block.heading.content}</span>
                    </h1>
                  )}

                  {/* Section (H2) block */}
                  {isH2 && (
                    <div className={`rounded-xl border-l-4 px-3 sm:px-4 pt-3 pb-5 ${isActive?"border-violet-500 bg-violet-50/60":"border-violet-300 bg-white"}`}>

                      {/* Section heading + ⚡ button on same row */}
                      <div className="flex items-start gap-2 mb-3">
                        <button
                          onClick={()=>{ openSection(blockIdx); setSidebarOpen(false); }}
                          disabled={generatingVisual!==null}
                          className={`flex-shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-white shadow active:scale-95 transition-all disabled:opacity-60 ${isActive?"bg-violet-700 ring-2 ring-violet-300 ring-offset-1":"bg-violet-600 hover:bg-violet-700"}`}
                          title="Auto-generate visual for this section"
                        >
                          {isLoading?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Zap className="h-3.5 w-3.5"/>}
                        </button>
                        <h2 className="text-lg sm:text-xl font-bold text-gray-800 leading-tight">{block.heading.content}</h2>
                      </div>

                      {/* Body text */}
                      {block.body.map(sec=>{
                        if (sec.type==="paragraph") return (
                          <p key={sec.id} className="text-gray-700 text-sm leading-relaxed mb-3"><Inline text={sec.content}/></p>
                        );
                        if (sec.type==="bullet") return (
                          <ul key={sec.id} className="list-disc pl-5 mb-3 space-y-1.5">
                            {(sec.items||[]).map((item,ii)=><li key={ii} className="text-gray-700 text-sm leading-relaxed"><Inline text={item}/></li>)}
                          </ul>
                        );
                        if (sec.type==="numbered") return (
                          <ol key={sec.id} className="list-decimal pl-5 mb-3 space-y-1.5">
                            {(sec.items||[]).map((item,ii)=><li key={ii} className="text-gray-700 text-sm leading-relaxed"><Inline text={item}/></li>)}
                          </ol>
                        );
                        return null;
                      })}

                      {/* Scanning animation */}
                      {isLoading && <ScanAnimation/>}

                      {/* Visual block */}
                      {hasVisual && !isLoading && (
                        <div className="mt-3 rounded-xl overflow-hidden shadow-lg border border-[#1e3a5f]">
                          <div className="flex items-center justify-between px-3 py-2" style={{ background:"#0c1523", borderBottom:"1px solid #1e3a5f" }}>
                            <span className="text-[10px] font-medium uppercase tracking-widest flex items-center gap-1.5" style={{ color:"#64748b" }}>
                              {tmpl?.icon} {tmpl?.label || visuals[blockIdx].type}
                            </span>
                            <div className="flex items-center gap-2">
                              <div className="flex gap-1">
                                {PALETTES.map(pal=>(
                                  <button key={pal.id} onClick={()=>setDoc({ palettes: { ...palettes, [blockIdx]: pal.id } })}
                                    className={`h-3.5 w-3.5 rounded-full transition-all ${palettes[blockIdx]===pal.id?"ring-1 ring-white scale-110":"opacity-40 hover:opacity-90"}`}
                                    style={{ background:pal.swatch }} title={pal.name}/>
                                ))}
                              </div>
                              <button onClick={()=>openSection(blockIdx)} className="text-[10px] font-medium transition-colors" style={{ color:"#a78bfa" }}>Regen</button>
                              <button onClick={()=>{ const n={...visuals}; delete n[blockIdx]; setDoc({ visuals: n }); }} className="transition-colors text-[#64748b] hover:text-red-400">
                                <X className="h-3.5 w-3.5"/>
                              </button>
                            </div>
                          </div>
                          <VisualRenderer visual={visuals[blockIdx]} palette={palette} variant={tmpl?.variant}/>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Non-section (paragraph/bullet under title) */}
                  {!isTitle && !isH2 && (
                    <div className="pl-2">
                      {block.body.map(sec=>{
                        if (sec.type==="paragraph") return (
                          <p key={sec.id} className="text-gray-700 text-sm leading-relaxed mb-3"><Inline text={sec.content}/></p>
                        );
                        if (sec.type==="bullet") return (
                          <ul key={sec.id} className="list-disc pl-5 mb-3 space-y-1.5">
                            {(sec.items||[]).map((item,ii)=><li key={ii} className="text-gray-700 text-sm leading-relaxed"><Inline text={item}/></li>)}
                          </ul>
                        );
                        if (sec.type==="numbered") return (
                          <ol key={sec.id} className="list-decimal pl-5 mb-3 space-y-1.5">
                            {(sec.items||[]).map((item,ii)=><li key={ii} className="text-gray-700 text-sm leading-relaxed"><Inline text={item}/></li>)}
                          </ol>
                        );
                        return null;
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Bottom padding so last section isn't hidden behind nav */}
            <div className="h-6"/>
          </div>
        </div>
      </div>
    </div>
  );
}
