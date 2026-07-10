import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Coins, Users, BarChart3, LogOut, ShieldCheck, ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Client-side gate only (UX / redirect). Every admin server function
// independently re-verifies the session + this allowlist server-side —
// this check alone grants no data access.
const ADMIN_EMAILS = ["bishalbishwokarma2180@gmail.com"];

export const Route = createFileRoute("/_admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    const email = data.user?.email?.toLowerCase();
    if (error || !data.user || !email || !ADMIN_EMAILS.includes(email)) {
      // Do NOT sign out here — the visitor may be a regular, already-signed-in
      // app user who simply navigated to /admin. Just deny entry to the panel.
      throw redirect({ to: "/admin/login" });
    }
    return { adminUser: data.user };
  },
  component: AdminLayout,
});

const navItems = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/credits", label: "Credit Limits", icon: Coins },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/usage", label: "Usage Analytics", icon: BarChart3 },
  { to: "/admin/logs", label: "Request Logs", icon: ScrollText },
] as const;

function AdminLayout() {
  const { adminUser } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/admin/login";
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-800 bg-slate-900 lg:flex">
        <div className="flex items-center gap-2.5 border-b border-slate-800 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 ring-1 ring-violet-500/40">
            <ShieldCheck className="h-4 w-4 text-violet-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Admin Panel</div>
            <div className="text-[11px] text-slate-500">ScorpStudy</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3 text-sm">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                  active ? "bg-violet-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-800 p-3">
          <div className="mb-2 truncate px-3 text-xs text-slate-500">{adminUser.email}</div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="lg:ml-60">
        <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
