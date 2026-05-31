'use client';

import { useEffect, useRef } from 'react';
import { liveClockUrgencyBand } from '@/lib/liveClockDisplay';
import {
  createLowTimeAudioContext,
  type LowTimeSoundPressureMode,
  playLowTimeSoundPulse,
  shouldPlayLowTimeSoundPulse,
} from '@/lib/liveClockLowTimeSound';

const CADENCE_CHECK_MS = 200;

export type UseLiveClockLowTimeSoundArgs = {
  enabled: boolean;
  /** Viewer seated with own clock in Stage 1/2/3. */
  applies: boolean;
  getViewerOwnRemainingMs: () => number | null;
  isViewerClockRunning: () => boolean;
};

/**
 * Cadence-driven low-time heartbeat audio (not per-render).
 */
export function useLiveClockLowTimeSound({
  enabled,
  applies,
  getViewerOwnRemainingMs,
  isViewerClockRunning,
}: UseLiveClockLowTimeSoundArgs): void {
  const getRemainingRef = useRef(getViewerOwnRemainingMs);
  getRemainingRef.current = getViewerOwnRemainingMs;
  const isRunningRef = useRef(isViewerClockRunning);
  isRunningRef.current = isViewerClockRunning;

  const audioCtxRef = useRef<AudioContext | null>(null);
  const pulseStateRef = useRef({
    lastPulseAtMs: 0,
    lastBand: 'normal' as ReturnType<typeof liveClockUrgencyBand> | 'normal',
    lastMode: 'waiting' as LowTimeSoundPressureMode,
  });

  useEffect(() => {
    if (!enabled) {
      pulseStateRef.current = { lastPulseAtMs: 0, lastBand: 'normal', lastMode: 'waiting' };
      return;
    }
    const unlock = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = createLowTimeAudioContext();
      }
      void audioCtxRef.current?.resume();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !applies) {
      pulseStateRef.current = { lastPulseAtMs: 0, lastBand: 'normal', lastMode: 'waiting' };
      return;
    }

    const id = window.setInterval(() => {
      const remainingMs = getRemainingRef.current();
      if (remainingMs == null) return;
      const band = liveClockUrgencyBand(remainingMs);
      const mode: LowTimeSoundPressureMode = isRunningRef.current() ? 'running' : 'waiting';
      const nowMs = Date.now();
      const state = pulseStateRef.current;
      if (
        shouldPlayLowTimeSoundPulse(
          { nowMs, band, enabled: true, applies: true, mode },
          state,
        )
      ) {
        if (!audioCtxRef.current) {
          audioCtxRef.current = createLowTimeAudioContext();
        }
        playLowTimeSoundPulse(band, audioCtxRef.current);
        pulseStateRef.current = { lastPulseAtMs: nowMs, lastBand: band, lastMode: mode };
      } else if (band === 'normal') {
        pulseStateRef.current = { lastPulseAtMs: 0, lastBand: 'normal', lastMode: 'waiting' };
      }
    }, CADENCE_CHECK_MS);

    return () => window.clearInterval(id);
  }, [enabled, applies]);
}
