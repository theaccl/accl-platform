"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NavigationBar from "@/components/NavigationBar";
import { supabase } from "@/lib/supabaseClient";

type DirectoryItem = {
  id: string;
  name: string;
  format: string;
  ecosystemScope: string;
  status: string;
  tempo: string | null;
  rated: boolean;
  liveTimeControl: string | null;
  createdAt: string;
  participantCount: number;
  sponsorLabel: string | null;
  sponsorTag: string | null;
  entryFeeCents: number | null;
  prizePoolCents: number | null;
};

function formatFeeLabel(cents: number | null | undefined): string {
  if (cents == null || cents <= 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatLabel(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/_/g, " ");
}

export default function TournamentJoinPage() {
  const router = useRouter();
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(() => new Set());
  const [joinErrors, setJoinErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserId(data.user?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setListLoading(true);
      setListError(null);
      const res = await fetch(
        "/api/tournaments/directory?ecosystem=adult&status=pending&limit=50",
        { credentials: "include" },
      );
      const j = (await res.json()) as { ok?: boolean; items?: DirectoryItem[]; error?: string };
      if (cancelled) return;
      if (!res.ok || !j.ok) {
        setListError(j.error ?? "Could not load pending tournaments.");
        setItems([]);
      } else {
        setItems(j.items ?? []);
      }
      setListLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onJoin = useCallback(
    async (tournamentId: string) => {
      if (!userId) return;
      setJoiningId(tournamentId);
      setJoinErrors((prev) => {
        const next = { ...prev };
        delete next[tournamentId];
        return next;
      });
      try {
        const res = await fetch("/api/tournaments/join", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tournamentId }),
        });
        const j = (await res.json()) as {
          ok?: boolean;
          tournamentId?: string;
          alreadyJoined?: boolean;
          error?: string;
          code?: string;
        };

        if (!res.ok || !j.ok) {
          setJoinErrors((prev) => ({
            ...prev,
            [tournamentId]: j.error ?? `Could not join (${res.status})`,
          }));
          return;
        }

        setJoinedIds((prev) => new Set(prev).add(tournamentId));
        if (!j.alreadyJoined) {
          router.push(`/tournaments/${tournamentId}`);
        }
      } catch {
        setJoinErrors((prev) => ({
          ...prev,
          [tournamentId]: "Network error — try again.",
        }));
      } finally {
        setJoiningId(null);
      }
    },
    [router, userId],
  );

  return (
    <div className="min-h-screen bg-[var(--accl-bg-base)] text-[var(--accl-text-primary)]">
      <NavigationBar />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Join tournament</h1>
        <p className="mb-6 text-sm text-[var(--accl-text-muted)]">
          Open registration for the adult ecosystem. Sign in to join; events with an entry fee require the payment flow
          (not wired here).
        </p>

        {!userId ? (
          <div
            className="mb-6 rounded-xl border border-[var(--accl-border-muted)] bg-[var(--accl-bg-elevated)]/40 px-4 py-3 text-sm text-[var(--accl-text-secondary)]"
            role="status"
          >
            Sign in to join.{" "}
            <Link
              href="/login?next=%2Ftournaments%2Fjoin"
              className="font-medium text-red-300/90 underline underline-offset-2 hover:text-red-200"
            >
              Log in
            </Link>
          </div>
        ) : null}

        <div className="flex flex-col gap-4 rounded-2xl border border-[var(--accl-border-muted)] bg-[var(--accl-bg-elevated)]/30 p-5">
          <p className="text-sm font-medium text-[var(--accl-text-secondary)]">Open for registration</p>

          {listLoading ? (
            <p className="text-sm text-[var(--accl-text-muted)]">Loading tournaments…</p>
          ) : listError ? (
            <p className="text-sm text-red-300/90">{listError}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-[var(--accl-text-muted)]">No pending tournaments right now. Check back soon.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((t) => {
                const busy = joiningId === t.id;
                const joined = joinedIds.has(t.id);
                const err = joinErrors[t.id];
                const feeLabel = formatFeeLabel(t.entryFeeCents);
                return (
                  <li
                    key={t.id}
                    className="rounded-xl border border-[var(--accl-border-muted)] bg-[var(--accl-bg-base)]/80 px-4 py-3"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[var(--accl-text-primary)]">{t.name}</p>
                        <p className="mt-1 text-xs text-[var(--accl-text-muted)]">
                          {formatLabel(t.format)}
                          {t.tempo ? ` · ${formatLabel(t.tempo)}` : ""}
                          {t.liveTimeControl ? ` · ${t.liveTimeControl}` : ""}
                          {t.rated ? " · Rated" : " · Unrated"}
                        </p>
                        <p className="mt-1 text-xs text-[var(--accl-text-secondary)]">
                          <span className="font-medium capitalize">{t.status}</span>
                          {" · "}
                          {t.participantCount} entr{t.participantCount === 1 ? "y" : "ies"}
                          {" · "}
                          <span className={feeLabel === "Free" ? "text-emerald-300/90" : "text-amber-200/90"}>
                            {feeLabel === "Free" ? "Free entry" : `Entry ${feeLabel}`}
                          </span>
                        </p>
                        {err ? <p className="mt-2 text-xs text-red-300/90">{err}</p> : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-40">
                        <button
                          type="button"
                          disabled={!userId || joined || busy || (t.entryFeeCents ?? 0) > 0}
                          title={
                            (t.entryFeeCents ?? 0) > 0
                              ? "Paid entry — use payment flow when available"
                              : undefined
                          }
                          onClick={() => void onJoin(t.id)}
                          className="rounded-lg bg-red-600/90 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busy ? "Joining…" : joined ? "Joined" : "Join"}
                        </button>
                        <Link
                          href={`/tournaments/${t.id}`}
                          className="text-center text-xs text-sky-300/90 underline underline-offset-2 hover:text-sky-200"
                        >
                          View details
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-xs text-[var(--accl-text-faint)]">
            School (K–12) listings require signing in and use the same directory with ecosystem{" "}
            <code className="rounded bg-black/20 px-1">k12</code> from Nexus or other surfaces — this page lists adult
            pending events only.
          </p>
        </div>
      </div>
    </div>
  );
}
