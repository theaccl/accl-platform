/** List / card label (sentence case). Unknown → Unrated. */
export function gameRatedListLabel(rated: boolean | null | undefined): string {
  return rated === true ? 'Rated' : 'Unrated';
}

/** Uppercase fragment for mode banner (matches gameModeBannerLabel style). */
export function gameRatedBannerSuffix(rated: boolean | null | undefined): string {
  return rated === true ? ' · RATED' : ' · UNRATED';
}
