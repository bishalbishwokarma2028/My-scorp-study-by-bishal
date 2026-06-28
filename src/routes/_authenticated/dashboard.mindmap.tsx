import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Loader2, Download, Save, ZoomIn, ZoomOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON } from "@/lib/aiProvider";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/mindmap")({
  component: MindMapPage,
});

type Node = { label: string; children?: Node[] };

const PALETTE = [
  { fill: "#7C3AED", light: "#EDE9FE", text: "#5B21B6", border: "#7C3AED" },
  { fill: "#0EA5E9", light: "#E0F2FE", text: "#0369A1", border: "#0EA5E9" },
  { fill: "#F59E0B", light: "#FEF3C7", text: "#B45309", border: "#F59E0B" },
  { fill: "#10B981", light: "#D1FAE5", text: "#047857", border: "#10B981" },
  { fill: "#EF4444", light: "#FEE2E2", text: "#B91C1C", border: "#EF4444" },
  { fill: "#EC4899", light: "#FCE7F3", text: "#BE185D", border: "#EC4899" },
  { fill: "#06B6D4", light: "#CFFAFE", text: "#0E7490", border: "#06B6D4" },
  { fill: "#84CC16", light: "#ECFCCB", text: "#4D7C0F", border: "#84CC16" },
];

function wrapText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + (cur ? " " : "") + w).length > maxLen) {
      if (cur) lines.push(cur);
      cur = w.length > maxLen ? w.slice(0, maxLen - 1) + "…" : w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function MindMapPage() {
  const { user } = Route.useRouteContext();
  const [topic, setTopic] = useState("");
  const [tree, setTree] = useState<Node | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  async function generate() {
    if (!topic.trim()) return toast.error("Enter a topic");
    setLoading(true);
    setTree(null);

    const prompt = `Generate a comprehensive, accurate educational mind map for: "${topic}".

CRITICAL: Return ONLY valid JSON — no markdown, no code fences, no explanation. Raw JSON only.

Schema:
{"label":"${topic}","children":[{"label":"Branch Name","children":[{"label":"Sub-point"},{"label":"Sub-point"}]}]}

Requirements:
- EXACTLY 6 main branches covering different aspects of the topic
- Each main branch: 3-4 specific, factual sub-branches
- Main branch labels: 2-4 words max (15 chars max)
- Sub-branch labels: 2-5 words max (20 chars max)
- Content must be FACTUALLY ACCURATE — no made-up information
- Cover key aspects: Definition, History/Origin, Types/Categories, Process/How-it-works, Applications/Uses, Key Facts/Examples
- The root label should be the exact topic name (capitalize properly)`;

    const res = await askAI(prompt, "You are an expert educator. Output ONLY raw valid JSON. No markdown, no code blocks, no backticks, no explanation whatsoever. Just the JSON object.");

    let parsed = extractJSON<Node>(res.text);

    if (!parsed || !parsed.label || !Array.isArray(parsed.children) || parsed.children.length === 0) {
      const secondTry = await askAI(
        `Create mind map JSON for "${topic}". Return ONLY this exact format with no other text:\n{"label":"${topic}","children":[{"label":"What It Is","children":[{"label":"Definition"},{"label":"Key concept"},{"label":"Origin"}]},{"label":"How It Works","children":[{"label":"Step 1"},{"label":"Step 2"},{"label":"Step 3"}]},{"label":"Types","children":[{"label":"Type A"},{"label":"Type B"},{"label":"Type C"}]},{"label":"Applications","children":[{"label":"Use 1"},{"label":"Use 2"},{"label":"Use 3"}]},{"label":"Key Facts","children":[{"label":"Fact 1"},{"label":"Fact 2"},{"label":"Fact 3"}]},{"label":"Examples","children":[{"label":"Example 1"},{"label":"Example 2"},{"label":"Example 3"}]}]}`,
        "Output ONLY valid JSON. Nothing else.",
      );
      parsed = extractJSON<Node>(secondTry.text);
    }

    if (parsed && parsed.label && Array.isArray(parsed.children) && parsed.children.length > 0) {
      setTree(parsed);
    } else {
      toast.error("Could not generate mind map — please try again");
    }
    setLoading(false);
  }

  async function save() {
    if (!tree) return;
    const { error } = await supabase.from("mindmaps").insert({ user_id: user.id, topic, map_data: tree as never });
    if (error) return toast.error(error.message);
    toast.success("Mind map saved ✓");
  }

  function downloadSVG() {
    if (!svgRef.current) return;
    const svgEl = svgRef.current;
    const xml = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `mindmap-${topic.replace(/\s+/g, "-")}.svg`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded as SVG");
  }

  const W = 1600, H = 1000, CX = 800, CY = 500;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") generate(); }}
            placeholder="Enter topic, e.g. 'Photosynthesis', 'World War II', 'Machine Learning'…"
            className="flex-1 min-w-[200px] rounded-xl border border-border bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
          <button
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "✦ Generate"}
          </button>
          {tree && (
            <>
              <button onClick={() => setZoom(z => Math.min(2.5, +(z + 0.15).toFixed(2)))} className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-white hover:bg-accent"><ZoomIn className="h-4 w-4" /></button>
              <button onClick={() => setZoom(z => Math.max(0.3, +(z - 0.15).toFixed(2)))} className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-white hover:bg-accent"><ZoomOut className="h-4 w-4" /></button>
              <button onClick={downloadSVG} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs hover:bg-accent"><Download className="h-3.5 w-3.5" /> SVG</button>
              <button onClick={save} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs hover:bg-accent"><Save className="h-3.5 w-3.5" /> Save</button>
              <button onClick={generate} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs hover:bg-accent"><RefreshCw className="h-3.5 w-3.5" /> Regenerate</button>
            </>
          )}
        </div>
      </div>

      {!tree && !loading && (
        <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 py-20 text-center">
          <p className="text-4xl mb-3">🧠</p>
          <p className="font-semibold text-violet-700 text-lg">Enter any topic above and click Generate</p>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">Creates a complete educational mind map with 6 main branches and detailed sub-topics. Use pinch/scroll to zoom.</p>
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-border bg-white py-24 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-violet-600" />
          <p className="mt-4 font-semibold text-violet-700 text-lg">Building your mind map…</p>
          <p className="mt-1 text-sm text-muted-foreground">Generating accurate, structured content</p>
        </div>
      )}

      {tree && (
        <div className="rounded-2xl border border-border bg-white p-4 overflow-auto shadow-sm">
          <div style={{ width: W * zoom, height: H * zoom, transition: "width 0.2s, height 0.2s" }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              width={W * zoom}
              height={H * zoom}
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.18" />
                </filter>
                <filter id="shadow-sm" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.12" />
                </filter>
              </defs>
              <rect width={W} height={H} fill="#F8F9FF" rx="16" />
              <MindMapRender root={tree} cx={CX} cy={CY} />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

function MindMapRender({ root, cx, cy }: { root: Node; cx: number; cy: number }) {
  const branches = root.children ?? [];
  const n = branches.length;
  const BRANCH_R = 320;
  const SUB_R = 185;

  return (
    <g>
      {branches.map((b, i) => {
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
        const bx = cx + Math.cos(angle) * BRANCH_R;
        const by = cy + Math.sin(angle) * BRANCH_R;
        const pal = PALETTE[i % PALETTE.length];
        const subs = b.children ?? [];
        const bLines = wrapText(b.label, 14);
        const bH = Math.max(44, bLines.length * 20 + 18);
        const bW = 140;

        const cp1x = cx + Math.cos(angle) * (BRANCH_R * 0.5);
        const cp1y = cy + Math.sin(angle) * (BRANCH_R * 0.5);

        return (
          <g key={i}>
            <path
              d={`M ${cx} ${cy} C ${cp1x} ${cp1y}, ${cp1x} ${cp1y}, ${bx} ${by}`}
              stroke={pal.fill}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              opacity={0.75}
            />

            <rect
              x={bx - bW / 2}
              y={by - bH / 2}
              width={bW}
              height={bH}
              rx={10}
              fill={pal.fill}
              filter="url(#shadow)"
            />
            {bLines.map((line, li) => (
              <text
                key={li}
                x={bx}
                y={by - ((bLines.length - 1) * 10) + li * 20 + 5}
                textAnchor="middle"
                fill="white"
                fontSize={11}
                fontWeight={700}
                fontFamily="'Inter', system-ui, sans-serif"
                letterSpacing="0.2"
              >
                {line}
              </text>
            ))}

            {subs.map((c, j) => {
              const total = subs.length;
              const spreadAngle = Math.min(0.65, Math.PI * 0.7 / Math.max(total, 1));
              const subAngle = angle + (j - (total - 1) / 2) * spreadAngle;
              const cxx = bx + Math.cos(subAngle) * SUB_R;
              const cyy = by + Math.sin(subAngle) * SUB_R;
              const cLines = wrapText(c.label, 16);
              const cH = Math.max(32, cLines.length * 17 + 12);
              const cW = 120;

              return (
                <g key={j}>
                  <line
                    x1={bx}
                    y1={by}
                    x2={cxx}
                    y2={cyy}
                    stroke={pal.fill}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeDasharray="4 2"
                    opacity={0.55}
                  />
                  <rect
                    x={cxx - cW / 2}
                    y={cyy - cH / 2}
                    width={cW}
                    height={cH}
                    rx={8}
                    fill={pal.light}
                    stroke={pal.fill}
                    strokeWidth={1.5}
                    filter="url(#shadow-sm)"
                  />
                  {cLines.map((line, li) => (
                    <text
                      key={li}
                      x={cxx}
                      y={cyy - ((cLines.length - 1) * 8.5) + li * 17 + 5}
                      textAnchor="middle"
                      fill={pal.text}
                      fontSize={10}
                      fontWeight={600}
                      fontFamily="'Inter', system-ui, sans-serif"
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Center node */}
      <ellipse cx={cx} cy={cy} rx={85} ry={52} fill="#1E1B4B" filter="url(#shadow)" />
      <ellipse cx={cx} cy={cy} rx={82} ry={49} fill="none" stroke="white" strokeWidth={1} strokeOpacity={0.3} />
      {(() => {
        const centerLines = wrapText(root.label, 13);
        return centerLines.map((line, i) => (
          <text
            key={i}
            x={cx}
            y={cy - (centerLines.length - 1) * 9 + i * 18 + 5}
            textAnchor="middle"
            fill="white"
            fontSize={13}
            fontWeight={700}
            fontFamily="'Inter', system-ui, sans-serif"
            letterSpacing="0.5"
          >
            {line}
          </text>
        ));
      })()}
    </g>
  );
}
