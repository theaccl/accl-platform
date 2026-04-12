'use client';

import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';

export type MoveLogRow = {
  san: string;
  fen_before?: string | null;
  fen_after?: string | null;
  created_at?: string;
  from_sq?: string | null;
  to_sq?: string | null;
};

export type ReplayPairedRow = { num: number; white: string; black?: string };

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
  startFen: string
) {
  const [moveLogs, setMoveLogs] = useState<MoveLogRow[]>([]);
  const [replayStep, setReplayStep] = useState<number | null>(null);

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
    if (moveLogs.length === 0) {
      return {} as Record<string, CSSProperties>;
    }
    if (replayStep !== null) {
      if (replayStep <= 0) {
        return {} as Record<string, CSSProperties>;
      }
      const idx = Math.min(replayStep, moveLogs.length) - 1;
      if (idx < 0) {
        return {} as Record<string, CSSProperties>;
      }
      return squareStylesForLastMove(moveLogs[idx]);
    }
    return squareStylesForLastMove(moveLogs[moveLogs.length - 1]);
  }, [moveLogs, replayStep]);

  return {
    moveLogs,
    setMoveLogs,
    replayStep,
    setReplayStep,
    pairedRows,
    boardPosition,
    lastMoveSquareStyles,
  };
}
