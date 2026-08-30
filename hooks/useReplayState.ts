'use client';

import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { lastMoveMatchesAuthoritativePosition } from '@/lib/coherentGamePresentation';
import { selectReplayHighlight } from '@/lib/replay/selectReplayHighlight';

export type MoveLogRow = {
  san: string;
  fen_before?: string | null;
  fen_after?: string | null;
  created_at?: string;
  from_sq?: string | null;
  to_sq?: string | null;
};

export type ReplayPairedRow = { num: number; white: string; black?: string };

const DEFAULT_REPLAY_INTERVAL_MS = 850;

function replayFenAtStep(step: number, moveLogs: MoveLogRow[], startFen: string): string {
  if (step <= 0) return startFen;
  const n = Math.min(step, moveLogs.length);
  const last = moveLogs[n - 1];
  if (last?.fen_after) return last.fen_after;
  const c = new Chess();
  try {
    c.load(startFen);
  } catch {
    // keep default position
  }
  for (let i = 0; i < n; i++) {
    const log = moveLogs[i]!;
    try {
      const from = log.from_sq?.trim();
      const to = log.to_sq?.trim();
      if (from && to) {
        c.move({ from: from as Square, to: to as Square });
      } else {
        c.move(log.san);
      }
    } catch {
      break;
    }
  }
  return c.fen();
}

function squareStylesForLastMove(m: MoveLogRow | undefined): Record<string, CSSProperties> {
  if (!m) return {};
  const from = m.from_sq?.trim();
  const to = m.to_sq?.trim();
  const out: Record<string, CSSProperties> = {};
  if (from) out[from] = { background: 'rgba(255, 180, 60, 0.35)' };
  if (to) out[to] = { background: 'rgba(255, 180, 60, 0.35)' };
  return out;
}

export function useReplayState(
  sanForDisplay: (m: MoveLogRow) => string,
  startFen: string,
  authoritativeFen?: string | null,
  enforceAuthoritativeCoherence = true,
  replayIntervalMs = DEFAULT_REPLAY_INTERVAL_MS
) {
  const [moveLogs, setMoveLogs] = useState<MoveLogRow[]>([]);
  const [replayStep, setReplayStepState] = useState<number | null>(null);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);

  const setReplayStep = useCallback<Dispatch<SetStateAction<number | null>>>((nextStep) => {
    setIsReplayPlaying(false);
    setReplayStepState(nextStep);
  }, []);

  const toggleReplayPlayback = useCallback(() => {
    if (isReplayPlaying) {
      setIsReplayPlaying(false);
      return;
    }
    if (moveLogs.length === 0) return;
    setReplayStepState((current) =>
      current === null || current >= moveLogs.length ? 0 : current
    );
    setIsReplayPlaying(true);
  }, [isReplayPlaying, moveLogs.length]);

  useEffect(() => {
    if (!isReplayPlaying || moveLogs.length === 0 || replayStep === null || replayStep >= moveLogs.length) return;

    const timeout = window.setTimeout(() => {
      const next = Math.min(moveLogs.length, replayStep + 1);
      setReplayStepState(next);
      if (next >= moveLogs.length) setIsReplayPlaying(false);
    }, replayIntervalMs);

    return () => window.clearTimeout(timeout);
  }, [isReplayPlaying, moveLogs.length, replayIntervalMs, replayStep]);

  const pairedRows = useMemo((): ReplayPairedRow[] => {
    if (moveLogs.length === 0) return [];
    const rows: ReplayPairedRow[] = [];
    let i = 0;
    let num = 1;
    while (i < moveLogs.length) {
      const white = sanForDisplay(moveLogs[i]!);
      if (i + 1 < moveLogs.length) {
        rows.push({ num: num++, white, black: sanForDisplay(moveLogs[i + 1]!) });
        i += 2;
      } else {
        rows.push({ num: num++, white, black: undefined });
        i += 1;
      }
    }
    return rows;
  }, [moveLogs, sanForDisplay]);

  const boardPosition = useMemo((): string | null => {
    if (replayStep === null) return null;
    if (moveLogs.length === 0) return startFen;
    return replayFenAtStep(replayStep, moveLogs, startFen);
  }, [replayStep, moveLogs, startFen]);

  const lastMoveSquareStyles = useMemo(() => {
    const selected = selectReplayHighlight(moveLogs, replayStep);
    if (replayStep !== null) {
      return squareStylesForLastMove(selected.move);
    }
    const lastMove = selected.move;
    if (
      enforceAuthoritativeCoherence &&
      authoritativeFen != null &&
      !lastMoveMatchesAuthoritativePosition(lastMove, authoritativeFen)
    ) {
      return {} as Record<string, CSSProperties>;
    }
    return squareStylesForLastMove(lastMove);
  }, [authoritativeFen, enforceAuthoritativeCoherence, moveLogs, replayStep]);

  return {
    moveLogs,
    setMoveLogs,
    replayStep,
    setReplayStep,
    isReplayPlaying,
    toggleReplayPlayback,
    pairedRows,
    boardPosition,
    lastMoveSquareStyles,
  };
}
