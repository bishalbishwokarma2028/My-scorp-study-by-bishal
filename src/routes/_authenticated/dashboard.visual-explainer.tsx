import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Loader2, Eye, Download, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { askAIJSON } from "@/lib/aiProvider";
import { ProviderBadge, QuotaBadge } from "@/components/ai-ui";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { usePageState } from "@/lib/pageState";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/_authenticated/dashboard/visual-explainer")({
  component: VisualExplainerPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type DiagramType = "mindmap" | "flowchart" | "conceptweb";

type MindMapItem   = { label: string; explanation: string };
type MindMapBranch = { label: string; color: string; explanation: string; items: MindMapItem[] };
type MindMapData   = { type: "mindmap"; center: string; centerExplanation: string; branches: MindMapBranch[] };

type FlowchartNode = { id: string; shape: "start" | "process" | "decision" | "end"; label: string; explanation: string };
type FlowchartEdge = { from: string; to: string; label?: string };
type FlowchartData = { type: "flowchart"; title: string; nodes: FlowchartNode[]; edges: FlowchartEdge[] };

type ConceptNode       = { id: string; label: string; type?: string; explanation: string };
type ConceptConnection = { from: string; to: string; label?: string };
type ConceptWebData    = { type: "conceptweb"; nodes: ConceptNode[]; connections: ConceptConnection[] };

type DiagramData = MindMapData | FlowchartData | ConceptWebData;
type SelectedNode = { label: string; explanation: string };

// Validates that the AI's JSON response has a usable shape for each
// diagram type before we accept it — catches malformed/truncated
// responses (especially for Concept Web) so we can retry instead of
// showing a broken diagram or a generic error.
function isValidDiagram(data: unknown): data is DiagramData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (d.type === "mindmap") {
    const branches = d.branches;
    return Array.isArray(branches) && branches.length > 0 &&
      branches.every((b) => b && typeof b === "object" && typeof (b as Record<string, unknown>).label === "string" && Array.isArray((b as Record<string, unknown>).items));
  }
  if (d.type === "flowchart") {
    const nodes = d.nodes, edges = d.edges;
    return Array.isArray(nodes) && nodes.length > 0 && Array.isArray(edges) &&
      nodes.every((n) => n && typeof n === "object" && typeof (n as Record<string, unknown>).id === "string" && typeof (n as Record<string, unknown>).label === "string");
  }
  if (d.type === "conceptweb") {
    const nodes = d.nodes, connections = d.connections;
    if (!Array.isArray(nodes) || nodes.length === 0 || !Array.isArray(connections)) return false;
    const ids = new Set(nodes.map((n) => (n && typeof n === "object" ? (n as Record<string, unknown>).id : undefined)));
    const nodesOk = nodes.every((n) => n && typeof n === "object" && typeof (n as Record<string, unknown>).label === "string" && typeof (n as Record<string, unknown>).id === "string");
    const connsOk = connections.every((c) => c && typeof c === "object" && ids.has((c as Record<string, unknown>).from) && ids.has((c as Record<string, unknown>).to));
    return nodesOk && connsOk;
  }
  return false;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function wrap(text: string, maxPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxPerLine) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur.trim());
  return lines.slice(0, 2);
}

// SVG text — auto-wraps to 2 lines and always centers on (x, y)
function SvgText({ x, y, text, maxChars, fontSize, fill, fontWeight = "normal" }:
  { x: number; y: number; text: string; maxChars: number; fontSize: number; fill: string; fontWeight?: string }) {
  const lines = wrap(text, maxChars);
  const lineH = fontSize * 1.35;
  if (lines.length === 1) {
    return (
      <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
        fontFamily="system-ui,sans-serif" fontSize={fontSize} fill={fill} fontWeight={fontWeight}>
        {lines[0]}
      </text>
    );
  }
  return (
    <text textAnchor="middle" fontFamily="system-ui,sans-serif" fontSize={fontSize} fill={fill} fontWeight={fontWeight}>
      <tspan x={x} y={y - lineH / 2} dominantBaseline="middle">{lines[0]}</tspan>
      <tspan x={x} y={y + lineH / 2} dominantBaseline="middle">{lines[1]}</tspan>
    </text>
  );
}

// ─── Mind Map ─────────────────────────────────────────────────────────────────
// Layout constants — tuned so all nodes stay inside the viewBox for up to 6 branches × 3 sub-items
// SUB_R=480: at top/bottom angles → sy = 650±480 = 170 or 1130; box half-height 26 → 144 or 1156, inside 1300
const MM_W = 1500, MM_H = 1300;
const MM_CX = MM_W / 2, MM_CY = MM_H / 2;   // 750, 650
const BRANCH_R   = 270;   // center → branch
const SUB_R      = 480;   // center → sub-item (reduced so nodes stay inside viewBox)
const SUB_SPREAD = 0.30;  // radians between adjacent sub-items
const MAX_SUBS   = 3;     // cap to guarantee no overlap
const BW = 158, BH = 62;  // branch box size
const SW = 148, SH = 52;  // sub-item box size

function MindMapSVG({ data, onSelect }: { data: MindMapData; onSelect: (n: SelectedNode) => void }) {
  const n = Math.min(data.branches.length, 6);
  const branches = data.branches.slice(0, n).map((b, i) => {
    const angle = (i * 2 * Math.PI / n) - Math.PI / 2;
    const bx = MM_CX + BRANCH_R * Math.cos(angle);
    const by = MM_CY + BRANCH_R * Math.sin(angle);
    return { ...b, angle, bx, by };
  });

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${MM_W} ${MM_H}`} className="w-full h-auto rounded-xl">
      <defs>
        <pattern id="mm-grid" width={44} height={44} patternUnits="userSpaceOnUse">
          <path d="M44,0 L0,0 0,44" fill="none" stroke="#e2e8f0" strokeWidth={0.5} />
        </pattern>
        {branches.map((b, i) => (
          <filter key={i} id={`mm-glow-${i}`} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx={0} dy={3} stdDeviation={6} floodColor={b.color} floodOpacity={0.4} />
          </filter>
        ))}
        <filter id="mm-center-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx={0} dy={4} stdDeviation={10} floodColor="#6366f1" floodOpacity={0.45} />
        </filter>
        <filter id="mm-sub-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx={0} dy={2} stdDeviation={3} floodColor="#0f172a" floodOpacity={0.12} />
        </filter>
      </defs>
      {/* Background */}
      <rect width={MM_W} height={MM_H} fill="#f8fafc" rx={20} />
      <rect width={MM_W} height={MM_H} fill="url(#mm-grid)" rx={20} />

      {/* Lines: center → branches */}
      {branches.map((b, i) => (
        <line key={i} x1={MM_CX} y1={MM_CY} x2={b.bx} y2={b.by}
          stroke={b.color} strokeWidth={2.5} strokeOpacity={0.45} strokeLinecap="round"
          strokeDasharray="7 4" />
      ))}

      {/* Lines: branches → sub-items */}
      {branches.map((b, i) =>
        b.items.slice(0, MAX_SUBS).map((item, j) => {
          const count = Math.min(b.items.length, MAX_SUBS);
          const subAngle = b.angle + (j - (count - 1) / 2) * SUB_SPREAD;
          const sx = MM_CX + SUB_R * Math.cos(subAngle);
          const sy = MM_CY + SUB_R * Math.sin(subAngle);
          return (
            <line key={`line-${i}-${j}`} x1={b.bx} y1={b.by} x2={sx} y2={sy}
              stroke={b.color} strokeWidth={1.6} strokeOpacity={0.35} strokeLinecap="round" />
          );
        })
      )}

      {/* Sub-item nodes */}
      {branches.map((b, i) =>
        b.items.slice(0, MAX_SUBS).map((item, j) => {
          const count = Math.min(b.items.length, MAX_SUBS);
          const subAngle = b.angle + (j - (count - 1) / 2) * SUB_SPREAD;
          const sx = MM_CX + SUB_R * Math.cos(subAngle);
          const sy = MM_CY + SUB_R * Math.sin(subAngle);
          return (
            <g key={`sub-${i}-${j}`}
              onClick={() => onSelect({ label: item.label, explanation: item.explanation })}
              style={{ cursor: "pointer" }} filter="url(#mm-sub-shadow)">
              {/* Outer glow ring */}
              <rect x={sx - SW / 2 - 3} y={sy - SH / 2 - 3} width={SW + 6} height={SH + 6}
                rx={SH / 2 + 3} fill={b.color} opacity={0.15} />
              <rect x={sx - SW / 2} y={sy - SH / 2} width={SW} height={SH}
                rx={SH / 2} fill="white" stroke={b.color} strokeWidth={2} />
              <SvgText x={sx} y={sy} text={item.label} maxChars={16} fontSize={10.5} fill="#1e293b" />
              {/* Click dot */}
              <circle cx={sx + SW / 2 - 9} cy={sy - SH / 2 + 9} r={3.5} fill={b.color} opacity={0.7} />
            </g>
          );
        })
      )}

      {/* Branch nodes */}
      {branches.map((b, i) => (
        <g key={`branch-${i}`}
          onClick={() => onSelect({ label: b.label, explanation: b.explanation })}
          style={{ cursor: "pointer" }} filter={`url(#mm-glow-${i})`}>
          <rect x={b.bx - BW / 2} y={b.by - BH / 2} width={BW} height={BH}
            rx={BH / 2} fill={b.color} />
          {/* Inner highlight */}
          <rect x={b.bx - BW / 2 + 3} y={b.by - BH / 2 + 3} width={BW - 6} height={BH - 6}
            rx={BH / 2 - 3} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1.5} />
          <SvgText x={b.bx} y={b.by} text={b.label} maxChars={14} fontSize={12}
            fill="white" fontWeight="bold" />
          <circle cx={b.bx + BW / 2 - 11} cy={b.by - BH / 2 + 11} r={4.5}
            fill="rgba(255,255,255,0.55)" />
        </g>
      ))}

      {/* Center node */}
      <g onClick={() => onSelect({ label: data.center, explanation: data.centerExplanation })}
        style={{ cursor: "pointer" }} filter="url(#mm-center-glow)">
        <ellipse cx={MM_CX} cy={MM_CY} rx={100} ry={50} fill="#1e293b" />
        <ellipse cx={MM_CX} cy={MM_CY} rx={93} ry={43} fill="none"
          stroke="rgba(255,255,255,0.2)" strokeWidth={2} />
        <SvgText x={MM_CX} y={MM_CY} text={data.center} maxChars={20} fontSize={14}
          fill="white" fontWeight="bold" />
        <circle cx={MM_CX + 90} cy={MM_CY - 40} r={6} fill="#6366f1" opacity={0.9} />
      </g>

      <text x={18} y={MM_H - 16} fontSize={11} fill="#94a3b8" fontFamily="system-ui,sans-serif">
        Click any node to see its full explanation
      </text>
    </svg>
  );
}

// ─── Flowchart ────────────────────────────────────────────────────────────────
function FlowchartSVG({ data, onSelect }: { data: FlowchartData; onSelect: (n: SelectedNode) => void }) {
  const W = 720;
  const NW = 200, NH = 52;
  const VGAP = 100;
  const cx = W / 2;

  const nodeMap: Record<string, FlowchartNode> = {};
  data.nodes.forEach(n => { nodeMap[n.id] = n; });

  const outEdges: Record<string, FlowchartEdge[]> = {};
  data.edges.forEach(e => { (outEdges[e.from] = outEdges[e.from] || []).push(e); });

  const visited = new Set<string>(), order: string[] = [];
  function walk(id: string) {
    if (visited.has(id)) return; visited.add(id); order.push(id);
    (outEdges[id] || []).forEach(e => walk(e.to));
  }
  if (data.nodes[0]) walk(data.nodes[0].id);
  data.nodes.forEach(n => { if (!visited.has(n.id)) { visited.add(n.id); order.push(n.id); } });

  const posMap: Record<string, { x: number; y: number }> = {};
  order.forEach((id, i) => { posMap[id] = { x: cx, y: 80 + i * VGAP }; });

  const H = Math.max(560, order.length * VGAP + 140);

  const colors: Record<string, { fill: string; stroke: string; text: string }> = {
    start:    { fill: "#10b981", stroke: "#059669", text: "white" },
    end:      { fill: "#ef4444", stroke: "#dc2626", text: "white" },
    process:  { fill: "#3b82f6", stroke: "#2563eb", text: "white" },
    decision: { fill: "#f59e0b", stroke: "#d97706", text: "white" },
  };

  function bottomOf(id: string) {
    const p = posMap[id], n = nodeMap[id];
    if (!p || !n) return { x: 0, y: 0 };
    if (n.shape === "decision") return { x: p.x, y: p.y + NH / 2 + 10 };
    return { x: p.x, y: p.y + NH / 2 };
  }
  function topOf(id: string) {
    const p = posMap[id], n = nodeMap[id];
    if (!p || !n) return { x: 0, y: 0 };
    if (n.shape === "decision") return { x: p.x, y: p.y - NH / 2 - 10 };
    return { x: p.x, y: p.y - NH / 2 };
  }

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-xl">
      <defs>
        <marker id="fc-arr" markerWidth={9} markerHeight={9} refX={7} refY={4.5} orient="auto">
          <path d="M0,0 L9,4.5 L0,9 z" fill="#64748b" />
        </marker>
        <filter id="fc-shadow">
          <feDropShadow dx={0} dy={2} stdDeviation={4} floodColor="#0f172a" floodOpacity={0.15} />
        </filter>
      </defs>
      <rect width={W} height={H} fill="#f8fafc" rx={20} />
      <text x={W / 2} y={36} textAnchor="middle" fontSize={15} fontWeight="bold"
        fill="#1e293b" fontFamily="system-ui,sans-serif">{data.title}</text>

      {/* Edges */}
      {data.edges.map((e, i) => {
        const from = posMap[e.from], to = posMap[e.to]; if (!from || !to) return null;
        const bot = bottomOf(e.from), top = topOf(e.to);
        const going_down = bot.y < top.y;
        const my = (bot.y + top.y) / 2;
        const d = going_down
          ? `M${bot.x},${bot.y} L${bot.x},${my} L${top.x},${my} L${top.x},${top.y - 7}`
          : `M${bot.x},${bot.y} Q${bot.x + 60},${bot.y + 30} ${top.x + 70},${my} L${top.x},${top.y - 7}`;
        return (
          <g key={i}>
            <path d={d} fill="none" stroke="#94a3b8" strokeWidth={2} markerEnd="url(#fc-arr)" />
            {e.label && <text x={(bot.x + top.x) / 2 + 8} y={(bot.y + top.y) / 2}
              fontSize={10} fill="#64748b" fontFamily="system-ui,sans-serif">{e.label}</text>}
          </g>
        );
      })}

      {/* Nodes */}
      {data.nodes.map(node => {
        const p = posMap[node.id]; if (!p) return null;
        const c = colors[node.shape] || colors.process;
        const isRound = node.shape === "start" || node.shape === "end";

        if (node.shape === "decision") {
          const dw = 110, dh = NH / 2 + 10;
          const pts = `${p.x},${p.y - dh} ${p.x + dw},${p.y} ${p.x},${p.y + dh} ${p.x - dw},${p.y}`;
          return (
            <g key={node.id} onClick={() => onSelect({ label: node.label, explanation: node.explanation })}
              style={{ cursor: "pointer" }} filter="url(#fc-shadow)">
              <polygon points={pts} fill={c.fill} stroke={c.stroke} strokeWidth={2} />
              <SvgText x={p.x} y={p.y} text={node.label} maxChars={18} fontSize={10.5} fill={c.text} fontWeight="bold" />
              <circle cx={p.x + dw - 16} cy={p.y - dh + 12} r={4} fill="rgba(255,255,255,0.5)" />
            </g>
          );
        }

        return (
          <g key={node.id} onClick={() => onSelect({ label: node.label, explanation: node.explanation })}
            style={{ cursor: "pointer" }} filter="url(#fc-shadow)">
            <rect x={p.x - NW / 2} y={p.y - NH / 2} width={NW} height={NH}
              rx={isRound ? NH / 2 : 10} fill={c.fill} stroke={c.stroke} strokeWidth={2} />
            <SvgText x={p.x} y={p.y} text={node.label} maxChars={22} fontSize={11.5} fill={c.text} fontWeight={isRound ? "bold" : "normal"} />
            <circle cx={p.x + NW / 2 - 12} cy={p.y - NH / 2 + 10} r={4} fill="rgba(255,255,255,0.5)" />
          </g>
        );
      })}

      <text x={16} y={H - 14} fontSize={10} fill="#94a3b8" fontFamily="system-ui,sans-serif">
        Click any shape to see its explanation
      </text>
    </svg>
  );
}

// ─── Concept Web ──────────────────────────────────────────────────────────────
function ConceptWebSVG({ data, onSelect }: { data: ConceptWebData; onSelect: (n: SelectedNode) => void }) {
  const W = 860, H = 720;
  const cx = W / 2, cy = H / 2;
  const ORBIT_R = 240;
  const PALETTE = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];

  const centerNode = data.nodes.find(n => n.id === "center" || n.type === "main") || data.nodes[0];
  const secondary  = data.nodes.filter(n => n.id !== centerNode?.id);
  const nSec = secondary.length;

  const posMap: Record<string, { x: number; y: number }> = {};
  if (centerNode) posMap[centerNode.id] = { x: cx, y: cy };
  secondary.forEach((nd, i) => {
    const angle = (i * 2 * Math.PI / nSec) - Math.PI / 2;
    posMap[nd.id] = { x: cx + ORBIT_R * Math.cos(angle), y: cy + ORBIT_R * Math.sin(angle) };
  });

  const nodeColor: Record<string, string> = {};
  secondary.forEach((nd, i) => { nodeColor[nd.id] = PALETTE[i % PALETTE.length]; });

  const C_R = 70, S_R = 52;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-xl">
      <defs>
        {PALETTE.map((color, i) => (
          <marker key={i} id={`cw-arr-${i}`} markerWidth={7} markerHeight={7} refX={6} refY={3.5} orient="auto">
            <path d="M0,0 L7,3.5 L0,7 z" fill={color} />
          </marker>
        ))}
        <filter id="cw-shadow">
          <feDropShadow dx={0} dy={3} stdDeviation={6} floodColor="#0f172a" floodOpacity={0.2} />
        </filter>
        <filter id="cw-center-shadow">
          <feDropShadow dx={0} dy={4} stdDeviation={10} floodColor="#6366f1" floodOpacity={0.45} />
        </filter>
        <pattern id="cw-grid" width={44} height={44} patternUnits="userSpaceOnUse">
          <path d="M44,0 L0,0 0,44" fill="none" stroke="#e2e8f0" strokeWidth={0.6} />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="#f8fafc" rx={20} />
      <rect width={W} height={H} fill="url(#cw-grid)" rx={20} />

      {/* Connections */}
      {data.connections.map((conn, i) => {
        const from = posMap[conn.from], to = posMap[conn.to]; if (!from || !to) return null;
        const dx = to.x - from.x, dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const r1 = conn.from === centerNode?.id ? C_R : S_R;
        const r2 = conn.to   === centerNode?.id ? C_R : S_R;
        const sx = from.x + (dx / len) * r1, sy = from.y + (dy / len) * r1;
        const ex = to.x   - (dx / len) * (r2 + 9), ey = to.y - (dy / len) * (r2 + 9);
        const mx = (sx + ex) / 2, my = (sy + ey) / 2;
        const colorIdx = secondary.findIndex(nd => nd.id === conn.from || nd.id === conn.to);
        const ci = Math.max(colorIdx, 0) % PALETTE.length;
        const color = PALETTE[ci];
        return (
          <g key={i}>
            <line x1={sx} y1={sy} x2={ex} y2={ey}
              stroke={color} strokeWidth={2} strokeOpacity={0.6} markerEnd={`url(#cw-arr-${ci})`} />
            {conn.label && (
              <>
                <rect x={mx - 24} y={my - 9} width={48} height={16} rx={5}
                  fill="white" fillOpacity={0.92} stroke={color} strokeWidth={0.8} strokeOpacity={0.5} />
                <text x={mx} y={my + 1} textAnchor="middle" dominantBaseline="middle"
                  fontSize={9} fill={color} fontFamily="system-ui,sans-serif" fontWeight="600">
                  {conn.label}
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* Secondary nodes */}
      {secondary.map(nd => {
        const p = posMap[nd.id]; if (!p) return null;
        const color = nodeColor[nd.id];
        return (
          <g key={nd.id} onClick={() => onSelect({ label: nd.label, explanation: nd.explanation })}
            style={{ cursor: "pointer" }} filter="url(#cw-shadow)">
            <circle cx={p.x} cy={p.y} r={S_R + 4} fill={color} opacity={0.18} />
            <circle cx={p.x} cy={p.y} r={S_R} fill={color} />
            <circle cx={p.x} cy={p.y} r={S_R - 4} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} />
            <SvgText x={p.x} y={p.y} text={nd.label} maxChars={12} fontSize={10.5} fill="white" fontWeight="bold" />
            <circle cx={p.x + S_R - 10} cy={p.y - S_R + 10} r={4} fill="rgba(255,255,255,0.55)" />
          </g>
        );
      })}

      {/* Center node */}
      {centerNode && posMap[centerNode.id] && (
        <g onClick={() => onSelect({ label: centerNode.label, explanation: centerNode.explanation })}
          style={{ cursor: "pointer" }} filter="url(#cw-center-shadow)">
          <circle cx={cx} cy={cy} r={C_R + 6} fill="#1e293b" opacity={0.15} />
          <circle cx={cx} cy={cy} r={C_R} fill="#1e293b" />
          <circle cx={cx} cy={cy} r={C_R - 5} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={2} />
          <SvgText x={cx} y={cy} text={centerNode.label} maxChars={14} fontSize={13} fill="white" fontWeight="bold" />
          <circle cx={cx + C_R - 12} cy={cy - C_R + 12} r={5} fill="#6366f1" opacity={0.8} />
        </g>
      )}

      <text x={16} y={H - 14} fontSize={10} fill="#94a3b8" fontFamily="system-ui,sans-serif">
        Click any node to see its explanation
      </text>
    </svg>
  );
}

// ─── Explanation Panel ────────────────────────────────────────────────────────
function ExplanationPanel({ node, onClose }: { node: SelectedNode; onClose: () => void }) {
  return (
    <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-violet-50 p-5 space-y-2 relative shadow-lg animate-in slide-in-from-top-2 duration-200">
      <button onClick={onClose}
        className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-accent">
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="pr-8">
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-1">Explanation</p>
        <h3 className="text-base font-bold text-foreground">{node.label}</h3>
      </div>
      <div className="text-sm leading-relaxed text-foreground/90 [&_p]:my-1.5">
        <ReactMarkdown
          components={{
            strong: ({ children }) => (
              <mark className="bg-yellow-200/80 text-yellow-900 px-0.5 rounded-sm font-semibold not-italic">{children}</mark>
            ),
          }}
        >
          {node.explanation}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// ─── Prompt builders ──────────────────────────────────────────────────────────
function buildPrompt(topic: string, type: DiagramType): string {
  const rule = `Return STRICT JSON only — no markdown fences, no prose outside JSON, and make sure the JSON is fully valid and complete (all brackets and quotes closed). Labels must be SHORT (max 14 chars). Each "explanation" field must be LONG and detailed — at least 100-140 words (9-11 full sentences) that thoroughly teach the concept to a student, including a concrete example or analogy. Inside each explanation string, wrap key terms, numbers, and important facts in **double asterisks** (markdown bold) so they stand out — use at least 3-4 bolded phrases per explanation.`;

  if (type === "mindmap") {
    return `Generate a comprehensive educational mind map for: "${topic}"

${rule}
{
  "type": "mindmap",
  "center": "Short topic label (max 16 chars)",
  "centerExplanation": "5-6 sentences explaining the overall topic in simple, educational terms for a student.",
  "branches": [
    {
      "label": "Branch Name",
      "color": "#6366f1",
      "explanation": "5-6 sentences explaining what this branch represents and why it matters.",
      "items": [
        { "label": "Sub-item", "explanation": "5-6 sentences explaining this specific sub-concept clearly." }
      ]
    }
  ]
}
Requirements:
- Exactly 5-6 branches
- 3-4 items per branch
- Branch labels max 12 chars, item labels max 13 chars
- Use these branch colors in order: "#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6"
- Every explanation must be genuinely educational and 5-6 complete sentences`;
  }

  if (type === "flowchart") {
    return `Generate a step-by-step educational flowchart for: "${topic}"

${rule}
{
  "type": "flowchart",
  "title": "How ${topic} Works",
  "nodes": [
    { "id": "1", "shape": "start",    "label": "Start",       "explanation": "5-6 sentences explaining the starting state or trigger." },
    { "id": "2", "shape": "process",  "label": "Step name",   "explanation": "5-6 sentences explaining what happens in this step." },
    { "id": "3", "shape": "decision", "label": "Condition?",  "explanation": "5-6 sentences explaining what this decision checks and why it matters." },
    { "id": "4", "shape": "process",  "label": "Yes path",    "explanation": "5-6 sentences explaining what happens on the Yes path." },
    { "id": "5", "shape": "process",  "label": "No path",     "explanation": "5-6 sentences explaining what happens on the No path." },
    { "id": "6", "shape": "end",      "label": "End",         "explanation": "5-6 sentences explaining the final outcome or result." }
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
Requirements:
- 6-9 nodes total; always start with shape "start" and end with "end"
- Node labels max 20 chars
- Decision nodes have exactly 2 outgoing edges labeled "Yes"/"No"
- Every node connected; all explanations 5-6 sentences`;
  }

  return `Generate a concept web / knowledge graph for: "${topic}"

${rule}
{
  "type": "conceptweb",
  "nodes": [
    { "id": "center", "label": "Main Topic", "type": "main", "explanation": "5-6 sentences about the overall concept." },
    { "id": "n1", "label": "Concept A", "explanation": "5-6 sentences about this concept." },
    { "id": "n2", "label": "Concept B", "explanation": "5-6 sentences about this concept." },
    { "id": "n3", "label": "Concept C", "explanation": "5-6 sentences about this concept." },
    { "id": "n4", "label": "Concept D", "explanation": "5-6 sentences about this concept." },
    { "id": "n5", "label": "Concept E", "explanation": "5-6 sentences about this concept." },
    { "id": "n6", "label": "Concept F", "explanation": "5-6 sentences about this concept." }
  ],
  "connections": [
    { "from": "center", "to": "n1", "label": "causes" },
    { "from": "center", "to": "n2", "label": "requires" },
    { "from": "n1",     "to": "n3", "label": "leads to" },
    { "from": "n2",     "to": "n4", "label": "produces" },
    { "from": "n3",     "to": "n5", "label": "enables" },
    { "from": "n4",     "to": "n6", "label": "affects" }
  ]
}
Requirements:
- 1 center + 5-7 secondary nodes
- Node labels max 13 chars; connection labels max 11 chars (short verbs)
- All explanations 5-6 complete educational sentences`;
}

// ─── Diagram type options ─────────────────────────────────────────────────────
const DIAGRAM_TYPES: { id: DiagramType; label: string; icon: string; description: string }[] = [
  { id: "mindmap",    label: "Mind Map",    icon: "🧠", description: "Radial branches from a central topic — great for overviews and recall" },
  { id: "flowchart",  label: "Flowchart",   icon: "🔀", description: "Step-by-step process with decisions — great for understanding procedures" },
  { id: "conceptweb", label: "Concept Web", icon: "🕸️", description: "Interconnected ideas with labeled relationships — great for complex topics" },
];

const EXAMPLE_TOPICS = [
  "Photosynthesis", "TCP/IP Network Model", "French Revolution",
  "How a Computer Boots Up", "DNA Replication", "Supply and Demand",
  "Machine Learning Pipeline", "Human Digestive System",
];

// Keywords that suggest a process-flow / flowchart topic
const PROCESS_KEYWORDS = /\b(how|process|steps?|workflow|procedure|algorithm|sequence|stages?|phases?|works?|mechanism|cycle|pipeline|protocol)\b/i;

// ─── Page ─────────────────────────────────────────────────────────────────────
function VisualExplainerPage() {
  const { user } = Route.useRouteContext();

  // Persisted state across route changes
  const [s, set] = usePageState("visual-explainer", {
    topic:       "",
    diagramType: "mindmap" as DiagramType,
    diagram:     null as DiagramData | null,
    provider:    null as string | null,
  });

  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "cerebras");

  // Restore from History navigation
  useEffect(() => {
    const raw = sessionStorage.getItem("scorp_visual_restore");
    if (raw) {
      try { set(JSON.parse(raw)); } catch {}
      sessionStorage.removeItem("scorp_visual_restore");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTopicChange(val: string) {
    set({ topic: val });
    // Auto-suggest flowchart if topic looks like a process question
    if (PROCESS_KEYWORDS.test(val) && s.diagramType === "mindmap") {
      set({ diagramType: "flowchart" });
      toast("💡 Switched to Flowchart — looks like a process question!", { duration: 2500 });
    }
  }

  async function generate() {
    if (!s.topic.trim()) return toast.error("Enter a topic first");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true); set({ diagram: null }); setSelected(null);
    const prompt = buildPrompt(s.topic.trim(), s.diagramType);

    let parsed: DiagramData | null = null;
    let prov = "";
    // Up to 3 attempts total — extra resilience for the more complex
    // Concept Web schema, which occasionally comes back malformed.
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await askAIJSON<DiagramData>(
        attempt === 0 ? prompt : `${prompt}\n\nIMPORTANT: Your previous attempt returned invalid or incomplete JSON. Double-check every bracket, comma, and quote before responding. Output ONLY the raw JSON object.`,
        undefined, undefined, true, undefined, true,
      );
      prov = result.provider || prov;
      if (result.data && isValidDiagram(result.data)) {
        parsed = result.data;
        break;
      }
    }

    set({ provider: prov });
    await bump();
    if (!parsed) {
      toast.error("Couldn't generate diagram — please try again or rephrase your topic");
    } else {
      set({ diagram: parsed });
      // Save to mindmaps history (non-blocking)
      supabase.from("mindmaps").insert({
        user_id: user.id,
        topic: s.topic.trim(),
        map_data: parsed as never,
      }).then(() => {});
    }
    setLoading(false);
  }

  function downloadSVG() {
    const svgEl = svgRef.current?.querySelector("svg");
    if (!svgEl) return;
    const blob = new Blob([svgEl.outerHTML], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${s.topic.slice(0, 30).replace(/\s+/g, "-")}-${s.diagramType}.svg`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("SVG downloaded");
  }

  const diagramInfo = DIAGRAM_TYPES.find(d => d.id === s.diagramType);

  return (
    <div className="space-y-5 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Eye className="h-5 w-5 text-primary" /> Visual Explainer
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Generate interactive visual diagrams — click any node to get a full explanation
          </p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      {/* Input */}
      <div className="card-soft p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Topic or Concept</label>
          <input
            value={s.topic}
            onChange={(e) => handleTopicChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !loading) generate(); }}
            placeholder="e.g. How photosynthesis works, TCP/IP model, French Revolution causes…"
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLE_TOPICS.map(t => (
              <button key={t} onClick={() => { set({ topic: t, diagram: null }); setSelected(null); }}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:bg-accent">{t}</button>
            ))}
          </div>
        </div>

        {/* Diagram type */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Diagram Type</label>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {DIAGRAM_TYPES.map(({ id, label, icon, description }) => (
              <button key={id} onClick={() => set({ diagramType: id })}
                className={`rounded-xl border p-3 text-left transition-colors ${s.diagramType === id ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{icon}</span>
                  <span className={`text-sm font-semibold ${s.diagramType === id ? "text-primary" : ""}`}>{label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">{description}</p>
              </button>
            ))}
          </div>
        </div>

        <button onClick={generate} disabled={loading || !s.topic.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating {diagramInfo?.label}…</>
            : <><Eye className="h-4 w-4" /> Generate {diagramInfo?.label}</>}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="card-soft flex flex-col items-center gap-3 py-16 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-semibold">Building your {diagramInfo?.icon} {diagramInfo?.label}…</p>
          <p className="text-xs text-muted-foreground">AI is structuring the concept and writing explanations for each node</p>
        </div>
      )}

      {/* Diagram output */}
      {!loading && s.diagram && (
        <div className="space-y-4">
          {/* Title bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-sm font-semibold">{s.topic}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                — {diagramInfo?.icon} {diagramInfo?.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ProviderBadge provider={s.provider} />
              <button onClick={downloadSVG}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent">
                <Download className="h-3 w-3" /> Download SVG
              </button>
              <button onClick={() => { set({ diagram: null }); setSelected(null); }}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent">
                <RefreshCw className="h-3 w-3" /> Regenerate
              </button>
            </div>
          </div>

          {/* Explanation panel */}
          {selected && <ExplanationPanel node={selected} onClose={() => setSelected(null)} />}

          {/* Prompt if not clicked yet */}
          {!selected && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-4 py-2.5 text-xs text-primary">
              <span className="text-base">👆</span>
              <span>Click any <strong>node, branch, or box</strong> in the diagram to read its full explanation</span>
            </div>
          )}

          {/* SVG */}
          <div ref={svgRef} className="rounded-xl border border-border overflow-x-auto overflow-y-hidden bg-slate-50 -mx-1 px-1">
            {s.diagram.type === "mindmap"    && <MindMapSVG    data={s.diagram as MindMapData}    onSelect={setSelected} />}
            {s.diagram.type === "flowchart"  && <FlowchartSVG  data={s.diagram as FlowchartData}  onSelect={setSelected} />}
            {s.diagram.type === "conceptweb" && <ConceptWebSVG data={s.diagram as ConceptWebData} onSelect={setSelected} />}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            💡 Download the SVG to use in notes or presentations
          </p>
        </div>
      )}

      {/* Tips */}
      {!loading && !s.diagram && (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold mb-2 text-muted-foreground">💡 Tips for best results</p>
          <div className="grid gap-1 sm:grid-cols-2 text-xs text-muted-foreground">
            <span>• Use <strong>Mind Map</strong> for overviews and revision</span>
            <span>• Use <strong>Flowchart</strong> for processes, algorithms, and steps</span>
            <span>• Use <strong>Concept Web</strong> for interconnected ideas</span>
            <span>• <strong>Click any node</strong> after generating to read its explanation</span>
          </div>
        </div>
      )}
    </div>
  );
}
