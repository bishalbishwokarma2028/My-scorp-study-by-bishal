import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Trash2, Flame, Trophy, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { applyFeatureTablesMigration } from "@/lib/applyMigration.server";

export const Route = createFileRoute("/_authenticated/dashboard/history")({
  component: HistoryPage,
});

const COLORS = ["#2563EB", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#EF4444", "#84CC16", "#F97316", "#6366F1"];

const FILTERS = ["All", "Chat", "Quiz", "Note", "Flashcard", "Image", "Summary", "Translation", "Compare", "Research", "Visual"] as const;

const TYPE_TO_ROUTE: Record<string, string> = {
  Chat:        "/dashboard/chat",
  Quiz:        "/dashboard/quiz",
  Note:        "/dashboard/notes",
  Flashcard:   "/dashboard/flashcards",
  Image:       "/dashboard/image-gen",
  Summary:     "/dashboard/summarizer",
  Translation: "/dashboard/translator",
  Compare:     "/dashboard/compare",
  Research:    "/dashboard/research",
  Visual:      "/dashboard/visual-explainer",
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TEN_DAYS_MS    = 10 * 24 * 60 * 60 * 1000;

// Tables deleted after 10 days (non-chat sections)
const SHORT_TTL_TABLES = [
  "quiz_results", "notes", "flashcards", "generated_images",
  "summaries", "translations", "research_history", "compare_history", "mindmaps",
];

type HistoryItem = {
  id: string;
  type: string;
  table: string;
  desc: string;
  created_at: string;
  extra?: Record<string, unknown>;
};

async function safeFetch<T>(promise: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await promise;
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

function HistoryPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [order, setOrder] = useState<"new" | "old">("new");
  const [search, setSearch] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const migrationRan = useRef(false);

  // Apply DB migration once to create research_history / compare_history tables
  useEffect(() => {
    if (migrationRan.current) return;
    migrationRan.current = true;
    applyFeatureTablesMigration({ data: undefined }).catch(() => {});
  }, []);

  // Auto-cleanup on mount: Chat = 30 days, everything else = 10 days
  useEffect(() => {
    const chatCutoff  = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
    const otherCutoff = new Date(Date.now() - TEN_DAYS_MS).toISOString();

    Promise.all([
      supabase.from("chat_history").delete().eq("user_id", user.id).lt("created_at", chatCutoff),
      ...SHORT_TTL_TABLES.map(t =>
        supabase.from(t as never).delete().eq("user_id", user.id).lt("created_at", otherCutoff)
      ),
    ]).then(() => qc.invalidateQueries({ queryKey: ["history"] }));
  }, [user.id, qc]);

  const { data: all } = useQuery({
    queryKey: ["history", user.id],
    queryFn: async () => {
      const [c, q, n, f, img, s, t, r, cmp, vis] = await Promise.all([
        safeFetch(supabase.from("chat_history").select("id,title,created_at").eq("user_id", user.id).order("created_at", { ascending: false })),
        safeFetch(supabase.from("quiz_results").select("id,topic,score,total,created_at").eq("user_id", user.id).order("created_at", { ascending: false })),
        safeFetch(supabase.from("notes").select("id,title,created_at").eq("user_id", user.id).order("created_at", { ascending: false })),
        safeFetch(supabase.from("flashcards").select("id,topic,created_at").eq("user_id", user.id).order("created_at", { ascending: false })),
        safeFetch(supabase.from("generated_images").select("id,prompt,created_at").eq("user_id", user.id).order("created_at", { ascending: false })),
        safeFetch(supabase.from("summaries").select("id,summary,created_at").eq("user_id", user.id).order("created_at", { ascending: false })),
        safeFetch(supabase.from("translations").select("id,original_text,translated_text,source_language,target_language,created_at").eq("user_id", user.id).order("created_at", { ascending: false })),
        safeFetch(supabase.from("research_history" as never).select("id,query,focus_type,report,sources,search_source,provider,created_at").eq("user_id", user.id).order("created_at", { ascending: false }) as never),
        safeFetch(supabase.from("compare_history" as never).select("id,concept_a,concept_b,category,result,provider,created_at").eq("user_id", user.id).order("created_at", { ascending: false }) as never),
        safeFetch(supabase.from("mindmaps").select("id,topic,map_data,created_at").eq("user_id", user.id).order("created_at", { ascending: false })),
      ]);

      const items: HistoryItem[] = [];

      (c as { id: string; title: string | null; created_at: string }[]).forEach(x =>
        items.push({ id: x.id, table: "chat_history", type: "Chat", desc: x.title ?? "Untitled", created_at: x.created_at }));

      (q as { id: string; topic: string | null; score: number | null; total: number | null; created_at: string }[]).forEach(x =>
        items.push({ id: x.id, table: "quiz_results", type: "Quiz", desc: `${x.topic} (${x.score}/${x.total})`, created_at: x.created_at, extra: { topic: x.topic } }));

      (n as { id: string; title: string; created_at: string }[]).forEach(x =>
        items.push({ id: x.id, table: "notes", type: "Note", desc: x.title, created_at: x.created_at }));

      (f as { id: string; topic: string | null; created_at: string }[]).forEach(x =>
        items.push({ id: x.id, table: "flashcards", type: "Flashcard", desc: x.topic ?? "Set", created_at: x.created_at, extra: { topic: x.topic } }));

      (img as { id: string; prompt: string | null; created_at: string }[]).forEach(x =>
        items.push({ id: x.id, table: "generated_images", type: "Image", desc: x.prompt ?? "", created_at: x.created_at, extra: { prompt: x.prompt } }));

      (s as { id: string; summary: string | null; created_at: string }[]).forEach(x =>
        items.push({ id: x.id, table: "summaries", type: "Summary", desc: (x.summary ?? "").slice(0, 80), created_at: x.created_at, extra: { summary: x.summary } }));

      (t as { id: string; original_text: string | null; translated_text: string | null; source_language: string | null; target_language: string | null; created_at: string }[]).forEach(x =>
        items.push({ id: x.id, table: "translations", type: "Translation", desc: `${(x.original_text ?? "").slice(0, 40)} → ${x.target_language}`, created_at: x.created_at, extra: { original_text: x.original_text, translated_text: x.translated_text, source_language: x.source_language, target_language: x.target_language } }));

      (r as { id: string; query: string; focus_type: string | null; report: string | null; sources: unknown; search_source: string | null; provider: string | null; created_at: string }[]).forEach(x =>
        items.push({ id: x.id, table: "research_history", type: "Research", desc: x.query, created_at: x.created_at, extra: { query: x.query, focusType: x.focus_type, report: x.report, sources: x.sources, searchSource: x.search_source, provider: x.provider } }));

      (cmp as { id: string; concept_a: string; concept_b: string; category: string | null; result: unknown; provider: string | null; created_at: string }[]).forEach(x =>
        items.push({ id: x.id, table: "compare_history", type: "Compare", desc: `${x.concept_a} vs ${x.concept_b}`, created_at: x.created_at, extra: { conceptA: x.concept_a, conceptB: x.concept_b, category: x.category, result: x.result, provider: x.provider } }));

      (vis as { id: string; topic: string | null; map_data: unknown; created_at: string }[]).forEach(x =>
        items.push({ id: x.id, table: "mindmaps", type: "Visual", desc: x.topic ?? "Diagram", created_at: x.created_at, extra: { topic: x.topic, diagram: x.map_data } }));

      return items;
    },
  });

  const filtered = (all ?? [])
    .filter(x => filter === "All" || x.type === filter)
    .filter(x => !search || x.desc.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => order === "new" ? +new Date(b.created_at) - +new Date(a.created_at) : +new Date(a.created_at) - +new Date(b.created_at));

  // Activity by day (last 7 days)
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return { day: d.toLocaleDateString("en", { weekday: "short" }), date: d.toDateString(), count: 0 };
  });
  (all ?? []).forEach(x => {
    const d = new Date(x.created_at).toDateString();
    const slot = days.find(y => y.date === d);
    if (slot) slot.count++;
  });

  // By type
  const typeCounts: Record<string, number> = {};
  (all ?? []).forEach(x => { typeCounts[x.type] = (typeCounts[x.type] ?? 0) + 1; });
  const pieData = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));
  const mostUsed = [...pieData].sort((a, b) => b.value - a.value)[0]?.name ?? "—";

  // Study streak
  const activeDays = new Set((all ?? []).map(x => new Date(x.created_at).toDateString()));
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (activeDays.has(d.toDateString())) streak++; else break;
  }

  async function del(table: string, id: string) {
    await supabase.from(table as never).delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["history"] });
    toast.success("Deleted");
  }

  async function openItem(x: HistoryItem) {
    const route = TYPE_TO_ROUTE[x.type];
    if (!route) return;
    setOpening(x.id);
    try {
      if (x.type === "Chat") {
        const { data } = await supabase.from("chat_history").select("messages").eq("id", x.id).maybeSingle();
        if (data?.messages) sessionStorage.setItem(`scorp_chat_msgs_${user.id}`, JSON.stringify(data.messages));

      } else if (x.type === "Note") {
        sessionStorage.setItem("scorp_restore", JSON.stringify({ type: "Note", id: x.id }));

      } else if (x.type === "Quiz") {
        sessionStorage.setItem("scorp_quiz_topic", String(x.extra?.topic ?? x.desc));

      } else if (x.type === "Flashcard") {
        sessionStorage.setItem("scorp_restore", JSON.stringify({ type: "Flashcard", topic: x.extra?.topic ?? x.desc }));

      } else if (x.type === "Image") {
        sessionStorage.setItem("scorp_restore", JSON.stringify({ type: "Image", prompt: x.extra?.prompt ?? "" }));

      } else if (x.type === "Summary") {
        const { data } = await supabase.from("summaries").select("*").eq("id", x.id).maybeSingle();
        if (data) sessionStorage.setItem("scorp_restore", JSON.stringify({ type: "Summary", data }));

      } else if (x.type === "Translation") {
        sessionStorage.setItem("scorp_restore", JSON.stringify({
          type: "Translation",
          original_text: x.extra?.original_text ?? "",
          translated_text: x.extra?.translated_text ?? "",
          source_language: x.extra?.source_language ?? "Auto-detect",
          target_language: x.extra?.target_language ?? "English",
        }));

      } else if (x.type === "Research") {
        sessionStorage.setItem("scorp_research_restore", JSON.stringify({
          query:        x.extra?.query ?? x.desc,
          focusType:    x.extra?.focusType ?? "general",
          report:       x.extra?.report ?? null,
          sources:      x.extra?.sources ?? [],
          searchSource: x.extra?.searchSource ?? "",
          provider:     x.extra?.provider ?? null,
        }));

      } else if (x.type === "Compare") {
        sessionStorage.setItem("scorp_compare_restore", JSON.stringify({
          conceptA: x.extra?.conceptA ?? "",
          conceptB: x.extra?.conceptB ?? "",
          category: x.extra?.category ?? "Auto-detect",
          result:   x.extra?.result ?? null,
          provider: x.extra?.provider ?? null,
        }));

      } else if (x.type === "Visual") {
        sessionStorage.setItem("scorp_visual_restore", JSON.stringify({
          topic:       x.extra?.topic ?? x.desc,
          diagramType: (x.extra?.diagram as { type?: string })?.type ?? "mindmap",
          diagram:     x.extra?.diagram ?? null,
          provider:    null,
        }));
      }

      navigate({ to: route as never });
    } finally {
      setOpening(null);
    }
  }

  const TYPE_ICONS: Record<string, string> = {
    Chat: "💬", Quiz: "❓", Note: "📝", Flashcard: "🗂️",
    Image: "🖼️", Summary: "📄", Translation: "🌐",
    Compare: "⚖️", Research: "🔍", Visual: "🧠",
  };

  return (
    <div className="space-y-6">
      {/* Auto-delete notice */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="mt-0.5 text-base leading-none">⏳</span>
        <p>
          <strong>Auto-delete policy:</strong>{" "}
          <strong>Bishal's Assistant (Chat)</strong> history is kept for <strong>30 days</strong>.{" "}
          All other sections (Quiz, Notes, Flashcards, Research, Compare, Visual, etc.) are deleted after <strong>10–15 days</strong>.
          Open items before they expire to save them.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Total activity" value={all?.length ?? 0} />
        <StatCard label="Study streak" value={`${streak}d`} icon={<Flame className="h-4 w-4 text-warning" />} />
        <StatCard label="Most used" value={mostUsed !== "—" ? (TYPE_ICONS[mostUsed] ?? "") + " " + mostUsed : "—"} icon={<Trophy className="h-4 w-4 text-warning" />} />
        <StatCard label="Days active" value={activeDays.size} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-soft p-4">
          <h3 className="mb-3 text-sm font-semibold">Activity (last 7 days)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={days}>
              <XAxis dataKey="day" stroke="currentColor" fontSize={11} />
              <YAxis stroke="currentColor" fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#2563EB" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card-soft p-4">
          <h3 className="mb-3 text-sm font-semibold">By feature</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={70} label={({ name }) => name}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* History list */}
      <div className="card-soft p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-accent hover:bg-accent/70"}`}>
              {TYPE_ICONS[f] ? `${TYPE_ICONS[f]} ` : ""}{f}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…" className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs" />
            <select value={order} onChange={e => setOrder(e.target.value as never)}
              className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs">
              <option value="new">Newest</option>
              <option value="old">Oldest</option>
            </select>
          </div>
        </div>

        <ul className="divide-y divide-border">
          {filtered.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">
              No activity yet — start using any feature to see it here
            </li>
          )}
          {filtered.map(x => {
            const route = TYPE_TO_ROUTE[x.type];
            return (
              <li key={`${x.type}-${x.id}`}
                className="flex items-center justify-between py-2.5 text-sm group hover:bg-accent/40 rounded-lg px-2 transition-colors">
                <button
                  onClick={() => openItem(x)}
                  disabled={opening === x.id}
                  className="min-w-0 flex items-center gap-3 flex-1 text-left disabled:opacity-60"
                  title={route ? `Open in ${x.type}` : undefined}
                >
                  <span className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/10 whitespace-nowrap">
                    {TYPE_ICONS[x.type] ?? ""} {x.type}
                  </span>
                  <span className="truncate text-sm">{x.desc}</span>
                  {opening === x.id
                    ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent flex-shrink-0" />
                    : route && <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />}
                </button>
                <div className="flex shrink-0 items-center gap-2 ml-2">
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    {new Date(x.created_at).toLocaleString()}
                  </span>
                  <button onClick={() => del(x.table, x.id)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div className="card-soft p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>{icon}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}
