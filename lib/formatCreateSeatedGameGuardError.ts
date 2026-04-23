import { FREE_PLAY_QUEUE_BUSY_MESSAGE } from '@/lib/freePlayFindMatch';

/** User-readable text for `create_seated_game_guard` RPC failures (Postgres exception text). */
export function formatCreateSeatedGameGuardError(raw: string | null | undefined): string {
  const m = String(raw ?? '').trim();
  if (!m) return 'Could not complete join. Try again.';
  /** Direct insert path: either listed player may already be in a full active/waiting game (not necessarily “you”). */
  if (/free_play_player_already_seated/i.test(m)) {
    return 'One player in this match is already in another active or waiting free-play game. Wait until they finish or leave that game, then try again.';
  }
  if (/free_play_joiner_busy/i.test(m)) {
    return FREE_PLAY_QUEUE_BUSY_MESSAGE;
  }
  if (/free_play_host_busy/i.test(m)) {
    return 'That host is already in another game. Pick a different open seat or try Find match.';
  }
  if (/seat already taken|join failed \(race\)/i.test(m)) {
    return 'That seat was just taken. Refresh the list and try another game.';
  }
  if (/open seat not found|seat not active|not a free-play open seat/i.test(m)) {
    return 'That open game is no longer available.';
  }
  return m;
}
