import { clockBudgetMsForGame } from '@/lib/gameTimeControl';
import { normalizeGameTempo } from '@/lib/gameTempo';

/** Total calculation budget, including candidate construction and process startup. */
export function botMoveBudgetMs(input: {
  fen: string;
  tempo: string | null;
  liveTimeControl: string | null;
  clockMs: number | null;
  lastMoveAt: string | null;
  nowMs?: number;
}): number | null {
  if (normalizeGameTempo(input.tempo) !== 'live') return null;
  const moveNumber = Math.max(1, Number(input.fen.split(' ')[5]) || 1);
  const phaseCap = moveNumber <= 10 ? 1_000 : moveNumber <= 15 ? 1_500 : 2_000;
  const initial = clockBudgetMsForGame(input.tempo, input.liveTimeControl);
  const stored = input.clockMs !== null && Number.isFinite(input.clockMs)
    ? Math.max(0, input.clockMs) : initial;
  const timestamp = input.lastMoveAt ? Date.parse(input.lastMoveAt) : NaN;
  const elapsed = Number.isFinite(timestamp)
    ? Math.max(0, (input.nowMs ?? Date.now()) - timestamp) : 0;
  const remaining = Math.max(0, stored - elapsed);
  // Reserve clock for later turns and the authoritative commit. Never increase
  // a depleted clock to a minimum thinking time.
  return Math.max(1, Math.min(phaseCap, Math.floor(remaining / 30)));
}
