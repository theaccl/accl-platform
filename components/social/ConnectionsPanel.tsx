"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import type { NexusEcosystem } from "@/lib/nexus/getNexusData";

type ConnRow = { id: string; peer_id: string; username: string | null };
type PendingIn = { id: string; from_id: string; username: string | null };
type PendingOut = { id: string; to_id: string; username: string | null };

export default function ConnectionsPanel({
  ecosystem,
  userId,
  k12,
  presenceByUser,
}: {
  ecosystem: NexusEcosystem;
  userId: string | null;
  k12: boolean;
  presenceByUser: Record<string, "active" | "recent">;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<ConnRow[]>([]);
  const [pendingIn, setPendingIn] = useState<PendingIn[]>([]);
  const [pendingOut, setPendingOut] = useState<PendingOut[]>([]);
  const [username, setUsername] = useState("");

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`/api/social/connections?ecosystem=${ecosystem}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const payload = (await res.json().catch(() => ({}))) as {
        accepted?: ConnRow[];
        pending_in?: PendingIn[];
        pending_out?: PendingOut[];
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? String(res.status));
      setAccepted((payload.accepted ?? []).slice(0, 16));
      setPendingIn((payload.pending_in ?? []).slice(0, 12));
      setPendingOut((payload.pending_out ?? []).slice(0, 12));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [ecosystem, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const authHeaders = async (): Promise<Record<string, string>> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  };

  const sendRequest = async () => {
    if (!userId || !username.trim()) return;
    setError(null);
    try {
      const h = await authHeaders();
      const res = await fetch("/api/social/connections", {
        method: "POST",
        headers: h,
        body: JSON.stringify({ to_username: username.trim(), ecosystem }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? String(res.status));
      setUsername("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };

  const patchConn = async (id: string, action: "accept" | "decline") => {
    setError(null);
    try {
      const h = await authHeaders();
      const res = await fetch("/api/social/connections", {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({ id, action }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? String(res.status));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const presenceLabel = (uid: string) => {
    const p = presenceByUser[uid];
    if (p === "active") return k12 ? "In a match" : "Active";
    if (p === "recent") return "Recently active";
    return null;
  };

  const collapsed = !userId ? (
    <p className="text-sm text-gray-400">
      {k12 ? "Sign in to recognize school-safe connections." : "Sign in to send connection requests to players you’ve faced."}
    </p>
  ) : (
    <div className="space-y-2">
      {error ? <p className="text-xs text-amber-200/90">{error}</p> : null}
      {loading ? <p className="text-xs text-gray-500">Loading…</p> : null}
      <p className="text-[10px] text-gray-500 leading-relaxed">
        {k12
          ? "Optional recognition only — no chat. Guardian controls may apply later."
          : "Identity-level links only — no messaging in this release."}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Exact username"
          className={`flex-1 min-w-0 rounded-lg border px-2 py-2 text-sm text-white placeholder:text-gray-500 ${
            k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"
          }`}
          maxLength={48}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => void sendRequest()}
          className={`rounded-lg px-3 py-2 text-sm font-medium min-h-[44px] touch-manipulation ${
            k12 ? "bg-cyan-800/80 text-cyan-50 hover:bg-cyan-700/90" : "bg-red-900/70 text-red-50 hover:bg-red-800/90"
          }`}
        >
          Request
        </button>
      </div>
      {pendingIn.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Incoming</p>
          {pendingIn.map((p) => (
            <div
              key={p.id}
              className={`flex flex-wrap items-center gap-2 rounded-lg border px-2 py-2 text-sm ${
                k12 ? "border-cyan-700/50 bg-[#0f2235]" : "border-[#3f2a32] bg-[#1a1418]"
              }`}
            >
              <span className="text-white truncate">{p.username ?? p.from_id.slice(0, 8)}</span>
              <button
                type="button"
                onClick={() => void patchConn(p.id, "accept")}
                className="text-xs px-2 py-1 rounded bg-emerald-900/60 text-emerald-100"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => void patchConn(p.id, "decline")}
                className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-200"
              >
                Decline
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {pendingOut.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Outgoing</p>
          {pendingOut.map((p) => (
            <p key={p.id} className="text-xs text-gray-400">
              Pending → {p.username ?? p.to_id.slice(0, 8)}
            </p>
          ))}
        </div>
      ) : null}
      {accepted.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Connections</p>
          {accepted.map((c) => {
            const pl = presenceLabel(c.peer_id);
            return (
              <div
                key={c.id}
                className={`flex flex-wrap items-center gap-2 text-sm rounded-lg border px-2 py-1.5 ${
                  k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"
                }`}
              >
                <span className="text-white truncate">{c.username ?? c.peer_id.slice(0, 8)}</span>
                {pl ? <span className="text-[10px] text-gray-500">{pl}</span> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-500">{loading ? null : "No connections yet."}</p>
      )}
    </div>
  );

  const expanded = collapsed;

  return (
    <ExpandablePanel
      title="Connections"
      subtitle={k12 ? "Optional recognition — school-safe" : "Competition-linked recognition"}
      statusText={userId ? `${accepted.length} linked` : "Sign in"}
      collapsed={collapsed}
      expanded={expanded}
      k12={k12}
    />
  );
}
