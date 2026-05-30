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

/** Track has a current rating but not enough movement to draw a chart in this view. */
export const RATING_MORE_GAMES_NEEDED =
  'More rated games are needed before this chart can be drawn.';

/** No rated games at all for this track. */
export const RATING_NO_RATED_GAMES = 'No rated games yet.';

export function resultFilterEmptyLabel(filterLabel: string): string {
  return `No ${filterLabel.toLowerCase()} in this lane yet.`;
}

export function exactTrackNoGamesLabel(displayLabel: string): string {
  return `No rated ${displayLabel} games recorded yet.`;
}

export function exactTrackHistoryEmptyLabel(displayLabel: string): string {
  return `Exact-track history will appear here after rated games are recorded for ${displayLabel}.`;
}
