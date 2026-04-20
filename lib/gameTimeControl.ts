import { normalizeGameTempo } from './gameTempo';

/** Live (per-side) clocks including Fischer-style `main+inc` tokens used in free play / ratings. */
export type LiveClockValue =
  | '1m'
  | '1+1'
  | '2+1'
  | '3m'
  | '3+2'
  | '5m'
  | '5+5'
  | '10m'
  | '15m'
  | '20m'
  | '30m'
  | '60m';
export type DailyClockValue = '30m' | '60m';
export type CorrespondencePaceValue = '1d' | '2d' | '3d';
export type GameTimeControlToken = LiveClockValue | DailyClockValue | CorrespondencePaceValue;

export function canonicalLiveTimeControlForInsert(
  _tempo: string | null | undefined,
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  return s === '' ? null : s;
}

export function clockBudgetMsForGame(
  tempo: string | null | undefined,
  liveTimeControl: string | null | undefined
): number {
  const t = normalizeGameTempo(tempo);
  const token = String(liveTimeControl ?? '')
    .toLowerCase()
    .trim();

  const dayMatch = /^(\d+)d$/.exec(token);
  if (dayMatch) {
    return Math.max(1, Number(dayMatch[1])) * 24 * 60 * 60 * 1000;
  }

  const inc = /^(\d+)\+(\d+)$/.exec(token);
  if (inc) {
    return Math.max(1, Number(inc[1])) * 60 * 1000;
  }

  const minutesFromToken = /^(\d+)m$/.exec(token)?.[1];
  if (minutesFromToken) {
    return Math.max(1, Number(minutesFromToken)) * 60 * 1000;
  }

  const m = t === 'daily' ? 30 : 5;
  return Math.max(1, m) * 60 * 1000;
}

export function correspondenceMoveDeadlineMs(liveTimeControl: string | null | undefined): number {
  const token = String(liveTimeControl ?? '').toLowerCase();
  if (token === '2d') return 2 * 24 * 60 * 60 * 1000;
  if (token === '3d') return 3 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export function formatGameTimeControlLabel(
  tempo: string | null | undefined,
  liveTimeControl: string | null | undefined
): string {
  const t = normalizeGameTempo(tempo);
  if (t === 'correspondence') {
    const tc = String(liveTimeControl ?? '1d').toUpperCase();
    return `Correspondence ${tc}`;
  }
  const tc = String(liveTimeControl ?? (t === 'daily' ? '30m' : '5m')).toUpperCase();
  return `${t === 'daily' ? 'Daily' : 'Live'} ${tc}`;
}

