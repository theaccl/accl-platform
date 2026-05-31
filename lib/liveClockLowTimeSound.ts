/**
 * Low-time clock sound (presentation only). Cadence-driven — not tied to render ticks.
 */

import {
  liveClockUrgencyBand,
  type ClockUrgencyBand,
} from '@/lib/liveClockDisplay';

export const LOW_TIME_SOUND_STORAGE_KEY = 'accl-live-low-time-sound';

export function readLowTimeSoundEnabled(): boolean {
  if (typeof window === 'undefined') return LOW_TIME_SOUND_DEFAULT_ENABLED;
  const stored = window.localStorage.getItem(LOW_TIME_SOUND_STORAGE_KEY);
  if (stored === 'off') return false;
  if (stored === 'on') return true;
  return LOW_TIME_SOUND_DEFAULT_ENABLED;
}

export function writeLowTimeSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOW_TIME_SOUND_STORAGE_KEY, enabled ? 'on' : 'off');
}

/** Default: on — part of the private pressure package; mute via toggle persists 'off'. */
export const LOW_TIME_SOUND_DEFAULT_ENABLED = true;

/** Peak gain per stage (Web Audio envelope). Escalates softly → urgent, not harsh. */
export const LOW_TIME_SOUND_PEAK_GAIN: Record<Exclude<ClockUrgencyBand, 'normal'>, number> = {
  'stage-1': 0.11,
  'stage-2': 0.18,
  'stage-3': 0.26,
};

export type LowTimeSoundPressureMode = 'running' | 'waiting';

const RUNNING_CADENCE_MS: Record<Exclude<ClockUrgencyBand, 'normal'>, number> = {
  'stage-1': 1200,
  'stage-2': 750,
  'stage-3': 450,
};

/** Viewer-owned heartbeat cadence; waiting uses a slower atmospheric interval. */
export function lowTimeSoundCadenceMs(
  band: ClockUrgencyBand,
  mode: LowTimeSoundPressureMode = 'running',
): number | null {
  if (band === 'normal') return null;
  const running = RUNNING_CADENCE_MS[band];
  if (mode === 'running') return running;
  return Math.round(running * 1.55);
}

/** True when seated viewer's own clock is in a low-time stage (any turn). */
export function lowTimeSoundAppliesForViewer(
  viewerOwnRemainingMs: number | null,
  isLive: boolean,
): boolean {
  if (!isLive || viewerOwnRemainingMs == null) return false;
  return liveClockUrgencyBand(viewerOwnRemainingMs) !== 'normal';
}

export type LowTimeSoundTickInput = {
  nowMs: number;
  band: ClockUrgencyBand;
  enabled: boolean;
  applies: boolean;
  mode: LowTimeSoundPressureMode;
};

/**
 * Returns whether a heartbeat pulse should fire on this cadence check.
 * Call from a fixed interval (e.g. 200ms), not from React render.
 */
export function shouldPlayLowTimeSoundPulse(
  input: LowTimeSoundTickInput,
  state: {
    lastPulseAtMs: number;
    lastBand: ClockUrgencyBand | 'normal';
    lastMode?: LowTimeSoundPressureMode;
  },
): boolean {
  const { nowMs, band, enabled, applies, mode } = input;
  if (!enabled || !applies || band === 'normal') return false;
  const cadence = lowTimeSoundCadenceMs(band, mode);
  if (cadence == null) return false;
  if (band !== state.lastBand || mode !== state.lastMode) return true;
  return nowMs - state.lastPulseAtMs >= cadence;
}

export function playLowTimeSoundPulse(band: ClockUrgencyBand, audioContext: AudioContext | null): void {
  if (!audioContext || band === 'normal') return;
  try {
    if (audioContext.state === 'suspended') {
      void audioContext.resume();
    }
    const t0 = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const baseFreq = band === 'stage-1' ? 92 : band === 'stage-2' ? 108 : 124;
    const peakGain = LOW_TIME_SOUND_PEAK_GAIN[band];
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, t0);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.82, t0 + 0.08);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(t0);
    osc.stop(t0 + 0.16);
  } catch {
    /* ignore autoplay / context errors */
  }
}

export function createLowTimeAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    return new Ctx();
  } catch {
    return null;
  }
}
