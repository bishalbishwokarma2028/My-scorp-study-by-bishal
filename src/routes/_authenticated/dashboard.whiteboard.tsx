import { createFileRoute } from "@tanstack/react-router";
import React, { useRef, useState, useEffect, useCallback, useLayoutEffect } from "react";
import { toast } from "sonner";
import { askAIServer } from "@/lib/aiProvider.functions";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge } from "@/components/ai-ui";
import {
  Pen, Eraser, MousePointer2, Type, Minus, Square, Circle,
  Undo2, Redo2, Trash2, ChevronLeft, ChevronRight, Plus,
  Maximize2, Minimize2, Grid3x3, Sun, Moon, Send, Download,
  MessageCircle, X, ZoomIn, ZoomOut, Sparkles, CheckCircle2,
  AlertTriangle, Lightbulb, BookOpen, Hash, Highlighter,
  MoveRight, Triangle, Dot, PanelRightClose, PanelRightOpen,
  CopyPlus, Play, Pause, SkipForward, Gauge, Mic, MicOff,
  Clipboard, RotateCcw, FlaskConical, Sigma, Atom, Dna, Code2,
  Clock, Globe, BarChart3, ChevronDown, ChevronUp,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/whiteboard")({
  component: WhiteboardPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type Tool = "pen" | "pencil" | "highlighter" | "eraser" | "select"
          | "text" | "line" | "arrow" | "rect" | "circle" | "triangle" | "laser" | "diagram";

type BgMode  = "blank" | "grid" | "dots";
type Theme   = "light" | "dark";
type Speed   = "slow" | "normal" | "fast";
type AnimPhase = "idle" | "running" | "paused" | "done";

interface Pt { x: number; y: number }

interface DrawEl {
  id: string; tool: Tool; points: Pt[];
  color: string; strokeWidth: number; opacity: number;
  fontSize?: number; text?: string; page: number;
  x1?: number; y1?: number; x2?: number; y2?: number;
}

type TeachType = "title" | "explain" | "formula" | "step"
               | "answer" | "tip" | "warning" | "definition" | "separator" | "diagram" | "table";

interface TeachStep {
  id: string; type: TeachType; text: string;
  num?: number; fullText: string; revealed: number;
}

interface ConvMsg { role: "user" | "assistant"; content: string }

// ─── Load handwriting font ────────────────────────────────────────────────────

function useHandwritingFont() {
  useEffect(() => {
    if (document.getElementById("hw-font")) return;
    const link = document.createElement("link");
    link.id   = "hw-font";
    link.rel  = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap";
    document.head.appendChild(link);
  }, []);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = {
  blue: "#3B82F6", green: "#22C55E", red: "#EF4444",
  orange: "#F97316", purple: "#A855F7", yellow: "#EAB308",
  black: "#1E293B", white: "#F8FAFC", gray: "#64748B",
  pink: "#EC4899", teal: "#14B8A6",
};

const TYPE_COLOR: Record<TeachType, string> = {
  title: COLORS.blue, explain: COLORS.black, formula: "#C0392B",
  step: COLORS.blue, answer: COLORS.green, tip: COLORS.orange,
  warning: COLORS.red, definition: COLORS.purple, separator: COLORS.gray,
  diagram: COLORS.teal, table: "#7C3AED",
};

const DARK_TYPE_BG: Record<TeachType, string> = {
  title: "bg-blue-900/40 border-blue-600",
  explain: "bg-slate-800/70 border-slate-600",
  formula: "bg-red-900/40 border-red-700",
  step: "bg-blue-900/30 border-blue-700",
  answer: "bg-green-900/40 border-green-600",
  tip: "bg-orange-900/40 border-orange-600",
  warning: "bg-red-900/40 border-red-600",
  definition: "bg-violet-900/40 border-violet-600",
  separator: "bg-transparent border-transparent",
  diagram: "bg-teal-900/40 border-teal-600",
  table: "bg-violet-900/40 border-violet-600",
};
const LIGHT_TYPE_BG: Record<TeachType, string> = {
  title: "bg-blue-50 border-blue-300",
  explain: "bg-white border-gray-200",
  formula: "bg-red-50 border-red-300",
  step: "bg-blue-50 border-blue-200",
  answer: "bg-green-50 border-green-300",
  tip: "bg-orange-50 border-orange-300",
  warning: "bg-red-50 border-red-300",
  definition: "bg-violet-50 border-violet-300",
  separator: "bg-transparent border-transparent",
  diagram: "bg-teal-50 border-teal-300",
  table: "bg-violet-50 border-violet-300",
};

const TYPE_LABEL: Record<TeachType, string> = {
  title: "Topic", explain: "Explanation", formula: "Formula",
  step: "Step", answer: "Answer", tip: "Pro Tip",
  warning: "Watch Out", definition: "Definition", separator: "", diagram: "Diagram",
  table: "Comparison Table",
};

const PRESET_COLORS = [
  COLORS.black, COLORS.blue, COLORS.green, COLORS.red,
  COLORS.orange, COLORS.purple, COLORS.yellow, COLORS.pink,
  COLORS.teal, COLORS.gray, "#8B5CF6", COLORS.white,
];
const STROKE_WIDTHS = [2, 4, 6, 10, 16];

// Speed → ms per character, ms between steps
const SPEED_CONFIG: Record<Speed, { charMs: number; stepMs: number }> = {
  slow:   { charMs: 65,  stepMs: 900  },
  normal: { charMs: 28,  stepMs: 450  },
  fast:   { charMs: 8,   stepMs: 100  },
};

const SUBJECTS = [
  { label: "Maths",    icon: <Sigma size={12} />,       q: "Explain " },
  { label: "Physics",  icon: <Atom size={12} />,        q: "Explain the physics of " },
  { label: "Chemistry",icon: <FlaskConical size={12} />, q: "Explain the chemistry of " },
  { label: "Biology",  icon: <Dna size={12} />,         q: "Explain the biology of " },
  { label: "CS",       icon: <Code2 size={12} />,       q: "Explain the concept of " },
  { label: "History",  icon: <Clock size={12} />,       q: "Explain the historical significance of " },
  { label: "Geography",icon: <Globe size={12} />,       q: "Explain the geography of " },
  { label: "Economics",icon: <BarChart3 size={12} />,   q: "Explain the economics of " },
];

const FOLLOWUP_CHIPS = [
  "Explain more simply",
  "Give a real-life example",
  "Show a different method",
  "What are common mistakes?",
  "Give me a shortcut",
  "Summarise in 3 points",
  "Create a quiz on this",
  "Go deeper into this topic",
];

// ─── AI prompt ────────────────────────────────────────────────────────────────

function buildTeachingPrompt(q: string, history: ConvMsg[]): string {
  const ctx = history.length > 0
    ? "\n\nPrevious context:\n" +
      history.slice(-4).map(m => `[${m.role}]: ${m.content.slice(0, 500)}`).join("\n")
    : "";

  // Detect question intent to guide AI format selection
  const ql = q.toLowerCase();
  const isComparison = /\b(differ|difference|compare|vs\.?|versus|contrast|between .* and|which is better|pros.{0,10}cons)\b/.test(ql);
  const isVisual = /\b(triangle|circle|wave|force|graph|axes|coordinate|sine|cosine|dna|helix|bar chart|histogram|geometry|trigonometry|physics|projectile|vector|frequency|amplitude)\b/.test(ql);

  const comparisonHint = isComparison
    ? `\n\nIMPORTANT: The student is asking for a COMPARISON. You MUST include exactly one "table" step that shows the comparison in two columns. Do NOT skip the table.`
    : "";
  const visualHint = isVisual
    ? `\n\nThe topic is visual — consider whether a diagram genuinely helps understanding. If so, include ONE appropriate diagram step.`
    : `\n\nThe topic is NOT visual — do NOT include any diagram steps.`;

  return `You are Bishal's expert AI teacher writing on an interactive whiteboard. A student asked:
"${q}"${ctx}${comparisonHint}${visualHint}

FIRST, silently analyse the question:
1. Is it a comparison/difference question? → Use a "table" step.
2. Is it a visual/geometric/physics topic? → Use ONE relevant "diagram" step.
3. Is it algebra, history, language, or any non-visual topic? → NO diagram steps at all.
4. Does it have a worked solution? → Use numbered "step" steps.

Return ONLY valid JSON (no markdown, no prose outside the JSON) in this exact structure:
{
  "topic": "short topic title",
  "steps": [
    {"type":"title","text":"..."},
    {"type":"explain","text":"..."},
    {"type":"definition","text":"..."},
    {"type":"diagram","text":"right-triangle:a,b,c"},
    {"type":"table","text":"Feature|Description\\nRow1Col1|Row1Col2\\nRow2Col1|Row2Col2"},
    {"type":"formula","text":"..."},
    {"type":"step","num":1,"text":"..."},
    {"type":"answer","text":"..."},
    {"type":"tip","text":"..."}
  ]
}

Step type rules:
- "title"      → Topic heading — always the very first step. Make it descriptive.
- "explain"    → Deep explanation of the concept. Write 3-5 sentences like a real teacher. Cover the WHY not just the WHAT. Be thorough.
- "definition" → Define a key term in full detail. Include origin, meaning, and context. 2-4 sentences.
- "formula"    → A formula, equation or rule. Show derivation context, not just the bare formula.
- "step"       → Numbered solution steps (include "num": N). Each step must be 2-4 sentences with reasoning. Explain WHY, not just WHAT.
- "answer"     → Final answer with full verification. Explain what the answer means in context. Always the last meaningful step.
- "tip"        → Shortcut, memory aid, or real-world connection — 2-3 sentences.
- "warning"    → Common mistake to avoid with explanation of WHY it is wrong — 2-3 sentences.
- "table"      → A two-column comparison or reference table. Use ONLY for: comparison questions, difference questions, pros/cons, properties lists, or "X vs Y" questions. Format: pipe-separated columns, backslash-n between rows. First row = bold headers. Example: "Property|Value\\nColor|Red\\nSize|Large". Maximum 8 rows. Do NOT use table for worked solutions or simple explanations.
- "diagram"    → Draw a subject-appropriate visual. STRICT RULES — only include when the visual DIRECTLY illustrates the concept being taught:
    • Geometry / trigonometry → right-triangle, circle, axes, number-line
    • Physics (forces, motion) → force-diagram, axes
    • Waves / oscillations → wave
    • Biology (genetics) → dna
    • Statistics / data sets → bar-chart
    • Graphing functions → axes
    The text value must be EXACTLY one of (copy precisely):
      right-triangle:a,b,c   → right-angle triangle labeled a, b, c (hypotenuse)
      axes:x,y               → coordinate plane with labeled axes
      number-line:-5,5       → number line (replace -5,5 with actual range)
      circle:r               → circle with radius r labeled
      force-diagram:F,mg,N   → free-body force arrows (replace labels with actual forces)
      bar-chart:A,B,C        → bar chart (replace A,B,C with actual category names)
      dna:double-helix       → DNA double helix
      wave:sine              → sine wave with axes
    FORBIDDEN: Do NOT use diagram for algebra, calculus (non-graphing), chemistry equations, history, language, grammar, literature, definitions, or any non-visual concept. ONE diagram maximum per response.
- "separator"  → Visual divider between major sections: {"type":"separator","text":""}

Requirements:
- 15 to 25 steps total. NEVER fewer than 12. This is a full lesson, not a summary.
- For comparison questions: include a "table" step — this is mandatory.
- For visual topics: include AT MOST ONE "diagram" step. Place it AFTER the explanation, BEFORE the worked steps.
- For non-visual topics (algebra, history, grammar, etc.): ZERO diagram steps.
- Include AT LEAST 2 "separator" steps to divide sections.
- Explain like an enthusiastic teacher who loves the subject. Be detailed, thorough, and educational.
- Structure: title → explain big picture → definitions → [diagram if visual] → [table if comparison] → formulas → worked steps → answer → tips → warnings.
- Each "explain" must be 3-5 sentences minimum — really teach the concept deeply.
- Each "step" must show ALL working with full reasoning — 2-4 sentences per step.
- No LaTeX: no \\frac, \\sqrt, $...$, backslashes
- Use Unicode: ×, ÷, √, ², ³, π, ≈, ±, θ, Δ, →, °, ∞, ∑, ∫, ≤, ≥, ≠
- Fractions as (a)/(b). Square roots as √(x). Exponents as xⁿ.
- For follow-ups: build on context, go deeper, don't repeat the whole intro.
- Match the student's language and level.`;
}

// ─── Parse AI response ────────────────────────────────────────────────────────

interface RawStep  { type: string; text: string; num?: number }
interface TeachScript { topic: string; steps: RawStep[] }

function parseTeachScript(raw: string): TeachScript | null {
  try {
    const clean = raw.replace(/```json\n?|\n?```/g, "").trim();
    const m = clean.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    if (!Array.isArray(j.steps)) return null;
    return j as TeachScript;
  } catch { return null; }
}

const VALID_TYPES = new Set(["title","explain","formula","step","answer","tip","warning","definition","separator","diagram"]);

function scriptToSteps(s: TeachScript): TeachStep[] {
  return s.steps.map((r, i) => ({
    id: `s${Date.now()}-${i}`,
    type: (VALID_TYPES.has(r.type) ? r.type : "explain") as TeachType,
    num: r.num,
    fullText: r.text ?? "",
    text: "",
    revealed: 0,
  }));
}

// ─── Canvas drawing helpers ───────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function drawPath(ctx: CanvasRenderingContext2D, el: DrawEl) {
  if (el.points.length < 2) return;
  ctx.save();
  ctx.globalAlpha = el.tool === "highlighter" ? 0.35 : el.opacity;
  ctx.strokeStyle = el.color;
  ctx.lineWidth   = el.tool === "highlighter" ? el.strokeWidth * 2.5 : el.strokeWidth;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(el.points[0].x, el.points[0].y);
  for (let i = 1; i < el.points.length; i++) {
    const mid = { x: (el.points[i-1].x + el.points[i].x)/2, y: (el.points[i-1].y + el.points[i].y)/2 };
    ctx.quadraticCurveTo(el.points[i-1].x, el.points[i-1].y, mid.x, mid.y);
  }
  ctx.stroke(); ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, el: DrawEl) {
  if (el.x1 === undefined) return;
  const { x1, y1=0, x2=0, y2=0 } = el;
  ctx.save();
  ctx.strokeStyle = el.color;
  ctx.lineWidth   = el.strokeWidth;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  if (el.tool === "line") {
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  } else if (el.tool === "arrow") {
    const ang = Math.atan2(y2-y1, x2-x1);
    const hl  = Math.max(12, el.strokeWidth * 3);
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.moveTo(x2, y2); ctx.lineTo(x2-hl*Math.cos(ang-0.4), y2-hl*Math.sin(ang-0.4));
    ctx.moveTo(x2, y2); ctx.lineTo(x2-hl*Math.cos(ang+0.4), y2-hl*Math.sin(ang+0.4));
    ctx.stroke();
  } else if (el.tool === "rect") {
    ctx.strokeRect(x1, y1, x2-x1, y2-y1);
  } else if (el.tool === "circle") {
    ctx.ellipse((x1+x2)/2, (y1+y2)/2, Math.abs(x2-x1)/2, Math.abs(y2-y1)/2, 0, 0, Math.PI*2);
    ctx.stroke();
  } else if (el.tool === "triangle") {
    ctx.moveTo((x1+x2)/2, y1); ctx.lineTo(x2, y2); ctx.lineTo(x1, y2); ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

const HW_FAMILY = "'Patrick Hand', cursive";

function hwFont(size: number, bold = false) {
  return `${bold ? "600" : "400"} ${size}px ${HW_FAMILY}`;
}

function drawText(ctx: CanvasRenderingContext2D, el: DrawEl) {
  if (!el.text || el.x1 === undefined) return;
  ctx.save();
  // AI-generated text uses Patrick Hand handwriting font (detected by font sizes 13/16/20/28)
  const isHW = el.fontSize && [13, 16, 20, 28].includes(el.fontSize);
  ctx.font = isHW
    ? hwFont(el.fontSize!, el.strokeWidth >= 3)
    : `${el.fontSize ?? 18}px Inter, sans-serif`;
  ctx.fillStyle = el.color;
  ctx.fillText(el.text, el.x1, el.y1!);
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number,
  bg: BgMode, dark: boolean, panX: number, panY: number, zoom: number) {
  ctx.fillStyle = dark ? "#0F172A" : "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  if (bg === "blank") return;
  const sp  = 32 * zoom;
  const ox  = ((panX % sp) + sp) % sp;
  const oy  = ((panY % sp) + sp) % sp;
  const dot = dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)";
  if (bg === "grid") {
    ctx.strokeStyle = dot; ctx.lineWidth = 0.5;
    for (let x = ox; x < W; x += sp) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y = oy; y < H; y += sp) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  } else {
    ctx.fillStyle = dot;
    for (let x = ox; x < W; x += sp)
      for (let y = oy; y < H; y += sp) { ctx.beginPath(); ctx.arc(x,y,1.2,0,Math.PI*2); ctx.fill(); }
  }
}

// ─── Diagram renderer ─────────────────────────────────────────────────────────

function drawDiagramOnCanvas(
  ctx: CanvasRenderingContext2D,
  code: string,
  ox: number, oy: number,
  color: string,
): number /* height used */ {
  const [kind, ...args] = code.split(":");
  const labels = (args[0] ?? "").split(",").map(s => s.trim());
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineWidth   = 2.2;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";

  const HW_FONT = `400 15px ${HW_FAMILY}`;
  let usedH = 0;

  if (kind === "right-triangle") {
    const [la = "a", lb = "b", lc = "c"] = labels;
    const W = 140, H = 110;
    ctx.beginPath();
    ctx.moveTo(ox, oy + H);
    ctx.lineTo(ox + W, oy + H);
    ctx.lineTo(ox, oy);
    ctx.closePath();
    ctx.stroke();
    // right-angle box
    ctx.beginPath();
    ctx.moveTo(ox + 14, oy + H);
    ctx.lineTo(ox + 14, oy + H - 14);
    ctx.lineTo(ox, oy + H - 14);
    ctx.stroke();
    ctx.font = HW_FONT;
    ctx.fillText(la, ox - 22, oy + H / 2 + 5);   // left side
    ctx.fillText(lb, ox + W / 2 - 6, oy + H + 20); // bottom
    ctx.fillText(lc, ox + W / 2 + 14, oy + H / 2 - 12); // hypotenuse
    usedH = H + 32;

  } else if (kind === "axes") {
    const [lx = "x", ly = "y"] = labels;
    const L = 150;
    // x-axis
    ctx.beginPath(); ctx.moveTo(ox, oy + L / 2); ctx.lineTo(ox + L, oy + L / 2); ctx.stroke();
    // y-axis
    ctx.beginPath(); ctx.moveTo(ox + 30, oy); ctx.lineTo(ox + 30, oy + L); ctx.stroke();
    // arrowheads
    ctx.beginPath();
    ctx.moveTo(ox + L, oy + L / 2); ctx.lineTo(ox + L - 10, oy + L / 2 - 5); ctx.lineTo(ox + L - 10, oy + L / 2 + 5); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ox + 30, oy); ctx.lineTo(ox + 25, oy + 10); ctx.lineTo(ox + 35, oy + 10); ctx.closePath(); ctx.fill();
    ctx.font = HW_FONT;
    ctx.fillText(lx, ox + L + 5, oy + L / 2 + 5);
    ctx.fillText(ly, ox + 30 - 18, oy - 5);
    // tick marks
    for (let i = 1; i <= 4; i++) {
      const tx = ox + 30 + i * 28, ty = oy + L / 2;
      ctx.beginPath(); ctx.moveTo(tx, ty - 5); ctx.lineTo(tx, ty + 5); ctx.stroke();
      const tty = oy + L / 2 - i * 22;
      ctx.beginPath(); ctx.moveTo(ox + 25, tty); ctx.lineTo(ox + 35, tty); ctx.stroke();
    }
    usedH = L + 12;

  } else if (kind === "number-line") {
    const start = parseInt(labels[0] ?? "-5"), end = parseInt(labels[1] ?? "5");
    const step  = Math.abs(end - start) <= 10 ? 1 : 2;
    const scale = 22;
    const totalW = (end - start) * scale;
    ctx.beginPath(); ctx.moveTo(ox, oy + 20); ctx.lineTo(ox + totalW + 20, oy + 20); ctx.stroke();
    // arrowheads
    ctx.beginPath(); ctx.moveTo(ox + totalW + 20, oy + 20); ctx.lineTo(ox + totalW + 8, oy + 14); ctx.lineTo(ox + totalW + 8, oy + 26); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ox, oy + 20); ctx.lineTo(ox + 12, oy + 14); ctx.lineTo(ox + 12, oy + 26); ctx.closePath(); ctx.fill();
    ctx.font = HW_FONT;
    for (let v = start; v <= end; v += step) {
      const tx = ox + (v - start) * scale;
      ctx.beginPath(); ctx.moveTo(tx, oy + 14); ctx.lineTo(tx, oy + 26); ctx.stroke();
      ctx.fillText(String(v), tx - 5, oy + 40);
    }
    usedH = 52;

  } else if (kind === "circle") {
    const label = labels[0] ?? "r";
    const R = 55;
    ctx.beginPath(); ctx.arc(ox + R + 10, oy + R + 5, R, 0, Math.PI * 2); ctx.stroke();
    // center dot
    ctx.beginPath(); ctx.arc(ox + R + 10, oy + R + 5, 3, 0, Math.PI * 2); ctx.fill();
    // radius line
    ctx.beginPath(); ctx.moveTo(ox + R + 10, oy + R + 5); ctx.lineTo(ox + R + 10 + R, oy + R + 5); ctx.stroke();
    ctx.font = HW_FONT;
    ctx.fillText(label, ox + R + 10 + R / 2 - 5, oy + R - 5);
    ctx.fillText("O", ox + R + 5, oy + R + 1);
    usedH = R * 2 + 22;

  } else if (kind === "force-diagram") {
    const arrowLen = 60;
    const cx = ox + 30, cy = oy + 70;
    // object box
    ctx.strokeRect(cx - 18, cy - 18, 36, 36);
    ctx.font = HW_FONT; ctx.fillText("m", cx - 5, cy + 7);
    const forces = labels.length ? labels : ["F", "mg", "N"];
    const dirs   = [[1, 0], [0, 1], [0, -1]]; // right, down, up
    forces.forEach((lbl, i) => {
      if (i >= dirs.length) return;
      const [dx, dy] = dirs[i];
      const sx = cx + (dx > 0 ? 18 : dx < 0 ? -18 : 0);
      const sy = cy + (dy > 0 ? 18 : dy < 0 ? -18 : 0);
      const ex = sx + dx * arrowLen, ey = sy + dy * arrowLen;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      // arrowhead
      const angle = Math.atan2(ey - sy, ex - sx);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 10 * Math.cos(angle - 0.4), ey - 10 * Math.sin(angle - 0.4));
      ctx.lineTo(ex - 10 * Math.cos(angle + 0.4), ey - 10 * Math.sin(angle + 0.4));
      ctx.closePath(); ctx.fill();
      ctx.fillText(lbl, ex + (dx >= 0 ? 4 : -22), ey + (dy > 0 ? 16 : dy < 0 ? -6 : 5));
    });
    usedH = 145;

  } else if (kind === "bar-chart") {
    const bars    = labels.length ? labels : ["A", "B", "C"];
    const heights = [80, 55, 68, 40, 72].slice(0, bars.length);
    const barW = 30, gap = 14, baseY = oy + 100;
    // y-axis
    ctx.beginPath(); ctx.moveTo(ox + 10, oy + 5); ctx.lineTo(ox + 10, baseY + 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox + 10, baseY + 5); ctx.lineTo(ox + 10 + bars.length * (barW + gap) + gap, baseY + 5); ctx.stroke();
    ctx.font = HW_FONT;
    bars.forEach((lbl, i) => {
      const bx = ox + 10 + gap + i * (barW + gap);
      const bh = heights[i] ?? 50;
      ctx.globalAlpha = 0.25; ctx.fillRect(bx, baseY - bh, barW, bh); ctx.globalAlpha = 1;
      ctx.strokeRect(bx, baseY - bh, barW, bh);
      ctx.fillText(lbl, bx + barW / 2 - 5, baseY + 18);
    });
    usedH = 118;

  } else if (kind === "wave") {
    const W = 200, amp = 30, freq = 2;
    ctx.beginPath();
    for (let px = 0; px <= W; px++) {
      const x = ox + px;
      const y = oy + 40 + amp * Math.sin((px / W) * freq * Math.PI * 2);
      px === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    // axes
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(ox, oy + 40); ctx.lineTo(ox + W, oy + 40); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = HW_FONT;
    ctx.fillText("Amplitude", ox - 2, oy + 11);
    ctx.fillText("→ Time", ox + W - 40, oy + 38);
    usedH = 85;

  } else if (kind === "dna") {
    const W = 60, H = 120, turns = 3;
    for (let i = 0; i <= H; i += 2) {
      const t  = (i / H) * turns * Math.PI * 2;
      const x1 = ox + W / 2 + (W / 2) * Math.sin(t);
      const x2 = ox + W / 2 - (W / 2) * Math.sin(t);
      if (i % 16 < 2) {
        ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.moveTo(x1, oy + i); ctx.lineTo(x2, oy + i); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // two backbone strands
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= H; i += 2) {
      const t = (i / H) * turns * Math.PI * 2;
      const x = ox + W / 2 + (W / 2) * Math.sin(t);
      i === 0 ? ctx.moveTo(x, oy + i) : ctx.lineTo(x, oy + i);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= H; i += 2) {
      const t = (i / H) * turns * Math.PI * 2;
      const x = ox + W / 2 - (W / 2) * Math.sin(t);
      i === 0 ? ctx.moveTo(x, oy + i) : ctx.lineTo(x, oy + i);
    }
    ctx.stroke();
    ctx.font = HW_FONT;
    ctx.fillText("DNA", ox + W + 8, oy + H / 2 + 5);
    usedH = H + 16;
  }

  ctx.restore();
  return usedH;
}

// ─── Table renderer ───────────────────────────────────────────────────────────

function drawTableOnCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  ox: number, oy: number,
  color: string,
): number /* height used */ {
  const rows = text.split("\\n").map(r => r.split("|").map(c => c.trim())).filter(r => r.length >= 2);
  if (rows.length === 0) return 0;

  ctx.save();
  ctx.font = `400 13px ${HW_FAMILY}`;

  const cols = Math.max(...rows.map(r => r.length));
  const colW = 130;
  const rowH = 26;
  const tableW = cols * colW;
  const headerColor = color;

  rows.forEach((row, ri) => {
    const y = oy + ri * rowH;
    const isHeader = ri === 0;

    // Row background
    if (isHeader) {
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = headerColor;
      ctx.fillRect(ox, y, tableW, rowH);
      ctx.globalAlpha = 1;
    } else if (ri % 2 === 0) {
      ctx.globalAlpha = 0.04;
      ctx.fillStyle = "#000";
      ctx.fillRect(ox, y, tableW, rowH);
      ctx.globalAlpha = 1;
    }

    // Cell borders
    ctx.strokeStyle = color;
    ctx.lineWidth = isHeader ? 1.8 : 1;
    ctx.globalAlpha = isHeader ? 0.8 : 0.35;
    ctx.strokeRect(ox, y, tableW, rowH);
    ctx.globalAlpha = 1;

    // Cell text
    row.forEach((cell, ci) => {
      ctx.fillStyle = color;
      ctx.font = isHeader
        ? `700 13px ${HW_FAMILY}`
        : `400 13px ${HW_FAMILY}`;
      // Vertical separator between columns
      if (ci > 0) {
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ox + ci * colW, y);
        ctx.lineTo(ox + ci * colW, y + rowH);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Clip text to cell width
      ctx.save();
      ctx.rect(ox + ci * colW + 4, y, colW - 8, rowH);
      ctx.clip();
      ctx.fillStyle = color;
      ctx.font = isHeader ? `700 13px ${HW_FAMILY}` : `400 13px ${HW_FAMILY}`;
      ctx.fillText(cell, ox + ci * colW + 6, y + rowH * 0.68);
      ctx.restore();
    });
  });

  ctx.restore();
  return rows.length * rowH + 12;
}

// ─── Main component ───────────────────────────────────────────────────────────

function WhiteboardPage() {
  const { user } = Route.useRouteContext();
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "cerebras");
  useHandwritingFont();

  // ── Canvas refs ──────────────────────────────────────────────────────────
  const bgRef        = useRef<HTMLCanvasElement>(null);
  const drawRef      = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stepsEndRef  = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const questionRef  = useRef<HTMLTextAreaElement>(null);

  // ── Drawing state (refs for perf) ────────────────────────────────────────
  const elemRef      = useRef<DrawEl[][]>([[]]); // per-page element arrays
  const curPathRef   = useRef<DrawEl | null>(null);
  const shapeStartRef= useRef<Pt | null>(null);
  const isDrawRef    = useRef(false);
  const undoRef      = useRef<DrawEl[][][]>([]);
  const redoRef      = useRef<DrawEl[][][]>([]);
  const laserPosRef  = useRef<Pt | null>(null);
  const textPosRef   = useRef<Pt | null>(null);
  const spaceHeldRef = useRef(false);
  const panningRef   = useRef(false);
  const panStartRef  = useRef<Pt>({ x: 0, y: 0 });
  const panOriRef    = useRef<Pt>({ x: 0, y: 0 });
  const pinchRef     = useRef<number | null>(null);

  // ── Animation engine (all refs — no React re-renders for timing logic) ───
  const animRef = useRef({
    pending:  [] as TeachStep[],
    shown:    [] as TeachStep[],
    stepIdx:  0,
    charIdx:  0,
    phase:    "idle" as "idle" | "typing" | "step-pause" | "done",
    pauseMs:  0,
    lastTs:   0,
    paused:   false,
    speed:    "normal" as Speed,
  });
  const rafRef = useRef(0);

  // ── React state ──────────────────────────────────────────────────────────
  const [tool, setTool]               = useState<Tool>("pen");
  const [color, setColor]             = useState(COLORS.black);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [bg, setBg]                   = useState<BgMode>("grid");
  const [theme, setTheme]             = useState<Theme>("light");
  const [zoom, setZoom]               = useState(1);
  const [pan, setPan]                 = useState<Pt>({ x: 0, y: 0 });
  const [page, setPage]               = useState(0);
  const [totalPages, setTotalPages]   = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAI, setShowAI]           = useState(true);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSubjects, setShowSubjects] = useState(false);

  // AI state
  const [question, setQuestion]       = useState("");
  const [loading, setLoading]         = useState(false);
  const [animPhase, setAnimPhase]     = useState<AnimPhase>("idle");
  const [visibleSteps, setVisibleSteps] = useState<TeachStep[]>([]);
  const [totalSteps, setTotalSteps]   = useState(0);
  const [speed, setSpeed]             = useState<Speed>("normal");
  const [chatHistory, setChatHistory] = useState<ConvMsg[]>([]);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textDraft, setTextDraft]     = useState("");
  const [isListening, setIsListening] = useState(false);
  const speechRef = useRef<SpeechRecognition | null>(null);

  // ── Hand animation state ──────────────────────────────────────────────────
  const [handScreenPos, setHandScreenPos] = useState<{x:number;y:number}>({x:120,y:120});
  const [handState, setHandState]         = useState<"idle"|"writing"|"done">("idle");
  const [mobileTab, setMobileTab]         = useState<"board"|"ai">("board");

  // ── Canvas-write state ────────────────────────────────────────────────────
  const [drawOnCanvas, setDrawOnCanvas]   = useState(true);
  const drawOnCanvasRef                   = useRef(true);
  const canvasWritePosRef                 = useRef<{ x: number; y: number }>({ x: 48, y: 64 });
  const aiElemIdsRef                      = useRef<Set<string>>(new Set());
  // callback ref so animation RAF can call it without stale closures
  const writeStepCbRef                    = useRef<(step: TeachStep) => void>(() => {});
  // Live "currently typing" elements — cleared and rebuilt each word boundary
  const liveElemIdsRef                    = useRef<Set<string>>(new Set());
  const writeLiveCharCbRef                = useRef<(step: TeachStep, charIdx: number) => void>(() => {});

  useEffect(() => { drawOnCanvasRef.current = drawOnCanvas; }, [drawOnCanvas]);

  const isDark = theme === "dark";

  // ── Viewport conversion ──────────────────────────────────────────────────
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const toWorld = useCallback((sx: number, sy: number): Pt => ({
    x: (sx - panRef.current.x) / zoomRef.current,
    y: (sy - panRef.current.y) / zoomRef.current,
  }), []);

  const toScreen = useCallback((wx: number, wy: number): Pt => ({
    x: wx * zoomRef.current + panRef.current.x,
    y: wy * zoomRef.current + panRef.current.y,
  }), []);
  // ── Canvas resize ────────────────────────────────────────────────────────
  function resizeCanvases() {
    const el = containerRef.current;
    if (!el) return;
    const W = el.clientWidth, H = el.clientHeight;
    [bgRef, drawRef].forEach(r => { if (r.current) { r.current.width = W; r.current.height = H; } });
    redrawCanvas();
  }

  useLayoutEffect(() => {
    resizeCanvases();
    const obs = new ResizeObserver(resizeCanvases);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAI]);

  // ── Full canvas redraw ───────────────────────────────────────────────────
  const pageRef  = useRef(page);
  const toolRef  = useRef(tool);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { toolRef.current = tool; }, [tool]);

  const redrawCanvas = useCallback(() => {
    const bgC = bgRef.current, drC = drawRef.current;
    if (!bgC || !drC) return;
    const W = bgC.width, H = bgC.height;
    const bgCtx = bgC.getContext("2d")!, drCtx = drC.getContext("2d")!;
    const p = panRef.current, z = zoomRef.current;

    drawBackground(bgCtx, W, H, bg, isDark, p.x, p.y, z);

    drCtx.clearRect(0, 0, W, H);
    drCtx.save();
    drCtx.translate(p.x, p.y);
    drCtx.scale(z, z);

    for (const el of (elemRef.current[pageRef.current] ?? [])) {
      if (["pen","pencil","highlighter"].includes(el.tool)) {
        drawPath(drCtx, el);
      } else if (el.tool === "eraser") {
        drCtx.save();
        drCtx.globalCompositeOperation = "destination-out";
        drawPath(drCtx, el);
        drCtx.restore();
      } else if (el.tool === "text") {
        drawText(drCtx, el);
      } else if (el.tool === "diagram") {
        const txt = el.text ?? "";
        if (txt.startsWith("__table__")) {
          drawTableOnCanvas(drCtx, txt.slice("__table__".length), el.x1 ?? 0, el.y1 ?? 0, el.color);
        } else {
          drawDiagramOnCanvas(drCtx, txt, el.x1 ?? 0, el.y1 ?? 0, el.color);
        }
      } else {
        drawShape(drCtx, el);
      }
    }

    // Laser pointer
    if (laserPosRef.current && toolRef.current === "laser") {
      const { x, y } = laserPosRef.current;
      const wx = (x - p.x)/z, wy = (y - p.y)/z;
      drCtx.save();
      drCtx.beginPath(); drCtx.arc(wx, wy, 8, 0, Math.PI*2);
      drCtx.fillStyle = "rgba(239,68,68,0.9)"; drCtx.fill();
      drCtx.strokeStyle = "rgba(255,255,255,0.95)"; drCtx.lineWidth = 2; drCtx.stroke();
      drCtx.beginPath(); drCtx.arc(wx, wy, 16, 0, Math.PI*2);
      drCtx.strokeStyle = "rgba(239,68,68,0.3)"; drCtx.lineWidth = 3; drCtx.stroke();
      drCtx.restore();
    }

    drCtx.restore();
  }, [bg, isDark]);

  useEffect(() => { redrawCanvas(); }, [redrawCanvas, pan, zoom, page]);

  // ── Shared word-wrap utility ─────────────────────────────────────────────
  const computeLines = useCallback((ctx: CanvasRenderingContext2D, text: string, fontSize: number, isTtl: boolean, maxW: number) => {
    ctx.font = hwFont(fontSize, isTtl);
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width / zoomRef.current > maxW && line) {
        lines.push(line); line = word;
      } else { line = test; }
    }
    if (line) lines.push(line);
    return lines;
  }, []);

  // ── Live (in-progress) canvas writing — called every word boundary ───────
  const writeLiveToCanvas = useCallback((step: TeachStep, charIdx: number) => {
    if (!drawOnCanvasRef.current || step.type === "separator" || step.type === "diagram" || step.type === "table") return;
    const canvas = drawRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pg       = pageRef.current;
    const pos      = canvasWritePosRef.current;
    const clr      = TYPE_COLOR[step.type];
    const isTtl    = step.type === "title";
    const isFml    = step.type === "formula";
    const fontSize = isTtl ? 28 : isFml ? 20 : 16;
    const lineH    = fontSize * 1.6;
    const maxW     = Math.max(220, (canvas.width * 0.58) / zoomRef.current);

    // Remove old live elements
    const liveIds = liveElemIdsRef.current;
    if (liveIds.size > 0) {
      elemRef.current[pg] = (elemRef.current[pg] ?? []).filter(e => !liveIds.has(e.id));
      liveElemIdsRef.current = new Set();
    }

    // Partial text typed so far
    const partial = step.fullText.slice(0, charIdx);
    if (!partial) return;

    // Compute label (same logic as writeStepToCanvas) so live text lands at correct Y
    const lbl = step.type === "step" && step.num
      ? `▸  Step ${step.num}`
      : step.type !== "explain" ? `▸  ${TYPE_LABEL[step.type]}` : "";
    if (lbl) {
      const lid = uid();
      liveElemIdsRef.current.add(lid);
      elemRef.current[pg] = [...(elemRef.current[pg] ?? []), {
        id: lid, tool: "text", points: [], color: clr,
        strokeWidth: 1, opacity: 1, page: pg,
        text: lbl, fontSize: 13, x1: pos.x, y1: pos.y,
      }];
    }
    const labelOffset = lbl ? 20 : 0;
    const startY = pos.y + labelOffset;

    const lines = computeLines(ctx, partial, fontSize, isTtl, maxW);

    let lastLineY = startY;
    lines.forEach((ln, li) => {
      const eid = uid();
      liveElemIdsRef.current.add(eid);
      const y = startY + li * lineH;
      elemRef.current[pg] = [...(elemRef.current[pg] ?? []), {
        id: eid, tool: "text", points: [], color: clr,
        strokeWidth: isTtl ? 3 : 1, opacity: 1, page: pg,
        text: ln, fontSize, x1: pos.x, y1: y,
      }];
      lastLineY = y;
    });

    // Hand follows the end of the last typed character on canvas.
    // Y is placed just below the baseline of the current line so the hand
    // body (which extends downward from the tip) never covers the text above.
    const lastLine = lines[lines.length - 1] ?? "";
    ctx.font = hwFont(fontSize, isTtl);
    const lastLineW = ctx.measureText(lastLine).width / zoomRef.current;
    const handWX = pos.x + Math.min(lastLineW + 4, maxW - 10);
    const handWY = lastLineY + fontSize + 2; // tip lands just below text baseline
    const hx = handWX * zoomRef.current + panRef.current.x;
    const hy = handWY * zoomRef.current + panRef.current.y;
    setHandScreenPos({ x: hx, y: hy });

    // Auto-pan if near bottom
    if (lastLineY * zoomRef.current + panRef.current.y > canvas.height - 140) {
      setPan(p => ({ ...p, y: Math.min(0, -(lastLineY * zoomRef.current - canvas.height * 0.38)) }));
    }

    redrawCanvas();
  }, [redrawCanvas, computeLines]);

  // ── Write final AI step to canvas (called when step finishes typing) ─────
  const writeStepToCanvas = useCallback((step: TeachStep) => {
    if (!drawOnCanvasRef.current || step.type === "separator") return;
    const canvas = drawRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pg      = pageRef.current;
    const pos     = canvasWritePosRef.current;
    const clr     = TYPE_COLOR[step.type];
    const isTtl   = step.type === "title";
    const isFml   = step.type === "formula";
    const isDiag  = step.type === "diagram";
    const fontSize = isTtl ? 28 : isFml ? 20 : 16;
    const lineH    = fontSize * 1.6;
    const maxW     = Math.max(220, (canvas.width * 0.58) / zoomRef.current);

    // Remove any live (in-progress) elements for this step first
    const liveIds = liveElemIdsRef.current;
    if (liveIds.size > 0) {
      elemRef.current[pg] = (elemRef.current[pg] ?? []).filter(e => !liveIds.has(e.id));
      liveElemIdsRef.current = new Set();
    }

    // ── Table step ────────────────────────────────────────────────────────
    if (step.type === "table") {
      const lblId = uid();
      aiElemIdsRef.current.add(lblId);
      elemRef.current[pg] = [...(elemRef.current[pg] ?? []), {
        id: lblId, tool: "text", points: [], color: clr,
        strokeWidth: 1, opacity: 1, page: pg,
        text: "▸  Comparison Table", fontSize: 13, x1: pos.x, y1: pos.y,
      }];
      pos.y += 24;

      const tblId = uid();
      aiElemIdsRef.current.add(tblId);
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = 900; tmpCanvas.height = 600;
      const tmpCtx = tmpCanvas.getContext("2d")!;
      const tblH = drawTableOnCanvas(tmpCtx, step.fullText, 0, 0, clr);
      elemRef.current[pg] = [...(elemRef.current[pg] ?? []), {
        id: tblId, tool: "diagram" as Tool, points: [], color: clr,
        strokeWidth: 2, opacity: 1, page: pg,
        text: "__table__" + step.fullText, fontSize: 1, x1: pos.x, y1: pos.y,
      }];
      pos.y += tblH + 24;

      const hx = (pos.x + 100) * zoomRef.current + panRef.current.x;
      const hy = pos.y * zoomRef.current + panRef.current.y;
      setHandScreenPos({ x: hx, y: hy });
      setHandState("writing");
      if (pos.y * zoomRef.current + panRef.current.y > canvas.height - 140) {
        setPan(p => ({ ...p, y: Math.min(0, -(pos.y * zoomRef.current - canvas.height * 0.38)) }));
      }
      redrawCanvas();
      return;
    }

    // ── Diagram step — store in elemRef so it persists across redraws ────
    if (isDiag) {
      // Section label "── Diagram ──"
      const lblId = uid();
      aiElemIdsRef.current.add(lblId);
      elemRef.current[pg] = [...(elemRef.current[pg] ?? []), {
        id: lblId, tool: "text", points: [], color: clr,
        strokeWidth: 1, opacity: 1, page: pg,
        text: "▸  Diagram", fontSize: 13, x1: pos.x, y1: pos.y,
      }];
      pos.y += 22; // gap after label

      // Top padding before diagram
      pos.y += 10;

      const diagId = uid();
      aiElemIdsRef.current.add(diagId);
      // Measure height on an off-screen canvas
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = 600; tmpCanvas.height = 600;
      const tmpCtx = tmpCanvas.getContext("2d")!;
      const diagH = drawDiagramOnCanvas(tmpCtx, step.fullText, 0, 0, clr);
      // Indent diagram by 16px for visual separation
      elemRef.current[pg] = [...(elemRef.current[pg] ?? []), {
        id: diagId, tool: "diagram" as Tool, points: [], color: clr,
        strokeWidth: 2, opacity: 1, page: pg,
        text: step.fullText, fontSize: 1, x1: pos.x + 16, y1: pos.y,
      }];
      pos.y += diagH + 32; // generous bottom padding after diagram

      const hx = (pos.x + 80) * zoomRef.current + panRef.current.x;
      const hy = pos.y * zoomRef.current + panRef.current.y;
      setHandScreenPos({ x: hx, y: hy });
      setHandState("writing");
      if (pos.y * zoomRef.current + panRef.current.y > canvas.height - 140) {
        setPan(p => ({ ...p, y: Math.min(0, -(pos.y * zoomRef.current - canvas.height * 0.38)) }));
      }
      redrawCanvas();
      return;
    }

    // Label row (skip for plain "explain" steps)
    const lbl = step.type === "step" && step.num
      ? `▸  Step ${step.num}`
      : step.type !== "explain"
        ? `▸  ${TYPE_LABEL[step.type]}`
        : "";

    if (lbl) {
      const labelId = uid();
      aiElemIdsRef.current.add(labelId);
      elemRef.current[pg] = [...(elemRef.current[pg] ?? []), {
        id: labelId, tool: "text", points: [], color: clr,
        strokeWidth: 1, opacity: 1, page: pg,
        text: lbl, fontSize: 13, x1: pos.x, y1: pos.y,
      }];
      pos.y += 20;
    }

    const lines = computeLines(ctx, step.fullText, fontSize, isTtl, maxW);

    for (const ln of lines) {
      const eid = uid();
      aiElemIdsRef.current.add(eid);
      elemRef.current[pg] = [...(elemRef.current[pg] ?? []), {
        id: eid, tool: "text", points: [], color: clr,
        strokeWidth: isTtl ? 3 : 1, opacity: 1, page: pg,
        text: ln, fontSize, x1: pos.x, y1: pos.y,
      }];
      pos.y += lineH;
    }

    // Underline after title
    if (isTtl) {
      const sepId = uid();
      aiElemIdsRef.current.add(sepId);
      elemRef.current[pg] = [...(elemRef.current[pg] ?? []), {
        id: sepId, tool: "line", points: [], color: clr,
        strokeWidth: 2, opacity: 0.5, page: pg,
        x1: pos.x, y1: pos.y + 2, x2: pos.x + maxW * 0.7, y2: pos.y + 2,
      }];
      pos.y += 16;
    } else if (isFml) {
      const boxId = uid();
      aiElemIdsRef.current.add(boxId);
      const boxTop = pos.y - lines.length * lineH - 6;
      // Measure actual max line width to avoid over-wide box
      ctx.font = hwFont(fontSize, false);
      const actualFmlW = Math.max(...lines.map(ln => ctx.measureText(ln).width / zoomRef.current));
      elemRef.current[pg] = [...(elemRef.current[pg] ?? []), {
        id: boxId, tool: "rect", points: [], color: clr,
        strokeWidth: 1.8, opacity: 0.5, page: pg,
        x1: pos.x - 8, y1: boxTop, x2: pos.x + actualFmlW + 16, y2: pos.y + 4,
      }];
      pos.y += 12;
    } else {
      pos.y += 10;
    }

    if (pos.y * zoomRef.current + panRef.current.y > canvas.height - 140) {
      setPan(p => ({ ...p, y: Math.min(0, -(pos.y * zoomRef.current - canvas.height * 0.38)) }));
    }

    // pos.y is already advanced past all written lines — tip goes right here,
    // so the hand body (below the tip) is fully below the written content.
    const hx = (pos.x + Math.min(maxW * 0.5, 180)) * zoomRef.current + panRef.current.x;
    const hy = pos.y * zoomRef.current + panRef.current.y;
    setHandScreenPos({ x: hx, y: hy });
    setHandState("writing");

    redrawCanvas();
  }, [redrawCanvas, computeLines]);

  // Keep the callback refs in sync so the RAF loop always calls the latest version
  useEffect(() => { writeStepCbRef.current = writeStepToCanvas; }, [writeStepToCanvas]);
  useEffect(() => { writeLiveCharCbRef.current = writeLiveToCanvas; }, [writeLiveToCanvas]);

  // Clear only AI-written elements, leaving user drawings untouched
  function clearAIDrawing() {
    const ids = new Set([...aiElemIdsRef.current, ...liveElemIdsRef.current]);
    for (let pg = 0; pg < elemRef.current.length; pg++) {
      elemRef.current[pg] = (elemRef.current[pg] ?? []).filter(e => !ids.has(e.id));
    }
    aiElemIdsRef.current = new Set();
    liveElemIdsRef.current = new Set();
    canvasWritePosRef.current = { x: 48, y: 64 };
    redrawCanvas();
  }

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  function snapshot() {
    undoRef.current.push(elemRef.current.map(p => [...p]));
    redoRef.current = [];
  }
  function undo() {
    const s = undoRef.current.pop(); if (!s) return;
    redoRef.current.push(elemRef.current.map(p => [...p]));
    elemRef.current = s; redrawCanvas();
  }
  function redo() {
    const s = redoRef.current.pop(); if (!s) return;
    undoRef.current.push(elemRef.current.map(p => [...p]));
    elemRef.current = s; redrawCanvas();
  }

  // ── Page helpers ─────────────────────────────────────────────────────────
  function addPage()  { elemRef.current.push([]); setTotalPages(t=>t+1); setPage(totalPages); }
  function dupPage()  {
    const copy = (elemRef.current[page]??[]).map(e=>({...e,id:uid(),page:totalPages}));
    elemRef.current.push(copy); setTotalPages(t=>t+1); setPage(totalPages);
  }
  function clearPage() {
    if (!window.confirm("Clear this page?")) return;
    snapshot(); elemRef.current[page]=[]; redrawCanvas();
  }

  // ── Event position helpers ───────────────────────────────────────────────
  function getPos(e: React.MouseEvent | React.TouchEvent): Pt {
    const r = drawRef.current!.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    const m = e as React.MouseEvent;
    return { x: m.clientX - r.left, y: m.clientY - r.top };
  }

  // ── Pointer handlers ─────────────────────────────────────────────────────
  function onPointerDown(e: React.MouseEvent | React.TouchEvent) {
    const pos = getPos(e);
    const mid = "button" in e && (e as React.MouseEvent).button === 1;
    if (mid || spaceHeldRef.current || tool === "select") {
      panningRef.current = true;
      panStartRef.current = pos;
      panOriRef.current = { ...panRef.current };
      return;
    }
    if (tool === "text") {
      textPosRef.current = toWorld(pos.x, pos.y);
      setShowTextInput(true); setTextDraft("");
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }
    if (tool === "laser") { laserPosRef.current = pos; redrawCanvas(); return; }

    isDrawRef.current = true;
    const w = toWorld(pos.x, pos.y);
    if (["pen","pencil","highlighter","eraser"].includes(tool)) {
      const el: DrawEl = {
        id: uid(), tool, points: [w], color,
        strokeWidth: tool === "eraser" ? strokeWidth * 4 : strokeWidth,
        opacity: 1, page,
      };
      snapshot(); curPathRef.current = el;
      elemRef.current[page] = [...(elemRef.current[page]??[]), el];
    } else {
      shapeStartRef.current = w;
    }
    redrawCanvas();
  }

  function onPointerMove(e: React.MouseEvent | React.TouchEvent) {
    const pos = getPos(e);
    if (panningRef.current) {
      const dx = pos.x - panStartRef.current.x, dy = pos.y - panStartRef.current.y;
      setPan({ x: panOriRef.current.x + dx, y: panOriRef.current.y + dy });
      return;
    }
    if (tool === "laser") { laserPosRef.current = pos; redrawCanvas(); return; }
    if (!isDrawRef.current) return;
    const w = toWorld(pos.x, pos.y);
    if (curPathRef.current) {
      curPathRef.current.points.push(w);
      elemRef.current[page][elemRef.current[page].length - 1] = { ...curPathRef.current };
      redrawCanvas();
    } else if (shapeStartRef.current) {
      redrawCanvas();
      const ctx = drawRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.save(); ctx.translate(panRef.current.x, panRef.current.y); ctx.scale(zoomRef.current, zoomRef.current);
      drawShape(ctx, {
        id:"prev", tool, points:[], color, strokeWidth, opacity:1, page,
        x1: shapeStartRef.current.x, y1: shapeStartRef.current.y, x2: w.x, y2: w.y,
      });
      ctx.restore();
    }
  }

  function onPointerUp(e: React.MouseEvent | React.TouchEvent) {
    if (panningRef.current) { panningRef.current = false; return; }
    if (!isDrawRef.current) return;
    isDrawRef.current = false;
    const pos = getPos(e), w = toWorld(pos.x, pos.y);
    if (shapeStartRef.current) {
      const s = shapeStartRef.current;
      if (Math.abs(w.x-s.x) > 3 || Math.abs(w.y-s.y) > 3) {
        snapshot();
        elemRef.current[page] = [...(elemRef.current[page]??[]),{
          id:uid(), tool, points:[], color, strokeWidth, opacity:1, page,
          x1:s.x, y1:s.y, x2:w.x, y2:w.y,
        }];
      }
      shapeStartRef.current = null;
    }
    curPathRef.current = null;
    redrawCanvas();
  }

  // ── Touch pinch-zoom ─────────────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) { pinchRef.current = null; }
    else onPointerDown(e);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const d  = Math.sqrt(dx*dx + dy*dy);
      if (pinchRef.current !== null) setZoom(z => Math.max(0.2, Math.min(5, z * d / pinchRef.current!)));
      pinchRef.current = d;
    } else onPointerMove(e);
  }
  function onTouchEnd(e: React.TouchEvent) { pinchRef.current = null; onPointerUp(e); }

  // ── Wheel zoom ───────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const d = e.deltaY > 0 ? 0.9 : 1.1;
        const r = el!.getBoundingClientRect();
        const cx = e.clientX - r.left, cy = e.clientY - r.top;
        setZoom(z => { const nz = Math.max(0.2, Math.min(5, z*d));
          setPan(p => ({ x: cx-(cx-p.x)*(nz/z), y: cy-(cy-p.y)*(nz/z) })); return nz; });
      } else {
        setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " ") { e.preventDefault(); spaceHeldRef.current = e.type === "keydown"; }
      if (e.type !== "keydown") return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if (ctrl && e.key === "y") { e.preventDefault(); redo(); }
      const map: Record<string, Tool> = { p:"pen", h:"highlighter", e:"eraser", t:"text", l:"laser", v:"select" };
      if (map[e.key] && !ctrl) setTool(map[e.key]);
    }
    window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, []);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  // ── Export PNG ────────────────────────────────────────────────────────────
  async function exportPNG() {
    try {
      toast.info("Preparing export…");
      const { default: html2canvas } = await import("html2canvas");
      const el = containerRef.current;
      if (!el) return;
      const c = await html2canvas(el, { useCORS: true, backgroundColor: isDark ? "#0F172A" : "#FFFFFF" });
      const a = document.createElement("a"); a.download = "whiteboard.png";
      a.href = c.toDataURL("image/png"); a.click();
      toast.success("Exported!");
    } catch { toast.error("Export failed"); }
  }

  // ── Text tool commit ──────────────────────────────────────────────────────
  function commitText() {
    if (!textDraft.trim() || !textPosRef.current) { setShowTextInput(false); return; }
    snapshot();
    elemRef.current[page] = [...(elemRef.current[page]??[]), {
      id: uid(), tool: "text", points: [], color, strokeWidth, opacity: 1, page,
      text: textDraft,
      fontSize: strokeWidth < 4 ? 16 : strokeWidth < 8 ? 22 : 32,
      x1: textPosRef.current.x, y1: textPosRef.current.y,
    }];
    setShowTextInput(false); setTextDraft(""); redrawCanvas();
  }

  // ── RAF animation engine ──────────────────────────────────────────────────
  function runAnimLoop(ts: number) {
    const a = animRef.current;
    if (a.phase === "idle" || a.phase === "done") return;
    if (a.paused) { rafRef.current = requestAnimationFrame(runAnimLoop); return; }

    const dt = Math.min(ts - a.lastTs, 150);
    a.lastTs = ts;
    const cfg = SPEED_CONFIG[a.speed];

    if (a.phase === "step-pause") {
      a.pauseMs -= dt;
      if (a.pauseMs <= 0) {
        a.stepIdx++;
        if (a.stepIdx >= a.pending.length) {
          a.phase = "done";
          setAnimPhase("done");
          setHandState("done");
          return;
        }
        const next = { ...a.pending[a.stepIdx], text: "", revealed: 0 };
        a.shown = [...a.shown, next];
        setVisibleSteps([...a.shown]);
        a.charIdx = 0;
        if (next.type === "separator") {
          a.shown[a.shown.length - 1] = { ...next, revealed: 1, text: "" };
          setVisibleSteps([...a.shown]);
          a.phase = "step-pause"; a.pauseMs = 80;
        } else {
          a.phase = "typing"; a.pauseMs = cfg.charMs;
        }
      }
    } else if (a.phase === "typing") {
      a.pauseMs -= dt;
      if (a.pauseMs <= 0) {
        const full = a.pending[a.stepIdx].fullText;
        if (a.charIdx < full.length) {
          a.charIdx++;
          const last = a.shown.length - 1;
          a.shown[last] = { ...a.shown[last], text: full.slice(0, a.charIdx), revealed: a.charIdx };
          setVisibleSteps([...a.shown]);
          a.pauseMs = cfg.charMs;
          stepsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
          // ── Simultaneously write to canvas letter by letter ──────────────
          writeLiveCharCbRef.current(a.pending[a.stepIdx], a.charIdx);
        } else {
          // Step finished typing — finalize on canvas (clears live elements, adds decorations)
          writeStepCbRef.current(a.pending[a.stepIdx]);
          a.phase = "step-pause"; a.pauseMs = cfg.stepMs;
        }
      }
    }

    rafRef.current = requestAnimationFrame(runAnimLoop);
  }

  function startAnimation(steps: TeachStep[], isFollowUp = false) {
    cancelAnimationFrame(rafRef.current);
    const a = animRef.current;
    a.pending  = steps;
    a.shown    = [];
    a.stepIdx  = 0;
    a.charIdx  = 0;
    a.paused   = false;
    a.lastTs   = performance.now();

    // Reset canvas write position for a fresh question (not follow-ups)
    if (!isFollowUp) {
      canvasWritePosRef.current = { x: 48, y: 64 };
    } else {
      // Add a small visual gap between sessions
      canvasWritePosRef.current.y += 24;
    }

    // Add first step immediately
    const first = { ...steps[0], text: "", revealed: 0 };
    a.shown = [first];
    a.phase = first.type === "separator" ? "step-pause" : "typing";
    a.pauseMs = 0;

    setVisibleSteps([first]);
    setTotalSteps(steps.length);
    setAnimPhase("running");
    setHandState("writing");

    rafRef.current = requestAnimationFrame(runAnimLoop);
  }

  function pauseResume() {
    const a = animRef.current;
    a.paused = !a.paused;
    setAnimPhase(a.paused ? "paused" : "running");
    if (!a.paused) {
      a.lastTs = performance.now();
      rafRef.current = requestAnimationFrame(runAnimLoop);
    }
  }

  function skipAnimation() {
    cancelAnimationFrame(rafRef.current);
    const a = animRef.current;
    // Clear any in-progress live elements first
    const pg = pageRef.current;
    if (liveElemIdsRef.current.size > 0) {
      elemRef.current[pg] = (elemRef.current[pg] ?? []).filter(e => !liveElemIdsRef.current.has(e.id));
      liveElemIdsRef.current = new Set();
    }
    // Write all steps that haven't been written yet to the canvas
    const alreadyWritten = a.shown.length - 1;
    for (let i = Math.max(0, alreadyWritten); i < a.pending.length; i++) {
      writeStepCbRef.current(a.pending[i]);
    }
    const all = a.pending.map(s => ({ ...s, text: s.fullText, revealed: s.fullText.length }));
    a.shown = all; a.phase = "done";
    setVisibleSteps(all);
    setAnimPhase("done");
    setHandState("done");
  }

  function changeSpeed(s: Speed) {
    setSpeed(s);
    animRef.current.speed = s;
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── AI teach function ─────────────────────────────────────────────────────
  async function teach(q?: string) {
    const text = (q ?? question).trim();
    if (!text) { toast.error("Please ask a question first"); return; }
    if (quota && quota.remaining <= 0) { toast.error(QUOTA_MESSAGE); return; }

    setLoading(true);
    setVisibleSteps([]);
    setAnimPhase("idle");
    cancelAnimationFrame(rafRef.current);

    try {
      const safe = chatHistory.slice(-6).map(m => ({ role: m.role, content: m.content.slice(0, 500) }));
      const res = await askAIServer({
        data: {
          prompt: buildTeachingPrompt(text, safe),
          preferCerebras: true,
          systemPrompt: "You are an expert AI teacher on an interactive whiteboard. Return ONLY valid JSON as instructed — no prose, no markdown wrappers.",
        },
      });

      const script = parseTeachScript(res.text);
      if (!script || !script.steps.length) throw new Error("Bad script");

      const steps = scriptToSteps(script);
      const isFollowUp = chatHistory.length > 0;
      setChatHistory(p => [...p,
        { role: "user",      content: text },
        { role: "assistant", content: res.text },
      ]);
      setQuestion("");
      animRef.current.speed = speed;
      startAnimation(steps, isFollowUp);
      await bump();
    } catch {
      toast.error("Teaching failed — please try again");
      setAnimPhase("idle");
    } finally {
      setLoading(false);
    }
  }

  function handleQuestionKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); teach(); }
  }

  // ── Copy teaching text ───────────────────────────────────────────────────
  function copyTeaching() {
    const text = visibleSteps
      .filter(s => s.type !== "separator")
      .map(s => `[${TYPE_LABEL[s.type]}${s.num ? " " + s.num : ""}] ${s.fullText}`)
      .join("\n\n");
    navigator.clipboard.writeText(text).then(() => toast.success("Copied to clipboard!"));
  }

  // ── Voice input ──────────────────────────────────────────────────────────
  function toggleVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("Voice not supported in this browser"); return; }
    if (isListening) {
      speechRef.current?.stop(); setIsListening(false); return;
    }
    const r: SpeechRecognition = new SR();
    r.continuous = false; r.interimResults = false; r.lang = "en-US";
    r.onresult = (ev: SpeechRecognitionEvent) => {
      const t = ev.results[0][0].transcript;
      setQuestion(t);
      setIsListening(false);
    };
    r.onerror = () => { setIsListening(false); toast.error("Voice recognition failed"); };
    r.onend   = () => setIsListening(false);
    speechRef.current = r; r.start(); setIsListening(true);
  }

  // ── New board ────────────────────────────────────────────────────────────
  function newBoard() {
    if (!window.confirm("Clear all pages and start fresh?")) return;
    cancelAnimationFrame(rafRef.current);
    elemRef.current = [[]]; setPage(0); setTotalPages(1);
    setVisibleSteps([]); setChatHistory([]); setAnimPhase("idle");
    aiElemIdsRef.current = new Set();
    canvasWritePosRef.current = { x: 48, y: 64 };
    redrawCanvas();
  }

  // ── Cursor style ─────────────────────────────────────────────────────────
  const cursorMap: Record<Tool, string> = {
    pen:"cursor-crosshair", pencil:"cursor-crosshair", highlighter:"cursor-crosshair",
    eraser:"cursor-cell", select:"cursor-move", text:"cursor-text",
    line:"cursor-crosshair", arrow:"cursor-crosshair", rect:"cursor-crosshair",
    circle:"cursor-crosshair", triangle:"cursor-crosshair", laser:"cursor-crosshair",
  };

  const currentStepIdx = animRef.current.shown.length - 1;

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={`flex h-full flex-col overflow-hidden ${isDark ? "bg-slate-950" : "bg-white"}`}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className={`flex shrink-0 items-center justify-between border-b px-2 py-1 ${isDark ? "border-slate-700 bg-slate-900" : "border-gray-200 bg-white"}`}>
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-bold ${isDark?"text-white":"text-slate-800"}`}>✏️ Teaching Board</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${isDark?"bg-slate-700 text-slate-400":"bg-slate-100 text-slate-400"}`}>
            pg {page+1}/{totalPages}
          </span>
          {!quotaLoading && <QuotaBadge quota={quota} />}
        </div>
        <div className="flex items-center gap-0.5">
          {(["blank","grid","dots"] as BgMode[]).map(m => (
            <TBtn key={m} active={bg===m} onClick={()=>setBg(m)} title={m} isDark={isDark}>
              {m==="grid"?<Grid3x3 size={13}/>:m==="dots"?<Dot size={13}/>:<Minus size={13}/>}
            </TBtn>
          ))}
          <TBtn onClick={()=>setTheme(t=>t==="light"?"dark":"light")} title="Theme" isDark={isDark}>
            {isDark?<Sun size={13}/>:<Moon size={13}/>}
          </TBtn>
          <TBtn onClick={()=>setZoom(z=>Math.min(5,z*1.25))} title="Zoom in" isDark={isDark}><ZoomIn size={13}/></TBtn>
          <TBtn onClick={()=>setZoom(z=>Math.max(0.2,z/1.25))} title="Zoom out" isDark={isDark}><ZoomOut size={13}/></TBtn>
          <button onClick={()=>{setZoom(1);setPan({x:0,y:0});}}
            className={`rounded px-1.5 py-1 font-mono text-[10px] transition-colors ${isDark?"text-slate-400 hover:bg-slate-700":"text-slate-400 hover:bg-gray-100"}`}>
            {Math.round(zoom*100)}%
          </button>
          <TBtn onClick={exportPNG} title="Export PNG" isDark={isDark}><Download size={13}/></TBtn>
          <TBtn onClick={newBoard}  title="New board"  isDark={isDark}><RotateCcw size={13}/></TBtn>
          <TBtn onClick={toggleFullscreen} title="Fullscreen" isDark={isDark}>
            {isFullscreen?<Minimize2 size={13}/>:<Maximize2 size={13}/>}
          </TBtn>
          <TBtn onClick={()=>setShowAI(s=>!s)} title="Toggle AI panel" isDark={isDark}>
            {showAI?<PanelRightClose size={13}/>:<PanelRightOpen size={13}/>}
          </TBtn>
        </div>
      </div>

      {/* ── Mobile tab bar ──────────────────────────────────────────────── */}
      <div className={`flex shrink-0 md:hidden border-b ${isDark?"border-slate-700 bg-slate-900":"border-gray-200 bg-white"}`}>
        <button onClick={()=>setMobileTab("board")}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${mobileTab==="board"?"border-indigo-500 text-indigo-600":isDark?"border-transparent text-slate-400":"border-transparent text-slate-500"}`}>
          <Pen size={14}/> Board
        </button>
        <button onClick={()=>setMobileTab("ai")}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${mobileTab==="ai"?"border-indigo-500 text-indigo-600":isDark?"border-transparent text-slate-400":"border-transparent text-slate-500"}`}>
          <Sparkles size={14}/> AI Teacher
          {animPhase==="running" && <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-indigo-500"/>}
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">

        {/* Board side (toolbar + canvas) — hidden on mobile when AI tab active */}
        <div className={`flex min-h-0 flex-1 ${mobileTab==="ai"?"hidden md:flex":"flex"}`}>

        {/* Left toolbar — desktop only */}
        <aside className={`hidden md:flex shrink-0 flex-col gap-0.5 border-r px-0.5 py-1.5 ${isDark?"border-slate-700 bg-slate-900":"border-gray-200 bg-gray-50"}`}>
          {([
            ["pen",         <Pen size={15}/>,                   "Pen (P)"],
            ["pencil",      <Pen size={13} className="opacity-50"/>, "Pencil"],
            ["highlighter", <Highlighter size={15}/>,           "Highlighter (H)"],
            ["eraser",      <Eraser size={15}/>,                "Eraser (E)"],
            ["select",      <MousePointer2 size={15}/>,         "Select (V)"],
            ["text",        <Type size={15}/>,                  "Text (T)"],
            ["line",        <Minus size={15}/>,                 "Line"],
            ["arrow",       <MoveRight size={15}/>,             "Arrow"],
            ["rect",        <Square size={15}/>,                "Rectangle"],
            ["circle",      <Circle size={15}/>,                "Circle"],
            ["triangle",    <Triangle size={15}/>,              "Triangle"],
            ["laser",       <Dot size={17} className="text-red-500"/>, "Laser (L)"],
          ] as [Tool, React.ReactNode, string][]).map(([t, icon, lbl]) => (
            <ToolBtn key={t} active={tool===t} onClick={()=>setTool(t)} title={lbl} isDark={isDark}>
              {icon}
            </ToolBtn>
          ))}

          <div className={`my-0.5 h-px mx-1 ${isDark?"bg-slate-700":"bg-gray-200"}`}/>
          <ToolBtn active={false} onClick={undo}      title="Undo (Ctrl+Z)"       isDark={isDark}><Undo2 size={14}/></ToolBtn>
          <ToolBtn active={false} onClick={redo}      title="Redo (Ctrl+Y)"       isDark={isDark}><Redo2 size={14}/></ToolBtn>
          <ToolBtn active={false} onClick={clearPage} title="Clear page"          isDark={isDark}><Trash2 size={14}/></ToolBtn>

          <div className={`my-0.5 h-px mx-1 ${isDark?"bg-slate-700":"bg-gray-200"}`}/>
          {STROKE_WIDTHS.map(w => (
            <button key={w} onClick={()=>setStrokeWidth(w)} title={`${w}px`}
              className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${strokeWidth===w?(isDark?"bg-indigo-700":"bg-indigo-100"):(isDark?"hover:bg-slate-700":"hover:bg-gray-100")}`}>
              <div className="rounded-full" style={{width:Math.max(3,w*1.2),height:Math.max(3,w*1.2),background:color}}/>
            </button>
          ))}

          <div className={`my-0.5 h-px mx-1 ${isDark?"bg-slate-700":"bg-gray-200"}`}/>
          {/* Color grid */}
          <div className="relative">
            <button onClick={()=>setShowColorPicker(s=>!s)}
              className="mx-0.5 h-7 w-7 rounded border-2 border-white/80 shadow transition-transform hover:scale-110"
              style={{background:color}} title="Colors"/>
            {showColorPicker && (
              <div className={`absolute left-9 top-0 z-50 rounded-xl border p-2 shadow-2xl ${isDark?"border-slate-600 bg-slate-800":"border-gray-200 bg-white"}`}>
                <p className={`mb-1.5 text-[9px] font-bold uppercase tracking-widest ${isDark?"text-slate-500":"text-slate-400"}`}>Smart Colors</p>
                <div className="mb-2 grid grid-cols-4 gap-1">
                  {[
                    [COLORS.blue,   "Explanation"],
                    [COLORS.green,  "Correct"],
                    [COLORS.red,    "Mistake"],
                    [COLORS.orange, "Warning"],
                    [COLORS.purple, "Definition"],
                    [COLORS.yellow, "Highlight"],
                    [COLORS.black,  "Default"],
                    [COLORS.gray,   "Note"],
                  ].map(([c,lbl]) => (
                    <button key={c} onClick={()=>{setColor(c);setShowColorPicker(false);}}
                      title={lbl as string}
                      className={`h-6 w-6 rounded border-2 transition-transform hover:scale-110 ${color===c?"border-indigo-500 scale-110":"border-white/50"}`}
                      style={{background:c as string}}/>
                  ))}
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={()=>{setColor(c);setShowColorPicker(false);}}
                      className={`h-5 w-5 rounded border transition-transform hover:scale-110 ${color===c?"border-indigo-500 scale-110":"border-white/20"}`}
                      style={{background:c}}/>
                  ))}
                </div>
                <input type="color" value={color} onChange={e=>setColor(e.target.value)}
                  className="mt-2 h-6 w-full cursor-pointer rounded"/>
              </div>
            )}
          </div>

          <div className={`my-0.5 h-px mx-1 ${isDark?"bg-slate-700":"bg-gray-200"}`}/>
          <ToolBtn active={false} onClick={()=>setPage(p=>Math.max(0,p-1))}     title="Prev page"  isDark={isDark}><ChevronLeft size={14}/></ToolBtn>
          <ToolBtn active={false} onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} title="Next page" isDark={isDark}><ChevronRight size={14}/></ToolBtn>
          <ToolBtn active={false} onClick={addPage}  title="Add page"  isDark={isDark}><Plus size={14}/></ToolBtn>
          <ToolBtn active={false} onClick={dupPage}  title="Dup page"  isDark={isDark}><CopyPlus size={14}/></ToolBtn>
        </aside>

        {/* Canvas */}
        <div ref={containerRef} className={`relative flex-1 overflow-hidden ${cursorMap[tool]}`} style={{touchAction:"none"}}>
          <canvas ref={bgRef}   className="absolute inset-0 pointer-events-none"/>
          <canvas ref={drawRef} className="absolute inset-0"
            onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp}
            onMouseLeave={()=>{if(tool==="laser"){laserPosRef.current=null;redrawCanvas();}}}
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
            onContextMenu={e=>e.preventDefault()}/>

          {/* Text input overlay */}
          {showTextInput && textPosRef.current && (()=>{
            const sc = toScreen(textPosRef.current!.x, textPosRef.current!.y);
            return (
              <input ref={textInputRef} value={textDraft}
                onChange={e=>setTextDraft(e.target.value)}
                onBlur={commitText}
                onKeyDown={e=>{if(e.key==="Enter")commitText();if(e.key==="Escape")setShowTextInput(false);}}
                className={`absolute z-20 min-w-32 border-b-2 border-indigo-500 bg-transparent px-1 outline-none ${isDark?"text-white":"text-slate-900"}`}
                style={{left:sc.x,top:sc.y,fontSize:`${(strokeWidth<4?16:strokeWidth<8?22:32)*zoom}px`,color}}
                placeholder="Type…"/>
            );
          })()}

          {/* HUD */}
          <div className={`absolute bottom-2 left-2 flex items-center gap-2 rounded-lg px-2 py-1 text-[10px] ${isDark?"bg-slate-800/80 text-slate-500":"bg-white/80 text-slate-400"} backdrop-blur`}>
            <span>{Math.round(zoom*100)}%</span>
            <span>·</span>
            <span>Pg {page+1}/{totalPages}</span>
            {animPhase==="running" && <><span>·</span><span className="animate-pulse text-indigo-400">Teaching…</span></>}
          </div>

          {/* Empty state hint */}
          {(elemRef.current[page]??[]).length === 0 && visibleSteps.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 opacity-25">
              <Pen size={48} className={isDark?"text-slate-500":"text-slate-300"}/>
              <p className={`text-sm ${isDark?"text-slate-500":"text-slate-300"}`}>Start drawing, or ask the AI to teach</p>
            </div>
          )}

          {/* Teacher hand overlay */}
          {animPhase !== "idle" && (
            <TeacherHand pos={handScreenPos} state={handState} isDark={isDark}/>
          )}
        </div>{/* /canvas */}

        </div>{/* /board-side */}

        {/* ── AI Teaching Panel ────────────────────────────────────────── */}
        {(showAI || mobileTab === "ai") && (
          <aside className={`${mobileTab==="board"?"hidden md:flex":"flex"} shrink-0 flex-col border-t md:border-t-0 md:border-l md:w-[340px] w-full ${isDark?"border-slate-700 bg-slate-900":"border-gray-100 bg-gray-50"}`}
            style={{height:"100%"}}>

            {/* Panel header */}
            <div className={`flex shrink-0 flex-col border-b ${isDark?"border-slate-700":"border-gray-200"}`}>
              {/* Row 1: title + speed + clear */}
              <div className={`flex items-center justify-between px-3 py-2`}>
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600">
                    <Sparkles size={12} className="text-white"/>
                  </div>
                  <span className={`text-sm font-bold ${isDark?"text-white":"text-slate-800"}`}>AI Teaching Mode</span>
                </div>
                <div className="flex items-center gap-1">
                  {(["slow","normal","fast"] as Speed[]).map(s => (
                    <button key={s} onClick={()=>changeSpeed(s)}
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase transition-colors ${speed===s?"bg-indigo-600 text-white":(isDark?"text-slate-500 hover:text-slate-300":"text-slate-400 hover:text-slate-600")}`}>
                      {s==="slow"?"🐢":s==="fast"?"⚡":"●"} {s}
                    </button>
                  ))}
                  {visibleSteps.length > 0 && (
                    <button onClick={()=>{setVisibleSteps([]);setAnimPhase("idle");cancelAnimationFrame(rafRef.current);}}
                      title="Clear panel" className={`ml-1 rounded p-1 transition-colors ${isDark?"text-slate-500 hover:text-red-400":"text-slate-400 hover:text-red-500"}`}>
                      <X size={12}/>
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: Toggles */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-semibold ${isDark?"text-slate-400":"text-slate-500"}`}>✏️ Write on board</span>
                  <button onClick={()=>setDrawOnCanvas(v=>!v)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${drawOnCanvas?(isDark?"bg-indigo-600":"bg-indigo-500"):(isDark?"bg-slate-700":"bg-gray-300")}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${drawOnCanvas?"translate-x-4":"translate-x-0.5"}`}/>
                  </button>
                </div>
                {aiElemIdsRef.current.size > 0 && (
                  <button onClick={clearAIDrawing}
                    className={`ml-auto rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${isDark?"text-slate-500 hover:text-red-400 hover:bg-red-900/20":"text-slate-400 hover:text-red-500 hover:bg-red-50"}`}>
                    Clear board text
                  </button>
                )}
              </div>
            </div>

            {/* Subject quick-select */}
            <div className={`shrink-0 border-b ${isDark?"border-slate-700":"border-gray-100"}`}>
              <button onClick={()=>setShowSubjects(s=>!s)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${isDark?"text-slate-500 hover:text-slate-300":"text-slate-400 hover:text-slate-600"}`}>
                <span>Quick Subject</span>
                {showSubjects?<ChevronUp size={10}/>:<ChevronDown size={10}/>}
              </button>
              {showSubjects && (
                <div className="flex flex-wrap gap-1 px-2 pb-2">
                  {SUBJECTS.map(s => (
                    <button key={s.label}
                      onClick={()=>{setQuestion(s.q);setShowSubjects(false);questionRef.current?.focus();}}
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${isDark?"bg-slate-700 text-slate-300 hover:bg-slate-600":"bg-white border border-gray-200 text-slate-600 hover:bg-gray-100"}`}>
                      {s.icon}{s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Progress bar (shown while animating) */}
            {(animPhase==="running"||animPhase==="paused") && totalSteps > 0 && (
              <div className={`shrink-0 border-b px-3 py-2 ${isDark?"border-slate-700":"border-gray-100"}`}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className={`text-[10px] font-medium ${isDark?"text-slate-400":"text-slate-500"}`}>
                    Step {Math.min(visibleSteps.length, totalSteps)} of {totalSteps}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={pauseResume}
                      className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${isDark?"bg-slate-700 text-slate-300 hover:bg-slate-600":"bg-white border border-gray-200 text-slate-600 hover:bg-gray-100"}`}>
                      {animPhase==="paused"?<><Play size={9}/>Resume</>:<><Pause size={9}/>Pause</>}
                    </button>
                    <button onClick={skipAnimation}
                      className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${isDark?"bg-slate-700 text-slate-300 hover:bg-slate-600":"bg-white border border-gray-200 text-slate-600 hover:bg-gray-100"}`}>
                      <SkipForward size={9}/>Skip
                    </button>
                  </div>
                </div>
                <div className={`h-1.5 w-full overflow-hidden rounded-full ${isDark?"bg-slate-700":"bg-gray-200"}`}>
                  <div className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                    style={{width:`${Math.round((visibleSteps.length/totalSteps)*100)}%`}}/>
                </div>
              </div>
            )}

            {/* Teaching steps — scrollable, takes all remaining space */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex flex-col gap-2 p-2.5">
                {visibleSteps.length === 0 && !loading && (
                  <div className={`rounded-xl border p-4 text-center ${isDark?"border-slate-700 bg-slate-800":"border-gray-100 bg-white"}`}>
                    <div className="mb-2 flex justify-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
                        <Sparkles size={20} className="text-indigo-600"/>
                      </div>
                    </div>
                    <p className={`text-sm font-semibold ${isDark?"text-white":"text-slate-700"}`}>Bishal's Teaching Mode</p>
                    <p className={`mt-1 text-[11px] leading-relaxed ${isDark?"text-slate-400":"text-slate-500"}`}>
                      Ask any question below. The AI will teach it step by step — like a real teacher writing on a whiteboard.
                    </p>
                    <div className="mt-3 flex flex-col gap-1.5">
                      {[
                        "Explain Newton's Second Law of Motion",
                        "Solve: 3x² - 12 = 0",
                        "What is photosynthesis?",
                        "Explain supply and demand",
                        "How does DNA replication work?",
                      ].map(q => (
                        <button key={q} onClick={()=>{setQuestion(q);questionRef.current?.focus();}}
                          className={`rounded-lg px-3 py-1.5 text-left text-[11px] leading-snug transition-colors ${isDark?"bg-slate-700/70 text-slate-300 hover:bg-slate-700":"bg-gray-50 border border-gray-200 text-slate-600 hover:bg-gray-100"}`}>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {loading && (
                  <div className={`flex flex-col items-center gap-3 rounded-xl border p-6 ${isDark?"border-slate-700 bg-slate-800":"border-gray-100 bg-white"}`}>
                    <div className="relative flex h-10 w-10 items-center justify-center">
                      <div className="absolute h-10 w-10 animate-ping rounded-full bg-indigo-300 opacity-30"/>
                      <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"/>
                    </div>
                    <div className="text-center">
                      <p className={`text-sm font-medium ${isDark?"text-slate-300":"text-slate-700"}`}>Preparing your lesson…</p>
                      <p className={`mt-0.5 text-[10px] ${isDark?"text-slate-500":"text-slate-400"}`}>AI is thinking like a teacher</p>
                    </div>
                  </div>
                )}

                {visibleSteps.map((step, i) => (
                  <TeachCard key={step.id} step={step} isDark={isDark}
                    isActive={i === currentStepIdx && animPhase === "running"}/>
                ))}

                {/* Follow-up chips after teaching is done */}
                {animPhase === "done" && visibleSteps.length > 0 && (
                  <div className={`rounded-xl border p-2.5 ${isDark?"border-slate-700 bg-slate-800":"border-gray-100 bg-white"}`}>
                    <p className={`mb-2 text-[9px] font-bold uppercase tracking-widest ${isDark?"text-slate-500":"text-slate-400"}`}>
                      Continue learning
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {FOLLOWUP_CHIPS.map(chip => (
                        <button key={chip} onClick={()=>teach(chip)}
                          className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${isDark?"bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800":"bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}>
                          {chip}
                        </button>
                      ))}
                    </div>
                    <div className={`mt-2 flex items-center justify-between border-t pt-2 ${isDark?"border-slate-700":"border-gray-100"}`}>
                      <span className={`text-[9px] ${isDark?"text-slate-600":"text-slate-300"}`}>
                        {visibleSteps.filter(s=>s.type!=="separator").length} steps · {chatHistory.length/2 | 0} questions asked
                      </span>
                      <button onClick={copyTeaching}
                        className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] transition-colors ${isDark?"text-slate-400 hover:text-slate-200":"text-slate-400 hover:text-slate-700"}`}>
                        <Clipboard size={10}/> Copy
                      </button>
                    </div>
                  </div>
                )}

                <div ref={stepsEndRef}/>
              </div>
            </div>

            {/* ── Input — always visible at bottom ─────────────────────── */}
            <div className={`shrink-0 border-t p-2.5 ${isDark?"border-slate-700 bg-slate-900":"border-gray-200 bg-white"}`}>
              {/* Chat history summary (last question only) */}
              {chatHistory.length > 0 && animPhase !== "running" && animPhase !== "paused" && (
                <div className={`mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] ${isDark?"bg-slate-800 text-slate-400":"bg-gray-50 text-slate-500"}`}>
                  <MessageCircle size={10}/>
                  <span className="truncate">
                    Last: {chatHistory.filter(m=>m.role==="user").at(-1)?.content.slice(0,50)}…
                  </span>
                  <button onClick={()=>{setVisibleSteps([]);setChatHistory([]);setAnimPhase("idle");}}
                    className="ml-auto shrink-0 hover:text-red-400"><X size={9}/></button>
                </div>
              )}

              <div className={`flex items-end gap-1.5 rounded-xl border p-1 ${isDark?"border-slate-600 bg-slate-800 focus-within:border-indigo-500":"border-gray-200 bg-white focus-within:border-indigo-400"} transition-colors`}>
                <textarea
                  ref={questionRef}
                  value={question}
                  onChange={e=>setQuestion(e.target.value)}
                  onKeyDown={handleQuestionKey}
                  placeholder={chatHistory.length>0 ? "Ask a follow-up…" : "Ask anything to teach on this board…"}
                  rows={2}
                  disabled={loading || animPhase==="running"}
                  className={`min-h-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none ${isDark?"text-white placeholder:text-slate-500":"text-slate-800 placeholder:text-slate-400"}`}
                />
                <div className="flex shrink-0 flex-col gap-1 pr-0.5 pb-0.5">
                  <button onClick={toggleVoice} title="Voice input"
                    className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${isListening?"bg-red-500 text-white animate-pulse":"text-slate-400 hover:bg-gray-100 hover:text-slate-700"}`}>
                    {isListening?<MicOff size={13}/>:<Mic size={13}/>}
                  </button>
                  <button onClick={()=>teach()} disabled={loading||!question.trim()||animPhase==="running"}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-40">
                    <Send size={13}/>
                  </button>
                </div>
              </div>
              <p className={`mt-1 text-center text-[9px] ${isDark?"text-slate-600":"text-slate-300"}`}>
                Enter to teach · Shift+Enter for newline · {speed==="slow"?"🐢 Slow":speed==="fast"?"⚡ Fast":"● Normal"} speed
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TBtn({ children, onClick, title, isDark, active }: {
  children: React.ReactNode; onClick: () => void;
  title?: string; isDark: boolean; active?: boolean;
}) {
  return (
    <button onClick={onClick} title={title}
      className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
        active
          ? (isDark?"bg-indigo-600 text-white":"bg-indigo-100 text-indigo-700")
          : (isDark?"text-slate-400 hover:bg-slate-700 hover:text-slate-200":"text-slate-400 hover:bg-gray-100 hover:text-slate-700")
      }`}>
      {children}
    </button>
  );
}

function ToolBtn({ children, active, onClick, title, isDark }: {
  children: React.ReactNode; active: boolean;
  onClick: () => void; title?: string; isDark: boolean;
}) {
  return (
    <button onClick={onClick} title={title}
      className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
        active
          ? "bg-indigo-600 text-white shadow-sm"
          : (isDark?"text-slate-400 hover:bg-slate-700 hover:text-slate-200":"text-slate-500 hover:bg-gray-200 hover:text-slate-800")
      }`}>
      {children}
    </button>
  );
}

// ─── Teacher Hand ─────────────────────────────────────────────────────────────

// ─── Teacher Hand — follows the writing cursor on canvas ──────────────────────
// The pen tip is positioned at (pos.x, pos.y) in canvas screen coords.
// The hand SVG is laid out so its pen tip is at (48, 0) in SVG space.
// We offset left by 48 and up by ~110 so the hand sits above/right of writing point.

// ─── Teacher Hand ─────────────────────────────────────────────────────────────
// Uses the real hand-marker photo (public/hand-marker.png, 262×380 RGBA).
// The blue marker tip sits at ~(121, 355) in the 262×380 source image.
// Displayed at 130 px wide (scale ≈ 0.496) → tip at display (60, 176).
// Positioning: left = pos.x − 60 / top = pos.y − 176
// so the pen tip lands exactly at the writing coordinate on screen.
// The hand body extends upward from the tip, which is the natural writing posture.

const HAND_W       = 80;           // display width in px (smaller = less text coverage)
const HAND_TIP_X   = 37;           // tip x-offset inside displayed image (scaled from 60)
const HAND_TIP_Y   = 108;          // tip y-offset inside displayed image (scaled from 176)

function TeacherHand({
  pos, state,
}: {
  pos: { x: number; y: number };
  state: "idle" | "writing" | "done";
  isDark: boolean;
}) {
  const isWriting = state === "writing";
  const isDone    = state === "done";

  return (
    <>
      {/* Status pill — floats just to the left of the tip */}
      {isWriting && (
        <div
          className="pointer-events-none absolute z-20 select-none"
          style={{
            left: Math.max(4, pos.x - 120),
            top:  Math.max(4, pos.y - 30),
            transition: "left 0.25s ease-out, top 0.25s ease-out",
          }}
        >
          <div className="flex items-center gap-1.5 rounded-full bg-slate-900/85 px-2.5 py-1 text-[10px] font-semibold text-white shadow-lg backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400"/>
            writing…
          </div>
        </div>
      )}
      {isDone && (
        <div
          className="pointer-events-none absolute z-20 select-none"
          style={{
            left: Math.max(4, pos.x - 70),
            top:  Math.max(4, pos.y - 30),
          }}
        >
          <div className="flex items-center gap-1 rounded-full bg-emerald-600/90 px-2.5 py-1 text-[10px] font-semibold text-white shadow-lg">
            ✓ Done!
          </div>
        </div>
      )}

      {/* Real hand photo — tip anchored to writing position */}
      <div
        className="pointer-events-none absolute z-10 select-none"
        style={{
          left:    pos.x - HAND_TIP_X,
          top:     pos.y - HAND_TIP_Y,
          width:   HAND_W,
          // smooth position during writing, ease-out when resting
          transition: isWriting
            ? "left 0.09s linear, top 0.09s linear, opacity 0.3s"
            : "left 0.5s ease-out, top 0.5s ease-out, opacity 0.4s",
          opacity: state === "idle" ? 0 : 1,
          // subtle micro-jitter while writing via CSS animation on the img
        }}
      >
        <style>{`
          @keyframes hwPhotoWrite {
            0%,100% { transform: rotate(0deg) translate(0px,  0px); }
            25%      { transform: rotate( 0.6deg) translate( 0.5px, -0.3px); }
            75%      { transform: rotate(-0.4deg) translate(-0.3px,  0.2px); }
          }
          @keyframes hwPhotoIdle {
            0%,100% { transform: translate(0px, 0px); }
            50%      { transform: translate(0px, 2px); }
          }
          .hw-photo {
            transform-origin: ${HAND_TIP_X}px ${HAND_TIP_Y}px;
            animation: ${isWriting
              ? "hwPhotoWrite 0.28s ease-in-out infinite"
              : "hwPhotoIdle 2.6s ease-in-out infinite"};
          }
        `}</style>
        <img
          src="/hand-marker.png"
          alt=""
          className="hw-photo block"
          width={HAND_W}
          draggable={false}
          style={{ imageRendering: "auto" }}
        />
      </div>
    </>
  );
}

function SidebarTable({ text, colorHex, isDark }: { text: string; colorHex: string; isDark: boolean }) {
  const rows = text.split("\\n").map(r => r.split("|").map(c => c.trim())).filter(r => r.length >= 2);
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: colorHex + "55" }}>
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr style={{ background: colorHex + "22" }}>
            {rows[0].map((cell, ci) => (
              <th key={ci} className="px-2 py-1.5 text-left font-bold border-b"
                style={{ borderColor: colorHex + "44", color: colorHex }}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? (isDark ? "bg-white/5" : "bg-black/[0.02]") : ""}>
              {row.map((cell, ci) => (
                <td key={ci} className={`px-2 py-1.5 border-t ${isDark?"text-slate-200":"text-slate-700"}`}
                  style={{ borderColor: colorHex + "22" }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeachCard({ step, isDark, isActive }: { step: TeachStep; isDark: boolean; isActive: boolean }) {
  if (step.type === "separator") return <div className={`my-0.5 border-t border-dashed ${isDark?"border-slate-700":"border-gray-200"}`}/>;

  const colorHex = TYPE_COLOR[step.type];
  const bgCls    = isDark ? DARK_TYPE_BG[step.type] : LIGHT_TYPE_BG[step.type];
  const isTitle  = step.type === "title";
  const isFormula= step.type === "formula";
  const isTable  = step.type === "table";
  const label    = step.type === "step" && step.num ? `Step ${step.num}` : TYPE_LABEL[step.type];
  const isComplete = step.revealed >= step.fullText.length && step.fullText.length > 0;

  const iconMap: Record<TeachType, React.ReactNode> = {
    title:      <BookOpen size={11}/>,
    explain:    <MessageCircle size={11}/>,
    formula:    <Hash size={11}/>,
    step:       <Hash size={11}/>,
    answer:     <CheckCircle2 size={11}/>,
    tip:        <Lightbulb size={11}/>,
    warning:    <AlertTriangle size={11}/>,
    definition: <BookOpen size={11}/>,
    separator:  null,
    diagram:    <FlaskConical size={11}/>,
    table:      <BarChart3 size={11}/>,
  };

  return (
    <div className={`
      rounded-lg border px-2.5 py-2 transition-all duration-300
      ${bgCls}
      ${isActive ? "ring-2 ring-indigo-400 ring-offset-1 shadow-md" : ""}
      ${step.revealed === 0 ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"}
    `}
    style={{ transition: "opacity 0.25s, transform 0.25s" }}>
      <div className="mb-1 flex items-center gap-1" style={{ color: colorHex }}>
        {iconMap[step.type]}
        <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
        {isActive && (
          <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500"/>
        )}
      </div>
      {isTable && isComplete ? (
        <SidebarTable text={step.fullText} colorHex={colorHex} isDark={isDark} />
      ) : isTable ? (
        <div className={`flex items-center gap-1.5 text-[10px] ${isDark?"text-slate-400":"text-slate-500"}`}>
          <span className="animate-pulse">Building table…</span>
          <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-current align-middle"/>
        </div>
      ) : (
        <p className={`leading-relaxed ${isDark?"text-slate-200":"text-slate-800"} ${isTitle?"text-sm font-bold":isFormula?"font-mono text-sm font-semibold":"text-xs"}`}
          style={isFormula ? { color: colorHex } : undefined}>
          {step.text}
          {isActive && step.revealed < step.fullText.length && (
            <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-current align-middle"/>
          )}
        </p>
      )}
    </div>
  );
}
