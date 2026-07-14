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
          | "text" | "line" | "arrow" | "rect" | "circle" | "triangle" | "laser";

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
               | "answer" | "tip" | "warning" | "definition" | "separator";

interface TeachStep {
  id: string; type: TeachType; text: string;
  num?: number; fullText: string; revealed: number;
}

interface ConvMsg { role: "user" | "assistant"; content: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = {
  blue: "#3B82F6", green: "#22C55E", red: "#EF4444",
  orange: "#F97316", purple: "#A855F7", yellow: "#EAB308",
  black: "#1E293B", white: "#F8FAFC", gray: "#64748B",
  pink: "#EC4899", teal: "#14B8A6",
};

const TYPE_COLOR: Record<TeachType, string> = {
  title: COLORS.blue, explain: COLORS.black, formula: COLORS.purple,
  step: COLORS.blue, answer: COLORS.green, tip: COLORS.orange,
  warning: COLORS.red, definition: COLORS.purple, separator: COLORS.gray,
};

const DARK_TYPE_BG: Record<TeachType, string> = {
  title: "bg-blue-900/40 border-blue-600",
  explain: "bg-slate-800/70 border-slate-600",
  formula: "bg-purple-900/40 border-purple-600",
  step: "bg-blue-900/30 border-blue-700",
  answer: "bg-green-900/40 border-green-600",
  tip: "bg-orange-900/40 border-orange-600",
  warning: "bg-red-900/40 border-red-600",
  definition: "bg-violet-900/40 border-violet-600",
  separator: "bg-transparent border-transparent",
};
const LIGHT_TYPE_BG: Record<TeachType, string> = {
  title: "bg-blue-50 border-blue-300",
  explain: "bg-white border-gray-200",
  formula: "bg-purple-50 border-purple-300",
  step: "bg-blue-50 border-blue-200",
  answer: "bg-green-50 border-green-300",
  tip: "bg-orange-50 border-orange-300",
  warning: "bg-red-50 border-red-300",
  definition: "bg-violet-50 border-violet-300",
  separator: "bg-transparent border-transparent",
};

const TYPE_LABEL: Record<TeachType, string> = {
  title: "Topic", explain: "Explanation", formula: "Formula",
  step: "Step", answer: "Answer", tip: "Pro Tip",
  warning: "Watch Out", definition: "Definition", separator: "",
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
  return `You are Bishal's expert AI teacher on an interactive whiteboard. A student asked:
"${q}"${ctx}

Return ONLY valid JSON (no markdown, no prose outside the JSON) in this exact structure:
{
  "topic": "short topic title",
  "steps": [
    {"type":"title","text":"..."},
    {"type":"explain","text":"..."},
    {"type":"formula","text":"..."},
    {"type":"step","num":1,"text":"..."},
    {"type":"step","num":2,"text":"..."},
    {"type":"answer","text":"..."},
    {"type":"tip","text":"..."}
  ]
}

Step type rules:
- "title"      → Topic heading — always first
- "explain"    → Overview of what the question is asking
- "definition" → Define a key term
- "formula"    → A formula, equation or rule
- "step"       → Numbered solution steps (include "num": N)
- "answer"     → Final answer — always green, always last meaningful step
- "tip"        → Shortcut or memory aid — orange
- "warning"    → Common mistake to avoid — red
- "separator"  → Visual divider {"type":"separator","text":""}

Requirements:
- 8 to 16 steps total. Never fewer than 6.
- SHORT step text — 1-3 sentences max. This is a whiteboard, not a textbook.
- No LaTeX: no \\frac, \\sqrt, $...$, backslashes
- Use Unicode: ×, ÷, √, ², ³, π, ≈, ±, θ, Δ, →, °
- Fractions as (a)/(b). Square roots as √(x)
- For follow-ups: build on context, don't repeat the whole intro
- Match the student's language`;
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

const VALID_TYPES = new Set(["title","explain","formula","step","answer","tip","warning","definition","separator"]);

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

function drawText(ctx: CanvasRenderingContext2D, el: DrawEl) {
  if (!el.text || el.x1 === undefined) return;
  ctx.save();
  ctx.font = `${el.fontSize ?? 18}px Inter, sans-serif`;
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

// ─── Main component ───────────────────────────────────────────────────────────

function WhiteboardPage() {
  const { user } = Route.useRouteContext();
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "cerebras");

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

  // ── Canvas-write state ────────────────────────────────────────────────────
  const [drawOnCanvas, setDrawOnCanvas]   = useState(true);
  const drawOnCanvasRef                   = useRef(true);
  const canvasWritePosRef                 = useRef<{ x: number; y: number }>({ x: 48, y: 64 });
  const aiElemIdsRef                      = useRef<Set<string>>(new Set());
  // callback ref so animation RAF can call it without stale closures
  const writeStepCbRef                    = useRef<(step: TeachStep) => void>(() => {});

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

  // ── Write AI step to canvas ──────────────────────────────────────────────
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
    const fontSize = isTtl ? 26 : isFml ? 18 : 14;
    const lineH    = fontSize * 1.55;
    const maxW     = Math.max(200, (canvas.width * 0.55) / zoomRef.current);

    // Label row (skip for plain "explain" steps)
    const lbl = step.type === "step" && step.num
      ? `▸ STEP ${step.num}`
      : step.type !== "explain"
        ? `▸ ${TYPE_LABEL[step.type].toUpperCase()}`
        : "";

    if (lbl) {
      const labelId = uid();
      aiElemIdsRef.current.add(labelId);
      elemRef.current[pg] = [...(elemRef.current[pg] ?? []), {
        id: labelId, tool: "text", points: [], color: clr,
        strokeWidth: 1, opacity: 1, page: pg,
        text: lbl, fontSize: 10, x1: pos.x, y1: pos.y,
      }];
      pos.y += 16;
    }

    // Word-wrap body text
    ctx.font = `${fontSize}px Inter, sans-serif`;
    const words = step.fullText.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width / zoomRef.current > maxW && line) {
        lines.push(line); line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

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
        strokeWidth: 1.5, opacity: 0.4, page: pg,
        x1: pos.x, y1: pos.y + 2, x2: pos.x + maxW, y2: pos.y + 2,
      }];
      pos.y += 14;
    } else {
      pos.y += 10;
    }

    // Auto-pan down if content is near the bottom edge
    if (canvas && pos.y * zoomRef.current + panRef.current.y > canvas.height - 120) {
      setPan(p => ({ ...p, y: Math.min(0, -(pos.y * zoomRef.current - canvas.height * 0.35)) }));
    }

    redrawCanvas();
  }, [redrawCanvas]);

  // Keep the callback ref in sync so the RAF loop always calls the latest version
  useEffect(() => { writeStepCbRef.current = writeStepToCanvas; }, [writeStepToCanvas]);

  // Clear only AI-written elements, leaving user drawings untouched
  function clearAIDrawing() {
    const ids = aiElemIdsRef.current;
    for (let pg = 0; pg < elemRef.current.length; pg++) {
      elemRef.current[pg] = (elemRef.current[pg] ?? []).filter(e => !ids.has(e.id));
    }
    aiElemIdsRef.current = new Set();
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
          // Auto-scroll as text reveals
          stepsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        } else {
          // Step finished typing — write it to the canvas
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
    // Write all steps that haven't been written yet to the canvas
    const alreadyWritten = a.shown.length - 1; // last shown was mid-typing, not written
    for (let i = Math.max(0, alreadyWritten); i < a.pending.length; i++) {
      writeStepCbRef.current(a.pending[i]);
    }
    const all = a.pending.map(s => ({ ...s, text: s.fullText, revealed: s.fullText.length }));
    a.shown = all; a.phase = "done";
    setVisibleSteps(all);
    setAnimPhase("done");
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

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">

        {/* Left toolbar */}
        <aside className={`flex shrink-0 flex-col gap-0.5 border-r px-0.5 py-1.5 ${isDark?"border-slate-700 bg-slate-900":"border-gray-200 bg-gray-50"}`}>
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
        </div>

        {/* ── AI Teaching Panel ────────────────────────────────────────── */}
        {showAI && (
          <aside className={`flex w-[340px] shrink-0 flex-col border-l ${isDark?"border-slate-700 bg-slate-900":"border-gray-100 bg-gray-50"}`}
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

              {/* Row 2: Write-on-board toggle */}
              <div className={`flex items-center justify-between px-3 pb-2`}>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-semibold ${isDark?"text-slate-400":"text-slate-500"}`}>
                    ✏️ Write answers on board
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Clear AI writing button */}
                  {aiElemIdsRef.current.size > 0 && (
                    <button onClick={clearAIDrawing}
                      className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${isDark?"text-slate-500 hover:text-red-400 hover:bg-red-900/20":"text-slate-400 hover:text-red-500 hover:bg-red-50"}`}>
                      Clear board text
                    </button>
                  )}
                  {/* Toggle pill */}
                  <button
                    onClick={()=>setDrawOnCanvas(v=>!v)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${drawOnCanvas?(isDark?"bg-indigo-600":"bg-indigo-500"):(isDark?"bg-slate-700":"bg-gray-300")}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${drawOnCanvas?"translate-x-4":"translate-x-0.5"}`}/>
                  </button>
                </div>
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

function TeachCard({ step, isDark, isActive }: { step: TeachStep; isDark: boolean; isActive: boolean }) {
  if (step.type === "separator") return <div className={`my-0.5 border-t border-dashed ${isDark?"border-slate-700":"border-gray-200"}`}/>;

  const colorHex = TYPE_COLOR[step.type];
  const bgCls    = isDark ? DARK_TYPE_BG[step.type] : LIGHT_TYPE_BG[step.type];
  const isTitle  = step.type === "title";
  const isFormula= step.type === "formula";
  const label    = step.type === "step" && step.num ? `Step ${step.num}` : TYPE_LABEL[step.type];

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
      <p className={`leading-relaxed ${isDark?"text-slate-200":"text-slate-800"} ${isTitle?"text-sm font-bold":isFormula?"font-mono text-sm font-semibold":"text-xs"}`}
        style={isFormula ? { color: colorHex } : undefined}>
        {step.text}
        {isActive && step.revealed < step.fullText.length && (
          <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-current align-middle"/>
        )}
      </p>
    </div>
  );
}
