import { correspondenceMoveDeadlineMs } from './gameTimeControl';
import { normalizeGameTempo } from './gameTempo';

export function preStartGameTimingFields(): { last_move_at: null; move_deadline_at: null } {
  return { last_move_at: null, move_deadline_at: null };
}

/** Both players seated with distinct ids (matches game board gating). */
function timingBothPlayersSeated(g: {
  white_player_id: string;
  black_player_id: string | null;
}): boolean {
  const w = String(g.white_player_id ?? '').trim();
  const b = String(g.black_player_id ?? '').trim();
  return w.length > 0 && b.length > 0 && w !== b;
}

/**
 * Live/daily clocks tick (elapsed since `last_move_at`, timeout checks, running LED) only after
 * the first move sets `last_move_at`. A row existing or both seats filling does not start time pressure.
 */
export function isLiveDailyClockTicking(g: {
  tempo?: string | null;
  last_move_at?: string | null;
  status?: string | null;
  white_player_id: string;
  black_player_id: string | null;
}): boolean {
  const t = normalizeGameTempo(g.tempo);
  if (t !== 'live' && t !== 'daily') return false;
  if (!timingBothPlayersSeated(g)) return false;
  if (String(g.status ?? '') === 'finished') return false;
  const lm = g.last_move_at;
  return lm != null && String(lm).trim() !== '';
}

/**
 * Correspondence per-move deadline UI is meaningful only once `move_deadline_at` exists (after first move).
 */
export function isCorrespondenceDeadlineActive(g: {
  tempo?: string | null;
  move_deadline_at?: string | null;
  status?: string | null;
  white_player_id: string;
  black_player_id: string | null;
}): boolean {
  if (normalizeGameTempo(g.tempo) !== 'correspondence') return false;
  if (!timingBothPlayersSeated(g)) return false;
  if (String(g.status ?? '') === 'finished') return false;
  const d = g.move_deadline_at;
  return d != null && String(d).trim() !== '';
}

export function afterMoveTimingFields(
  tempo: string | null | undefined,
  movedAt: Date = new Date(),
  liveTimeControl?: string | null
) {
  const t = normalizeGameTempo(tempo);
  if (t === 'correspondence') {
    return {
      last_move_at: movedAt.toISOString(),
      move_deadline_at: new Date(
        movedAt.getTime() + correspondenceMoveDeadlineMs(liveTimeControl)
      ).toISOString(),
    };
  }
  return {
    last_move_at: movedAt.toISOString(),
    move_deadline_at: null as string | null,
  };
}

export function gameTimingRuleSummaryLine(tempo: 'live' | 'daily' | 'correspondence'): string {
  if (tempo === 'correspondence') return 'Correspondence — per-move deadline.';
  if (tempo === 'daily') return 'Daily — slower game clock per side.';
  return 'Live — game clock per side.';
}

