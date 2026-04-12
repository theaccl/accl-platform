export const GAME_TEMPOS = ['live', 'daily', 'correspondence'] as const;
export type GameTempo = (typeof GAME_TEMPOS)[number];
export const DEFAULT_GAME_TEMPO: GameTempo = 'live';

export function normalizeGameTempo(raw: string | null | undefined): GameTempo {
  const v = String(raw ?? '').toLowerCase();
  if (v === 'live' || v === 'daily' || v === 'correspondence') return v;
  return DEFAULT_GAME_TEMPO;
}

export function gameTempoLabel(t: GameTempo): string {
  if (t === 'daily') return 'Daily';
  if (t === 'correspondence') return 'Correspondence';
  return 'Live';
}

export function gameTempoDescription(t: GameTempo): string {
  if (t === 'daily') return 'Slower game clock per side.';
  if (t === 'correspondence') return 'Per-move deadline pacing.';
  return 'Fast game clock per side.';
}

