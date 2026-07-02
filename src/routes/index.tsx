import { createFileRoute, Link } from "@tanstack/react-router";
import {
  MessageSquare, FileText, ListChecks, Layers, Image as ImageIcon, BookOpen, Camera,
  Sparkles, Globe, Clock, Star, Shield, ArrowRight, Calculator as CalcIcon, FlaskConical,
  Atom, History as HistoryIcon, Code2, Languages as LangIcon, BarChart3, Music, Palette,
  CheckCircle2, XCircle, Zap, TrendingUp, Brain, Map, ExternalLink, GraduationCap, Trophy,
  GitCompare, Search, Eye,
} from "lucide-react";
import logoUrl from "@/assets/scorpstudy-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ScorpStudy by Bishal – AI Student Learning Platform 🚀" },
      { name: "description", content: "ScorpStudy by Bishal is an AI-powered learning platform for students. Get study help, notes, quizzes, mock tests and personalized AI tutoring. Study Smart. Learn Faster. Achieve More." },
      { name: "keywords", content: "ScorpStudy, ScorpStudy by Bishal, Bishal's Assistant, AI study tutor, AI learning platform, online study help, quiz generator, flashcard maker, smart notes, PDF summarizer, mind maps, exam preparation, free study app, Bishal Bishwokarma, student learning, study smarter, SEE exam Nepal, +2 science help" },
      { property: "og:title", content: "ScorpStudy by Bishal – AI Student Learning Platform 🚀" },
      { property: "og:description", content: "ScorpStudy by Bishal is an AI-powered learning platform for students. Get study help, notes, quizzes, mock tests and personalized AI tutoring. Study Smart. Learn Faster. Achieve More." },
      { property: "og:url", content: "https://scorpstudy.in.net/" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "ScorpStudy by Bishal – AI Student Learning Platform 🚀" },
      { name: "twitter:description", content: "ScorpStudy by Bishal is an AI-powered learning platform for students. Get study help, notes, quizzes, mock tests and personalized AI tutoring." },
    ],
    links: [
      { rel: "canonical", href: "https://scorpstudy.in.net/" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: MessageSquare, title: "Bishal's Assistant", desc: "Chat with a brilliant study tutor that knows everything. Ask about any subject — science, math, history, coding. Get detailed, exam-ready answers in seconds.", color: "from-blue-500 to-cyan-500", badge: "Most Popular" },
  { icon: FileText, title: "PDF Summarizer", desc: "Paste any long text or textbook content. Get a concise summary, key bullet points, and auto-generated exam questions instantly.", color: "from-violet-500 to-purple-500" },
  { icon: ListChecks, title: "Quiz Generator", desc: "Test yourself with custom quizzes on any topic. Choose difficulty and question count. No two quizzes are the same — endless practice.", color: "from-fuchsia-500 to-purple-500" },
  { icon: Layers, title: "Flashcard Maker", desc: "Type your topic and get beautifully designed flashcards in seconds. Flip through them to memorize faster. Built for spaced repetition learning.", color: "from-pink-500 to-rose-500" },
  { icon: Camera, title: "Image Question Solver", desc: "Snap a photo of any question paper, textbook page, or worksheet. Bishal's Assistant reads it and solves every question step by step.", color: "from-rose-500 to-pink-600", badge: "New" },
  { icon: BookOpen, title: "Smart Notes", desc: "Write notes and let Bishal's Assistant enhance them, add structure, fix grammar, and create summaries. Export to PDF or generate a quiz straight from your notes.", color: "from-red-500 to-rose-500" },
  { icon: Map, title: "Mind Maps", desc: "Generate comprehensive visual mind maps for any topic in seconds. 6 branches with detailed sub-topics — perfect for visual learners.", color: "from-emerald-500 to-teal-500" },
  { icon: LangIcon, title: "Universal Translator", desc: "Translate text between 30+ languages instantly. With auto-detect, text-to-speech, and a full history of your translations.", color: "from-sky-500 to-blue-500" },
  { icon: CalcIcon, title: "Smart Calculator", desc: "Basic, scientific, unit converter, and Bishal's Formula Helper — all in one. Solve equations and get step-by-step explanations.", color: "from-amber-500 to-orange-500" },
  { icon: Code2, title: "Code Tutor", desc: "Paste any code and get a full line-by-line analysis, bug fixes, and explanations. Or describe what you want and generate production-quality code instantly.", color: "from-slate-600 to-gray-700" },
  { icon: Search, title: "Deep Research", desc: "Enter any topic and get a structured, web-powered research report — with sources, key findings, and analysis you can actually use for assignments.", color: "from-teal-500 to-cyan-600" },
  { icon: Eye, title: "Visual Explainer", desc: "Turn any topic into an interactive Mind Map, Flowchart, or Concept Web. Click any node to get a full explanation of that specific idea.", color: "from-emerald-500 to-teal-600" },
  { icon: GitCompare, title: "Compare Concepts", desc: "Pick two topics and get a structured side-by-side comparison — definitions, key differences, similarities, and exam tips all in one place.", color: "from-indigo-500 to-blue-600" },
];

const subjects = [
  { name: "Mathematics", icon: CalcIcon, color: "bg-blue-100 text-blue-700" },
  { name: "Physics", icon: Atom, color: "bg-purple-100 text-purple-700" },
  { name: "Chemistry", icon: FlaskConical, color: "bg-green-100 text-green-700" },
  { name: "Biology", icon: Brain, color: "bg-emerald-100 text-emerald-700" },
  { name: "Programming", icon: Code2, color: "bg-indigo-100 text-indigo-700" },
  { name: "History", icon: HistoryIcon, color: "bg-amber-100 text-amber-700" },
  { name: "Geography", icon: Globe, color: "bg-teal-100 text-teal-700" },
  { name: "Languages", icon: LangIcon, color: "bg-pink-100 text-pink-700" },
  { name: "Economics", icon: BarChart3, color: "bg-orange-100 text-orange-700" },
  { name: "Literature", icon: BookOpen, color: "bg-violet-100 text-violet-700" },
  { name: "Music Theory", icon: Music, color: "bg-red-100 text-red-700" },
  { name: "Arts & Design", icon: Palette, color: "bg-fuchsia-100 text-fuchsia-700" },
];


function visitCreator() {
  const parts = ["https://www.", "bishalbishwokarm", "a.in.net"];
  window.open(parts.join(""), "_blank", "noopener,noreferrer");
}

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 font-bold">
            <img src={logoUrl} alt="ScorpStudy" width={40} height={40} className="h-10 w-10 object-contain" />
            <div className="leading-tight">
              <div className="text-base">ScorpStudy</div>
              <div className="text-xs font-medium text-primary">by Bishal</div>
            </div>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/auth" className="hidden sm:inline-flex rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">Sign In</Link>
            <Link to="/auth" search={{ mode: "signup" }} className="rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-md hover:opacity-90 sm:px-5 sm:text-sm">Get Started Free</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-violet-50 via-white to-white" />
          <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-violet-200/30 blur-3xl" />
          <div className="absolute top-20 right-1/4 h-72 w-72 rounded-full bg-fuchsia-200/30 blur-3xl" />
        </div>
        <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <div className="relative mx-auto h-28 w-28 sm:h-36 sm:w-36">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-200 to-fuchsia-200 blur-xl opacity-70" />
            <img src={logoUrl} alt="ScorpStudy logo" width={256} height={256} className="relative h-full w-full object-contain drop-shadow-xl" />
            <span className="absolute -top-2 -right-2 grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg ring-4 ring-white">
              <Sparkles className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-xs font-semibold text-violet-700 shadow-sm">
            <Zap className="h-3.5 w-3.5" /> Bishal's Learning Platform · Free Forever
          </div>
          <h1 className="mt-5 text-5xl font-extrabold tracking-tight sm:text-7xl">
            Study Smarter with<br />
            <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 bg-clip-text text-transparent">ScorpStudy</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
            Your personal study companion powered by <strong className="text-foreground">Bishal's Assistant</strong>. Ask questions, solve problems, create quizzes, summarize textbooks, make flashcards — all in one place. In any language. For free.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/auth" search={{ mode: "signup" }} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-8 py-3.5 text-sm font-semibold text-white shadow-xl shadow-violet-500/30 hover:opacity-90 transition">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/auth" className="rounded-full border border-border bg-white px-8 py-3.5 text-sm font-semibold hover:bg-accent transition shadow-sm">Sign In</Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Shield className="h-4 w-4 text-emerald-600" /> No credit card required</span>
            <span className="inline-flex items-center gap-1.5"><Globe className="h-4 w-4 text-violet-600" /> 60+ languages supported</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-fuchsia-600" /> Setup in 30 seconds</span>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 border border-violet-200 px-4 py-1.5 text-xs font-semibold text-violet-700"><Brain className="h-3.5 w-3.5" /> AI-powered study tutor</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-4 py-1.5 text-xs font-semibold text-emerald-700"><Shield className="h-3.5 w-3.5" /> 100% Free — no paywalls</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-4 py-1.5 text-xs font-semibold text-blue-700"><Zap className="h-3.5 w-3.5" /> 9 study tools in one app</span>
          </div>
        </div>
      </section>

      {/* Stat band */}
      <section className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-700 text-white">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-4 py-14 sm:grid-cols-4 sm:px-6">
          {[
            { icon: Globe, n: "60+", l: "Languages" },
            { icon: Clock, n: "24/7", l: "Available" },
            { icon: GraduationCap, n: "9+", l: "Tools" },
            { icon: Star, n: "Free", l: "Forever" },
          ].map((s) => (
            <div key={s.l} className="text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-white/15 backdrop-blur-sm"><s.icon className="h-6 w-6" /></div>
              <div className="text-4xl font-extrabold tracking-tight">{s.n}</div>
              <div className="mt-1 text-sm opacity-80">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <div className="text-xs font-bold tracking-widest text-violet-600 uppercase">How It Works</div>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Start learning in 3 simple steps</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">No complex setup. No learning curve. Just sign up and start studying smarter from day one.</p>
          </div>
          <div className="relative mt-14 grid gap-6 sm:grid-cols-3">
            {[
              { i: Zap, n: "01", t: "Sign Up Free", d: "Create your account in under 30 seconds. No credit card required. Set up your learning profile — level, goals, preferred language.", color: "bg-violet-100 text-violet-700" },
              { i: Brain, n: "02", t: "Meet Bishal's Assistant", d: "Tell ScorpStudy your study level, goals, and preferred language. Bishal's Assistant adapts every response to suit you perfectly.", color: "bg-blue-100 text-blue-700" },
              { i: TrendingUp, n: "03", t: "Study Smarter", d: "Use all 9 tools together. Chat, quiz yourself, make notes, summarize content, build mind maps, and track your progress daily.", color: "bg-emerald-100 text-emerald-700" },
            ].map((s, i, arr) => (
              <div key={s.n} className="relative rounded-2xl border border-border bg-white p-7 shadow-sm hover:shadow-md transition">
                <div className="flex items-start justify-between">
                  <div className={`grid h-12 w-12 place-items-center rounded-xl ${s.color}`}><s.i className="h-6 w-6" /></div>
                  <span className="text-4xl font-bold text-muted-foreground/20">{s.n}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
                {i < arr.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 hidden h-6 w-6 -translate-y-1/2 text-muted-foreground/40 sm:block" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <div className="text-xs font-bold tracking-widest text-violet-600 uppercase">Features</div>
          <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Everything you need to ace your exams</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">Nine powerful tools powered by Bishal's Assistant — built specifically for students, from school to university, in any subject.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="group relative rounded-2xl border border-border bg-white p-7 shadow-sm transition hover:shadow-lg hover:-translate-y-0.5">
              {f.badge && (
                <span className={`absolute right-5 top-5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${f.badge === "New" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>{f.badge}</span>
              )}
              <div className={`mb-5 grid h-13 w-13 place-items-center rounded-xl bg-gradient-to-br ${f.color} text-white shadow-md`}><f.icon className="h-6 w-6" /></div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Subjects */}
      <section className="bg-violet-50/60 py-20">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
          <div className="text-xs font-bold tracking-widest text-violet-600 uppercase">Subject Coverage</div>
          <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Every subject. Every level.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">Whether you're studying for SEE, +2, Bachelor's, or a Master's degree — ScorpStudy covers every subject you need.</p>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {subjects.map((s) => (
              <div key={s.name} className={`rounded-2xl p-5 transition hover:scale-105 cursor-default ${s.color}`}>
                <s.icon className="mx-auto h-6 w-6" />
                <div className="mt-2 text-sm font-semibold">{s.name}</div>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-border bg-white p-6 text-sm shadow-sm">
            <span className="font-semibold text-violet-700">And much more!</span>{" "}
            <span className="text-muted-foreground">Bishal's Assistant can help with any topic — Accounting, Law, Medicine, Psychology, Engineering, Architecture, and every other subject. If you can ask it, ScorpStudy can answer it.</span>
          </div>
        </div>
      </section>

      {/* Why ScorpStudy */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <div className="text-xs font-bold tracking-widest text-violet-600 uppercase">Why ScorpStudy</div>
          <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Built specifically for students</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">Every feature is designed to help you understand topics faster, retain more, and score higher — in any language, any subject.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Brain, color: "from-violet-500 to-fuchsia-500", title: "Instant Understanding", desc: "Ask any question and get structured, detailed explanations — like having a personal tutor available 24/7." },
            { icon: Zap, color: "from-amber-500 to-orange-500", title: "Exam-Ready Answers", desc: "Topper Mode formats answers with headings, points, formulas, and examples — exactly how toppers write." },
            { icon: Globe, color: "from-blue-500 to-cyan-500", title: "Any Language", desc: "Study in Nepali, Hindi, English, or 60+ languages. Bishal's Assistant adapts to your preferred language instantly." },
            { icon: Shield, color: "from-emerald-500 to-teal-500", title: "Always Free", desc: "No subscription fees, no credit card, no hidden paywalls. ScorpStudy is free for every student, forever." },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-white p-6 shadow-sm hover:shadow-md transition">
              <div className={`mb-4 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${item.color} text-white shadow-md`}>
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Old way vs ScorpStudy */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <div className="text-xs font-bold tracking-widest text-violet-600 uppercase">The Difference</div>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Old way vs. ScorpStudy</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">See why students are switching to a smarter way to study.</p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-7">
              <div className="flex items-center gap-2 text-rose-700 mb-5"><XCircle className="h-5 w-5" /><h3 className="text-lg font-bold">Old Way of Studying</h3></div>
              <ul className="space-y-3 text-sm text-rose-800/90">
                {["Hours reading the same textbook page","Making flashcards by hand — one by one","Guessing what might be on the exam","Stuck on a question with no help available","Notes that are hard to understand later","Can't afford expensive tutors or apps"].map((t) => (
                  <li key={t} className="flex gap-2"><XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" /> {t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-7">
              <div className="flex items-center gap-2 text-emerald-700 mb-5"><CheckCircle2 className="h-5 w-5" /><h3 className="text-lg font-bold">With ScorpStudy</h3></div>
              <ul className="space-y-3 text-sm text-emerald-800/90">
                {["Summarize any text in seconds with Bishal's Assistant","Generate 10 flashcards in one click","Get custom practice quizzes on any topic","Get step-by-step help 24/7, any subject","Bishal's Assistant enhances and structures your notes","Completely free — no paywalls ever"].map((t) => (
                  <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" /> {t}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Topper mode highlight */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-violet-950 px-8 py-12 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-60 w-60 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="relative z-10 grid gap-8 lg:grid-cols-2 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/40 bg-violet-500/20 px-3 py-1 text-xs font-semibold text-violet-300 mb-4">
                <Trophy className="h-3.5 w-3.5" /> Exclusive Feature
              </div>
              <h2 className="text-3xl font-bold sm:text-4xl mb-4">Topper Mode 🎓</h2>
              <p className="text-violet-200 text-lg leading-relaxed mb-6">Activate Topper Mode and Bishal's Assistant formats every answer like a top-scoring exam response — with structured points, definitions, formulas, examples, and a strong conclusion. Designed to maximize your marks.</p>
              <Link to="/auth" search={{ mode: "signup" }} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition shadow-lg">
                Try Topper Mode Free <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="rounded-2xl border border-violet-500/30 bg-white/5 backdrop-blur-sm p-5 space-y-3">
              {["✦ Direct Definition — One sharp sentence","✦ Detailed Explanation — Full depth with sub-points","✦ Step-by-step Process — Numbered clearly","✦ Types & Categories — All listed with descriptions","✦ Formulas & Equations — In code blocks","✦ Real-World Examples — 2–3 specific applications","✦ Common Mistakes to Avoid","✦ Important Points for Exam — Must-know facts","✦ Conclusion — All key terms bolded"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-violet-100">
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Meet the Creator */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="rounded-3xl bg-[#111827] px-8 py-10 sm:px-12 sm:py-12">
          <p className="text-xs font-bold tracking-widest text-violet-400 uppercase mb-3">Meet the Creator</p>
          <h2 className="text-2xl font-bold text-white sm:text-3xl mb-4">Built by Bishal Bishwokarma</h2>
          <p className="text-slate-400 text-base leading-relaxed max-w-2xl mb-6">
            Bishal is a software developer and student from Nepal who experienced firsthand how hard it was to find quality, affordable learning tools. He built ScorpStudy to give every student — regardless of where they're from or what language they speak — access to a world-class study assistant. For free.
          </p>
          <div className="flex flex-wrap gap-2 mb-7">
            {["AI & Machine Learning", "Educational Technology", "Software Development", "Student Empowerment"].map((tag) => (
              <span key={tag} className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-slate-300 border border-white/10">
                {tag}
              </span>
            ))}
          </div>
          <button
            onClick={visitCreator}
            className="inline-flex items-center gap-2 text-sm font-semibold text-violet-400 hover:text-violet-300 transition group"
          >
            Visit Creator's Website
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
        <div className="rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-600 px-8 py-14 text-center text-white shadow-2xl shadow-violet-500/30 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-1/4 h-64 w-64 rounded-full bg-white blur-3xl" />
            <div className="absolute bottom-0 right-1/4 h-48 w-48 rounded-full bg-yellow-200 blur-3xl" />
          </div>
          <div className="relative z-10">
            <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <img src={logoUrl} alt="" className="h-10 w-10 object-contain" />
            </div>
            <h2 className="text-3xl font-bold sm:text-4xl">Ready to study smarter?</h2>
            <p className="mx-auto mt-3 max-w-xl opacity-90 text-lg">Join students using ScorpStudy by Bishal to ace their exams — completely free.</p>
            <Link to="/auth" search={{ mode: "signup" }} className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-bold text-violet-700 hover:opacity-90 transition shadow-lg">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2.5">
              <img src={logoUrl} alt="ScorpStudy" className="h-8 w-8 object-contain" />
              <div>
                <div className="text-sm font-bold">ScorpStudy by Bishal</div>
                <div className="text-xs text-muted-foreground">Built for students, powered by Bishal's Assistant</div>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <button
                onClick={visitCreator}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-foreground transition"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Visit Creator's Website
              </button>
              <Link to="/auth" className="hover:text-foreground transition">Sign In</Link>
              <Link to="/auth" search={{ mode: "signup" }} className="hover:text-foreground transition">Sign Up</Link>
            </div>
          </div>
          <div className="mt-6 flex flex-col items-center gap-1 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between">
            <p>© {new Date().getFullYear()} ScorpStudy by Bishal Bishwokarma. All rights reserved.</p>
            <p>Powered by Bishal's Assistant · 60+ Languages · Free Forever</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
