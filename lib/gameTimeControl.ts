import { normalizeGameTempo } from './gameTempo';

export type LiveClockValue = '1m' | '3m' | '5m' | '10m' | '30m' | '60m';
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
  const token = String(liveTimeControl ?? '').toLowerCase();
  const minutesFromToken = /^(\d+)m$/.exec(token)?.[1];
  const m = minutesFromToken ? Number(minutesFromToken) : t === 'daily' ? 30 : 5;
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

