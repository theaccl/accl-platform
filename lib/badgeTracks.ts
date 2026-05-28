/**
 * Free-play exact time-control badge tracks (Phase 1).
 * Keep in sync with SQL `classify_free_badge_track_key`.
 */

export const BADGE_VISUAL_STATES = ['normal', 'upgraded', 'downgraded'] as const;
export type BadgeVisualState = (typeof BADGE_VISUAL_STATES)[number];

export const BADGE_PRESSURE_STATES = ['stable', 'promotion_armed', 'demotion_armed'] as const;
export type BadgePressureState = (typeof BADGE_PRESSURE_STATES)[number];

/** 25-point demotion cushion below a band's lower border. */
export const BADGE_DEMOTION_CUSHION_POINTS = 25;

export const BADGE_RANK_BANDS = [
  'elite',
  'master',
  'expert',
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
] as const;
export type BadgeRankBand = (typeof BADGE_RANK_BANDS)[number];

export const BADGE_RANK_BAND_ORDER: Record<BadgeRankBand, number> = {
  f: 0,
  e: 1,
  d: 2,
  c: 3,
  b: 4,
  a: 5,
  expert: 6,
  master: 7,
  elite: 8,
};

/** Lower inclusive rating boundary for each band (F has none). */
export const BADGE_RANK_BAND_LOWER_BORDER: Record<BadgeRankBand, number | null> = {
  elite: 2400,
  master: 2200,
  expert: 2000,
  a: 1800,
  b: 1600,
  c: 1400,
  d: 1200,
  e: 1000,
  f: null,
};

export const FREE_BADGE_TRACK_KEYS = [
  'bullet_1_0',
  'bullet_1_1',
  'bullet_2_0',
  'bullet_2_1',
  'blitz_3_0',
  'blitz_3_2',
  'blitz_5_0',
  'blitz_5_5',
  'rapid_10_0',
  'rapid_15_0',
  'rapid_20_0',
  'rapid_30_0',
  'rapid_60_0',
  'daily_1_day',
  'daily_2_day',
  'daily_3_day',
  'daily_5_day',
] as const;
export type FreeBadgeTrackKey = (typeof FREE_BADGE_TRACK_KEYS)[number];

/** PLAT `live_time_control` / daily tokens → exact track key. */
const LIVE_TRACK_BY_TOKEN: Record<string, FreeBadgeTrackKey> = {
  '1m': 'bullet_1_0',
  '1+1': 'bullet_1_1',
  '2m': 'bullet_2_0',
  '2+0': 'bullet_2_0',
  '2+1': 'bullet_2_1',
  '3m': 'blitz_3_0',
  '3+2': 'blitz_3_2',
  '5m': 'blitz_5_0',
  '5+5': 'blitz_5_5',
  '10m': 'rapid_10_0',
  '15m': 'rapid_15_0',
  '20m': 'rapid_20_0',
  '30m': 'rapid_30_0',
  '60m': 'rapid_60_0',
  '1d': 'daily_1_day',
  '2d': 'daily_2_day',
  '3d': 'daily_3_day',
  '5d': 'daily_5_day',
};

function normLc(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function normTempo(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toLowerCase();
}

/**
 * Classify a free-play finished game into an exact badge track.
 * Returns null when tempo/clock is not a supported exact track.
 */
export function classifyFreeBadgeTrackKey(
  tempoRaw: string | null | undefined,
  liveTimeControlRaw: string | null | undefined,
): FreeBadgeTrackKey | null {
  const tempo = normTempo(tempoRaw);
  const lc = normLc(liveTimeControlRaw);
  if (!lc) return null;

  if (tempo === 'correspondence' || lc.endsWith('d')) {
    const daily = LIVE_TRACK_BY_TOKEN[lc];
    if (daily?.startsWith('daily_')) return daily;
    return null;
  }

  if (tempo === 'daily') {
    const daily = LIVE_TRACK_BY_TOKEN[lc];
    return daily?.startsWith('daily_') ? daily : null;
  }

  if (tempo !== '' && tempo !== 'live') {
    return null;
  }

  const track = LIVE_TRACK_BY_TOKEN[lc];
  if (!track || track.startsWith('daily_')) return null;
  return track;
}

export function rankBandFromSettlementRating(rating: number): BadgeRankBand {
  const r = Math.round(rating);
  if (r >= 2400) return 'elite';
  if (r >= 2200) return 'master';
  if (r >= 2000) return 'expert';
  if (r >= 1800) return 'a';
  if (r >= 1600) return 'b';
  if (r >= 1400) return 'c';
  if (r >= 1200) return 'd';
  if (r >= 1000) return 'e';
  return 'f';
}

export function lowerBorderForRankBand(band: BadgeRankBand): number | null {
  return BADGE_RANK_BAND_LOWER_BORDER[band];
}

/** Rating at or below this threshold is in demotion danger for the given lower border. */
export function demotionDangerThreshold(lowerBorder: number): number {
  return lowerBorder - BADGE_DEMOTION_CUSHION_POINTS;
}

export function isInDemotionDanger(rating: number, lowerBorder: number): boolean {
  return Math.round(rating) <= demotionDangerThreshold(lowerBorder);
}

export function hasRecoveredFromDemotion(rating: number, recoveryBorder: number): boolean {
  return Math.round(rating) >= recoveryBorder;
}

export function defaultSettlementRatingForNewTrack(): number {
  return 1500;
}
