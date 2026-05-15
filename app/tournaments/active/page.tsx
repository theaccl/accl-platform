"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavigationBar from "@/components/NavigationBar";

type DirectoryItem = {
  id: string;
  name: string;
  format: string;
  status: string;
  tempo: string | null;
  rated: boolean;
  participantCount: number;
  entryFeeCents: number | null;
};

function formatLabel(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/_/g, " ");
}

export default function TournamentActivePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DirectoryItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const res = await fetch(
        "/api/tournaments/directory?ecosystem=adult&status=active&limit=50",
        { credentials: "include" },
      );
      const j = (await res.json()) as { ok?: boolean; items?: DirectoryItem[]; error?: string };
      if (cancelled) return;
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Could not load active tournaments.");
        setItems([]);
      } else {
        setItems(j.items ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--accl-bg-base)] text-[var(--accl-text-primary)]">
      <NavigationBar />
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Active tournaments</h1>

        <div className="rounded-2xl border border-[var(--accl-border-muted)] bg-[var(--accl-bg-elevated)]/30 p-5">
          {loading ? (
            <p className="text-sm text-[var(--accl-text-muted)]">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-300/90">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-[var(--accl-text-muted)]">No active tournaments right now.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((t) => (
                <li
                  key={t.id}
                  className="rounded-xl border border-[var(--accl-border-muted)] bg-[var(--accl-bg-base)]/80 px-4 py-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">{t.name}</p>
                      <p className="mt-1 text-xs text-[var(--accl-text-muted)]">
                        {formatLabel(t.format)}
                        {t.tempo ? ` · ${formatLabel(t.tempo)}` : ""}
                        {t.rated ? " · Rated" : ""} · {t.participantCount} entr
                        {t.participantCount === 1 ? "y" : "ies"}
                      </p>
                    </div>
                    <Link
                      href={`/tournaments/${t.id}`}
                      className="shrink-0 rounded-lg border border-sky-500/40 bg-sky-900/20 px-3 py-2 text-center text-sm font-medium text-sky-200/95 hover:bg-sky-900/35"
                    >
                      Open
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-[var(--accl-text-faint)]">
            Listings use the trusted directory API (adult ecosystem). K–12 users: open Nexus from a signed-in session
            for school-scoped events.
          </p>
        </div>
      </div>
    </div>
  );
}
