import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Compass, Search, X, ChevronRight, ArrowLeft, TrendingUp,
  Briefcase, Globe, MapPin, Star, BookOpen, Layers, Award,
  DollarSign, Users, BarChart2, Filter, ChevronDown, Sparkles,
  SendHorizontal, Loader2,
} from "lucide-react";
import { getCareersIndex, getCareerDetail, findCareersByInterest } from "@/lib/careers.functions";
import type { CareerIndex, CareerFull } from "@/lib/careers.functions";

export const Route = createFileRoute("/_authenticated/dashboard/career-explorer")({
  loader: async () => {
    const index = await getCareersIndex();
    return { index };
  },
  component: CareerExplorerPage,
});

// ─── Category colors ────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  "Technology & IT": "from-blue-500 to-cyan-500",
  "Engineering": "from-orange-500 to-amber-500",
  "Medical & Healthcare": "from-rose-500 to-pink-500",
  "Business & Finance": "from-emerald-500 to-teal-500",
  "Arts, Media & Creative": "from-purple-500 to-fuchsia-500",
  "Government & Civil Service": "from-slate-500 to-gray-600",
  "Science & Research": "from-indigo-500 to-blue-600",
  "Agriculture & Environment": "from-green-500 to-emerald-600",
  "Skilled Trades": "from-yellow-500 to-orange-500",
  "Education": "from-cyan-500 to-sky-600",
  "Hospitality & Tourism": "from-amber-500 to-yellow-500",
  "Law & Legal": "from-zinc-600 to-slate-700",
  "Armed Forces & Security": "from-red-700 to-rose-700",
  "Sports": "from-lime-500 to-green-500",
  "Manufacturing & Production": "from-stone-500 to-zinc-600",
  "Transportation & Logistics": "from-sky-500 to-blue-500",
  "Retail & Sales": "from-pink-500 to-rose-500",
  "Beauty & Wellness": "from-fuchsia-500 to-pink-500",
  "Non-Profit & Social Services": "from-teal-500 to-cyan-500",
  "Real Estate & Property": "from-violet-500 to-purple-500",
  "Maritime & Aviation": "from-blue-600 to-indigo-600",
  "Energy & Utilities": "from-yellow-600 to-amber-600",
  "Politics & Public Policy": "from-red-500 to-rose-600",
  "Religious & Community Services": "from-amber-600 to-yellow-700",
};

const CATEGORY_BG: Record<string, string> = {
  "Technology & IT": "bg-blue-50 text-blue-700 border-blue-200",
  "Engineering": "bg-orange-50 text-orange-700 border-orange-200",
  "Medical & Healthcare": "bg-rose-50 text-rose-700 border-rose-200",
  "Business & Finance": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Arts, Media & Creative": "bg-purple-50 text-purple-700 border-purple-200",
  "Government & Civil Service": "bg-slate-50 text-slate-700 border-slate-200",
  "Science & Research": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Agriculture & Environment": "bg-green-50 text-green-700 border-green-200",
  "Skilled Trades": "bg-yellow-50 text-yellow-700 border-yellow-200",
  "Education": "bg-cyan-50 text-cyan-700 border-cyan-200",
  "Hospitality & Tourism": "bg-amber-50 text-amber-700 border-amber-200",
  "Law & Legal": "bg-zinc-50 text-zinc-700 border-zinc-200",
  "Armed Forces & Security": "bg-red-50 text-red-800 border-red-200",
  "Sports": "bg-lime-50 text-lime-700 border-lime-200",
  "Manufacturing & Production": "bg-stone-50 text-stone-700 border-stone-200",
  "Transportation & Logistics": "bg-sky-50 text-sky-700 border-sky-200",
  "Retail & Sales": "bg-pink-50 text-pink-700 border-pink-200",
  "Beauty & Wellness": "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  "Non-Profit & Social Services": "bg-teal-50 text-teal-700 border-teal-200",
  "Real Estate & Property": "bg-violet-50 text-violet-700 border-violet-200",
  "Maritime & Aviation": "bg-blue-50 text-blue-800 border-blue-300",
  "Energy & Utilities": "bg-yellow-50 text-yellow-800 border-yellow-300",
  "Politics & Public Policy": "bg-red-50 text-red-700 border-red-200",
  "Religious & Community Services": "bg-amber-50 text-amber-800 border-amber-300",
};

const ALL_CATEGORIES = Object.keys(CATEGORY_COLORS);

function gradientFor(category: string) {
  return CATEGORY_COLORS[category] ?? "from-violet-500 to-purple-600";
}
function chipFor(category: string) {
  return CATEGORY_BG[category] ?? "bg-violet-50 text-violet-700 border-violet-200";
}
function parseSalary(band: string): number {
  const m = band.match(/[\d,]+/);
  return m ? parseInt(m[0].replace(/,/g, ""), 10) : 0;
}

// ─── Salary bar ─────────────────────────────────────────────────────────────
function SalaryBar({ label, value, max, color }: { label: string; value: string; max: number; color: string }) {
  const num = parseSalary(value);
  const pct = max > 0 ? Math.min(100, Math.round((num / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-500">{label}</span>
        <span className="font-bold text-slate-800">{value}</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Section block ───────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, accent }: { title: string; icon: React.ElementType; children: React.ReactNode; accent: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className={`flex items-center gap-3 px-6 py-4 border-b border-slate-100`}>
        <div className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-sm flex-shrink-0`}>
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="font-bold text-base text-slate-800">{title}</h3>
      </div>
      <div className="px-6 py-5 text-[15px] leading-[1.85] text-slate-700 font-normal">
        {children}
      </div>
    </div>
  );
}

// ─── Salary quick-stat pill ──────────────────────────────────────────────────
function SalaryPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`flex-1 rounded-2xl border p-4 ${color}`}>
      <div className="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">{label}</div>
      <div className="text-base font-bold leading-snug">{value}</div>
    </div>
  );
}

// ─── Career Detail View ──────────────────────────────────────────────────────
function CareerDetail({ careerId, onBack }: { careerId: string; onBack: () => void }) {
  const [career, setCareer] = useState<CareerFull | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setCareer(null);
    getCareerDetail({ data: { id: careerId } })
      .then((c) => setCareer(c))
      .finally(() => setLoading(false));
  }, [careerId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="h-12 w-12 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
        <p className="text-base text-slate-500 font-medium">Loading career details…</p>
      </div>
    );
  }
  if (!career) {
    return (
      <div className="text-center py-24 text-slate-500">
        <p className="text-base">Career not found.</p>
        <button onClick={onBack} className="mt-4 text-violet-600 underline text-sm">Go back</button>
      </div>
    );
  }

  const maxSalary = Math.max(
    parseSalary(career.salaryBands.senior),
    parseSalary(career.salaryBands.mid),
    parseSalary(career.salaryBands.entry),
  ) || 1;

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">
      {/* Back */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors group"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Back to Career Explorer
      </button>

      {/* Hero */}
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${gradientFor(career.category)} p-8 text-white shadow-2xl`}>
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -left-10 bottom-0 h-48 w-48 rounded-full bg-black/10 blur-2xl" />
        <div className="relative">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-sm font-semibold backdrop-blur-sm">
            <Briefcase className="h-3.5 w-3.5" />
            {career.category}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl mb-4">{career.title}</h1>
          <div className="flex flex-wrap gap-2">
            {career.skills.slice(0, 6).map((sk) => (
              <span key={sk} className="rounded-full bg-white/20 px-3 py-1 text-sm font-medium backdrop-blur-sm">
                {sk}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Nepal salary quick-stats */}
      <div className="flex gap-3 flex-wrap sm:flex-nowrap">
        <SalaryPill label="Entry Level" value={career.salaryBands.entry} color="bg-emerald-50 text-emerald-900 border-emerald-200" />
        <SalaryPill label="Mid Level" value={career.salaryBands.mid} color="bg-blue-50 text-blue-900 border-blue-200" />
        <SalaryPill label="Senior Level" value={career.salaryBands.senior} color="bg-violet-50 text-violet-900 border-violet-200" />
      </div>

      {/* Main content — single column, no gap problem */}
      <div className="space-y-5">
        <Section title="Overview" icon={BookOpen} accent="from-violet-500 to-purple-600">
          <p>{career.overview}</p>
        </Section>

        <Section title="Roles & Responsibilities" icon={Users} accent="from-blue-500 to-cyan-500">
          <p>{career.roles}</p>
        </Section>

        <Section title="Why Choose This Career" icon={Star} accent="from-amber-500 to-orange-500">
          <p>{career.whyChoose}</p>
        </Section>

        <Section title="Current Scope & Industry Trends" icon={TrendingUp} accent="from-emerald-500 to-teal-500">
          <p>{career.scope}</p>
        </Section>

        <Section title="Career Growth Path" icon={Award} accent="from-indigo-500 to-blue-600">
          <p>{career.growth}</p>
        </Section>

        {/* Salary + Skills row */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Nepal Salary detail */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-sm">
                <DollarSign className="h-4 w-4" />
              </div>
              <h3 className="font-bold text-base text-slate-800">Nepal Salary Detail</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">{career.salaryNepal}</p>
              <div className="space-y-4 pt-1">
                <SalaryBar label="Entry" value={career.salaryBands.entry} max={maxSalary} color="from-emerald-400 to-teal-400" />
                <SalaryBar label="Mid" value={career.salaryBands.mid} max={maxSalary} color="from-blue-400 to-indigo-500" />
                <SalaryBar label="Senior" value={career.salaryBands.senior} max={maxSalary} color="from-violet-500 to-purple-600" />
              </div>
            </div>
          </div>

          {/* International Salary */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm">
                <Globe className="h-4 w-4" />
              </div>
              <h3 className="font-bold text-base text-slate-800">International Salaries</h3>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-slate-600 leading-relaxed mb-4">{career.salaryAbroad}</p>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-amber-700 opacity-70"><MapPin className="h-3 w-3" />Gulf Countries</div>
                <div className="text-base font-bold text-amber-900">{career.foreignSalary.gulf}</div>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-blue-700 opacity-70"><Globe className="h-3 w-3" />USA / UK / Western Europe</div>
                <div className="text-base font-bold text-blue-900">{career.foreignSalary.western}</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-emerald-700 opacity-70"><BarChart2 className="h-3 w-3" />Australia & NZ</div>
                <div className="text-base font-bold text-emerald-900">{career.foreignSalary.australia}</div>
              </div>
            </div>
          </div>

          {/* Key Skills */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-500 text-white shadow-sm">
                <Layers className="h-4 w-4" />
              </div>
              <h3 className="font-bold text-base text-slate-800">Key Skills</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600 leading-relaxed mb-4">{career.skillsIntro}</p>
              <div className="flex flex-wrap gap-2">
                {career.skills.map((sk) => (
                  <span key={sk} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700">
                    {sk}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Career Card ─────────────────────────────────────────────────────────────
function CareerCard({ career, onClick }: { career: CareerIndex; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group w-full text-left rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/10 hover:border-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 overflow-hidden"
    >
      <div className={`h-1.5 bg-gradient-to-r ${gradientFor(career.category)}`} />
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${chipFor(career.category)}`}>
            {career.category}
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-500 flex-shrink-0" />
        </div>
        <h3 className="font-semibold text-sm leading-snug text-slate-800 group-hover:text-violet-600 transition-colors">
          {career.title}
        </h3>
        <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
          <DollarSign className="h-3 w-3" />
          <span className="truncate">{career.salaryBands.entry}</span>
          <span className="opacity-40 mx-0.5">→</span>
          <span className="truncate text-emerald-600 font-semibold">{career.salaryBands.senior}</span>
        </div>
      </div>
    </button>
  );
}

// ─── Interest Finder ─────────────────────────────────────────────────────────
function InterestFinder({ onSelectCareer }: { onSelectCareer: (id: string) => void }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CareerIndex[] | null>(null);
  const [error, setError] = useState("");

  async function handleFind() {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    setResults(null);
    try {
      const matches = await findCareersByInterest({ data: { interest: text } });
      setResults(matches);
    } catch {
      setError("Could not find matches. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleFind(); }
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-violet-100">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-bold text-base text-slate-800">Career Match Finder</h3>
          <p className="text-xs text-slate-500 mt-0.5">Describe your interests, hobbies, or goals — we'll find matching careers</p>
        </div>
      </div>
      <div className="px-6 py-5 space-y-4">
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            rows={3}
            placeholder="e.g. I love working with computers and solving puzzles, I enjoy helping sick people recover, I'm good at drawing and design, I want to work outdoors with animals…"
            className="w-full resize-none rounded-xl border border-violet-200 bg-white px-4 py-3.5 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200 leading-relaxed"
          />
        </div>
        <button
          onClick={handleFind}
          disabled={loading || !text.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          {loading ? "Finding matches…" : "Find Matching Careers"}
        </button>

        {error && <p className="text-sm text-rose-600 font-medium">{error}</p>}

        {results !== null && (
          <div className="pt-2">
            {results.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No close matches found. Try different words like your subjects, skills, or dream job.</p>
            ) : (
              <>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  {results.length} matching career{results.length !== 1 ? "s" : ""} found
                </p>
                <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {results.map((career) => (
                    <CareerCard
                      key={career.id}
                      career={career}
                      onClick={() => { onSelectCareer(career.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function CareerExplorerPage() {
  const { index } = Route.useLoaderData();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCareerId, setSelectedCareerId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 48;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCategoryDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => { setPage(1); }, [search, selectedCategory]);

  const filtered = useMemo(() => {
    let result = index;
    if (selectedCategory) result = result.filter((c) => c.category === selectedCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q));
    }
    return result;
  }, [index, search, selectedCategory]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of index) counts[c.category] = (counts[c.category] ?? 0) + 1;
    return counts;
  }, [index]);

  if (selectedCareerId) {
    return (
      <div className="mx-auto max-w-4xl">
        <CareerDetail careerId={selectedCareerId} onBack={() => setSelectedCareerId(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 p-7 text-white shadow-xl shadow-violet-500/25">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-indigo-400/20 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
              <Compass className="h-3.5 w-3.5" />
              Career Planning Tool
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">ScorpStudy Career Explorer</h1>
            <p className="mt-2 max-w-xl text-sm text-violet-200 leading-relaxed">
              Explore 510 career paths with real salary data for Nepal and abroad, required skills, growth trajectories, and industry insights — all in one place.
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-2xl bg-white/15 px-5 py-4 backdrop-blur-sm text-center min-w-[120px]">
            <div className="text-4xl font-extrabold">510</div>
            <div className="text-xs text-violet-200 font-medium">Career Paths</div>
            <div className="text-3xl font-bold mt-1">24</div>
            <div className="text-xs text-violet-200 font-medium">Categories</div>
          </div>
        </div>
      </div>

      {/* Interest finder */}
      <InterestFinder onSelectCareer={(id) => { setSelectedCareerId(id); window.scrollTo({ top: 0, behavior: "smooth" }); }} />

      {/* Search + filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all 510 careers…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowCategoryDropdown((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-slate-50 transition-colors w-full sm:w-auto justify-between"
          >
            <Filter className="h-4 w-4 text-slate-400" />
            <span className="flex-1 text-left">{selectedCategory ?? "All Categories"}</span>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showCategoryDropdown ? "rotate-180" : ""}`} />
          </button>
          {showCategoryDropdown && (
            <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl shadow-black/10 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="max-h-80 overflow-y-auto p-2">
                <button
                  onClick={() => { setSelectedCategory(null); setShowCategoryDropdown(false); }}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${selectedCategory === null ? "bg-violet-600 text-white font-semibold" : "hover:bg-slate-50"}`}
                >
                  <span>All Categories</span>
                  <span className="text-xs opacity-70">{index.length}</span>
                </button>
                {ALL_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => { setSelectedCategory(cat); setShowCategoryDropdown(false); }}
                    className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${selectedCategory === cat ? "bg-violet-600 text-white font-semibold" : "hover:bg-slate-50"}`}
                  >
                    <span>{cat}</span>
                    <span className="text-xs opacity-70">{categoryCounts[cat] ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {(search || selectedCategory) && (
          <button
            onClick={() => { setSearch(""); setSelectedCategory(null); }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors shadow-sm"
          >
            <X className="h-4 w-4" /> Clear
          </button>
        )}
      </div>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
            selectedCategory === null
              ? "bg-violet-600 text-white border-violet-600 shadow-md"
              : "bg-white border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-600"
          }`}
        >
          All <span className="opacity-60">{index.length}</span>
        </button>
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
              selectedCategory === cat
                ? "bg-violet-600 text-white border-violet-600 shadow-md"
                : "bg-white border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-600"
            }`}
          >
            {cat} <span className="opacity-60">{categoryCounts[cat] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Results summary */}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          {filtered.length === 0
            ? "No careers found"
            : `${filtered.length} career${filtered.length !== 1 ? "s" : ""}${selectedCategory ? ` in ${selectedCategory}` : ""}${search ? ` matching "${search}"` : ""}`}
        </span>
        {totalPages > 1 && <span>Page {page} of {totalPages}</span>}
      </div>

      {/* Career grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-20 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400 mb-4">
            <Search className="h-7 w-7" />
          </div>
          <p className="font-semibold text-slate-700">No careers found</p>
          <p className="mt-1 text-sm text-slate-400">Try a different search term or category.</p>
          <button onClick={() => { setSearch(""); setSelectedCategory(null); }} className="mt-4 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:opacity-90 transition">
            Show all careers
          </button>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {paginated.map((career) => (
            <CareerCard
              key={career.id}
              career={career}
              onClick={() => { setSelectedCareerId(career.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2 pb-4 flex-wrap">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let p: number;
            if (totalPages <= 7) p = i + 1;
            else if (page <= 4) p = i + 1;
            else if (page >= totalPages - 3) p = totalPages - 6 + i;
            else p = page - 3 + i;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`h-9 w-9 rounded-xl text-sm font-medium transition-all ${
                  p === page ? "bg-violet-600 text-white shadow-md" : "border border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                {p}
              </button>
            );
          })}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
