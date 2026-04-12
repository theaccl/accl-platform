import { afterMoveTimingFields } from '@/lib/gameTiming';
import { clockBudgetMsForGame } from '@/lib/gameTimeControl';
import { normalizeGameTempo } from '@/lib/gameTempo';

export type AuthoritativeGameStatus = 'waiting' | 'active' | 'finished' | 'void';

export type MovePatchInput = {
  nextFen: string;
  nextTurn: string;
  statusBefore: string;
  tempo: string | null | undefined;
  liveTimeControl: string | null | undefined;
  currentTurn: string;
  whiteClockMs: number | null | undefined;
  blackClockMs: number | null | undefined;
  lastMoveAt: string | null | undefined;
  movedAt?: Date;
};

export type MoveWritePayload = {
  fen: string;
  turn: string;
  last_move_at: string;
  move_deadline_at: string | null;
  white_clock_ms?: number;
  black_clock_ms?: number;
  status?: string;
};

export function normalizeAuthoritativeStatus(raw: string | null | undefined): AuthoritativeGameStatus {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'waiting' || s === 'active' || s === 'finished' || s === 'void') return s;
  return 'active';
}

export function isAuthoritativelyFinished(raw: string | null | undefined): boolean {
  return normalizeAuthoritativeStatus(raw) === 'finished';
}

export function trainerEligibleFromStatus(raw: string | null | undefined): boolean {
  return isAuthoritativelyFinished(raw);
}

export function buildAuthoritativeMovePatch(input: MovePatchInput): MoveWritePayload {
  const movedAt = input.movedAt ?? new Date();
  const tempo = normalizeGameTempo(input.tempo);
  const timing = afterMoveTimingFields(tempo, movedAt, input.liveTimeControl);
  const baseClockMs = clockBudgetMsForGame(input.tempo, input.liveTimeControl);
  const whiteStoredBefore = Number.isFinite(input.whiteClockMs) ? Number(input.whiteClockMs) : baseClockMs;
  const blackStoredBefore = Number.isFinite(input.blackClockMs) ? Number(input.blackClockMs) : baseClockMs;
  const elapsedSinceLastMove = input.lastMoveAt
    ? Math.max(0, Date.now() - new Date(input.lastMoveAt).getTime())
    : 0;
  const whiteAfter =
    input.currentTurn === 'white'
      ? Math.max(0, whiteStoredBefore - elapsedSinceLastMove)
      : whiteStoredBefore;
  const blackAfter =
    input.currentTurn === 'black'
      ? Math.max(0, blackStoredBefore - elapsedSinceLastMove)
      : blackStoredBefore;

  const payload: MoveWritePayload = {
    fen: input.nextFen,
    turn: input.nextTurn,
    last_move_at: timing.last_move_at,
    move_deadline_at: timing.move_deadline_at,
    ...(tempo === 'live' || tempo === 'daily'
      ? {
          white_clock_ms: whiteAfter,
          black_clock_ms: blackAfter,
        }
      : {}),
  };

  if (normalizeAuthoritativeStatus(input.statusBefore) === 'waiting') {
    payload.status = 'active';
  }

  return payload;
}
