export type ReplayNotationScrollBounds = {
  scrollTop: number;
  viewportTop: number;
  viewportBottom: number;
  itemTop: number;
  itemBottom: number;
};

/** Return the nearest container-only scroll position that reveals the active move. */
export function nearestReplayNotationScrollTop(bounds: ReplayNotationScrollBounds): number {
  if (bounds.itemTop < bounds.viewportTop) {
    return Math.max(0, bounds.scrollTop - (bounds.viewportTop - bounds.itemTop));
  }
  if (bounds.itemBottom > bounds.viewportBottom) {
    return bounds.scrollTop + (bounds.itemBottom - bounds.viewportBottom);
  }
  return bounds.scrollTop;
}
