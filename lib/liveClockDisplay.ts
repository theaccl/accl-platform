/**
 * Live/daily game-board clock presentation (display only — not clock authority).
 * Authority remains server `white_clock_ms` / `black_clock_ms` + `last_move_at` elapsed model.
 */

export type ClockUrgencyBand = 'normal' | 'stage-1' | 'stage-2' | 'stage-3';

const FINAL_MINUTE_MS = 60_000;
const STAGE_2_MS = 30_000;
const STAGE_3_MS = 10_000;

/** Fixed slot width for longest live form: 0:10.00 / 0:09.99 */
export const LIVE_CLOCK_DIGIT_MIN_CH = '6.5ch';

/**
 * Format remaining milliseconds for live clocks.
 * Above one minute: M:SS (e.g. 1:01).
 * 60s down to above 10s: M:SS.t tenths (e.g. 0:10.1).
 * 10s to 0: M:SS.hh hundredths (e.g. 0:10.00 → 0:09.99).
 */
export function formatLiveClock(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  if (safe > FINAL_MINUTE_MS) {
    const totalSec = Math.floor(safe / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  if (safe > STAGE_3_MS) {
    const totalTenths = Math.floor(safe / 100);
    const min = Math.floor(totalTenths / 600);
    const sec = Math.floor((totalTenths % 600) / 10);
    const tenth = totalTenths % 10;
    return `${min}:${String(sec).padStart(2, '0')}.${tenth}`;
  }

  const totalHundredths = Math.floor(safe / 10);
  const min = Math.floor(totalHundredths / 6000);
  const sec = Math.floor((totalHundredths % 6000) / 100);
  const hundredth = totalHundredths % 100;
  return `${min}:${String(sec).padStart(2, '0')}.${String(hundredth).padStart(2, '0')}`;
}

export function liveClockUrgencyBand(ms: number): ClockUrgencyBand {
  const safe = Math.max(0, ms);
  if (safe > FINAL_MINUTE_MS) return 'normal';
  if (safe > STAGE_2_MS) return 'stage-1';
  if (safe > STAGE_3_MS) return 'stage-2';
  return 'stage-3';
}

/**
 * Layer 1 — persistent private pressure on this device for the viewer's own clock side.
 * Does not require the clock to be actively draining.
 */
export function shouldShowViewerImmersivePressure(
  viewerColor: 'white' | 'black' | null,
  side: 'white' | 'black',
  remainingMs: number,
  isLive: boolean,
): boolean {
  if (!isLive || viewerColor !== side) return false;
  return liveClockUrgencyBand(remainingMs) !== 'normal';
}

/**
 * Layer 2 — running-clock accent when the viewer's own clock is actively draining.
 */
export function viewerPressureRunningAccent(
  viewerColor: 'white' | 'black' | null,
  side: 'white' | 'black',
  activeTurn: 'white' | 'black' | null,
): boolean {
  if (!viewerColor || activeTurn == null) return false;
  return viewerColor === side && activeTurn === side;
}

export function viewerImmersivePressureBand(
  viewerColor: 'white' | 'black' | null,
  side: 'white' | 'black',
  remainingMs: number,
  isLive: boolean,
): ClockUrgencyBand | null {
  if (!shouldShowViewerImmersivePressure(viewerColor, side, remainingMs, isLive)) return null;
  return liveClockUrgencyBand(remainingMs);
}

export function isLiveClockFinalMinute(ms: number): boolean {
  return Math.max(0, ms) <= FINAL_MINUTE_MS;
}

export function isLiveClockStage3(ms: number): boolean {
  const safe = Math.max(0, ms);
  return safe <= STAGE_3_MS;
}

/** Presentation tick interval for client interpolation (not clock authority). */
export function liveClockPresentationTickMs(remainingMs: number | null): number {
  if (remainingMs == null || remainingMs > FINAL_MINUTE_MS) return 1000;
  if (remainingMs > STAGE_3_MS) return 100;
  return 10;
}
