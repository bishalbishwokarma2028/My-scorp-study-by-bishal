import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Loader2, Eye, Download, RefreshCw, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON } from "@/lib/aiProvider";
import { ProviderBadge, QuotaBadge } from "@/components/ai-ui";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";

export const Route = createFileRoute("/_authenticated/dashboard/visual-explainer")({
  component: VisualExplainerPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type DiagramType = "mindmap" | "flowchart" | "conceptweb";

type MindMapBranch = { label: string; color: string; items: string[] };
type MindMapData = { type: "mindmap"; center: string; branches: MindMapBranch[] };

type FlowchartNode = { id: string; shape: "start" | "process" | "decision" | "end"; label: string };
type FlowchartEdge = { from: string; to: string; label?: string };
type FlowchartData = { type: "flowchart"; title: string; nodes: FlowchartNode[]; edges: FlowchartEdge[] };

type ConceptNode = { id: string; label: string; type?: string };
type ConceptConnection = { from: string; to: string; label?: string };
type ConceptWebData = { type: "conceptweb"; nodes: ConceptNode[]; connections: ConceptConnection[] };

type DiagramData = MindMapData | FlowchartData | ConceptWebData;

// ─── SVG Renderers ────────────────────────────────────────────────────────────

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function MindMapSVG({ data }: { data: MindMapData }) {
  const W = 920, H = 720;
  const cx = W / 2, cy = H / 2;
  const BRANCH_R = 198;
  const n = Math.min(data.branches.length, 6);
  const branches = data.branches.slice(0, n).map((b, i) => {
    const angle = (i * 2 * Math.PI / n) - Math.PI / 2;
    return { ...b, x: cx + BRANCH_R * Math.cos(angle), y: cy + (BRANCH_R * 0.82) * Math.sin(angle), angle };
  });

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-xl">
      <rect width={W} height={H} fill="#f8fafc" rx={20} />
      {/* Subtle grid */}
      <defs>
        <pattern id="grid" width={40} height={40} patternUnits="userSpaceOnUse">
          <path d="M40,0 L0,0 0,40" fill="none" stroke="#e2e8f0" strokeWidth={0.5} />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" rx={20} />

      {/* Lines center→branch */}
      {branches.map((b, i) => (
        <line key={i} x1={cx} y1={cy} x2={b.x} y2={b.y}
          stroke={b.color} strokeWidth={2.5} strokeOpacity={0.55} strokeLinecap="round" />
      ))}

      {/* Sub-items */}
      {branches.map((b, i) =>
        b.items.slice(0, 4).map((item, j) => {
          const count = Math.min(b.items.length, 4);
          const spread = b.angle + (j - (count - 1) / 2) * 0.34;
          const sx = b.x + 108 * Math.cos(spread);
          const sy = b.y + 92 * Math.sin(spread);
          const lbl = truncate(item, 15);
          return (
            <g key={`${i}-${j}`}>
              <line x1={b.x} y1={b.y} x2={sx} y2={sy}
                stroke={b.color} strokeWidth={1.5} strokeOpacity={0.38} strokeLinecap="round" />
              <ellipse cx={sx} cy={sy} rx={50} ry={17} fill="white" stroke={b.color} strokeWidth={1.5} />
              <text x={sx} y={sy} textAnchor="middle" dominantBaseline="middle"
                fontSize={9.5} fill="#374151" fontFamily="system-ui,sans-serif">{lbl}</text>
            </g>
          );
        })
      )}

      {/* Branch ovals */}
      {branches.map((b, i) => (
        <g key={i}>
          <ellipse cx={b.x} cy={b.y} rx={60} ry={24} fill={b.color} />
          <text x={b.x} y={b.y} textAnchor="middle" dominantBaseline="middle"
            fontSize={11} fill="white" fontWeight="bold" fontFamily="system-ui,sans-serif">
            {truncate(b.label, 15)}
          </text>
        </g>
      ))}

      {/* Center node */}
      <ellipse cx={cx} cy={cy} rx={80} ry={35} fill="#1e293b" />
      <ellipse cx={cx} cy={cy} rx={77} ry={32} fill="none" stroke="white" strokeWidth={1} strokeOpacity={0.25} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
        fontSize={13} fill="white" fontWeight="bold" fontFamily="system-ui,sans-serif">
        {truncate(data.center, 20)}
      </text>
    </svg>
  );
}

function FlowchartSVG({ data }: { data: FlowchartData }) {
  const W = 680;
  const NW = 180, NH = 46;
  const DH = 38; // decision half-height
  const DW = 96; // decision half-width
  const VGAP = 90;
  const cx = W / 2;

  // Simple positional layout: follow edge order from start node
  const posMap: Record<string, { x: number; y: number }> = {};
  const visited = new Set<string>();
  const order: string[] = [];

  const outEdges: Record<string, FlowchartEdge[]> = {};
  data.edges.forEach(e => { (outEdges[e.from] = outEdges[e.from] || []).push(e); });

  function walk(id: string) {
    if (visited.has(id)) return;
    visited.add(id); order.push(id);
    (outEdges[id] || []).forEach(e => walk(e.to));
  }
  if (data.nodes[0]) walk(data.nodes[0].id);
  data.nodes.forEach(n => { if (!visited.has(n.id)) { visited.add(n.id); order.push(n.id); } });

  order.forEach((id, i) => { posMap[id] = { x: cx, y: 70 + i * VGAP }; });

  const H = Math.max(500, order.length * VGAP + 120);
  const nodeMap: Record<string, FlowchartNode> = {};
  data.nodes.forEach(n => { nodeMap[n.id] = n; });

  const shapeColor: Record<string, { fill: string; stroke: string; text: string }> = {
    start: { fill: "#10b981", stroke: "#059669", text: "white" },
    end: { fill: "#ef4444", stroke: "#dc2626", text: "white" },
    process: { fill: "#3b82f6", stroke: "#2563eb", text: "white" },
    decision: { fill: "#f59e0b", stroke: "#d97706", text: "white" },
  };

  function nodeBottom(id: string): { x: number; y: number } {
    const p = posMap[id];
    const n = nodeMap[id];
    if (!p || !n) return { x: 0, y: 0 };
    if (n.shape === "decision") return { x: p.x, y: p.y + DH };
    if (n.shape === "start" || n.shape === "end") return { x: p.x, y: p.y + NH / 2 };
    return { x: p.x, y: p.y + NH / 2 };
  }

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-xl">
      <defs>
        <marker id="fc-arrow" markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#64748b" />
        </marker>
      </defs>
      <rect width={W} height={H} fill="#f8fafc" rx={20} />
      <text x={W / 2} y={30} textAnchor="middle" fontSize={14} fontWeight="bold"
        fill="#1e293b" fontFamily="system-ui,sans-serif">{data.title || "Flowchart"}</text>

      {/* Edges */}
      {data.edges.map((e, i) => {
        const from = posMap[e.from], to = posMap[e.to];
        if (!from || !to) return null;
        const bot = nodeBottom(e.from);
        const top = { x: to.x, y: to.y - (nodeMap[e.to]?.shape === "decision" ? DH : NH / 2) };
        const mid = { x: (bot.x + top.x) / 2, y: (bot.y + top.y) / 2 };
        return (
          <g key={i}>
            <line x1={bot.x} y1={bot.y} x2={top.x} y2={top.y - 6}
              stroke="#94a3b8" strokeWidth={1.8} markerEnd="url(#fc-arrow)" />
            {e.label && (
              <text x={mid.x + 6} y={mid.y} fontSize={9} fill="#64748b" fontFamily="system-ui,sans-serif">{e.label}</text>
            )}
          </g>
        );
      })}

      {/* Nodes */}
      {data.nodes.map(node => {
        const p = posMap[node.id];
        if (!p) return null;
        const c = shapeColor[node.shape] || shapeColor.process;
        const lbl = truncate(node.label, 24);

        if (node.shape === "decision") {
          return (
            <g key={node.id}>
              <polygon points={`${p.x},${p.y - DH} ${p.x + DW},${p.y} ${p.x},${p.y + DH} ${p.x - DW},${p.y}`}
                fill={c.fill} stroke={c.stroke} strokeWidth={2} />
              <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                fontSize={10} fill={c.text} fontWeight="bold" fontFamily="system-ui,sans-serif">{lbl}</text>
            </g>
          );
        }
        const isRound = node.shape === "start" || node.shape === "end";
        return (
          <g key={node.id}>
            <rect x={p.x - NW / 2} y={p.y - NH / 2} width={NW} height={NH}
              rx={isRound ? NH / 2 : 8} fill={c.fill} stroke={c.stroke} strokeWidth={2} />
            <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
              fontSize={11} fill={c.text} fontWeight={isRound ? "bold" : "normal"} fontFamily="system-ui,sans-serif">{lbl}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ConceptWebSVG({ data }: { data: ConceptWebData }) {
  const W = 820, H = 700;
  const cx = W / 2, cy = H / 2;
  const ORBIT_R = 230;
  const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];

  const centerNode = data.nodes.find(n => n.id === "center" || n.type === "main") || data.nodes[0];
  const secondary = data.nodes.filter(n => n.id !== centerNode?.id);
  const n = secondary.length;

  const posMap: Record<string, { x: number; y: number }> = {};
  if (centerNode) posMap[centerNode.id] = { x: cx, y: cy };
  secondary.forEach((nd, i) => {
    const angle = (i * 2 * Math.PI / n) - Math.PI / 2;
    posMap[nd.id] = { x: cx + ORBIT_R * Math.cos(angle), y: cy + (ORBIT_R * 0.84) * Math.sin(angle) };
  });

  const nodeColor: Record<string, string> = {};
  secondary.forEach((nd, i) => { nodeColor[nd.id] = COLORS[i % COLORS.length]; });

  const CENTER_R = 64, SEC_R = 44;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-xl">
      <defs>
        {COLORS.map((color, i) => (
          <marker key={i} id={`cw-arrow-${i}`} markerWidth={7} markerHeight={7} refX={5} refY={3.5} orient="auto">
            <path d="M0,0 L7,3.5 L0,7 z" fill={color} />
          </marker>
        ))}
      </defs>
      <rect width={W} height={H} fill="#f8fafc" rx={20} />
      <defs>
        <pattern id="cw-grid" width={40} height={40} patternUnits="userSpaceOnUse">
          <path d="M40,0 L0,0 0,40" fill="none" stroke="#e2e8f0" strokeWidth={0.5} />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#cw-grid)" rx={20} />

      {/* Connections */}
      {data.connections.map((conn, i) => {
        const from = posMap[conn.from], to = posMap[conn.to];
        if (!from || !to) return null;
        const dx = to.x - from.x, dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const r1 = conn.from === centerNode?.id ? CENTER_R : SEC_R;
        const r2 = conn.to === centerNode?.id ? CENTER_R : SEC_R;
        const sx = from.x + (dx / len) * r1;
        const sy = from.y + (dy / len) * r1;
        const ex = to.x - (dx / len) * (r2 + 8);
        const ey = to.y - (dy / len) * (r2 + 8);
        const mx = (sx + ex) / 2, my = (sy + ey) / 2;
        const colorIdx = secondary.findIndex(nd => nd.id === conn.from || nd.id === conn.to);
        const color = COLORS[Math.max(colorIdx, 0) % COLORS.length];

        return (
          <g key={i}>
            <line x1={sx} y1={sy} x2={ex} y2={ey}
              stroke={color} strokeWidth={1.8} strokeOpacity={0.65}
              markerEnd={`url(#cw-arrow-${Math.max(colorIdx, 0) % COLORS.length})`} />
            {conn.label && (
              <>
                <rect x={mx - 22} y={my - 8} width={44} height={14} rx={4} fill="white" fillOpacity={0.9} />
                <text x={mx} y={my + 1} textAnchor="middle" dominantBaseline="middle"
                  fontSize={8.5} fill="#475569" fontFamily="system-ui,sans-serif">{truncate(conn.label, 12)}</text>
              </>
            )}
          </g>
        );
      })}

      {/* Secondary nodes */}
      {secondary.map(nd => {
        const p = posMap[nd.id];
        const color = nodeColor[nd.id];
        return (
          <g key={nd.id}>
            <circle cx={p.x} cy={p.y} r={SEC_R + 2} fill={color} opacity={0.15} />
            <circle cx={p.x} cy={p.y} r={SEC_R} fill={color} />
            <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
              fontSize={9.5} fill="white" fontWeight="bold" fontFamily="system-ui,sans-serif">
              {truncate(nd.label, 12)}
            </text>
          </g>
        );
      })}

      {/* Center node */}
      {centerNode && posMap[centerNode.id] && (
        <g>
          <circle cx={cx} cy={cy} r={CENTER_R + 4} fill="#1e293b" opacity={0.15} />
          <circle cx={cx} cy={cy} r={CENTER_R} fill="#1e293b" />
          <circle cx={cx} cy={cy} r={CENTER_R - 4} fill="none" stroke="white" strokeWidth={1} strokeOpacity={0.25} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
            fontSize={12} fill="white" fontWeight="bold" fontFamily="system-ui,sans-serif">
            {truncate(centerNode.label, 14)}
          </text>
        </g>
      )}
    </svg>
  );
}

// ─── Prompt builders ──────────────────────────────────────────────────────────
function buildPrompt(topic: string, type: DiagramType): string {
  const base = `Return STRICT JSON only. No markdown fences, no prose outside JSON. Keep ALL labels SHORT (max 14 chars unless unavoidable).`;

  if (type === "mindmap") {
    return `Generate a mind map for: "${topic}"

${base}
{
  "type": "mindmap",
  "center": "short topic label (max 18 chars)",
  "branches": [
    { "label": "Branch Name", "color": "#hex", "items": ["sub 1", "sub 2", "sub 3"] }
  ]
}
Rules:
- Exactly 5-6 branches
- 2-4 items per branch, each max 14 chars
- Use these colors in order: "#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6"
- Make branches meaningful and educational`;
  }

  if (type === "flowchart") {
    return `Generate a step-by-step flowchart for: "${topic}"

${base}
{
  "type": "flowchart",
  "title": "Flowchart: ${topic}",
  "nodes": [
    { "id": "1", "shape": "start", "label": "Start" },
    { "id": "2", "shape": "process", "label": "Action step" },
    { "id": "3", "shape": "decision", "label": "Condition?" },
    { "id": "4", "shape": "process", "label": "Yes path" },
    { "id": "5", "shape": "process", "label": "No path" },
    { "id": "6", "shape": "end", "label": "End" }
  ],
  "edges": [
    { "from": "1", "to": "2" },
    { "from": "2", "to": "3" },
    { "from": "3", "to": "4", "label": "Yes" },
    { "from": "3", "to": "5", "label": "No" },
    { "from": "4", "to": "6" },
    { "from": "5", "to": "6" }
  ]
}
Rules:
- 5-9 nodes, always start with "start" and end with "end" shape
- Labels max 22 chars
- decision nodes have exactly 2 outgoing edges labeled "Yes"/"No"
- Every node must be connected`;
  }

  // conceptweb
  return `Generate a concept web / knowledge graph for: "${topic}"

${base}
{
  "type": "conceptweb",
  "nodes": [
    { "id": "center", "label": "Main Topic", "type": "main" },
    { "id": "n1", "label": "Concept A" },
    { "id": "n2", "label": "Concept B" },
    { "id": "n3", "label": "Concept C" },
    { "id": "n4", "label": "Concept D" },
    { "id": "n5", "label": "Concept E" },
    { "id": "n6", "label": "Concept F" }
  ],
  "connections": [
    { "from": "center", "to": "n1", "label": "causes" },
    { "from": "center", "to": "n2", "label": "requires" },
    { "from": "n1", "to": "n3", "label": "leads to" },
    { "from": "n2", "to": "n4", "label": "produces" }
  ]
}
Rules:
- 1 center + 5-7 secondary nodes
- Node labels max 14 chars
- Connection labels max 11 chars (verbs: "causes", "enables", "leads to", "requires", "produces", "affects")
- Include cross-connections between secondary nodes too (not just center→secondary)`;
}

// ─── Diagram type options ─────────────────────────────────────────────────────
const DIAGRAM_TYPES: { id: DiagramType; label: string; icon: string; description: string }[] = [
  { id: "mindmap", label: "Mind Map", icon: "🧠", description: "Central topic with branching subtopics — great for overview and recall" },
  { id: "flowchart", label: "Flowchart", icon: "🔀", description: "Step-by-step process with decisions — great for understanding procedures" },
  { id: "conceptweb", label: "Concept Web", icon: "🕸️", description: "Interconnected ideas with labeled relationships — great for understanding connections" },
];

const EXAMPLE_TOPICS = [
  "Photosynthesis", "TCP/IP Network Model", "French Revolution",
  "How a Computer Boots Up", "DNA Replication", "Supply and Demand",
  "Machine Learning Pipeline", "Human Digestive System",
];

// ─── Page ─────────────────────────────────────────────────────────────────────
function VisualExplainerPage() {
  const { user } = Route.useRouteContext();
  const [topic, setTopic] = useState("");
  const [diagramType, setDiagramType] = useState<DiagramType>("mindmap");
  const [loading, setLoading] = useState(false);
  const [diagram, setDiagram] = useState<DiagramData | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const svgRef = useRef<HTMLDivElement>(null);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "visual_explainer");

  async function generate() {
    if (!topic.trim()) return toast.error("Enter a topic first");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true);
    setDiagram(null);

    const prompt = buildPrompt(topic.trim(), diagramType);
    const res = await askAI(prompt, "Output only valid JSON. No code fences, no explanation.");
    setProvider(res.provider);
    await bump();

    const parsed = extractJSON<DiagramData>(res.text);
    if (!parsed || !parsed.type) {
      toast.error("Couldn't generate diagram, try again or rephrase your topic");
    } else {
      setDiagram(parsed);
    }
    setLoading(false);
  }

  function downloadSVG() {
    const svgEl = svgRef.current?.querySelector("svg");
    if (!svgEl) return;
    const blob = new Blob([svgEl.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${topic.slice(0, 30).replace(/\s+/g, "-")}-${diagramType}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("SVG downloaded");
  }

  async function copyCaption() {
    const caption = `Visual diagram: ${topic} — ${DIAGRAM_TYPES.find(d => d.id === diagramType)?.label}`;
    await navigator.clipboard.writeText(caption);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Eye className="h-5 w-5 text-primary" /> Visual Explainer
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Enter any topic — AI generates a visual diagram to help you understand and memorize faster
          </p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      {/* Input */}
      <div className="card-soft p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Topic or Concept</label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !loading) generate(); }}
            placeholder="e.g. How photosynthesis works, TCP/IP model, French Revolution causes…"
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLE_TOPICS.map(t => (
              <button key={t} onClick={() => { setTopic(t); setDiagram(null); }}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:bg-accent">{t}</button>
            ))}
          </div>
        </div>

        {/* Diagram type */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Diagram Type</label>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {DIAGRAM_TYPES.map(({ id, label, icon, description }) => (
              <button key={id} onClick={() => setDiagramType(id)}
                className={`rounded-xl border p-3 text-left transition-colors ${diagramType === id ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{icon}</span>
                  <span className={`text-sm font-semibold ${diagramType === id ? "text-primary" : ""}`}>{label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">{description}</p>
              </button>
            ))}
          </div>
        </div>

        <button onClick={generate} disabled={loading || !topic.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating diagram…</> : <><Eye className="h-4 w-4" /> Generate Visual Diagram</>}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="card-soft flex flex-col items-center gap-3 py-16 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-semibold">Building your {DIAGRAM_TYPES.find(d => d.id === diagramType)?.label}…</p>
          <p className="text-xs text-muted-foreground">AI is structuring the concept into a visual layout</p>
        </div>
      )}

      {/* Diagram output */}
      {!loading && diagram && (
        <div className="card-soft p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-sm font-semibold">{topic}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                — {DIAGRAM_TYPES.find(d => d.id === diagram.type)?.icon} {DIAGRAM_TYPES.find(d => d.id === diagram.type)?.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ProviderBadge provider={provider} />
              <button onClick={copyCaption}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent">
                {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                Caption
              </button>
              <button onClick={downloadSVG}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent">
                <Download className="h-3 w-3" /> Download SVG
              </button>
              <button onClick={() => setDiagram(null)}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent">
                <RefreshCw className="h-3 w-3" /> Regenerate
              </button>
            </div>
          </div>

          {/* Rendered diagram */}
          <div ref={svgRef} className="rounded-xl border border-border overflow-hidden bg-slate-50 p-2">
            {diagram.type === "mindmap" && <MindMapSVG data={diagram as MindMapData} />}
            {diagram.type === "flowchart" && <FlowchartSVG data={diagram as FlowchartData} />}
            {diagram.type === "conceptweb" && <ConceptWebSVG data={diagram as ConceptWebData} />}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            💡 Download the SVG to use in notes, presentations, or print it for revision
          </p>
        </div>
      )}

      {/* Tips */}
      {!loading && !diagram && (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold mb-2 text-muted-foreground">💡 Tips for best results</p>
          <div className="grid gap-1 sm:grid-cols-2 text-xs text-muted-foreground">
            <span>• Use <strong>Mind Map</strong> for overviews and revision</span>
            <span>• Use <strong>Flowchart</strong> for processes, algorithms, and steps</span>
            <span>• Use <strong>Concept Web</strong> for interconnected ideas and relationships</span>
            <span>• Specific topics give better diagrams than vague ones</span>
          </div>
        </div>
      )}
    </div>
  );
}
