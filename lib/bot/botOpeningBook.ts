import { Chess } from 'chess.js';

import type { BotPersonalityStyle } from '@/lib/bot/botPersonalityStyle';

type OpeningEntry = {
  prefix: string[];
  replies: string[];
};

const AGGRESSIVE_D4_ENTRIES: OpeningEntry[] = [
  { prefix: ['d2d4'], replies: ['g8f6', 'd7d5'] },
  { prefix: ['d2d4', 'g8f6', 'c2c4'], replies: ['g7g6', 'e7e6'] },
  { prefix: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3'], replies: ['f8g7'] },
  { prefix: ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3'], replies: ['f8b4'] },
  { prefix: ['d2d4', 'd7d5', 'c2c4'], replies: ['e7e6', 'c7c6'] },
  { prefix: ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3'], replies: ['g8f6'] },
];

function positionKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}

function buildReferenceMap(entries: OpeningEntry[]): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, readonly string[]>();
  for (const entry of entries) {
    const board = new Chess();
    let valid = true;
    for (const move of entry.prefix) {
      try {
        board.move({
          from: move.slice(0, 2),
          to: move.slice(2, 4),
          promotion: (move[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
        });
      } catch {
        valid = false;
        break;
      }
    }
    if (valid) map.set(positionKey(board.fen()), entry.replies);
  }
  return map;
}

const AGGRESSIVE_D4_REFERENCE = buildReferenceMap(AGGRESSIVE_D4_ENTRIES);

/**
 * Server-side bot prior only. It is not opening advice and never overrides legality or engine truth.
 */
export function botOpeningReferenceMoves(
  fen: string,
  style: BotPersonalityStyle,
): readonly string[] {
  if (style !== 'aggressive') return [];
  return AGGRESSIVE_D4_REFERENCE.get(positionKey(fen)) ?? [];
}
