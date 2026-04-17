"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { publicIdentityFromProfileUsername } from "@/lib/profileIdentity";
import {
  formatRatingDisplay,
  parseP1FromSnapshotPayload,
  type PublicP1Read,
} from "@/lib/p1PublicRatingRead";
import TesterBugReportDialog from "@/components/TesterBugReportDialog";

const AVATAR_BUCKET = "profile-avatars";

type SnapshotProfile = {
  id: string;
  username: string | null;
  avatar_path: string | null;
};

function readProfileFromSnapshot(data: unknown): SnapshotProfile | null {
  if (!data || typeof data !== "object") return null;
  const p = (data as { profile?: unknown }).profile;
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;
  return {
    id,
    username: typeof o.username === "string" ? o.username : null,
    avatar_path: typeof o.avatar_path === "string" ? o.avatar_path : null,
  };
}

function initialsFromUsername(username: string | null, id: string): string {
  const raw = (username ?? "").trim() || id;
  const clean = raw.replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  if (!clean) return "P";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

function p1RowLabel(
  label: string,
  row: { rating: number; games_played: number } | null | undefined,
): { label: string; value: string } {
  if (!row || typeof row.rating !== "number" || !Number.isFinite(row.rating)) {
    return { label, value: "—" };
  }
  return {
    label,
    value: `${formatRatingDisplay(row.rating)} · ${row.games_played} games`,
  };
}

async function fetchVsYouRecord(viewerId: string, targetId: string): Promise<{ w: number; d: number; l: number }> {
  const { data, error } = await supabase
    .from("games")
    .select("result, white_player_id, black_player_id")
    .eq("status", "finished")
    .or(`white_player_id.eq.${viewerId},black_player_id.eq.${viewerId}`)
    .limit(200);
  if (error || !data?.length) return { w: 0, d: 0, l: 0 };
  let w = 0;
  let d = 0;
  let l = 0;
  for (const g of data as Array<{ result: string | null; white_player_id: string; black_player_id: string | null }>) {
    const wp = g.white_player_id;
    const bp = g.black_player_id;
    if (!bp || (wp !== targetId && bp !== targetId)) continue;
    if (wp !== viewerId && bp !== viewerId) continue;
    const r = String(g.result ?? "").trim().toLowerCase();
    if (r === "draw" || r === "1/2-1/2") {
      d++;
      continue;
    }
    const viewerWon =
      (r === "white_win" && wp === viewerId) || (r === "black_win" && bp === viewerId);
    const viewerLost =
      (r === "white_win" && bp === viewerId) || (r === "black_win" && wp === viewerId);
    if (viewerWon) w++;
    else if (viewerLost) l++;
  }
  return { w, d, l };
}

export function PublicIdentityCard({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const router = useRouter();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<unknown | null>(null);
  const [vs, setVs] = useState<{ w: number; d: number; l: number } | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [err, setErr] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setPhase("loading");
      setErr("");
      setSnapshot(null);
      setVs(null);
      const { data: auth } = await supabase.auth.getUser();
      if (cancelled) return;
      const viewer = auth.user?.id ?? null;
      setViewerId(viewer);

      const { data, error } = await supabase.rpc("get_public_profile_snapshot", {
        p_profile_id: playerId,
      });
      if (cancelled) return;
      if (error || !data) {
        setErr(error?.message ?? "Profile unavailable.");
        setPhase("error");
        return;
      }
      setSnapshot(data);
      const prof = readProfileFromSnapshot(data);
      if (!prof) {
        setErr("Profile payload missing.");
        setPhase("error");
        return;
      }
      if (viewer && viewer !== playerId) {
        const rec = await fetchVsYouRecord(viewer, playerId);
        if (!cancelled) setVs(rec);
      }
      if (!cancelled) setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const profile = snapshot ? readProfileFromSnapshot(snapshot) : null;
  const p1: PublicP1Read | null = snapshot ? parseP1FromSnapshotPayload(snapshot) : null;
  const displayName = publicIdentityFromProfileUsername(profile?.username ?? null, playerId);
  const avatarUrl =
    profile?.avatar_path && profile.avatar_path.trim()
      ? supabase.storage.from(AVATAR_BUCKET).getPublicUrl(profile.avatar_path.trim()).data.publicUrl
      : null;

  const ratingRows: Array<{ label: string; value: string }> = [];
  if (p1) {
    ratingRows.push(p1RowLabel("Free · Bullet", p1.free_bullet));
    ratingRows.push(p1RowLabel("Free · Blitz", p1.free_blitz));
    ratingRows.push(p1RowLabel("Free · Rapid", p1.free_rapid));
    ratingRows.push(p1RowLabel("Free · Daily", p1.free_day));
    ratingRows.push(p1RowLabel("Tournament (ACCL)", p1.tournament_unified));
  }

  const challengeHref =
    profile?.username && profile.username.trim()
      ? `/free/create?opponent=${encodeURIComponent(profile.username.trim())}`
      : null;

  const reportSeed =
    profile?.username && profile.username.trim()
      ? `Player-related report\nTarget: @${profile.username.trim()} (${playerId})\n\n`
      : `Player-related report\nTarget id: ${playerId}\n\n`;

  const handleBlock = useCallback(async () => {
    if (!viewerId || viewerId === playerId) return;
    if (!window.confirm(`Block this player? You will stop receiving direct messages from them.`)) return;
    setBlockBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/chat/block", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: playerId }),
      });
      if (!res.ok) {
        window.alert("Could not update block. Try again.");
        return;
      }
      onClose();
    } finally {
      setBlockBusy(false);
    }
  }, [viewerId, playerId, onClose]);

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="public-identity-title"
      data-testid="public-identity-card"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-[#2a3442] bg-[#111723] p-4 text-white shadow-xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/profile/${playerId}`}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0a0f16] text-sm font-bold text-red-100 ring-2 ring-red-500/70 transition hover:ring-red-400"
            title="Open full public profile"
            onClick={onClose}
          >
            ACCL
          </Link>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-white/10 bg-[#151d2c]">
              {avatarUrl ? (
                <Image src={avatarUrl} alt="" fill className="object-cover" sizes="64px" unoptimized />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-gray-200">
                  {initialsFromUsername(profile?.username ?? null, playerId)}
                </span>
              )}
            </div>
            <h2 id="public-identity-title" className="truncate text-center text-base font-semibold text-white">
              {displayName}
            </h2>
            <p className="text-center text-[11px] text-gray-500">Public snapshot · no full bio or history here</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-xs text-gray-400 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        {phase === "loading" ? <p className="mt-4 text-sm text-gray-400">Loading…</p> : null}
        {phase === "error" ? <p className="mt-4 text-sm text-red-300">{err}</p> : null}

        {phase === "ready" && profile ? (
          <>
            {viewerId && viewerId !== playerId && vs ? (
              <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#0f1420] px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">vs You (finished)</p>
                <p className="mt-1 text-sm tabular-nums text-gray-200">
                  <span className="text-emerald-300">{vs.w}W</span>
                  <span className="text-gray-600"> · </span>
                  <span className="text-gray-300">{vs.d}D</span>
                  <span className="text-gray-600"> · </span>
                  <span className="text-rose-300">{vs.l}L</span>
                </p>
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">ACCL ratings by mode</p>
              {ratingRows.length === 0 ? (
                <p className="text-xs text-gray-500">Ratings not loaded.</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {ratingRows.map((row) => (
                    <li key={row.label} className="flex justify-between gap-2 border-b border-white/[0.06] pb-1">
                      <span className="text-gray-400">{row.label}</span>
                      <span className="shrink-0 font-medium tabular-nums text-gray-100">{row.value}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {viewerId && viewerId !== playerId ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.08] pt-4">
                <button
                  type="button"
                  className="rounded-lg border border-sky-700/50 bg-sky-950/30 px-3 py-2 text-xs font-medium text-sky-100 hover:bg-sky-950/50"
                  onClick={() => {
                    onClose();
                    router.push(`/tester/messages?peer=${encodeURIComponent(playerId)}`);
                  }}
                >
                  Message
                </button>
                <button
                  type="button"
                  disabled={!challengeHref}
                  title={challengeHref ? undefined : "Public username required to prefill challenge."}
                  className="rounded-lg border border-violet-700/50 bg-violet-950/30 px-3 py-2 text-xs font-medium text-violet-100 hover:bg-violet-950/50 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => {
                    if (!challengeHref) return;
                    onClose();
                    router.push(challengeHref);
                  }}
                >
                  Challenge
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-amber-700/50 bg-amber-950/25 px-3 py-2 text-xs font-medium text-amber-100 hover:bg-amber-950/40"
                  onClick={() => setReportOpen(true)}
                >
                  Report
                </button>
                <button
                  type="button"
                  disabled={blockBusy}
                  className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs font-medium text-red-100 hover:bg-red-950/45 disabled:opacity-50"
                  onClick={() => void handleBlock()}
                >
                  {blockBusy ? "…" : "Block"}
                </button>
              </div>
            ) : viewerId === playerId ? (
              <p className="mt-4 border-t border-white/[0.08] pt-4 text-center text-xs text-gray-500">
                This is you — use the badge link for your full profile.
              </p>
            ) : (
              <p className="mt-4 border-t border-white/[0.08] pt-4 text-center text-xs text-gray-500">
                Sign in as another player to message, challenge, report, or block.
              </p>
            )}
          </>
        ) : null}
      </div>

      <TesterBugReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        initialMessage={reportSeed}
      />
    </div>
  );
}
