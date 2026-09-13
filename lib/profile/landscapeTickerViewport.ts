/**
 * Genuine visual-viewport measurement and rotation/chrome settlement.
 * Chart-box reflow is not a viewport change.
 */

export type ViewportBox = {
  width: number;
  height: number;
};

export type VisualViewportBox = {
  offsetTop: number;
  offsetLeft: number;
  width: number;
  height: number;
};

export const LANDSCAPE_TICKER_VIEWPORT_THRESHOLD_PX = 8;

/** Short-landscape fit uses measured visualViewport, not a CSS orientation media query. */
export const LANDSCAPE_FIT_MAX_HEIGHT_PX = 500;

/**
 * Delayed rereads for mobile browser rotation and chrome reflow.
 * Playwright fake clocks must fast-forward past the last delay.
 */
export const LANDSCAPE_TICKER_VIEWPORT_SETTLE_DELAYS_MS = [0, 32, 80, 160, 320, 480] as const;

export function readViewportSize(win: Window): ViewportBox {
  const visual = win.visualViewport;
  return {
    width: Math.round(visual?.width ?? win.innerWidth),
    height: Math.round(visual?.height ?? win.innerHeight),
  };
}

export function readVisualViewportBox(win: Window = window): VisualViewportBox {
  const visual = win.visualViewport;
  return {
    offsetTop: Math.round(visual?.offsetTop ?? 0),
    offsetLeft: Math.round(visual?.offsetLeft ?? 0),
    width: Math.round(visual?.width ?? win.innerWidth),
    height: Math.round(visual?.height ?? win.innerHeight),
  };
}

export function visualViewportBoxesEqual(a: VisualViewportBox, b: VisualViewportBox): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.offsetTop === b.offsetTop &&
    a.offsetLeft === b.offsetLeft
  );
}

export function isLandscapeFitBox(box: Pick<VisualViewportBox, 'width' | 'height'>): boolean {
  return box.height > 0 && box.height <= LANDSCAPE_FIT_MAX_HEIGHT_PX && box.width >= box.height;
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

export type VisualViewportSubscribeOptions = {
  win?: Window;
  settleDelaysMs?: readonly number[];
};

/**
 * Subscribe to resize, orientation, and visualViewport geometry.
 * Emits only when the rounded box changes. Cleans up listeners, timers, and rAF.
 */
export function subscribeVisualViewport(
  onBox: (box: VisualViewportBox) => void,
  options: VisualViewportSubscribeOptions = {},
): () => void {
  const win = options.win ?? window;
  const delays = options.settleDelaysMs ?? LANDSCAPE_TICKER_VIEWPORT_SETTLE_DELAYS_MS;
  let last: VisualViewportBox | null = null;
  let raf = 0;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;

  const emit = (box: VisualViewportBox) => {
    if (stopped) return;
    if (last && visualViewportBoxesEqual(last, box)) return;
    last = box;
    onBox(box);
  };

  const sample = () => {
    emit(readVisualViewportBox(win));
  };

  const clearTimers = () => {
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
  };

  const scheduleSettlement = () => {
    if (stopped) return;
    sample();
    if (raf) win.cancelAnimationFrame(raf);
    raf = win.requestAnimationFrame(() => {
      raf = 0;
      sample();
    });
    clearTimers();
    for (const ms of delays) {
      if (ms <= 0) continue;
      timers.push(setTimeout(sample, ms));
    }
  };

  scheduleSettlement();
  win.addEventListener('resize', scheduleSettlement);
  win.addEventListener('orientationchange', scheduleSettlement);
  win.visualViewport?.addEventListener('resize', scheduleSettlement);
  win.visualViewport?.addEventListener('scroll', scheduleSettlement);
  const orientation = win.screen?.orientation;
  orientation?.addEventListener?.('change', scheduleSettlement);

  return () => {
    stopped = true;
    if (raf) win.cancelAnimationFrame(raf);
    clearTimers();
    win.removeEventListener('resize', scheduleSettlement);
    win.removeEventListener('orientationchange', scheduleSettlement);
    win.visualViewport?.removeEventListener('resize', scheduleSettlement);
    win.visualViewport?.removeEventListener('scroll', scheduleSettlement);
    orientation?.removeEventListener?.('change', scheduleSettlement);
  };
}
