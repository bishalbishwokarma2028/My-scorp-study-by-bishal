import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Search, Ban, ShieldCheck, Sparkles, Brain, Zap } from "lucide-react";
import { toast } from "sonner";
import { adminListUsersServer, adminSetBannedServer, adminSetUnlimitedServer, adminSetUserLimitServer } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/users")({
  component: AdminUsers,
});

type AdminUser = Awaited<ReturnType<typeof adminListUsersServer>>["users"][number];

// 10, 15, 20, ... 100
const CREDIT_OPTIONS = Array.from({ length: 19 }, (_, i) => 10 + i * 5);

function CreditLimitSelect({
  icon: Icon,
  label,
  value,
  disabled,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-400">
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
      <select
        disabled={disabled}
        value={value === null ? "default" : String(value)}
        onChange={(e) => onChange(e.target.value === "default" ? null : Number(e.target.value))}
        className="rounded-md border border-slate-700 bg-slate-800 px-1.5 py-1 text-xs text-white focus:border-violet-500 focus:outline-none disabled:opacity-50"
      >
        <option value="default">Default</option>
        {CREDIT_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n} credits
          </option>
        ))}
      </select>
    </label>
  );
}

function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(q = "") {
    setLoading(true);
    try {
      const res = await adminListUsersServer({ data: { search: q || undefined, page: 1, perPage: 200 } });
      setUsers(res.users);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleBan(u: AdminUser) {
    setBusyId(u.id);
    try {
      await adminSetBannedServer({ data: { userId: u.id, value: !u.isBanned } });
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? { ...x, isBanned: !x.isBanned } : x)) ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleUnlimited(u: AdminUser) {
    setBusyId(u.id);
    try {
      await adminSetUnlimitedServer({ data: { userId: u.id, value: !u.unlimitedCredits } });
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? { ...x, unlimitedCredits: !x.unlimitedCredits } : x)) ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function setUserLimit(u: AdminUser, pool: "cerebras" | "groq", dailyLimit: number | null) {
    setBusyId(u.id);
    try {
      await adminSetUserLimitServer({ data: { userId: u.id, pool, dailyLimit } });
      setUsers((prev) =>
        prev?.map((x) =>
          x.id === u.id
            ? { ...x, ...(pool === "cerebras" ? { cerebrasLimitOverride: dailyLimit } : { groqLimitOverride: dailyLimit }) }
            : x,
        ) ?? null,
      );
      toast.success(`${pool === "cerebras" ? "Deep" : "Rapid"} Engine limit updated for ${u.email}`);
    } catch (e) {
      toast.error((e as Error).message || "Failed to update credit limit — has the per-user credit migration been run yet?");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Users</h1>
        <p className="mt-1 text-sm text-slate-500">Manage access and credits for individual accounts.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(search);
        }}
        className="flex items-center gap-2"
      >
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or name..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
          />
        </div>
        <button type="submit" className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700">
          Search
        </button>
      </form>

      {loading || !users ? (
        <div className="flex h-48 items-center justify-center text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Credit limits</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/50">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{u.fullName || u.email}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {u.isBanned && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-400">Banned</span>}
                      {u.unlimitedCredits && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-400">Unlimited</span>}
                      {!u.isBanned && !u.unlimitedCredits && <span className="text-xs text-slate-600">Standard</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      <CreditLimitSelect
                        icon={Brain}
                        label="Deep"
                        value={u.cerebrasLimitOverride ?? null}
                        disabled={busyId === u.id || u.unlimitedCredits}
                        onChange={(v) => setUserLimit(u, "cerebras", v)}
                      />
                      <CreditLimitSelect
                        icon={Zap}
                        label="Rapid"
                        value={u.groqLimitOverride ?? null}
                        disabled={busyId === u.id || u.unlimitedCredits}
                        onChange={(v) => setUserLimit(u, "groq", v)}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        disabled={busyId === u.id}
                        onClick={() => toggleUnlimited(u)}
                        title="Toggle unlimited credits"
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          u.unlimitedCredits ? "bg-amber-500/20 text-amber-300" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                        }`}
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Unlimited
                      </button>
                      <button
                        disabled={busyId === u.id}
                        onClick={() => toggleBan(u)}
                        title="Toggle ban"
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          u.isBanned ? "bg-red-500/20 text-red-300" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                        }`}
                      >
                        <Ban className="h-3.5 w-3.5" /> {u.isBanned ? "Unban" : "Ban"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-slate-600">
        <ShieldCheck className="h-3.5 w-3.5" /> Ban flag is stored on the account; enforcing sign-in blocks for banned users is not yet wired into the login flow.
      </p>
    </div>
  );
}
