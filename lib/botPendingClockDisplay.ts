import { normalizeGameTempo } from '@/lib/gameTempo';
import {
  clockBudgetMsForGame,
  liveFischerIncrementMsFromToken,
} from '@/lib/gameTimeControl';

export type ClockColor = 'white' | 'black';

export type BotPendingClockSnapshot = {
  activeTurn: ClockColor;
  startedAtMs: number;
  whiteMs: number;
  blackMs: number;
};

type BeginBotPendingClockInput = {
  sourceType: string | null | undefined;
  tempo: string | null | undefined;
  liveTimeControl: string | null | undefined;
  currentTurn: string | null | undefined;
  nextTurn: string | null | undefined;
  whiteClockMs: number | null | undefined;
  blackClockMs: number | null | undefined;
  lastMoveAt: string | null | undefined;
  movedAtMs: number;
};

function clockColor(raw: string | null | undefined): ClockColor | null {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (normalized === 'white' || normalized === 'w') return 'white';
  if (normalized === 'black' || normalized === 'b') return 'black';
  return null;
}

/**
 * Builds the temporary client clock state shown while the atomic human+bot move request is pending.
 * The server remains authoritative; this snapshot is discarded as soon as the response succeeds or fails.
 */
export function beginBotPendingClockDisplay(
  input: BeginBotPendingClockInput,
): BotPendingClockSnapshot | null {
  if (String(input.sourceType ?? '') !== 'bot_game') return null;

  const tempo = normalizeGameTempo(input.tempo);
  if (tempo !== 'live' && tempo !== 'daily') return null;

  const mover = clockColor(input.currentTurn);
  const botTurn = clockColor(input.nextTurn);
  if (!mover || !botTurn || mover === botTurn) return null;

  const baseClockMs = clockBudgetMsForGame(input.tempo, input.liveTimeControl);
  const whiteStored = Number.isFinite(input.whiteClockMs)
    ? Number(input.whiteClockMs)
    : baseClockMs;
  const blackStored = Number.isFinite(input.blackClockMs)
    ? Number(input.blackClockMs)
    : baseClockMs;
  const lastMoveAtMs = input.lastMoveAt ? new Date(input.lastMoveAt).getTime() : Number.NaN;
  const elapsedMs = Number.isFinite(lastMoveAtMs)
    ? Math.max(0, input.movedAtMs - lastMoveAtMs)
    : 0;
  const incrementMs = liveFischerIncrementMsFromToken(input.liveTimeControl);

  const whiteAfterHuman =
    mover === 'white' ? Math.max(0, whiteStored - elapsedMs) + incrementMs : whiteStored;
  const blackAfterHuman =
    mover === 'black' ? Math.max(0, blackStored - elapsedMs) + incrementMs : blackStored;

  return {
    activeTurn: botTurn,
    startedAtMs: input.movedAtMs,
    whiteMs: whiteAfterHuman,
    blackMs: blackAfterHuman,
  };
}

/** Returns the ticking display values for a pending bot turn without mutating the snapshot. */
export function botPendingClockDisplayAt(
  snapshot: BotPendingClockSnapshot,
  nowMs: number,
): BotPendingClockSnapshot {
  const elapsedMs = Math.max(0, nowMs - snapshot.startedAtMs);
  return {
    ...snapshot,
    whiteMs:
      snapshot.activeTurn === 'white'
        ? Math.max(0, snapshot.whiteMs - elapsedMs)
        : snapshot.whiteMs,
    blackMs:
      snapshot.activeTurn === 'black'
        ? Math.max(0, snapshot.blackMs - elapsedMs)
        : snapshot.blackMs,
  };
}
