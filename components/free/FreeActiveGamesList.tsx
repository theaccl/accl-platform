"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isLobbyNonFinishedGame, sortLobbyGamesForDisplay } from "@/lib/freePlayLobby";
import { supabase } from "@/lib/supabaseClient";

type Row = {
  id: string;
  status: string;
  white_player_id: string;
  black_player_id: string | null;
  created_at?: string;
};

function statusLabel(status: string): string {
  const s = String(status ?? "").toLowerCase();
  if (s === "active") return "In progress";
  if (s === "waiting") return "Waiting";
  if (s === "finished") return "Finished";
  return status || "—";
}

/**
 * Lists all non-finished games for the signed-in user (active seats, open seats, etc.).
 */
export default function FreeActiveGamesList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        if (!cancelled) setRows([]);
        return;
      }
      const { data, error } = await supabase
        .from("games")
        .select("id,status,white_player_id,black_player_id,created_at")
        .or(`white_player_id.eq.${uid},black_player_id.eq.${uid}`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) {
        setErr("Could not load games.");
        setRows([]);
        return;
      }
      const games = (data as Row[]) ?? [];
      const nonFin = games.filter(isLobbyNonFinishedGame);
      setRows(sortLobbyGamesForDisplay(nonFin));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows === null) {
    return <p className="text-sm text-gray-400">Loading…</p>;
  }
  if (err) {
    return <p className="text-sm text-red-400">{err}</p>;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-[#2a3442] bg-[#161b22] p-6">
        <p className="text-gray-300">No current games.</p>
        <p className="mt-2 text-sm text-gray-500">Start from Free play — create a game, find a match, or accept a challenge.</p>
        <Link href="/free/lobby" className="mt-4 inline-block text-sm font-medium text-sky-400 hover:text-sky-300">
          Go to Free play
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="free-active-games-list">
      {rows.map((g) => (
        <li key={g.id}>
          <Link
            href={`/game/${g.id}`}
            className="flex items-center justify-between rounded-xl border border-[#2a3442] bg-[#161b22] px-4 py-3 transition hover:border-red-500/35 hover:bg-[#1a2231]"
          >
            <span className="font-mono text-sm text-gray-200">{g.id.slice(0, 8)}…</span>
            <span className="text-sm text-gray-400">{statusLabel(g.status)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
