export const RATING_HISTORY_EMPTY =
  'Rating history will appear here after finished rated games are recorded for this track.';

export const RATING_CURRENT_NO_HISTORY =
  'Current rating is available. Game-by-game rating history is not populated yet.';

export const RATING_FUTURE_CONTROL_EMPTY =
  'This time control is available, but no rated games have been recorded yet.';

export const RATING_BADGE_UNAVAILABLE =
  'Badge state for this track is not available yet.';

export const RATING_EXACT_SELF_ONLY =
  'Exact-track settlement ratings are visible on your profile when signed in.';

/** Selected lane window has no authoritative points (other lanes may still have data). */
export const RATING_LANE_EMPTY = 'No rating movement in this lane yet.';

export function exactTrackNoGamesLabel(displayLabel: string): string {
  return `No rated ${displayLabel} games recorded yet.`;
}

export function exactTrackHistoryEmptyLabel(displayLabel: string): string {
  return `Exact-track history will appear here after rated games are recorded for ${displayLabel}.`;
}
