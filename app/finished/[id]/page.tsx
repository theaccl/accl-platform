"use client";

import NavigationBar from "@/components/NavigationBar";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  finishedGameResultBannerText,
  formatEndReasonLabel,
  formatFinishedAtLocal,
} from "@/lib/finishedGame";
import { gameDisplayTempoLabel } from "@/lib/gameDisplayLabel";
import { buildLoginRedirect } from "@/lib/nexus/nexusRouteHelpers";
import { publicDisplayNameFromProfileUsername } from "@/lib/profileIdentity";
import { START_FEN } from "@/lib/startFen";
import { supabase } from "@/lib/supabaseClient";
import { useReplayState, type MoveLogRow, type ReplayPairedRow } from "@/hooks/useReplayState";

type FinishedGameRow = {
  id: string;
  white_player_id: string;
  black_player_id: string | null;
  status: string;
  fen: string;
  result: string | null;
  end_reason: string | null;
  finished_at: string | null;
  created_at: string;
  tempo: string | null;
  live_time_control: string | null;
  rated: boolean | null;
};

function normalizeFenForReactChessboard(raw: string): string {
  if (!raw || raw === "start") return START_FEN;
  try {
    const c = new Chess();
    c.load(raw);
    return c.fen();
  } catch {
    return START_FEN;
  }
}

function isEnPassantMoveLog(m: MoveLogRow): boolean {
  const from = m.from_sq?.trim();
  const to = m.to_sq?.trim();
  if (!from || !to) return false;
  try {
    const c = new Chess();
    const fb = m.fen_before;
    if (fb && fb !== "start") {
      c.load(fb);
    }
    const move = c.move({ from: from as Square, to: to as Square });
    if (!move) return false;
    return move.isEnPassant();
  } catch {
    return false;
  }
}

export default function FinishedGameDetailPage() {
  const params = useParams<{ id: string }>();
  const gameId = String(params?.id ?? "").trim();

  const [phase, setPhase] = useState<"loading" | "ready" | "signed_out" | "not_found" | "not_finished" | "error">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [game, setGame] = useState<FinishedGameRow | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [displayNameById, setDisplayNameById] = useState<Record<string, string>>({});

  const sanForDisplay = useCallback((m: MoveLogRow) => {
    return isEnPassantMoveLog(m) ? `${m.san} e.p.` : m.san;
  }, []);

  const { moveLogs, setMoveLogs, replayStep, setReplayStep, pairedRows, boardPosition, lastMoveSquareStyles } =
    useReplayState(sanForDisplay, START_FEN);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!gameId) {
        setPhase("not_found");
        return;
      }

      setPhase("loading");
      setErrorMessage("");
      setGame(null);
      setMoveLogs([]);
      setReplayStep(null);

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      if (cancelled) return;
      if (!uid) {
        setViewerId(null);
        setPhase("signed_out");
        return;
      }
      setViewerId(uid);

      const { data: row, error } = await supabase
        .from("games")
        .select(
          "id, white_player_id, black_player_id, status, fen, result, end_reason, finished_at, created_at, tempo, live_time_control, rated"
        )
        .eq("id", gameId)
        .or(`white_player_id.eq.${uid},black_player_id.eq.${uid}`)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        setErrorMessage(error.message);
        setPhase("error");
        return;
      }
      if (!row) {
        setPhase("not_found");
        return;
      }

      const g = row as FinishedGameRow;
      if (String(g.status).toLowerCase() !== "finished") {
        setGame(g);
        setPhase("not_finished");
        return;
      }

      setGame(g);

      const { data: logs, error: logErr } = await supabase
        .from("game_move_logs")
        .select("san, fen_before, fen_after, created_at, from_sq, to_sq")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      if (logErr) {
        setErrorMessage(logErr.message);
        setPhase("error");
        return;
      }

      setMoveLogs((logs ?? []) as MoveLogRow[]);
      setReplayStep(null);

      const ids = [...new Set([g.white_player_id, g.black_player_id].filter(Boolean) as string[])];
      if (ids.length > 0) {
        const { data: profiles, error: pErr } = await supabase
          .from("profiles")
          .select("id, username, email")
          .in("id", ids);
        if (cancelled) return;
        if (!pErr && profiles) {
          const next: Record<string, string> = {};
          for (const p of profiles as { id: string; username: string | null; email: string | null }[]) {
            next[p.id] = publicDisplayNameFromProfileUsername(p.username, p.id, p.email);
          }
          for (const id of ids) {
            if (!(id in next)) next[id] = publicDisplayNameFromProfileUsername(null, id);
          }
          setDisplayNameById(next);
        }
      }

      setPhase("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [gameId, setMoveLogs, setReplayStep]);

  const myColor = useMemo(() => {
    if (!game || !viewerId) return null as "white" | "black" | null;
    if (game.white_player_id === viewerId) return "white";
    if (game.black_player_id === viewerId) return "black";
    return null;
  }, [game, viewerId]);

  const boardOrientation = myColor === "black" ? "black" : "white";

  const boardFen = useMemo(() => {
    if (!game) return START_FEN;
    const replay = boardPosition;
    if (replay) return normalizeFenForReactChessboard(replay);
    return normalizeFenForReactChessboard(game.fen);
  }, [boardPosition, game]);

  const maxReplayStep = moveLogs.length;

  const loginHref = gameId ? buildLoginRedirect(`/finished/${gameId}`) : "/login";

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />

      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6" data-testid="finished-detail-page">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href="/trainer/review"
              className="text-sm font-medium text-gray-400 transition hover:text-white w-fit"
              data-testid="game-finished-history-link"
            >
              ← Review list
            </Link>
            <Link
              href="/trainer"
              className="text-sm font-medium text-gray-500 transition hover:text-white w-fit"
              data-testid="game-finished-trainer-home-link"
            >
              Trainer home
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Finished game</h1>
          {gameId ? (
            <p className="text-sm text-gray-500 font-mono">
              Game <span className="text-gray-400">{gameId}</span>
            </p>
          ) : null}
        </div>

        {phase === "loading" ? (
          <div className="rounded-2xl border border-gray-700 bg-[#161b22] p-6 text-gray-400">Loading…</div>
        ) : null}

        {phase === "signed_out" ? (
          <div className="rounded-2xl border border-gray-700 bg-[#161b22] p-6 flex flex-col gap-3">
            <p className="text-gray-300">Sign in to open your finished games.</p>
            <Link
              href={loginHref}
              className="inline-flex w-fit rounded-xl bg-[#21262d] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2b3138]"
            >
              Log in
            </Link>
          </div>
        ) : null}

        {(phase === "not_found" || phase === "error") && (
          <div className="rounded-2xl border border-gray-700 bg-[#161b22] p-6">
            <p className="font-semibold text-gray-200">
              {phase === "not_found" ? "Game not found" : "Could not load this game"}
            </p>
            {phase === "error" && errorMessage ? (
              <p className="text-sm text-gray-400 mt-2">{errorMessage}</p>
            ) : (
              <p className="text-sm text-gray-400 mt-2">
                There is no finished game at this link for your account, or the link is invalid.
              </p>
            )}
          </div>
        )}

        {phase === "not_finished" && game ? (
          <div className="rounded-2xl border border-amber-900/50 bg-[#161b22] p-6 flex flex-col gap-4">
            <p className="font-semibold text-amber-100">This game is still in progress</p>
            <p className="text-sm text-gray-400">Open the live board to continue or spectate.</p>
            <Link
              href={`/game/${game.id}`}
              className="inline-flex w-fit rounded-xl bg-[#21262d] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2b3138]"
            >
              Open live game
            </Link>
          </div>
        ) : null}

        {phase === "ready" && game ? (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-gray-400">
              Read-only record of a completed game. Use replay to step through moves; the board defaults to the final
              position.
            </p>

            <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-5 border border-gray-800">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">White</p>
                  <p className="text-lg font-semibold text-white">
                    {displayNameById[game.white_player_id] ?? game.white_player_id}
                  </p>
                </div>
                <div className="text-center text-gray-500 text-sm font-medium pt-1">vs</div>
                <div className="sm:text-right">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Black</p>
                  <p className="text-lg font-semibold text-white">
                    {game.black_player_id
                      ? displayNameById[game.black_player_id] ?? game.black_player_id
                      : "—"}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-amber-900/40 bg-gradient-to-b from-[#2a2210] to-[#1a1508] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-200/90 mb-2">Result</p>
                {game.finished_at ? (
                  <p className="text-xs text-stone-400 mb-2">Finished {formatFinishedAtLocal(game.finished_at)}</p>
                ) : null}
                <p
                  data-testid="finished-result-summary"
                  data-result={game.result ?? ""}
                  data-end-reason={game.end_reason ?? ""}
                  className="text-xl font-bold text-amber-50 leading-snug"
                >
                  {finishedGameResultBannerText(game)}
                </p>
                {game.end_reason ? (
                  <p className="text-sm text-stone-400 mt-2">
                    <span className="text-stone-500">End reason:</span> {formatEndReasonLabel(game.end_reason)}
                  </p>
                ) : null}
              </div>

              <div className="text-sm text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <span className="text-gray-500">Tempo:</span>{" "}
                  {gameDisplayTempoLabel({ tempo: game.tempo, liveTimeControl: game.live_time_control })}
                </span>
                <span>
                  <span className="text-gray-500">Rated:</span> {game.rated ? "Yes" : "No"}
                </span>
              </div>

              <div
                className="mx-auto w-full max-w-[min(100%,520px)]"
                data-testid="game-board"
                data-interaction-mode="finished_readonly"
              >
                <Chessboard
                  id={`finished-game-board-${game.id}`}
                  position={boardFen}
                  boardOrientation={boardOrientation}
                  animationDuration={0}
                  customSquareStyles={lastMoveSquareStyles}
                  arePiecesDraggable={false}
                />
              </div>

              {moveLogs.length > 0 ? (
                <div className="flex flex-col gap-3" data-testid="finished-move-list">
                  <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Moves</h2>
                  <div className="rounded-xl border border-gray-700 bg-[#0D1117] overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-800 text-xs text-gray-500">
                      Click a move to jump; use Final position for the stored end of the game.
                    </div>
                    <div className="max-h-48 overflow-y-auto px-3 py-2 font-mono text-sm text-gray-200 leading-relaxed">
                      {(() => {
                        let flat = 0;
                        return pairedRows.map((row: ReplayPairedRow) => {
                          const wIdx = flat++;
                          const bIdx = row.black !== undefined ? flat++ : -1;
                          const hl = (idx: number) => replayStep !== null && replayStep === idx + 1;
                          return (
                            <div key={row.num} className="mb-1">
                              <span className="text-gray-600 select-none">{row.num}. </span>
                              <MoveSanButton label={row.white} active={hl(wIdx)} onPick={() => setReplayStep(wIdx + 1)} />
                              {row.black !== undefined && bIdx >= 0 ? (
                                <>
                                  {" "}
                                  <MoveSanButton
                                    label={row.black}
                                    active={hl(bIdx)}
                                    onPick={() => setReplayStep(bIdx + 1)}
                                  />
                                </>
                              ) : null}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <ReplayBtn label="First" onClick={() => setReplayStep(0)} disabled={replayStep === 0} />
                    <ReplayBtn
                      label="Prev"
                      onClick={() => setReplayStep((s) => (s === null ? 0 : Math.max(0, s - 1)))}
                      disabled={replayStep !== null && replayStep <= 0}
                    />
                    <ReplayBtn
                      label="Next"
                      onClick={() =>
                        setReplayStep((s) => {
                          if (s === null) return 0;
                          return Math.min(maxReplayStep, s + 1);
                        })
                      }
                      disabled={replayStep !== null && replayStep >= maxReplayStep}
                    />
                    <ReplayBtn
                      label="Last"
                      onClick={() => setReplayStep(maxReplayStep)}
                      disabled={replayStep === maxReplayStep || maxReplayStep === 0}
                    />
                    <ReplayBtn
                      label="Final position"
                      onClick={() => setReplayStep(null)}
                      disabled={replayStep === null}
                    />
                    {replayStep !== null ? (
                      <span className="text-xs text-gray-500">
                        After move {replayStep} / {maxReplayStep}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No move list stored for this game.</p>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Link
                  href={`/finished/${game.id}/analyze`}
                  className="flex-1 rounded-xl bg-[#21262d] py-3 text-center text-base font-semibold transition hover:bg-[#2b3138]"
                  data-testid="finished-link-analyze"
                >
                  Analyze game
                </Link>
                <Link
                  href={`/finished/${game.id}/train`}
                  className="flex-1 rounded-xl bg-[#21262d] py-3 text-center text-base font-semibold transition hover:bg-[#2b3138]"
                  data-testid="finished-link-train"
                >
                  Train from mistakes
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReplayBtn({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-gray-700 bg-[#21262d] px-3 py-1.5 text-xs font-medium text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#2b3138]"
    >
      {label}
    </button>
  );
}

function MoveSanButton({ label, active, onPick }: { label: string; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`px-1 rounded ${active ? "bg-amber-500/25 text-amber-100 font-semibold" : "text-gray-200 hover:bg-white/5"}`}
    >
      {label}
    </button>
  );
}
