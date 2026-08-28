import {
  ACTIVE_GAME_CLASSIFICATION_KINDS,
  type AuthoritativeGameSnapshot,
  type GameClassification,
  type ServerGameSurface,
  type UntrustedCallerAuthorizationInput,
} from './types';

export type ClassifyAuthoritativeGameInput = {
  game: AuthoritativeGameSnapshot | null;
  gameExpected?: boolean;
  serverSurface?: ServerGameSurface;
  nowMs?: number;
  maxAgeMs?: number;
  /** Ignored for authorization. Present so tests can prove anti-spoofing. */
  untrustedCaller?: UntrustedCallerAuthorizationInput;
};

function norm(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function hasBotSettings(value: unknown): boolean {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isContradictory(game: AuthoritativeGameSnapshot): boolean {
  if (!String(game.id ?? '').trim()) return true;
  const playContext = norm(game.play_context);
  const source = norm(game.source_type);
  const hasTournament = Boolean(String(game.tournament_id ?? '').trim());
  if (playContext === 'tournament' && !hasTournament) return true;
  if (playContext === 'free' && hasTournament) return true;
  if (source === 'bot_game' && hasTournament) return true;
  if (source === 'bot_ladder' && hasTournament) return true;
  if (source === 'asi_arena' && hasTournament) return true;
  if (source === 'asi_arena' && hasBotSettings(game.bot_settings)) return true;
  return false;
}

export function isActiveGameClassification(classification: GameClassification): boolean {
  return (ACTIVE_GAME_CLASSIFICATION_KINDS as readonly string[]).includes(classification.kind);
}

export function isHumanLiveOrCorrespondenceClassification(classification: GameClassification): boolean {
  return (
    classification.kind === 'human-live-active' ||
    classification.kind === 'human-correspondence-active' ||
    classification.kind === 'human-daily-active'
  );
}

/**
 * Server-derived Slice 1 classification. Caller gameType/mode/completed/classification
 * fields are untrusted and never unlock a class.
 *
 * Missing game while a game was expected, stale snapshots, contradictory columns,
 * and unrecognized status fail closed as `unresolved`.
 */
export function classifyAuthoritativeGame(input: ClassifyAuthoritativeGameInput): GameClassification {
  void input.untrustedCaller;
  const surface = input.serverSurface ?? 'none';

  if (input.gameExpected && !input.game) {
    return { kind: 'unresolved', reason: 'missing' };
  }

  if (!input.game) {
    if (surface === 'trainer-sandbox') return { kind: 'training-sandbox' };
    return { kind: 'none' };
  }

  const game = input.game;
  const nowMs = input.nowMs ?? Date.now();
  if (game.stale === true) return { kind: 'unresolved', reason: 'stale' };
  if (typeof game.observedAtMs === 'number' && typeof input.maxAgeMs === 'number') {
    if (nowMs - game.observedAtMs > input.maxAgeMs) return { kind: 'unresolved', reason: 'stale' };
  }

  if (isContradictory(game)) return { kind: 'unresolved', reason: 'contradictory' };

  const status = norm(game.status);
  if (status !== 'waiting' && status !== 'active' && status !== 'finished') {
    return { kind: 'unresolved', reason: 'unrecognized' };
  }

  if (status === 'finished') return { kind: 'completed' };

  const source = norm(game.source_type);
  if (source === 'asi_arena') return { kind: 'asi-arena-active' };
  if (source === 'bot_ladder') return { kind: 'bot-ladder-active' };
  if (source === 'bot_game') return { kind: 'play-computer-active' };

  const white = String(game.white_player_id ?? '').trim();
  const black = String(game.black_player_id ?? '').trim();
  const bothSeated = Boolean(white && black && white !== black);
  const tempo = norm(game.tempo);

  if (bothSeated) {
    if (tempo === 'live') return { kind: 'human-live-active' };
    if (tempo === 'correspondence') return { kind: 'human-correspondence-active' };
    if (tempo === 'daily') return { kind: 'human-daily-active' };
  }

  return { kind: 'other-active' };
}
