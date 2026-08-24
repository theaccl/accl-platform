/**
 * Genuine viewport/orientation measurement for landscape ticker settlement.
 * Chart-box reflow is not a viewport change.
 */

export type ViewportBox = {
  width: number;
  height: number;
};

export const LANDSCAPE_TICKER_VIEWPORT_THRESHOLD_PX = 8;

export function readViewportSize(win: Window): ViewportBox {
  const visual = win.visualViewport;
  return {
    width: Math.round(visual?.width ?? win.innerWidth),
    height: Math.round(visual?.height ?? win.innerHeight),
  };
}

export function isMaterialViewportChange(
  previous: ViewportBox,
  next: ViewportBox,
  thresholdPx: number = LANDSCAPE_TICKER_VIEWPORT_THRESHOLD_PX,
): boolean {
  return (
    Math.abs(next.width - previous.width) >= thresholdPx ||
    Math.abs(next.height - previous.height) >= thresholdPx
  );
}
