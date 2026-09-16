import { buildAuthoritativeMovePatch } from '@/lib/gameStateSourceOfTruth';

export type OptimisticMoveClockRow = {
  fen: string;
  turn: string;
  status: string;
  tempo?: string | null;
  live_time_control?: string | null;
  last_move_at?: string | null;
  move_deadline_at?: string | null;
  white_clock_ms?: number | null;
  black_clock_ms?: number | null;
};

/**
 * Project the clock state immediately after a locally accepted move.
 *
 * The database remains authoritative. This projection only keeps the moving
 * player's screen responsive while the move request (and any bot reply) is in flight.
 */
export function buildOptimisticMoveClockRow<T extends OptimisticMoveClockRow>(
  game: T,
  input: { nextFen: string; nextTurn: string; movedAt: Date },
): T {
  const patch = buildAuthoritativeMovePatch({
    nextFen: input.nextFen,
    nextTurn: input.nextTurn,
    statusBefore: game.status,
    tempo: game.tempo,
    liveTimeControl: game.live_time_control,
    currentTurn: game.turn,
    whiteClockMs: game.white_clock_ms,
    blackClockMs: game.black_clock_ms,
    lastMoveAt: game.last_move_at,
    movedAt: input.movedAt,
  });

  return { ...game, ...patch };
}

/** Wait only until the server's scheduled bot-move reveal time. */
export function remainingBotMoveRevealDelayMs(
  lastMoveAt: string | null | undefined,
  fallbackThinkMs: number | null | undefined,
  nowMs: number = Date.now(),
): number {
  const revealAtMs = lastMoveAt ? new Date(lastMoveAt).getTime() : Number.NaN;
  if (Number.isFinite(revealAtMs)) return Math.max(0, revealAtMs - nowMs);
  return Number.isFinite(fallbackThinkMs) ? Math.max(0, Number(fallbackThinkMs)) : 0;
}
