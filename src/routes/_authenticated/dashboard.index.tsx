import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  MessageSquare, ListChecks, StickyNote, Image as ImageIcon, Sparkles, Flame,
  FileText, Layers, BookOpen, TrendingUp, Star, ArrowRight, Brain,
  Code2, GitCompare, Search, Eye, Languages, Calculator, FlaskConical, Sheet,
  FileQuestion, Youtube, BookText, Sigma, Microscope, ScanText, PenLine, Compass,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDailyTip } from "@/hooks/useDailyTip";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardOverview,
});

const quickStart = [
  { to: "/dashboard/chat",             label: "Bishal's Assistant", sub: "Ask anything, get explained",  icon: MessageSquare, grad: "from-blue-500 to-cyan-500" },
  { to: "/dashboard/solver",           label: "Step-by-Step Solver", sub: "Full worked solutions",       icon: Brain,         grad: "from-blue-500 to-indigo-600" },
  { to: "/dashboard/pdf-chat",         label: "Chat with PDF",     sub: "Ask questions about any PDF",   icon: FileQuestion,  grad: "from-violet-500 to-fuchsia-600" },
  { to: "/dashboard/youtube",          label: "YouTube Summarizer", sub: "Summarize any video",          icon: Youtube,       grad: "from-red-500 to-rose-600" },
  { to: "/dashboard/grammar",          label: "Grammar",           sub: "Rules, examples & practice",    icon: BookText,      grad: "from-cyan-500 to-blue-600" },
  { to: "/dashboard/math",             label: "Mathematics",       sub: "Formulas & worked examples",    icon: Sigma,         grad: "from-indigo-500 to-purple-600" },
  { to: "/dashboard/science",          label: "Science",           sub: "Physics, Chem & Biology",       icon: Microscope,    grad: "from-emerald-500 to-green-600" },
  { to: "/dashboard/summarizer",       label: "Summarizer",        sub: "Condense any content fast",     icon: FileText,      grad: "from-violet-500 to-purple-500" },
  { to: "/dashboard/quiz",             label: "Quiz Yourself",     sub: "Custom practice tests",         icon: ListChecks,    grad: "from-fuchsia-500 to-purple-500" },
  { to: "/dashboard/flashcards",       label: "Flashcards",        sub: "Spaced repetition study",       icon: Layers,        grad: "from-pink-500 to-rose-500" },
  { to: "/dashboard/compare",          label: "Compare Concepts",  sub: "Side-by-side deep comparison",  icon: GitCompare,    grad: "from-indigo-500 to-blue-600" },
  { to: "/dashboard/research",         label: "Deep Research",     sub: "Web-powered research reports",  icon: Search,        grad: "from-teal-500 to-cyan-600" },
  { to: "/dashboard/visual-explainer", label: "Visual Explainer",  sub: "Click-to-explain diagrams",     icon: Eye,           grad: "from-emerald-500 to-teal-600" },
  { to: "/dashboard/code-tutor",       label: "Code Tutor",        sub: "Analyze & generate code",       icon: Code2,         grad: "from-slate-600 to-gray-700" },
  { to: "/dashboard/notes",            label: "Smart Notes",       sub: "Smart note editor",             icon: BookOpen,      grad: "from-red-500 to-rose-500" },
  { to: "/dashboard/translator",       label: "Translator",        sub: "Translate any language",        icon: Languages,     grad: "from-amber-500 to-orange-500" },
  { to: "/dashboard/image-gen",        label: "Image Generator",   sub: "Visualize any concept",         icon: ImageIcon,     grad: "from-rose-500 to-pink-600" },
  { to: "/dashboard/formula-sheet",    label: "Formula Sheet",     sub: "Generate formula sheets",       icon: Sheet,         grad: "from-cyan-500 to-blue-600" },
  { to: "/dashboard/mock-test",        label: "Mock Test",         sub: "Timed tests with review",       icon: FlaskConical,  grad: "from-rose-500 to-red-600" },
  { to: "/dashboard/calculator",       label: "Calculator",        sub: "Step-by-step math solver",      icon: Calculator,    grad: "from-green-500 to-emerald-600" },
  { to: "/dashboard/image-solver",     label: "Image Solver",      sub: "Solve questions from images",   icon: ScanText,      grad: "from-orange-500 to-amber-600" },
  { to: "/dashboard/whiteboard",       label: "Teaching Board",    sub: "Interactive visual teaching",   icon: PenLine,       grad: "from-sky-500 to-indigo-500" },
  { to: "/dashboard/career-explorer", label: "Career Explorer",   sub: "Explore 510 career paths",      icon: Compass,       grad: "from-violet-600 to-indigo-600" },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function DashboardOverview() {
  const { user } = Route.useRouteContext();
  const tip = useDailyTip();

  const { data: profile } = useQuery({
    queryKey: ["profile-name", user.id],
    queryFn: async () => (await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()).data,
  });

  const { data: stats } = useQuery({
    queryKey: ["overview-stats", user.id],
    queryFn: async () => {
      const [notesRes, chatsRes, quizzesRes] = await Promise.all([
        supabase.from("notes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("chat_history").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("quiz_results").select("id,percentage", { count: "exact" }).eq("user_id", user.id),
      ]);
      const quizScores = (quizzesRes.data ?? []).map((q) => q.percentage ?? 0);
      const avgScore = quizScores.length ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length) : 0;
      return {
        total_notes: notesRes.count ?? 0,
        total_chats: chatsRes.count ?? 0,
        total_quizzes: quizzesRes.count ?? 0,
        avg_quiz_score: avgScore,
        study_streak: 0,
      };
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["recent", user.id],
    queryFn: async () => {
      const [chats, quizzes, notes, images] = await Promise.all([
        supabase.from("chat_history").select("id,title,created_at").order("created_at", { ascending: false }).limit(3),
        supabase.from("quiz_results").select("id,topic,score,total,created_at").order("created_at", { ascending: false }).limit(3),
        supabase.from("notes").select("id,title,created_at").order("created_at", { ascending: false }).limit(3),
        supabase.from("generated_images").select("id,prompt,created_at").order("created_at", { ascending: false }).limit(3),
      ]);
      const all = [
        ...(chats.data ?? []).map((x) => ({ ...x, type: "Chat", desc: x.title || "Untitled chat" })),
        ...(quizzes.data ?? []).map((x) => ({ ...x, type: "Quiz", desc: `${x.topic} (${x.score}/${x.total})` })),
        ...(notes.data ?? []).map((x) => ({ ...x, type: "Note", desc: x.title })),
        ...(images.data ?? []).map((x) => ({ ...x, type: "Image", desc: x.prompt })),
      ];
      return all.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 5);
    },
  });

  const name = (profile?.full_name?.split(" ")[0]) || "Student";
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const cards = [
    { label: "Notes Written", value: stats?.total_notes ?? 0, icon: BookOpen, tint: "bg-rose-100 text-rose-600", bgTint: "bg-rose-50/50" },
    { label: "Chat Sessions", value: stats?.total_chats ?? 0, icon: MessageSquare, tint: "bg-blue-100 text-blue-600", bgTint: "bg-blue-50/50" },
    { label: "Quizzes Taken", value: stats?.total_quizzes ?? 0, icon: Brain, tint: "bg-violet-100 text-violet-600", bgTint: "bg-violet-50/50" },
    { label: "Avg Quiz Score", value: stats?.avg_quiz_score ? `${stats.avg_quiz_score}%` : "—", icon: TrendingUp, tint: "bg-emerald-100 text-emerald-600", bgTint: "bg-emerald-50/50" },
  ];

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* Hero greeting */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 p-4 text-white shadow-xl shadow-violet-500/30 sm:rounded-3xl sm:p-7">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl lg:text-4xl">
              <span>💥</span> {greeting()}, {name}!
            </h1>
            <p className="mt-1.5 text-xs opacity-95 sm:mt-2 sm:text-sm">{today} — Keep pushing forward 🚀</p>
          </div>
          <div className="rounded-xl bg-white/15 px-4 py-2.5 backdrop-blur sm:rounded-2xl sm:px-5 sm:py-3">
            <div className="flex items-center gap-2 text-xs opacity-90"><Flame className="h-4 w-4" /> Study Streak</div>
            <div className="mt-1 text-xl font-bold sm:text-2xl">{stats?.study_streak ?? 0} sessions</div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-2xl border border-border ${c.bgTint} p-3 sm:p-5`}>
            <div className="flex items-start justify-between">
              <div className={`grid h-9 w-9 place-items-center rounded-xl sm:h-11 sm:w-11 ${c.tint}`}><c.icon className="h-4 w-4 sm:h-5 sm:w-5" /></div>
              <TrendingUp className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div className="mt-3 text-2xl font-bold sm:mt-4 sm:text-3xl">{c.value}</div>
            <div className="mt-1 text-[11px] text-muted-foreground sm:text-xs">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Quick start */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold sm:mb-4 sm:text-lg">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100 text-amber-600"><Sparkles className="h-4 w-4" /></span>
          Quick Start
        </h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {quickStart.map((q) => (
            <Link key={q.to} to={q.to} className="group rounded-2xl border border-border bg-gradient-to-br from-white to-violet-50/40 p-2.5 text-center transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/10 sm:p-4">
              <div className={`mx-auto mb-2 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br sm:mb-3 sm:h-12 sm:w-12 sm:rounded-2xl ${q.grad} text-white shadow-md`}>
                <q.icon className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="text-[11px] font-semibold leading-tight sm:text-sm">{q.label}</div>
              <div className="mt-0.5 hidden text-[11px] leading-snug text-muted-foreground sm:mt-1 sm:block">{q.sub}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Two-col: recent activity + side panel */}
      <div className="grid gap-4 lg:grid-cols-3 sm:gap-6">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-100 text-violet-600">🕒</span>
              Recent Activity
            </h2>
            <Link to="/dashboard/history" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">View all <ArrowRight className="h-3 w-3" /></Link>
          </div>
          <div className="rounded-2xl border border-border bg-white p-6">
            {(!recent || recent.length === 0) ? (
              <div className="py-10 text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground"><Brain className="h-7 w-7" /></div>
                <p className="mt-4 font-semibold">No activity yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Start with any tool above — your history will appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((r) => (
                  <li key={`${r.type}-${r.id}`} className="flex items-center justify-between py-3 text-sm">
                    <span className="flex items-center gap-3"><span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-primary">{r.type}</span> {r.desc}</span>
                    <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-700">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-500 text-white"><Star className="h-4 w-4" /></span>
              Study Tip of the Day
            </div>
            <p className="mt-3 text-sm leading-relaxed text-amber-900">✍️ {tip || "The Feynman Technique: explain a concept as if teaching a child — gaps in your explanation reveal gaps in understanding."}</p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500 text-white"><TrendingUp className="h-4 w-4" /></span>
              Your Progress
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                { l: "Notes", v: stats?.total_notes ?? 0, icon: "📝" },
                { l: "Chats", v: stats?.total_chats ?? 0, icon: "💬" },
                { l: "Quizzes", v: stats?.total_quizzes ?? 0, icon: "🎯" },
                { l: "Flashcards", v: 0, icon: "🗂️" },
              ].map((r) => (
                <li key={r.l} className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2">
                  <span className="flex items-center gap-2 text-emerald-800"><span>{r.icon}</span> {r.l}</span>
                  <span className="font-bold text-emerald-700">{r.v}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
