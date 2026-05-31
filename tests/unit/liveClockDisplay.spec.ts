import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LIVE_CLOCK_DIGIT_MIN_CH,
  formatLiveClock,
  isLiveClockFinalMinute,
  isLiveClockStage3,
  liveClockPresentationTickMs,
  liveClockUrgencyBand,
  shouldShowViewerImmersivePressure,
  viewerImmersivePressureBand,
  viewerPressureRunningAccent,
} from '@/lib/liveClockDisplay';
import {
  LOW_TIME_SOUND_DEFAULT_ENABLED,
  LOW_TIME_SOUND_PEAK_GAIN,
  LOW_TIME_SOUND_STORAGE_KEY,
  lowTimeSoundAppliesForViewer,
  lowTimeSoundCadenceMs,
  readLowTimeSoundEnabled,
  shouldPlayLowTimeSoundPulse,
} from '@/lib/liveClockLowTimeSound';

test.describe('formatLiveClock', () => {
  test('precision bands at exact doctrine thresholds', () => {
    expect(formatLiveClock(61_000)).toBe('1:01');
    expect(formatLiveClock(60_000)).toBe('1:00.0');
    expect(formatLiveClock(59_900)).toBe('0:59.9');
    expect(formatLiveClock(30_000)).toBe('0:30.0');
    expect(formatLiveClock(29_900)).toBe('0:29.9');
    expect(formatLiveClock(10_100)).toBe('0:10.1');
    expect(formatLiveClock(10_000)).toBe('0:10.00');
    expect(formatLiveClock(9_990)).toBe('0:09.99');
    expect(formatLiveClock(9_980)).toBe('0:09.98');
    expect(formatLiveClock(100)).toBe('0:00.10');
    expect(formatLiveClock(10)).toBe('0:00.01');
    expect(formatLiveClock(0)).toBe('0:00.00');
  });

  test('negative values clamp safely to 0:00.00', () => {
    expect(formatLiveClock(-500)).toBe('0:00.00');
  });
});

test.describe('shouldShowViewerImmersivePressure (layer 1 — persistent)', () => {
  test('viewer own low clock gets private pressure on viewer turn', () => {
    expect(
      shouldShowViewerImmersivePressure('white', 'white', 9_000, true),
    ).toBe(true);
  });

  test('viewer own low clock retains private pressure while opponent is moving', () => {
    expect(
      shouldShowViewerImmersivePressure('white', 'white', 9_000, true),
    ).toBe(true);
    expect(
      shouldShowViewerImmersivePressure('black', 'black', 5_000, true),
    ).toBe(true);
  });

  test('pressure layer persists independently of sideActive', () => {
    expect(
      shouldShowViewerImmersivePressure('white', 'white', 9_000, true),
    ).toBe(true);
    expect(viewerImmersivePressureBand('white', 'white', 9_000, true)).toBe('stage-3');
  });

  test('opponent low clock never receives immersive classes on viewer device', () => {
    expect(
      shouldShowViewerImmersivePressure('white', 'black', 9_000, true),
    ).toBe(false);
    expect(
      shouldShowViewerImmersivePressure('black', 'white', 9_000, true),
    ).toBe(false);
  });

  test('spectator and public viewer see numerical clocks only', () => {
    expect(
      shouldShowViewerImmersivePressure(null, 'white', 9_000, true),
    ).toBe(false);
    expect(
      shouldShowViewerImmersivePressure(null, 'black', 5_000, true),
    ).toBe(false);
  });

  test('correspondence never receives immersive pressure', () => {
    expect(
      shouldShowViewerImmersivePressure('white', 'white', 9_000, false),
    ).toBe(false);
  });

  test('above final minute is numerical only', () => {
    expect(
      shouldShowViewerImmersivePressure('white', 'white', 61_000, true),
    ).toBe(false);
  });

  test('both seated players can independently qualify on their own devices', () => {
    expect(
      shouldShowViewerImmersivePressure('white', 'white', 5_000, true),
    ).toBe(true);
    expect(
      shouldShowViewerImmersivePressure('black', 'black', 5_000, true),
    ).toBe(true);
  });
});

test.describe('viewerPressureRunningAccent (layer 2 — draining)', () => {
  test('running-clock accent applies only when viewer own side is active', () => {
    expect(viewerPressureRunningAccent('white', 'white', 'white')).toBe(true);
    expect(viewerPressureRunningAccent('white', 'white', 'black')).toBe(false);
    expect(viewerPressureRunningAccent('white', 'black', 'white')).toBe(false);
    expect(viewerPressureRunningAccent('black', 'black', 'black')).toBe(true);
    expect(viewerPressureRunningAccent(null, 'white', 'white')).toBe(false);
    expect(viewerPressureRunningAccent('white', 'white', null)).toBe(false);
  });

  test('accent is independent of remaining time stage', () => {
    expect(viewerPressureRunningAccent('white', 'white', 'white')).toBe(true);
    expect(viewerPressureRunningAccent('white', 'white', 'black')).toBe(false);
  });
});

test.describe('liveClockUrgencyBand', () => {
  test('urgency bands at exact doctrine thresholds', () => {
    expect(liveClockUrgencyBand(60_001)).toBe('normal');
    expect(liveClockUrgencyBand(60_000)).toBe('stage-1');
    expect(liveClockUrgencyBand(30_001)).toBe('stage-1');
    expect(liveClockUrgencyBand(30_000)).toBe('stage-2');
    expect(liveClockUrgencyBand(10_001)).toBe('stage-2');
    expect(liveClockUrgencyBand(10_000)).toBe('stage-3');
    expect(liveClockUrgencyBand(9_999)).toBe('stage-3');
    expect(liveClockUrgencyBand(0)).toBe('stage-3');
  });

  test('presentation tick cadence by remaining time', () => {
    expect(liveClockPresentationTickMs(61_000)).toBe(1000);
    expect(liveClockPresentationTickMs(60_000)).toBe(100);
    expect(liveClockPresentationTickMs(10_001)).toBe(100);
    expect(liveClockPresentationTickMs(10_000)).toBe(10);
    expect(liveClockPresentationTickMs(9_999)).toBe(10);
    expect(isLiveClockFinalMinute(60_000)).toBe(true);
    expect(isLiveClockStage3(10_000)).toBe(true);
    expect(isLiveClockStage3(10_001)).toBe(false);
  });
});

test.describe('liveClockLowTimeSound', () => {
  test('heartbeat preference defaults on; explicit off persists mute', () => {
    expect(LOW_TIME_SOUND_DEFAULT_ENABLED).toBe(true);
    expect(readLowTimeSoundEnabled()).toBe(true);
    expect(LOW_TIME_SOUND_STORAGE_KEY).toBe('accl-live-low-time-sound');
  });

  test('Stage 1 / 2 / 3 peak gains escalate in a controlled manner', () => {
    expect(LOW_TIME_SOUND_PEAK_GAIN['stage-1']).toBeLessThan(LOW_TIME_SOUND_PEAK_GAIN['stage-2']);
    expect(LOW_TIME_SOUND_PEAK_GAIN['stage-2']).toBeLessThan(LOW_TIME_SOUND_PEAK_GAIN['stage-3']);
    expect(LOW_TIME_SOUND_PEAK_GAIN['stage-1']).toBeGreaterThan(0.08);
    expect(LOW_TIME_SOUND_PEAK_GAIN['stage-3']).toBeLessThan(0.35);
  });

  test('mute toggle disables cadence immediately via enabled flag', () => {
    expect(
      shouldPlayLowTimeSoundPulse(
        { nowMs: 5000, band: 'stage-3', enabled: false, applies: true, mode: 'running' },
        { lastPulseAtMs: 0, lastBand: 'normal' },
      ),
    ).toBe(false);
    expect(
      shouldPlayLowTimeSoundPulse(
        { nowMs: 5000, band: 'stage-3', enabled: true, applies: true, mode: 'running' },
        { lastPulseAtMs: 0, lastBand: 'normal' },
      ),
    ).toBe(true);
  });

  test('viewer own low clock applies audio on any turn', () => {
    expect(lowTimeSoundAppliesForViewer(9_000, true)).toBe(true);
    expect(lowTimeSoundAppliesForViewer(61_000, true)).toBe(false);
    expect(lowTimeSoundAppliesForViewer(9_000, false)).toBe(false);
    expect(lowTimeSoundAppliesForViewer(null, true)).toBe(false);
  });

  test('opponent low clock never triggers viewer audio via applies helper', () => {
    expect(lowTimeSoundAppliesForViewer(9_000, true)).toBe(true);
    expect(lowTimeSoundAppliesForViewer(9_000, false)).toBe(false);
  });

  test('cadence gates pulses — not every render tick', () => {
    const state = { lastPulseAtMs: 1000, lastBand: 'stage-2' as const, lastMode: 'running' as const };
    expect(
      shouldPlayLowTimeSoundPulse(
        { nowMs: 1100, band: 'stage-2', enabled: true, applies: true, mode: 'running' },
        state,
      ),
    ).toBe(false);
    expect(
      shouldPlayLowTimeSoundPulse(
        {
          nowMs: 1000 + (lowTimeSoundCadenceMs('stage-2', 'running') ?? 0),
          band: 'stage-2',
          enabled: true,
          applies: true,
          mode: 'running',
        },
        state,
      ),
    ).toBe(true);
  });

  test('viewer own waiting pressure uses slower retained cadence', () => {
    const running = lowTimeSoundCadenceMs('stage-3', 'running')!;
    const waiting = lowTimeSoundCadenceMs('stage-3', 'waiting')!;
    expect(waiting).toBeGreaterThan(running);
    expect(
      shouldPlayLowTimeSoundPulse(
        { nowMs: 5000, band: 'stage-3', enabled: true, applies: true, mode: 'waiting' },
        { lastPulseAtMs: 0, lastBand: 'normal', lastMode: 'waiting' },
      ),
    ).toBe(true);
  });

  test('stage cadence increases toward stage-3', () => {
    expect(lowTimeSoundCadenceMs('stage-1')).toBeGreaterThan(lowTimeSoundCadenceMs('stage-3')!);
    expect(lowTimeSoundCadenceMs('stage-2')).toBeGreaterThan(lowTimeSoundCadenceMs('stage-3')!);
  });
});

test.describe('live clock presentation wiring (static)', () => {
  test('game page uses shared formatter and urgency bands', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');
    expect(page).toContain("from '@/lib/liveClockDisplay'");
    expect(page).toContain('formatLiveClock');
    expect(page).toContain('liveClockPresentationTickMs');
    expect(page).toContain('FinishedGameRatingSummary');
    expect(page).toContain("'clock-white-digit'");
    expect(page).toContain('shouldShowViewerImmersivePressure');
    expect(page).toContain('viewerPressureRunningAccent');
    expect(page).toContain('data-clock-immersive-pressure');
    expect(page).toContain('data-clock-running-accent');
    expect(page).toContain('viewerColor={isPublicViewer ? null : myColor}');
    expect(page).toContain('useLiveClockLowTimeSound');
    expect(page).toContain('data-testid="clock-low-time-sound-toggle"');
  });

  test('CSS defines staged heartbeat radiance and reduced-motion fallback', () => {
    const css = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');
    expect(css).toContain('@keyframes accl-clock-heartbeat-stage-1');
    expect(css).toContain('.accl-game-clock-face--urgency-stage-3');
    expect(css).toContain('.accl-game-clock-face--running-accent');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('.accl-game-clock-digit-slot');
    expect(css).toContain('font-variant-numeric: tabular-nums');
    expect(css).toContain('min-width: 6.5ch');
    expect(css).toContain(LIVE_CLOCK_DIGIT_MIN_CH);
  });

  test('presentation tick uses viewer own remaining for staged intervals', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');
    expect(page).toContain('liveClockPresentationTickMs');
    expect(page).toContain('liveViewerOwnRemainingForPresentation');
    expect(page).toContain('liveViewerSideRemainingMsForPresentation');
  });

  test('immersive pressure is viewer-owned by remaining time not sideActive', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');
    expect(page).toContain('showImmersivePressure = shouldShowViewerImmersivePressure');
    expect(page).toContain('data-clock-viewer-owned');
    expect(page).not.toContain('showUrgencyPulse');
    const helperSrc = readFileSync(join(process.cwd(), 'lib', 'liveClockDisplay.ts'), 'utf8');
    const immersiveFn = helperSrc.match(
      /export function shouldShowViewerImmersivePressure\([\s\S]*?\n\}/,
    )?.[0];
    expect(immersiveFn).toBeTruthy();
    expect(immersiveFn).not.toContain('sideActive');
  });

  test('heartbeat audio is viewer-owned low time not opponent turn gate', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');
    expect(page).toContain('lowTimeSoundAppliesForViewer');
    expect(page).toContain('getViewerOwnRemainingMs');
    expect(page).toContain('isViewerClockRunning');
    const appliesBlock = page.match(
      /const lowTimeSoundApplies = useMemo\([\s\S]*?\}, \[game, myColor, clockNowMs\]\);/,
    )?.[0];
    expect(appliesBlock).toBeTruthy();
    expect(appliesBlock).not.toContain('displayClockTurn(game.turn) === myColor');
  });

  test('sound hook uses cadence interval not render', () => {
    const hook = readFileSync(join(process.cwd(), 'hooks', 'useLiveClockLowTimeSound.ts'), 'utf8');
    expect(hook).toContain('CADENCE_CHECK_MS');
    expect(hook).toMatch(/setInterval\([\s\S]*shouldPlayLowTimeSoundPulse/);
    expect(hook).toMatch(/setInterval\([\s\S]*playLowTimeSoundPulse/);
    expect(hook).toContain('isViewerClockRunning');
  });

  test('autoplay-safe gesture arms AudioContext after pointer or keyboard', () => {
    const hook = readFileSync(join(process.cwd(), 'hooks', 'useLiveClockLowTimeSound.ts'), 'utf8');
    expect(hook).toContain("addEventListener('pointerdown', unlock");
    expect(hook).toContain("addEventListener('keydown', unlock");
    expect(hook).toContain('.resume()');
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');
    expect(page).toContain('writeLowTimeSoundEnabled');
    expect(page).toContain('Heartbeat sound');
    expect(page).toContain('LOW_TIME_SOUND_DEFAULT_ENABLED');
  });

  test('desktop and mobile share the same DigitalChessClock component', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');
    expect(page).toContain('function DigitalChessClock');
    expect(page).toContain('accl-game-clock--play-hud');
    const css = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');
    expect(css).toContain('.accl-game-active-hud .accl-game-clock--play-hud');
    expect(css).toContain('@media (max-width: 768px)');
  });
});
