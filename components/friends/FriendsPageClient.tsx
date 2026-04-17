"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useOpenPublicIdentityCard } from "@/components/identity/PublicIdentityCardContext";
import { supabase } from "@/lib/supabaseClient";

/**
 * Future row shape — no server friend graph in this pass; list stays empty until API exists.
 */
export type FriendsShellRow = {
  playerId: string;
  /** When profiles are joined client-side */
  displayName?: string | null;
  /** Future: 'active' | 'recent' | null from presence service */
  presence?: "active" | "recent" | null;
};

function PresencePlaceholder({ presence }: { presence?: FriendsShellRow["presence"] }) {
  if (presence === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300/95">
        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" aria-hidden />
        Active
      </span>
    );
  }
  if (presence === "recent") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
        <span className="h-2 w-2 rounded-full bg-amber-500/70" aria-hidden />
        Recent
      </span>
    );
  }
  return (
    <span className="text-xs text-gray-600" title="Presence will appear when connected">
      —
    </span>
  );
}

function FriendsRow({
  row,
  onQuickView,
}: {
  row: FriendsShellRow;
  onQuickView: (id: string) => void;
}) {
  const label =
    row.displayName?.trim() ||
    `Player ${row.playerId.slice(0, 8)}…`;
  return (
    <tr className="border-b border-white/[0.06] bg-[#111723] transition hover:bg-[#151d2c]/80">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#0f1420] text-xs font-semibold text-gray-400"
            aria-hidden
          >
            {label.slice(0, 2).toUpperCase()}
          </div>
          <span className="font-medium text-gray-100">{label}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <PresencePlaceholder presence={row.presence} />
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid={`friends-quick-view-${row.playerId}`}
            onClick={() => onQuickView(row.playerId)}
            className="rounded-lg border border-sky-700/45 bg-sky-950/30 px-2.5 py-1.5 text-xs font-medium text-sky-100 hover:bg-sky-950/45"
          >
            Quick view
          </button>
          <Link
            href={`/profile/${row.playerId}`}
            data-testid={`friends-profile-${row.playerId}`}
            className="rounded-lg border border-white/10 bg-[#0f1420] px-2.5 py-1.5 text-xs font-medium text-gray-200 hover:border-white/20"
          >
            Profile
          </Link>
        </div>
      </td>
    </tr>
  );
}

export function FriendsPageClient() {
  const openIdentity = useOpenPublicIdentityCard();
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  /** Populated when a friend graph API exists; intentionally empty in this pass. */
  const [rows] = useState<FriendsShellRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) {
        setUserId(data.user?.id ?? null);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-gray-500" data-testid="friends-loading">
          Loading…
        </p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-gray-400">Sign in to use Friends.</p>
        <Link href="/login" className="mt-4 inline-block text-sky-400 underline">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10" data-testid="friends-root">
      <header className="border-b border-white/[0.08] pb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">Social</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white" data-testid="friends-title">
          Friends
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-400">
          A dedicated list for people you play with often.{" "}
          <span className="text-gray-500">
            Direct messages stay in <Link className="text-sky-400/90 underline" href="/tester/messages">Mailbox</Link>
            ; alerts stay in{" "}
            <Link className="text-sky-400/90 underline" href="/notifications">
              Notifications
            </Link>
            .
          </span>
        </p>
      </header>

      <div className="mt-8 overflow-hidden rounded-2xl border border-[#2a3442] bg-[#111723] shadow-lg shadow-black/15">
        <table className="w-full text-left text-sm" aria-label="Friends list">
          <thead>
            <tr className="border-b border-white/[0.08] bg-[#0c0e12] text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3 w-[140px]">Presence</th>
              <th className="px-4 py-3 w-[200px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr data-testid="friends-empty">
                <td colSpan={3} className="px-4 py-12 text-center">
                  <p className="text-base font-medium text-gray-300">No friends yet</p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                    Friend connections and presence will fill this list when the network layer ships. Until then, use{" "}
                    <Link href="/players" className="text-sky-400/90 underline">
                      Player lookup
                    </Link>{" "}
                    and <strong className="text-gray-400">Quick view</strong> on usernames elsewhere.
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <FriendsRow
                  key={row.playerId}
                  row={row}
                  onQuickView={(id) => openIdentity?.(id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-8 text-center text-xs text-gray-600">
        Row layout reserves space for live presence and future actions (invite, whisper, etc.).
      </p>
    </div>
  );
}
