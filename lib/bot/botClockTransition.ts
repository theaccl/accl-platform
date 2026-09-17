import { clockBudgetMsForGame } from '@/lib/gameTimeControl';
import { normalizeGameTempo } from '@/lib/gameTempo';

const MAX_BOT_REVEAL_DELAY_MS = 10_000;

function boundedDelayMs(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_BOT_REVEAL_DELAY_MS, Math.max(0, Math.round(Number(value))));
}

export function botTimeoutFinishBeforeMove(input: {
  tempo: string | null | undefined;
  liveTimeControl: string | null | undefined;
  botMoverColor: 'white' | 'black';
  lastMoveAt: string | null | undefined;
  movedAt: Date;
  whiteClockMs: number | null | undefined;
  blackClockMs: number | null | undefined;
}): { result: 'white_win' | 'black_win'; endReason: 'timeout' } | null {
  const tempo = normalizeGameTempo(input.tempo);
  if (tempo !== 'live' && tempo !== 'daily') return null;
  if (!input.lastMoveAt) return null;

  const lastMoveMs = new Date(input.lastMoveAt).getTime();
  if (!Number.isFinite(lastMoveMs)) return null;
  const elapsedMs = Math.max(0, input.movedAt.getTime() - lastMoveMs);
  const baseMs = clockBudgetMsForGame(input.tempo, input.liveTimeControl);
  const storedMs =
    input.botMoverColor === 'white'
      ? Number.isFinite(input.whiteClockMs)
        ? Number(input.whiteClockMs)
        : baseMs
      : Number.isFinite(input.blackClockMs)
        ? Number(input.blackClockMs)
        : baseMs;
  if (storedMs - elapsedMs > 0) return null;

  return {
    result: input.botMoverColor === 'white' ? 'black_win' : 'white_win',
    endReason: 'timeout',
  };
}

/** Convert the server's scheduled reveal timestamp to a bounded relative delay. */
export function botRevealDelayForResponse(
  lastMoveAt: string | null | undefined,
  thinkMs: number | null | undefined,
  nowMs: number = Date.now(),
): number {
  const fallback = boundedDelayMs(thinkMs);
  const revealAtMs = lastMoveAt ? new Date(lastMoveAt).getTime() : Number.NaN;
  if (!Number.isFinite(revealAtMs)) return fallback;
  return Math.min(fallback, Math.max(0, Math.round(revealAtMs - nowMs)));
}

/** Trust a relative server duration only after bounding it to the configured think time. */
export function botRevealDelayForClient(
  revealDelayMs: number | null | undefined,
  thinkMs: number | null | undefined,
): number {
  const fallback = boundedDelayMs(thinkMs);
  if (!Number.isFinite(revealDelayMs)) return fallback;
  return Math.min(fallback, boundedDelayMs(revealDelayMs));
}
