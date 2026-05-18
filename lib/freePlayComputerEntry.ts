import {
  isValidPlatTimeForMode,
  PLAT_MODE_TIME_OPTIONS,
  type PlatMode,
} from '@/lib/freePlayModeTimeControl';

/** Live PLAT modes that expose in-room Play Computer (not Daily). */
export const COMPUTER_PLAY_PLAT_MODES = ['bullet', 'blitz', 'rapid'] as const;

export type ComputerPlayPlatMode = (typeof COMPUTER_PLAY_PLAT_MODES)[number];

export function isComputerPlayPlatMode(mode: string): mode is ComputerPlayPlatMode {
  return (COMPUTER_PLAY_PLAT_MODES as readonly string[]).includes(mode);
}

export function isValidComputerPlayTimeControl(mode: ComputerPlayPlatMode, clock: string): boolean {
  return isValidPlatTimeForMode(mode, clock);
}

/** Legal clocks for mode-scoped computer starts (bullet / blitz / rapid only). */
export function allComputerPlayTimeControlIds(): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const m of COMPUTER_PLAY_PLAT_MODES) {
    for (const o of PLAT_MODE_TIME_OPTIONS[m]) {
      ids.add(o.id);
    }
  }
  return ids;
}

export function normalizeComputerPlayPlatMode(raw: unknown): ComputerPlayPlatMode | null {
  const s = String(raw ?? '').trim().toLowerCase();
  return isComputerPlayPlatMode(s) ? s : null;
}

export function resolveComputerPlayLiveTimeControl(args: {
  platMode: ComputerPlayPlatMode | null;
  liveTimeControl: string | null;
}): { ok: true; liveTimeControl: string } | { ok: false } {
  const tc = String(args.liveTimeControl ?? '').trim();
  if (!tc) return { ok: false };
  if (args.platMode) {
    if (!isValidComputerPlayTimeControl(args.platMode, tc)) return { ok: false };
    return { ok: true, liveTimeControl: tc };
  }
  if (allComputerPlayTimeControlIds().has(tc)) return { ok: true, liveTimeControl: tc };
  if (['3m', '5m', '10m'].includes(tc)) return { ok: true, liveTimeControl: tc };
  return { ok: false };
}

export function platModeExposesComputerPlay(mode: PlatMode): mode is ComputerPlayPlatMode {
  return isComputerPlayPlatMode(mode);
}
