"use client";

import NavigationBar from "@/components/NavigationBar";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { gameDisplayTempoLabel } from "@/lib/gameDisplayLabel";
import { buildLoginRedirect } from "@/lib/nexus/nexusRouteHelpers";

type FinishedRow = {
  id: string;
  created_at: string;
  finished_at: string | null;
  result: string | null;
  tempo: string | null;
  live_time_control: string | null;
  rated: boolean | null;
};

function formatWhen(r: FinishedRow): string {
  const raw = r.finished_at ?? r.created_at;
  try {
    return new Date(raw).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return raw;
  }
}

function shortGameLabel(id: string): string {
  const t = id.trim();
  if (t.length <= 10) return t;
  return `${t.slice(0, 8)}…`;
}

export default function TrainerReviewPage() {
  const [rows, setRows] = useState<FinishedRow[]>([]);
  const [sessionState, setSessionState] = useState<"checking" | "signed_out" | "ready">("checking");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setSessionState("checking");
      const { data: auth } = await supabase.auth.getUser();
      if (cancelled) return;
      const uid = auth.user?.id;
      if (!uid) {
        setRows([]);
        setSessionState("signed_out");
        return;
      }
      const { data } = await supabase
        .from("games")
        .select("id,created_at,finished_at,result,tempo,live_time_control,rated")
        .eq("status", "finished")
        .or(`white_player_id.eq.${uid},black_player_id.eq.${uid}`)
        .order("created_at", { ascending: false })
        .limit(40);
      if (cancelled) return;
      setRows((data as FinishedRow[]) ?? []);
      setSessionState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loginHref = buildLoginRedirect("/trainer/review");

  const latest = rows[0] ?? null;

  return (
    <div className="min-h-screen bg-[#0D1117] text-white" data-testid="trainer-review-page">
      <NavigationBar />

      <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-400">
            <Link href="/trainer" className="font-medium text-gray-400 transition hover:text-white">
              Trainer
            </Link>
            <span className="text-gray-600" aria-hidden="true">
              /
            </span>
            <span className="text-gray-200 font-medium">Game review</span>
          </div>
          <Link href="/nexus" className="text-sm font-medium text-gray-500 transition hover:text-white w-fit">
            ← Back to Nexus
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Review my games</h1>
          <p className="text-sm text-gray-400 leading-relaxed">
            Open a <span className="text-gray-200">finished game record</span> for replay and metadata. From there,
            use <span className="text-gray-200">Analyze game</span> or <span className="text-gray-200">Train from mistakes</span>{" "}
            for engine work tied to that game.
          </p>
        </div>

        {sessionState === "checking" ? (
          <div className="rounded-2xl border border-gray-700 bg-[#161b22] p-6 text-gray-400" data-testid="trainer-review-loading">
            Loading your finished games…
          </div>
        ) : null}

        {sessionState === "signed_out" ? (
          <div className="rounded-2xl border border-gray-700 bg-[#161b22] p-6 flex flex-col gap-3" data-testid="trainer-review-signed-out">
            <p className="text-gray-300">Sign in to list games you played and open their finished records.</p>
            <Link
              href={loginHref}
              className="inline-flex w-fit rounded-xl bg-[#21262d] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2b3138]"
            >
              Log in
            </Link>
          </div>
        ) : null}

        {sessionState === "ready" && rows.length === 0 ? (
          <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-3 border border-gray-800">
            <p className="font-semibold text-gray-100">No finished games yet</p>
            <p className="text-sm text-gray-400">
              Complete a game to unlock the per-game page at <span className="font-mono text-gray-300">/finished/…</span>{" "}
              with replay, analysis, and training entry points.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link
                href="/free"
                className="inline-flex rounded-xl bg-[#21262d] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2b3138]"
              >
                Play free live
              </Link>
              <Link
                href="/trainer"
                className="inline-flex rounded-xl border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:bg-[#21262d]"
              >
                Trainer home
              </Link>
            </div>
          </div>
        ) : null}

        {sessionState === "ready" && rows.length > 0 ? (
          <div className="flex flex-col gap-5">
            {latest ? (
              <div className="rounded-2xl border border-emerald-900/35 bg-gradient-to-b from-[#0f1a14] to-[#161b22] p-5 flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/80">Most recent</p>
                <p className="text-sm text-gray-400">
                  Game <span className="font-mono text-gray-200">{shortGameLabel(latest.id)}</span> · {formatWhen(latest)}
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Link
                    href={`/finished/${latest.id}`}
                    className="flex-1 rounded-xl bg-[#238636] py-3 text-center text-sm font-semibold text-white transition hover:bg-[#2ea043]"
                    data-testid="trainer-review-latest-open"
                  >
                    Open game record
                  </Link>
                  <Link
                    href={`/finished/${latest.id}/analyze`}
                    className="flex-1 rounded-xl bg-[#21262d] py-3 text-center text-sm font-semibold transition hover:bg-[#2b3138]"
                    data-testid="trainer-review-latest-analyze"
                  >
                    Analyze game
                  </Link>
                  <Link
                    href={`/finished/${latest.id}/train`}
                    className="flex-1 rounded-xl bg-[#21262d] py-3 text-center text-sm font-semibold transition hover:bg-[#2b3138]"
                    data-testid="trainer-review-latest-train"
                  >
                    Train from mistakes
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4 border border-gray-800">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">All finished games</h2>
              <ul className="flex flex-col gap-3 list-none p-0 m-0">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-xl bg-[#0D1117] border border-gray-700 p-4 flex flex-col gap-3"
                    data-testid="trainer-review-game-row"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div>
                        <p className="font-semibold text-white">Finished game</p>
                        <p className="text-xs font-mono text-gray-500 mt-0.5">{r.id}</p>
                        <p className="text-sm text-gray-400 mt-2">
                          <span className="text-gray-300">{r.result ?? "Result unset"}</span>
                          <span className="text-gray-600"> · </span>
                          {gameDisplayTempoLabel({ tempo: r.tempo, liveTimeControl: r.live_time_control })}
                          <span className="text-gray-600"> · </span>
                          {r.rated ? "Rated" : "Unrated"}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{formatWhen(r)}</p>
                      </div>
                      <Link
                        href={`/finished/${r.id}`}
                        className="shrink-0 rounded-lg bg-[#238636] px-4 py-2 text-sm font-semibold text-center text-white transition hover:bg-[#2ea043] sm:self-center"
                        data-testid="trainer-review-open-finished"
                      >
                        Open
                      </Link>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm border-t border-gray-800 pt-3">
                      <Link href={`/finished/${r.id}/analyze`} className="text-cyan-200/90 hover:text-cyan-100 underline">
                        Analyze game
                      </Link>
                      <Link href={`/finished/${r.id}/train`} className="text-cyan-200/90 hover:text-cyan-100 underline">
                        Train from mistakes
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
