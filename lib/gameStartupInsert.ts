import { normalizeGameTempo, DEFAULT_GAME_TEMPO } from '@/lib/gameTempo';
import { preStartGameTimingFields } from '@/lib/gameTiming';
import { START_FEN } from '@/lib/startFen';

export type GameRatedOption = { rated?: boolean };

/**
 * Shared startup contract for new `games` rows (see docs §27 Phase 4):
 * - `fen`: canonical `START_FEN` (never literal `'start'`)
 * - `turn`: `'white'`
 * - `status`: `'active'` (open-seat rows keep `black_player_id` null until join)
 * - `last_move_at` / `move_deadline_at`: null via `preStartGameTimingFields()`
 * - `rated`: whether the game should count for rating when the engine runs (default false)
 * - Gameplay still requires both seats filled where applicable (`canPlayMoves` / open-seat solo)
 */
export function openSeatNewGameInsert(whitePlayerId: string, options?: GameRatedOption) {
  const rated = options?.rated === true;
  return {
    white_player_id: whitePlayerId,
    black_player_id: null as null,
    status: 'active' as const,
    fen: START_FEN,
    turn: 'white' as const,
    play_context: 'free' as const,
    rated,
    tempo: normalizeGameTempo(DEFAULT_GAME_TEMPO),
    live_time_control: null as string | null,
    ...preStartGameTimingFields(),
  };
}

export function casualTwoPlayerGameInsert(
  whitePlayerId: string,
  blackPlayerId: string,
  options?: GameRatedOption
) {
  const rated = options?.rated === true;
  return {
    white_player_id: whitePlayerId,
    black_player_id: blackPlayerId,
    status: 'active' as const,
    fen: START_FEN,
    turn: 'white' as const,
    play_context: 'free' as const,
    rated,
    tempo: normalizeGameTempo(DEFAULT_GAME_TEMPO),
    live_time_control: null as string | null,
    ...preStartGameTimingFields(),
  };
}

export function botGameInsert(humanUserId: string, botUserId: string) {
  return {
    white_player_id: humanUserId,
    black_player_id: botUserId,
    status: 'active' as const,
    fen: START_FEN,
    turn: 'white' as const,
    play_context: 'free' as const,
    rated: false,
    source_type: 'bot_game' as const,
    tempo: normalizeGameTempo(DEFAULT_GAME_TEMPO),
    live_time_control: null as string | null,
    ...preStartGameTimingFields(),
  };
}

type ChallengeRequestRow = {
  id: string;
  request_type: string;
  white_player_id: string;
  black_player_id: string;
  /** `open` listings (public join rows) are not the same as private rematches—see Phase 5 audit. */
  visibility?: string | null;
  source_game_id?: string | null;
  tempo?: string | null;
  live_time_control?: string | null;
  rated?: boolean | null;
};

function sourceTypeForAcceptedGame(r: ChallengeRequestRow): string {
  if ((r.visibility ?? '') === 'open') {
    return 'open_listing';
  }
  if (r.request_type === 'challenge') {
    return 'challenge';
  }
  if (r.request_type === 'rematch') {
    return 'rematch_request';
  }
  return 'rematch_request';
}

export type TournamentMatchGameInsertParams = {
  whitePlayerId: string;
  blackPlayerId: string;
  tournamentId: string;
  tempo?: string | null;
  liveTimeControl?: string | null;
  rated?: boolean;
};

/** Mirrors server `tournament_try_spawn_game` row shape for client/tooling parity (DB still spawns in practice). */
export function tournamentMatchGameInsert(p: TournamentMatchGameInsertParams) {
  const rated = p.rated === true;
  return {
    white_player_id: p.whitePlayerId,
    black_player_id: p.blackPlayerId,
    status: 'active' as const,
    fen: START_FEN,
    turn: 'white' as const,
    mode: 'PIT' as const,
    play_context: 'tournament' as const,
    tournament_id: p.tournamentId,
    rated,
    source_type: 'tournament_bracket' as const,
    tempo: normalizeGameTempo(p.tempo ?? DEFAULT_GAME_TEMPO),
    live_time_control: p.liveTimeControl ?? null,
    ...preStartGameTimingFields(),
  };
}

export function gameInsertFromAcceptedChallenge(r: ChallengeRequestRow) {
  const sourceType = sourceTypeForAcceptedGame(r);
  const rated = r.rated === true;
  return {
    white_player_id: r.white_player_id,
    black_player_id: r.black_player_id,
    status: 'active' as const,
    fen: START_FEN,
    turn: 'white' as const,
    play_context: 'free' as const,
    rated,
    source_type: sourceType,
    source_request_id: r.id,
    source_game_id: r.source_game_id ?? null,
    tempo: normalizeGameTempo(r.tempo),
    live_time_control: r.live_time_control ?? null,
    ...preStartGameTimingFields(),
  };
}
