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
  MoveRight, Triangle, Dot, Layers, PanelRightClose, PanelRightOpen,
  Minus as MinusIcon, CopyPlus, Copy,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/whiteboard")({
  component: WhiteboardPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type Tool =
  | "pen" | "pencil" | "highlighter" | "eraser" | "select"
  | "text" | "line" | "arrow" | "rect" | "circle" | "triangle" | "laser";

type BgMode = "blank" | "grid" | "dots";
type Theme = "light" | "dark";

interface Pt { x: number; y: number }

interface DrawEl {
  id: string;
  tool: Tool;
  points: Pt[];
  color: string;
  strokeWidth: number;
  opacity: number;
  fontSize?: number;
  text?: string;
  page: number;
  // shape bounds (rect/circle/triangle/line/arrow)
  x1?: number; y1?: number; x2?: number; y2?: number;
}

type TeachType =
  | "title" | "explain" | "formula" | "step"
  | "answer" | "tip" | "warning" | "definition" | "separator";

interface TeachStep {
  id: string;
  type: TeachType;
  text: string;
  num?: number;
  fullText: string;
  revealed: number; // chars revealed so far
}

interface ConvMsg { role: "user" | "assistant"; content: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = {
  blue:   "#3B82F6",
  green:  "#22C55E",
  red:    "#EF4444",
  orange: "#F97316",
  purple: "#A855F7",
  yellow: "#EAB308",
  black:  "#1E293B",
  white:  "#F8FAFC",
  gray:   "#64748B",
};

const TYPE_COLOR: Record<TeachType, string> = {
  title:      COLORS.blue,
  explain:    COLORS.black,
  formula:    COLORS.purple,
  step:       COLORS.blue,
  answer:     COLORS.green,
  tip:        COLORS.orange,
  warning:    COLORS.red,
  definition: COLORS.purple,
  separator:  COLORS.gray,
};

const TYPE_BG: Record<TeachType, string> = {
  title:      "bg-blue-50 border-blue-300",
  explain:    "bg-white border-gray-200",
  formula:    "bg-purple-50 border-purple-300",
  step:       "bg-blue-50 border-blue-200",
  answer:     "bg-green-50 border-green-300",
  tip:        "bg-orange-50 border-orange-300",
  warning:    "bg-red-50 border-red-300",
  definition: "bg-purple-50 border-purple-300",
  separator:  "bg-transparent border-transparent",
};

const TYPE_ICON: Record<TeachType, React.ReactNode> = {
  title:      <BookOpen size={15} />,
  explain:    <MessageCircle size={15} />,
  formula:    <Hash size={15} />,
  step:       <Hash size={15} />,
  answer:     <CheckCircle2 size={15} />,
  tip:        <Lightbulb size={15} />,
  warning:    <AlertTriangle size={15} />,
  definition: <BookOpen size={15} />,
  separator:  null,
};

const PRESET_COLORS = [
  COLORS.black, COLORS.blue, COLORS.green, COLORS.red,
  COLORS.orange, COLORS.purple, COLORS.yellow, COLORS.white,
];

const STROKE_WIDTHS = [2, 4, 6, 10, 16];

const CHAR_SPEED_MS = 18; // ms per character in typewriter

// ─── AI prompt ────────────────────────────────────────────────────────────────

function buildTeachingPrompt(question: string, history: ConvMsg[]): string {
  const prevContext = history.length > 0
    ? `\n\nPrevious teaching context (last ${Math.min(history.length, 4)} messages):\n` +
      history.slice(-4).map(m => `[${m.role}]: ${m.content.slice(0, 400)}`).join("\n")
    : "";

  return `You are Bishal's expert AI teacher on an interactive whiteboard. A student asked:
"${question}"
${prevContext}

Return ONLY valid JSON (no markdown, no prose) in this exact structure:
{
  "topic": "short title for this explanation",
  "steps": [
    {"type": "title", "text": "..."},
    {"type": "explain", "text": "..."},
    {"type": "formula", "text": "..."},
    {"type": "step", "num": 1, "text": "..."},
    {"type": "step", "num": 2, "text": "..."},
    {"type": "answer", "text": "..."},
    {"type": "tip", "text": "..."}
  ]
}

Step types and when to use:
- "title"      → Topic heading (always first, always include)
- "explain"    → What the question is asking / concept overview
- "formula"    → A formula, equation, or rule (use for math/science)
- "definition" → Define a key term (use purple)
- "step"       → Numbered solution step (include "num": N)
- "diagram"    → (type "explain") describe a diagram in text with ASCII art if useful
- "answer"     → The final answer (always last meaningful step, green box)
- "tip"        → Shortcut, trick, or memory aid (orange)
- "warning"    → Common mistake to avoid (red)
- "separator"  → Visual break (use sparingly, just {"type":"separator","text":""})

Rules:
- 8 to 16 steps total
- NEVER use LaTeX: no \\frac, \\sqrt, $...$, or backslashes
- Use Unicode: ×, ÷, √, ², ³, π, ≈, ±, θ, Δ, →
- Write fractions as (a)/(b) or a/b
- Keep each step text SHORT (1-3 sentences max — this is a whiteboard, not a textbook)
- For follow-up questions, build on the existing context without repeating the full intro
- Answer in the same language the student used`;
}

// ─── Parse AI JSON response ───────────────────────────────────────────────────

interface RawStep { type: string; text: string; num?: number }
interface TeachScript { topic: string; steps: RawStep[] }

function parseTeachScript(raw: string): TeachScript | null {
  try {
    const clean = raw.replace(/```json\n?|\n?```/g, "").trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const j = JSON.parse(match[0]);
    if (!j.steps || !Array.isArray(j.steps)) return null;
    return j as TeachScript;
  } catch { return null; }
}

function scriptToSteps(script: TeachScript): TeachStep[] {
  return script.steps.map((s, i) => {
    const type = (
      ["title","explain","formula","step","answer","tip","warning","definition","separator"]
        .includes(s.type) ? s.type : "explain"
    ) as TeachType;
    return {
      id: `step-${Date.now()}-${i}`,
      type,
      num: s.num,
      fullText: s.text ?? "",
      text: "",
      revealed: 0,
    };
  });
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function drawPath(ctx: CanvasRenderingContext2D, el: DrawEl, zoom: number) {
  if (el.points.length < 2) return;
  ctx.save();
  ctx.globalAlpha = el.opacity;
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.strokeWidth * zoom;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (el.tool === "highlighter") {
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = el.strokeWidth * zoom * 2.5;
  }
  ctx.beginPath();
  ctx.moveTo(el.points[0].x, el.points[0].y);
  for (let i = 1; i < el.points.length; i++) {
    const mid = { x: (el.points[i-1].x + el.points[i].x)/2, y: (el.points[i-1].y + el.points[i].y)/2 };
    ctx.quadraticCurveTo(el.points[i-1].x, el.points[i-1].y, mid.x, mid.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, el: DrawEl, zoom: number) {
  if (el.x1 === undefined) return;
  const x1 = el.x1, y1 = el.y1!, x2 = el.x2!, y2 = el.y2!;
  ctx.save();
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.strokeWidth * zoom;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  if (el.tool === "line") {
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.stroke();
  } else if (el.tool === "arrow") {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(12, el.strokeWidth * zoom * 3);
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
    ctx.stroke();
  } else if (el.tool === "rect") {
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  } else if (el.tool === "circle") {
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (el.tool === "triangle") {
    const mx = (x1 + x2) / 2;
    ctx.moveTo(mx, y1); ctx.lineTo(x2, y2); ctx.lineTo(x1, y2); ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, el: DrawEl, zoom: number) {
  if (!el.text || el.x1 === undefined) return;
  ctx.save();
  const fs = (el.fontSize ?? 18) * zoom;
  ctx.font = `${fs}px Inter, sans-serif`;
  ctx.fillStyle = el.color;
  ctx.fillText(el.text, el.x1, el.y1!);
  ctx.restore();
}

// ─── Background renderers ─────────────────────────────────────────────────────

function drawBackground(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  bg: BgMode,
  theme: Theme,
  panX: number, panY: number, zoom: number,
) {
  const isDark = theme === "dark";
  ctx.fillStyle = isDark ? "#0F172A" : "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  if (bg === "blank") return;

  const spacing = 32 * zoom;
  const ox = ((panX % spacing) + spacing) % spacing;
  const oy = ((panY % spacing) + spacing) % spacing;
  const dotColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";

  if (bg === "grid") {
    ctx.strokeStyle = dotColor;
    ctx.lineWidth = 0.5;
    for (let x = ox; x < W; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = oy; y < H; y += spacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  } else if (bg === "dots") {
    ctx.fillStyle = dotColor;
    for (let x = ox; x < W; x += spacing) {
      for (let y = oy; y < H; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

function WhiteboardPage() {
  const { user } = Route.useRouteContext();
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "cerebras");

  // ── Canvas refs ────────────────────────────────────────────────────────────
  const bgRef   = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const teachScrollRef = useRef<HTMLDivElement>(null);

  // ── Drawing state (not in React state for perf — refs) ─────────────────────
  const elementsRef = useRef<DrawEl[][]>([[]]); // per-page arrays
  const currentPathRef = useRef<DrawEl | null>(null);
  const shapeStartRef = useRef<Pt | null>(null);
  const isDrawingRef = useRef(false);
  const undoStackRef = useRef<DrawEl[][][]>([]);
  const redoStackRef = useRef<DrawEl[][][]>([]);
  const laserPosRef = useRef<Pt | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const textPosRef = useRef<Pt | null>(null);

  // ── React state ────────────────────────────────────────────────────────────
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS.black);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [bg, setBg] = useState<BgMode>("grid");
  const [theme, setTheme] = useState<Theme>("light");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pt>({ x: 0, y: 0 });
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAI, setShowAI] = useState(true);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // AI state
  const [question, setQuestion] = useState("");
  const [teaching, setTeaching] = useState(false);
  const [teachSteps, setTeachSteps] = useState<TeachStep[]>([]);
  const [chatHistory, setChatHistory] = useState<ConvMsg[]>([]);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textDraft, setTextDraft] = useState("");

  // Viewport panning
  const panningRef = useRef(false);
  const panStartRef = useRef<Pt>({ x: 0, y: 0 });
  const panOriginRef = useRef<Pt>({ x: 0, y: 0 });

  // ── Coordinate conversion ──────────────────────────────────────────────────
  const toWorld = useCallback((screenX: number, screenY: number): Pt => ({
    x: (screenX - pan.x) / zoom,
    y: (screenY - pan.y) / zoom,
  }), [pan, zoom]);

  const toScreen = useCallback((wx: number, wy: number): Pt => ({
    x: wx * zoom + pan.x,
    y: wy * zoom + pan.y,
  }), [pan, zoom]);

  // ── Canvas sizing ──────────────────────────────────────────────────────────
  function resizeCanvases() {
    const el = containerRef.current;
    if (!el) return;
    const W = el.clientWidth, H = el.clientHeight;
    [bgRef, drawRef].forEach(ref => {
      if (ref.current) { ref.current.width = W; ref.current.height = H; }
    });
  }

  useLayoutEffect(() => {
    resizeCanvases();
    const obs = new ResizeObserver(resizeCanvases);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [showAI]);

  // ── Full redraw ────────────────────────────────────────────────────────────
  const redraw = useCallback(() => {
    const bg2 = bgRef.current, draw = drawRef.current;
    if (!bg2 || !draw) return;
    const W = bg2.width, H = bg2.height;
    const bgCtx = bg2.getContext("2d")!;
    const drawCtx = draw.getContext("2d")!;

    // Background
    drawBackground(bgCtx, W, H, bg, theme, pan.x, pan.y, zoom);

    // Drawings
    drawCtx.clearRect(0, 0, W, H);
    drawCtx.save();
    drawCtx.translate(pan.x, pan.y);
    drawCtx.scale(zoom, zoom);

    const pageEls = elementsRef.current[page] ?? [];
    for (const el of pageEls) {
      if (["pen","pencil","highlighter","eraser"].includes(el.tool)) {
        const ctx2 = drawCtx;
        if (el.tool === "eraser") {
          ctx2.save();
          ctx2.globalCompositeOperation = "destination-out";
          drawPath(ctx2, el, 1);
          ctx2.restore();
        } else {
          drawPath(ctx2, el, 1);
        }
      } else if (el.tool === "text") {
        drawText(drawCtx, el, 1);
      } else {
        drawShape(drawCtx, el, 1);
      }
    }

    // Laser pointer
    if (laserPosRef.current && tool === "laser") {
      const lp = laserPosRef.current;
      const wx = (lp.x - pan.x) / zoom, wy = (lp.y - pan.y) / zoom;
      drawCtx.save();
      drawCtx.beginPath();
      drawCtx.arc(wx, wy, 8, 0, Math.PI * 2);
      drawCtx.fillStyle = "rgba(239,68,68,0.85)";
      drawCtx.fill();
      drawCtx.strokeStyle = "rgba(255,255,255,0.9)";
      drawCtx.lineWidth = 2;
      drawCtx.stroke();
      // Trail
      drawCtx.beginPath();
      drawCtx.arc(wx, wy, 14, 0, Math.PI * 2);
      drawCtx.strokeStyle = "rgba(239,68,68,0.35)";
      drawCtx.lineWidth = 3;
      drawCtx.stroke();
      drawCtx.restore();
    }

    drawCtx.restore();
  }, [bg, theme, zoom, pan, page, tool]);

  useEffect(() => { redraw(); }, [redraw]);

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  function snapshot() {
    undoStackRef.current.push(elementsRef.current.map(p => [...p]));
    redoStackRef.current = [];
  }

  function undo() {
    const snap = undoStackRef.current.pop();
    if (!snap) return;
    redoStackRef.current.push(elementsRef.current.map(p => [...p]));
    elementsRef.current = snap;
    redraw();
  }

  function redo() {
    const snap = redoStackRef.current.pop();
    if (!snap) return;
    undoStackRef.current.push(elementsRef.current.map(p => [...p]));
    elementsRef.current = snap;
    redraw();
  }

  // ── Page helpers ───────────────────────────────────────────────────────────
  function addPage() {
    elementsRef.current.push([]);
    const np = totalPages + 1;
    setTotalPages(np);
    setPage(np - 1);
  }

  function dupPage() {
    const copy = [...(elementsRef.current[page] ?? [])].map(e => ({ ...e, id: uid(), page: totalPages }));
    elementsRef.current.push(copy);
    const np = totalPages + 1;
    setTotalPages(np);
    setPage(np - 1);
  }

  function clearPage() {
    if (!window.confirm("Clear this page?")) return;
    snapshot();
    elementsRef.current[page] = [];
    redraw();
  }

  // ── Mouse / Touch helpers ──────────────────────────────────────────────────
  function getEventPos(e: React.MouseEvent | React.TouchEvent): Pt {
    const rect = drawRef.current!.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }

  // ── Pointer down ──────────────────────────────────────────────────────────
  function onPointerDown(e: React.MouseEvent | React.TouchEvent) {
    const pos = getEventPos(e);
    const isMiddle = "button" in e && e.button === 1;
    const isSpace = spaceHeldRef.current;

    if (isMiddle || isSpace || tool === "select") {
      panningRef.current = true;
      panStartRef.current = pos;
      panOriginRef.current = { ...pan };
      return;
    }

    if (tool === "text") {
      const w = toWorld(pos.x, pos.y);
      textPosRef.current = w;
      setShowTextInput(true);
      setTextDraft("");
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    if (tool === "laser") {
      laserPosRef.current = pos;
      redraw();
      return;
    }

    isDrawingRef.current = true;
    const w = toWorld(pos.x, pos.y);

    if (["pen","pencil","highlighter","eraser"].includes(tool)) {
      const el: DrawEl = {
        id: uid(), tool, points: [w], color,
        strokeWidth: tool === "eraser" ? strokeWidth * 3 : strokeWidth,
        opacity: 1, page,
      };
      snapshot();
      currentPathRef.current = el;
      elementsRef.current[page] = [...(elementsRef.current[page] ?? []), el];
    } else {
      shapeStartRef.current = w;
    }
    redraw();
  }

  // ── Pointer move ──────────────────────────────────────────────────────────
  function onPointerMove(e: React.MouseEvent | React.TouchEvent) {
    const pos = getEventPos(e);

    if (panningRef.current) {
      const dx = pos.x - panStartRef.current.x;
      const dy = pos.y - panStartRef.current.y;
      setPan({ x: panOriginRef.current.x + dx, y: panOriginRef.current.y + dy });
      return;
    }

    if (tool === "laser") {
      laserPosRef.current = pos;
      redraw();
      return;
    }

    if (!isDrawingRef.current) return;
    const w = toWorld(pos.x, pos.y);

    if (currentPathRef.current) {
      currentPathRef.current.points.push(w);
      elementsRef.current[page][elementsRef.current[page].length - 1] = { ...currentPathRef.current };
      redraw();
    } else if (shapeStartRef.current) {
      redraw();
      // preview shape
      const ctx = drawRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);
      const preview: DrawEl = {
        id: "preview", tool, points: [],
        color, strokeWidth, opacity: 1, page,
        x1: shapeStartRef.current.x, y1: shapeStartRef.current.y,
        x2: w.x, y2: w.y,
      };
      drawShape(ctx, preview, 1);
      ctx.restore();
    }
  }

  // ── Pointer up ────────────────────────────────────────────────────────────
  function onPointerUp(e: React.MouseEvent | React.TouchEvent) {
    if (panningRef.current) { panningRef.current = false; return; }
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const pos = getEventPos(e);
    const w = toWorld(pos.x, pos.y);

    if (shapeStartRef.current) {
      const start = shapeStartRef.current;
      if (Math.abs(w.x - start.x) < 3 && Math.abs(w.y - start.y) < 3) {
        shapeStartRef.current = null;
        redraw();
        return;
      }
      const el: DrawEl = {
        id: uid(), tool, points: [],
        color, strokeWidth, opacity: 1, page,
        x1: start.x, y1: start.y, x2: w.x, y2: w.y,
      };
      snapshot();
      elementsRef.current[page] = [...(elementsRef.current[page] ?? []), el];
      shapeStartRef.current = null;
    }
    currentPathRef.current = null;
    redraw();
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const spaceHeldRef = useRef(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " ") { e.preventDefault(); spaceHeldRef.current = e.type === "keydown"; }
      if (e.type !== "keydown") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if (e.key === "p") setTool("pen");
      if (e.key === "h") setTool("highlighter");
      if (e.key === "e") setTool("eraser");
      if (e.key === "t") setTool("text");
      if (e.key === "l") setTool("laser");
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, []);

  // ── Zoom ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const rect = el!.getBoundingClientRect();
        const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
        setZoom(z => {
          const nz = Math.max(0.2, Math.min(5, z * delta));
          setPan(p => ({
            x: cx - (cx - p.x) * (nz / z),
            y: cy - (cy - p.y) * (nz / z),
          }));
          return nz;
        });
      } else {
        setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Touch pinch zoom ───────────────────────────────────────────────────────
  const lastPinchRef = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) lastPinchRef.current = null;
    else onPointerDown(e);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (lastPinchRef.current !== null) {
        const delta = dist / lastPinchRef.current;
        setZoom(z => Math.max(0.2, Math.min(5, z * delta)));
      }
      lastPinchRef.current = dist;
    } else { onPointerMove(e); }
  }
  function onTouchEnd(e: React.TouchEvent) {
    lastPinchRef.current = null;
    onPointerUp(e);
  }

  // ── Fullscreen ────────────────────────────────────────────────────────────
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.parentElement?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  // ── Export PNG ────────────────────────────────────────────────────────────
  async function exportPNG() {
    const wrap = containerRef.current;
    if (!wrap) return;
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(wrap, { useCORS: true, backgroundColor: theme === "dark" ? "#0F172A" : "#FFFFFF" });
      const a = document.createElement("a");
      a.download = "whiteboard.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    } catch { toast.error("Export failed — please try again"); }
  }

  // ── Text commit ───────────────────────────────────────────────────────────
  function commitText() {
    if (!textDraft.trim() || !textPosRef.current) { setShowTextInput(false); return; }
    const el: DrawEl = {
      id: uid(), tool: "text", points: [], color, strokeWidth, opacity: 1, page,
      text: textDraft, fontSize: strokeWidth < 4 ? 16 : strokeWidth < 8 ? 22 : 30,
      x1: textPosRef.current.x, y1: textPosRef.current.y,
    };
    snapshot();
    elementsRef.current[page] = [...(elementsRef.current[page] ?? []), el];
    setShowTextInput(false);
    setTextDraft("");
    redraw();
  }

  // ── AI Teaching ────────────────────────────────────────────────────────────
  const typeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function animateSteps(steps: TeachStep[]) {
    setTeachSteps(steps);
    let stepIdx = 0;
    let charIdx = 0;

    function tick() {
      setTeachSteps(prev => {
        const next = [...prev];
        const step = next[stepIdx];
        if (!step) return prev;
        if (step.type === "separator") {
          step.revealed = 1;
          step.text = "";
          stepIdx++;
          charIdx = 0;
          return next;
        }
        if (charIdx < step.fullText.length) {
          charIdx++;
          step.revealed = charIdx;
          step.text = step.fullText.slice(0, charIdx);
        } else {
          stepIdx++;
          charIdx = 0;
          if (stepIdx >= next.length) {
            if (typeTimerRef.current) clearInterval(typeTimerRef.current);
          }
        }
        return next;
      });
      setTimeout(() => {
        teachScrollRef.current?.scrollTo({ top: 9999, behavior: "smooth" });
      }, 0);
    }

    if (typeTimerRef.current) clearInterval(typeTimerRef.current);
    typeTimerRef.current = setInterval(tick, CHAR_SPEED_MS);
  }

  async function teach() {
    const q = question.trim();
    if (!q) return toast.error("Ask a question first");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setTeaching(true);
    setTeachSteps([]);
    if (typeTimerRef.current) clearInterval(typeTimerRef.current);

    try {
      const safeHistory = chatHistory.slice(-6).map(m => ({
        role: m.role,
        content: m.content.slice(0, 600),
      }));
      const res = await askAIServer({
        data: {
          prompt: buildTeachingPrompt(q, safeHistory),
          preferCerebras: true,
          systemPrompt: "You are an expert AI teacher on an interactive whiteboard. Always return ONLY valid JSON as instructed. Never add prose or markdown wrappers.",
        },
      });

      const script = parseTeachScript(res.text);
      if (!script) throw new Error("Could not parse teaching script");

      const steps = scriptToSteps(script);
      setChatHistory(prev => [
        ...prev,
        { role: "user", content: q },
        { role: "assistant", content: res.text },
      ]);
      setQuestion("");
      animateSteps(steps);
      await bump();
    } catch (err) {
      toast.error("Teaching failed — please try again");
    } finally {
      setTeaching(false);
    }
  }

  function handleQuestionKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); teach(); }
  }

  useEffect(() => () => { if (typeTimerRef.current) clearInterval(typeTimerRef.current); }, []);

  // ── Reset board ────────────────────────────────────────────────────────────
  function newBoard() {
    if (!window.confirm("Start a new board? This clears all pages.")) return;
    elementsRef.current = [[]];
    setPage(0);
    setTotalPages(1);
    setTeachSteps([]);
    setChatHistory([]);
    redraw();
  }

  // ── Cursor style ──────────────────────────────────────────────────────────
  const cursorStyle = tool === "eraser" ? "cursor-cell"
    : tool === "text" ? "cursor-text"
    : tool === "select" ? "cursor-move"
    : tool === "laser" ? "cursor-crosshair"
    : "cursor-crosshair";

  // ─── Render ──────────────────────────────────────────────────────────────
  const isDark = theme === "dark";

  return (
    <div className={`flex h-full flex-col ${isDark ? "bg-slate-900" : "bg-white"}`}>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className={`flex shrink-0 items-center justify-between border-b px-3 py-1.5 ${isDark ? "border-slate-700 bg-slate-900" : "border-gray-200 bg-white"}`}>
        {/* Left: tool identity + quota */}
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>
            ✏️ Teaching Board
          </span>
          <span className={`rounded px-2 py-0.5 text-xs ${isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-500"}`}>
            Page {page + 1} / {totalPages}
          </span>
          {!quotaLoading && <QuotaBadge quota={quota} />}
        </div>

        {/* Right: utility buttons */}
        <div className="flex items-center gap-1">
          <TopBtn onClick={() => setBg(b => b === "blank" ? "grid" : b === "grid" ? "dots" : "blank")} title="Background">
            <Grid3x3 size={15} />
          </TopBtn>
          <TopBtn onClick={() => setTheme(t => t === "light" ? "dark" : "light")} title="Theme">
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </TopBtn>
          <TopBtn onClick={() => setZoom(z => Math.min(5, z * 1.25))} title="Zoom in"><ZoomIn size={15} /></TopBtn>
          <TopBtn onClick={() => setZoom(z => Math.max(0.2, z / 1.25))} title="Zoom out"><ZoomOut size={15} /></TopBtn>
          <TopBtn onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Reset view">
            <span className="text-xs font-mono">{Math.round(zoom * 100)}%</span>
          </TopBtn>
          <TopBtn onClick={exportPNG} title="Export PNG"><Download size={15} /></TopBtn>
          <TopBtn onClick={newBoard} title="New board"><Trash2 size={15} /></TopBtn>
          <TopBtn onClick={toggleFullscreen} title="Fullscreen">
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </TopBtn>
          <TopBtn onClick={() => setShowAI(s => !s)} title="AI panel">
            {showAI ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </TopBtn>
        </div>
      </div>

      {/* ── Body: toolbar + canvas + AI panel ──────────────────────────── */}
      <div className="flex min-h-0 flex-1">

        {/* Left toolbar */}
        <aside className={`flex shrink-0 flex-col gap-1 border-r px-1 py-2 ${isDark ? "border-slate-700 bg-slate-900" : "border-gray-200 bg-gray-50"}`}>
          {/* Tools */}
          {([
            ["pen",         <Pen size={16} />,          "Pen (P)"],
            ["pencil",      <Pen size={14} className="opacity-60" />, "Pencil"],
            ["highlighter", <Highlighter size={16} />,  "Highlighter (H)"],
            ["eraser",      <Eraser size={16} />,       "Eraser (E)"],
            ["select",      <MousePointer2 size={16} />, "Select"],
            ["text",        <Type size={16} />,          "Text (T)"],
            ["line",        <Minus size={16} />,         "Line"],
            ["arrow",       <MoveRight size={16} />,     "Arrow"],
            ["rect",        <Square size={16} />,        "Rectangle"],
            ["circle",      <Circle size={16} />,        "Circle"],
            ["triangle",    <Triangle size={16} />,      "Triangle"],
            ["laser",       <Dot size={18} className="text-red-500" />, "Laser (L)"],
          ] as [Tool, React.ReactNode, string][]).map(([t, icon, label]) => (
            <ToolBtn key={t} active={tool === t} onClick={() => setTool(t)} title={label} isDark={isDark}>
              {icon}
            </ToolBtn>
          ))}

          <div className={`my-1 h-px ${isDark ? "bg-slate-700" : "bg-gray-200"}`} />

          {/* Undo / Redo */}
          <ToolBtn active={false} onClick={undo} title="Undo (Ctrl+Z)" isDark={isDark}><Undo2 size={16} /></ToolBtn>
          <ToolBtn active={false} onClick={redo} title="Redo (Ctrl+Shift+Z)" isDark={isDark}><Redo2 size={16} /></ToolBtn>
          <ToolBtn active={false} onClick={clearPage} title="Clear page" isDark={isDark}><Trash2 size={16} /></ToolBtn>

          <div className={`my-1 h-px ${isDark ? "bg-slate-700" : "bg-gray-200"}`} />

          {/* Stroke widths */}
          {STROKE_WIDTHS.map(w => (
            <button
              key={w}
              onClick={() => setStrokeWidth(w)}
              title={`Stroke ${w}px`}
              className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${strokeWidth === w ? (isDark ? "bg-blue-600" : "bg-blue-100") : (isDark ? "hover:bg-slate-700" : "hover:bg-gray-100")}`}
            >
              <div
                className="rounded-full"
                style={{ width: Math.max(4, w * 1.4), height: Math.max(4, w * 1.4), background: color }}
              />
            </button>
          ))}

          <div className={`my-1 h-px ${isDark ? "bg-slate-700" : "bg-gray-200"}`} />

          {/* Color swatch */}
          <div className="relative">
            <button
              onClick={() => setShowColorPicker(s => !s)}
              className="flex h-8 w-8 items-center justify-center rounded border-2 border-white shadow transition-transform hover:scale-110"
              style={{ background: color }}
              title="Color picker"
            />
            {showColorPicker && (
              <div className={`absolute left-10 top-0 z-50 rounded-lg border p-2 shadow-xl ${isDark ? "border-slate-600 bg-slate-800" : "border-gray-200 bg-white"}`}>
                <div className="grid grid-cols-4 gap-1">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => { setColor(c); setShowColorPicker(false); }}
                      className={`h-7 w-7 rounded border-2 transition-transform hover:scale-110 ${color === c ? "border-blue-500 scale-110" : "border-transparent"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <input
                  type="color" value={color}
                  onChange={e => setColor(e.target.value)}
                  className="mt-2 h-7 w-full cursor-pointer rounded"
                />
              </div>
            )}
          </div>

          <div className={`my-1 h-px ${isDark ? "bg-slate-700" : "bg-gray-200"}`} />

          {/* Page controls */}
          <ToolBtn active={false} onClick={() => setPage(p => Math.max(0, p - 1))} title="Previous page" isDark={isDark}><ChevronLeft size={16} /></ToolBtn>
          <ToolBtn active={false} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} title="Next page" isDark={isDark}><ChevronRight size={16} /></ToolBtn>
          <ToolBtn active={false} onClick={addPage} title="Add page" isDark={isDark}><Plus size={16} /></ToolBtn>
          <ToolBtn active={false} onClick={dupPage} title="Duplicate page" isDark={isDark}><CopyPlus size={16} /></ToolBtn>
        </aside>

        {/* Canvas area */}
        <div
          ref={containerRef}
          className={`relative flex-1 overflow-hidden ${cursorStyle}`}
          style={{ touchAction: "none" }}
        >
          {/* bg canvas */}
          <canvas ref={bgRef} className="absolute inset-0 pointer-events-none" />
          {/* draw canvas */}
          <canvas
            ref={drawRef}
            className="absolute inset-0"
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onMouseLeave={() => { if (tool === "laser") { laserPosRef.current = null; redraw(); } }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onContextMenu={e => e.preventDefault()}
          />

          {/* Text input overlay */}
          {showTextInput && textPosRef.current && (() => {
            const sc = toScreen(textPosRef.current.x, textPosRef.current.y);
            return (
              <input
                ref={textInputRef}
                value={textDraft}
                onChange={e => setTextDraft(e.target.value)}
                onBlur={commitText}
                onKeyDown={e => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setShowTextInput(false); }}
                className={`absolute z-20 border-b-2 border-blue-500 bg-transparent px-1 outline-none ${isDark ? "text-white" : "text-slate-900"}`}
                style={{
                  left: sc.x, top: sc.y,
                  fontSize: `${(strokeWidth < 4 ? 16 : strokeWidth < 8 ? 22 : 30) * zoom}px`,
                  color,
                  minWidth: 120,
                }}
                placeholder="Type here…"
              />
            );
          })()}

          {/* AI Teaching overlay (scrollable, inside canvas area) */}
          {teachSteps.length > 0 && (
            <div
              ref={teachScrollRef}
              className="absolute right-4 top-4 bottom-4 z-10 w-72 overflow-y-auto rounded-xl shadow-2xl"
              style={{ background: isDark ? "rgba(15,23,42,0.92)" : "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)" }}
            >
              <div className="flex flex-col gap-2 p-3">
                {teachSteps.map(step => (
                  <TeachCard key={step.id} step={step} isDark={isDark} />
                ))}
              </div>
            </div>
          )}

          {/* Zoom indicator */}
          <div className={`absolute bottom-3 left-3 rounded px-2 py-1 text-xs ${isDark ? "bg-slate-800/80 text-slate-400" : "bg-white/80 text-slate-400"}`}>
            {Math.round(zoom * 100)}% · Page {page + 1}/{totalPages}
          </div>
        </div>

        {/* AI panel */}
        {showAI && (
          <aside className={`flex w-80 shrink-0 flex-col border-l ${isDark ? "border-slate-700 bg-slate-900" : "border-gray-200 bg-gray-50"}`}>
            {/* Header */}
            <div className={`flex items-center justify-between border-b px-3 py-2 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-500" />
                <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>AI Teaching Mode</span>
              </div>
              {chatHistory.length > 0 && (
                <button
                  onClick={() => { setTeachSteps([]); setChatHistory([]); }}
                  className="text-xs text-slate-400 hover:text-red-400"
                  title="Clear session"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Session messages */}
            <div className="flex-1 overflow-y-auto p-3">
              {chatHistory.length === 0 && (
                <div className={`rounded-xl border p-4 text-center ${isDark ? "border-slate-700 bg-slate-800" : "border-gray-100 bg-white"}`}>
                  <Sparkles size={32} className="mx-auto mb-2 text-indigo-400" />
                  <p className={`text-sm font-medium ${isDark ? "text-white" : "text-slate-700"}`}>Bishal's Teaching Mode</p>
                  <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Ask any question and I'll teach it step by step on the whiteboard — with explanations, formulas, and visual breakdowns.
                  </p>
                  <div className="mt-3 flex flex-col gap-1.5">
                    {["Explain Newton's Second Law", "Solve: 2x + 5 = 13", "What is photosynthesis?", "Explain supply and demand"].map(q => (
                      <button
                        key={q}
                        onClick={() => { setQuestion(q); }}
                        className={`rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-gray-100 text-slate-600 hover:bg-gray-200"}`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chatHistory.filter((_, i) => i % 2 === 0).map((msg, i) => (
                <div key={i} className="mb-3">
                  <div className="mb-1 flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-indigo-100 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-indigo-600">You</span>
                    </div>
                    <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>{msg.content.slice(0, 60)}{msg.content.length > 60 ? "…" : ""}</span>
                  </div>
                  <div className={`rounded-lg px-3 py-2 text-xs ${isDark ? "bg-indigo-900/40 text-indigo-200" : "bg-indigo-50 text-indigo-700"}`}>
                    ✅ Teaching displayed on board
                  </div>
                </div>
              ))}

              {teaching && (
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${isDark ? "bg-slate-800 text-slate-300" : "bg-white text-slate-600"}`}>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                  Preparing lesson…
                </div>
              )}
            </div>

            {/* Input */}
            <div className={`border-t p-3 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
              <div className={`flex gap-2 rounded-xl border ${isDark ? "border-slate-600 bg-slate-800" : "border-gray-200 bg-white"}`}>
                <textarea
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={handleQuestionKey}
                  placeholder={chatHistory.length > 0 ? "Ask a follow-up…" : "Ask anything to teach…"}
                  rows={2}
                  className={`flex-1 resize-none rounded-xl bg-transparent px-3 py-2 text-sm outline-none ${isDark ? "text-white placeholder:text-slate-500" : "text-slate-800 placeholder:text-slate-400"}`}
                  disabled={teaching}
                />
                <button
                  onClick={teach}
                  disabled={teaching || !question.trim()}
                  className="m-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
                >
                  <Send size={14} />
                </button>
              </div>
              <p className={`mt-1.5 text-center text-[10px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                Enter to teach · Shift+Enter for newline
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TopBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded text-slate-500 transition-colors hover:bg-gray-100 hover:text-slate-800"
    >
      {children}
    </button>
  );
}

function ToolBtn({ children, active, onClick, title, isDark }: {
  children: React.ReactNode; active: boolean; onClick: () => void; title?: string; isDark: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
        active
          ? "bg-indigo-600 text-white shadow"
          : isDark
            ? "text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            : "text-slate-500 hover:bg-gray-200 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function TeachCard({ step, isDark }: { step: TeachStep; isDark: boolean }) {
  if (step.type === "separator") {
    return <div className="my-1 border-t border-dashed border-gray-300 opacity-40" />;
  }

  const colorHex = TYPE_COLOR[step.type];
  const bg = isDark
    ? step.type === "answer" ? "bg-green-900/30 border-green-700"
    : step.type === "warning" ? "bg-red-900/30 border-red-700"
    : step.type === "tip" ? "bg-orange-900/30 border-orange-700"
    : step.type === "formula" ? "bg-purple-900/30 border-purple-700"
    : step.type === "title" ? "bg-blue-900/30 border-blue-700"
    : "bg-slate-800/60 border-slate-700"
    : TYPE_BG[step.type];

  const isTitle = step.type === "title";
  const isFormula = step.type === "formula";

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${bg} ${step.revealed === 0 ? "opacity-0" : "opacity-100"} transition-opacity duration-200`}
    >
      {/* Header */}
      <div className="mb-1 flex items-center gap-1.5" style={{ color: colorHex }}>
        {TYPE_ICON[step.type]}
        <span className="text-[10px] font-bold uppercase tracking-wider">
          {step.type === "step" && step.num ? `Step ${step.num}` : step.type}
        </span>
      </div>
      {/* Content */}
      <p
        className={`leading-snug ${isDark ? "text-slate-200" : "text-slate-800"} ${isTitle ? "text-sm font-bold" : isFormula ? "font-mono text-sm" : "text-xs"}`}
        style={isFormula ? { color: colorHex } : undefined}
      >
        {step.text}
        {step.revealed < step.fullText.length && (
          <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-current align-middle" />
        )}
      </p>
    </div>
  );
}
