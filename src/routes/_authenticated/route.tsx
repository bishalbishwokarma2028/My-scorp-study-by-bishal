import { createFileRoute, Outlet, redirect, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { clearAllPageState } from "@/lib/pageState";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, MessageSquare, FileText, ListChecks, Layers,
  Image as ImageIcon, StickyNote, Languages, Calculator, BarChart3,
  LogOut, Menu, X, Bell, Code2, GitCompare, Search, Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const navItems = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/chat", label: "Bishal's Assistant", icon: MessageSquare },
  { to: "/dashboard/summarizer", label: "Summarizer", icon: FileText },
  { to: "/dashboard/quiz", label: "Quiz Generator", icon: ListChecks },
  { to: "/dashboard/flashcards", label: "Flashcards", icon: Layers },
  { to: "/dashboard/code-tutor", label: "Code Tutor", icon: Code2 },
  { to: "/dashboard/compare", label: "Compare Concepts", icon: GitCompare },
  { to: "/dashboard/research", label: "Deep Research", icon: Search },
  { to: "/dashboard/visual-explainer", label: "Visual Explainer", icon: Eye },
  { to: "/dashboard/image-gen", label: "Image Gen", icon: ImageIcon },
  { to: "/dashboard/notes", label: "Smart Notes", icon: StickyNote },
  { to: "/dashboard/translator", label: "Translator", icon: Languages },
  { to: "/dashboard/calculator", label: "Calculator", icon: Calculator },
  { to: "/dashboard/history", label: "History", icon: BarChart3 },
] as const;

import logoUrl from "@/assets/scorpstudy-logo.png";

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s: { location: { pathname: string } }) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  // Force light mode always
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Double-back guard: first browser back press shows a warning toast;
  // second press within 2.5 s actually navigates.
  useEffect(() => {
    // Push a sentinel state so we have something to intercept
    window.history.pushState({ scorpGuard: true }, "");
    let lastBackAt = 0;

    function onPopState() {
      const now = Date.now();
      if (now - lastBackAt < 2500) {
        // Second press within window — let the navigation happen naturally
        return;
      }
      // First press — block and warn
      window.history.pushState({ scorpGuard: true }, "");
      lastBackAt = now;
      toast("Press back again to leave this page", { duration: 2000 });
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const { data: profile } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  const fullName: string = profile?.full_name || user.email || "Student";
  const initials = fullName.split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  const title = navItems.find((n) => n.to === pathname)?.label ?? "Dashboard";

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearAllPageState();
    try { sessionStorage.clear(); } catch { /* silent */ }
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 h-14 flex items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
        <Link to="/dashboard" className="flex items-center gap-2 font-bold">
          <img src={logoUrl} alt="ScorpStudy" width={40} height={40} className="h-10 w-10 rounded-xl object-contain" />
          <span className="text-sm leading-tight">ScorpStudy<br/><span className="text-[10px] font-medium text-primary">by Bishal</span></span>
        </Link>
        <div className="flex items-center gap-1">
          <button onClick={() => setMobileOpen(true)} className="rounded-md p-2 hover:bg-accent"><Menu className="h-5 w-5" /></button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:static lg:flex lg:translate-x-0 ${mobileOpen ? "translate-x-0 flex" : "-translate-x-full hidden lg:flex"}`}>
        <div className="flex items-center justify-between border-b border-sidebar-border px-5 py-4">
          <Link to="/dashboard" className="flex items-center gap-2 font-bold">
            <img src={logoUrl} alt="ScorpStudy" width={48} height={48} className="h-12 w-12 rounded-xl object-contain" />
            <span className="text-sm leading-tight">ScorpStudy<br/><span className="text-[11px] font-medium text-primary">by Bishal</span></span>
          </Link>
          <button onClick={() => setMobileOpen(false)} className="rounded-md p-1 hover:bg-accent lg:hidden"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{initials}</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{fullName}</div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3 text-sm">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link key={to} to={to} className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground hover:bg-accent"}`}>
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      {mobileOpen && <div onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-black/30 lg:hidden" />}

      {/* Main */}
      <main className="flex-1 min-w-0">
        <div className="hidden items-center justify-between border-b border-border bg-background/95 px-6 py-3 backdrop-blur lg:flex">
          <div>
            <div className="text-xs text-muted-foreground">
              <Link to="/dashboard" className="hover:text-foreground">Dashboard</Link>
              {pathname !== "/dashboard" && <> / <span className="text-foreground">{title}</span></>}
            </div>
            <h1 className="text-xl font-semibold">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"><Bell className="h-4 w-4" /></button>
            <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-hero text-xs font-semibold text-primary-foreground shadow-glow">{initials}</div>
          </div>
        </div>
        <div className="p-2 sm:p-5 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
