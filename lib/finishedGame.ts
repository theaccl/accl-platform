/**
 * Single source for “this chess row is a completed record” and shared finished-game copy.
 */

export type FinishedGameDisplayFields = {
  status?: string | null;
  result?: string | null;
  end_reason?: string | null;
  white_player_id: string;
  black_player_id?: string | null;
};

export function isGameRecordFinished(g: { status?: string | null }): boolean {
  return String(g.status ?? '').toLowerCase() === 'finished';
}

/** Human-readable finished-game line (game board banner + history cards). */
export function finishedGameResultBannerText(game: FinishedGameDisplayFields): string {
  const r = game.result ?? '';
  const er = (game.end_reason ?? '').trim();

  if (r === 'draw' || r === '1/2-1/2') {
    switch (er) {
      case 'draw_agreement':
        return 'Draw by agreement';
      case 'stalemate':
        return 'Stalemate - Draw';
      case 'insufficient_material':
        return 'Insufficient material - Draw';
      case 'threefold_repetition':
        return 'Threefold repetition - Draw';
      case 'fifty_move':
      case 'fifty_move_rule':
        return 'Fifty-move rule - Draw';
      default:
        return er ? `Draw (${er.replace(/_/g, ' ')})` : 'Draw';
    }
  }

  if (r === 'white_win') {
    switch (er) {
      case 'resign':
        return 'Resignation - White wins';
      case 'checkmate':
        return 'Checkmate - White wins';
      case 'timeout':
        return 'Timeout - White wins';
      default:
        return er ? `White wins (${er.replace(/_/g, ' ')})` : 'White wins';
    }
  }

  if (r === 'black_win') {
    switch (er) {
      case 'resign':
        return 'Resignation - Black wins';
      case 'checkmate':
        return 'Checkmate - Black wins';
      case 'timeout':
        return 'Timeout - Black wins';
      default:
        return er ? `Black wins (${er.replace(/_/g, ' ')})` : 'Black wins';
    }
  }

  if (r && er) {
    return `${r.replace(/_/g, ' ')} — ${er.replace(/_/g, ' ')}`;
  }
  return 'Game over';
}

/** Stable display for raw `end_reason` tokens (snake_case → words). */
export function formatEndReasonLabel(er: string | null | undefined): string {
  const t = (er ?? '').trim();
  if (!t) return '';
  return t.replace(/_/g, ' ');
}

export function formatFinishedAtLocal(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Short line for list cards from the signed-in viewer’s perspective. */
export function viewerOutcomeShortLabel(
  game: FinishedGameDisplayFields,
  viewerUserId: string
): string {
  const r = game.result ?? '';
  if (r === 'draw' || r === '1/2-1/2') return 'Draw';
  const isWhite = game.white_player_id === viewerUserId;
  const isBlack = game.black_player_id === viewerUserId;
  if (!isWhite && !isBlack) return finishedGameResultBannerText(game);
  if (r === 'white_win') return isWhite ? 'You won · White' : 'You lost · White won';
  if (r === 'black_win') return isBlack ? 'You won · Black' : 'You lost · Black won';
  return finishedGameResultBannerText(game);
}

export function opponentUserIdForViewer(
  game: FinishedGameDisplayFields,
  viewerUserId: string
): string | null {
  if (game.white_player_id === viewerUserId) return game.black_player_id ?? null;
  if (game.black_player_id === viewerUserId) return game.white_player_id;
  return null;
}
