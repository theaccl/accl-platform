import {
  getTempoType,
  parseGameIdFromPath,
  shouldRedirectOnAccept,
} from '@/lib/gameAcceptRedirectPriority';

export type AcceptGameRef = {
  id: string;
  tempo?: string | null;
};

export type RedirectDecisionInput = {
  currentPath: string;
  /**
   * Merged “current” game for priority (path board when on `/game/:id`, else active free game).
   * Built via {@link mergeCurrentGameForAcceptNavigation}.
   */
  currentGame: AcceptGameRef | null;
  acceptedGame: AcceptGameRef;
  /**
   * Path-only sources for the **hard live-board rule** (in-memory wins over DB for `/game/:id`).
   * When omitted, hard rule falls back to `currentGame` if its id matches the path game id.
   */
  inMemoryBoardGame?: AcceptGameRef | null;
  pathBoardFromDb?: AcceptGameRef | null;
};

export type AcceptRedirectDecision = {
  navigate: boolean;
  reason: string;
};

function normId(id: string | undefined | null): string {
  return String(id ?? '').trim();
}

/**
 * Board at URL `/game/:pathId`: prefer in-memory row when ids match, else DB row for that id.
 */
export function pathBoardRefForHardRule(
  pathname: string,
  inMemoryBoardGame: AcceptGameRef | null | undefined,
  pathBoardFromDb: AcceptGameRef | null | undefined
): AcceptGameRef | null {
  const pathId = parseGameIdFromPath(pathname);
  if (!pathId) return null;
  if (inMemoryBoardGame && normId(inMemoryBoardGame.id) === pathId) {
    return { id: pathId, tempo: inMemoryBoardGame.tempo ?? null };
  }
  if (pathBoardFromDb && normId(pathBoardFromDb.id) === pathId) {
    return { id: pathId, tempo: pathBoardFromDb.tempo ?? null };
  }
  return null;
}

/**
 * Truth order: (1) in-memory board when id matches path, (2) DB row for `/game/:id`, (3) off-path active game.
 */
export function mergeCurrentGameForAcceptNavigation(params: {
  pathname: string;
  acceptedGameId: string;
  inMemoryBoardGame: AcceptGameRef | null;
  pathGameFromDb: AcceptGameRef | null;
  offPathActiveGameFromDb: AcceptGameRef | null;
}): AcceptGameRef | null {
  const pathId = parseGameIdFromPath(params.pathname);
  const acc = normId(params.acceptedGameId);

  if (pathId && pathId !== acc) {
    if (params.inMemoryBoardGame && normId(params.inMemoryBoardGame.id) === pathId) {
      return { id: pathId, tempo: params.inMemoryBoardGame.tempo ?? null };
    }
    if (params.pathGameFromDb && normId(params.pathGameFromDb.id) === pathId) {
      return { id: pathId, tempo: params.pathGameFromDb.tempo ?? null };
    }
    return null;
  }

  return params.offPathActiveGameFromDb;
}

/**
 * Single client gate: self-redirect, URL checks, **hard live-board block**, then tempo priority.
 */
export function getAcceptRedirectDecision(input: RedirectDecisionInput): AcceptRedirectDecision {
  const { currentPath, currentGame, acceptedGame } = input;
  const accId = normId(acceptedGame.id);
  if (!accId) {
    return { navigate: false, reason: 'missing-accepted-id' };
  }

  const pathGameId = parseGameIdFromPath(currentPath);

  if (pathGameId && pathGameId === accId) {
    return { navigate: false, reason: 'already-on-accepted-game-url' };
  }

  const curId = currentGame ? normId(currentGame.id) : '';
  if (curId && curId === accId) {
    return { navigate: false, reason: 'same-accepted-as-current-game' };
  }

  const accType = getTempoType(acceptedGame);

  /** Hard board protection: on a live board URL, never follow a lower-tempo accept. In-memory beats DB. */
  if (currentPath.startsWith('/game/') && pathGameId && pathGameId !== accId) {
    const pathBoard =
      pathBoardRefForHardRule(currentPath, input.inMemoryBoardGame ?? null, input.pathBoardFromDb ?? null) ??
      (currentGame && pathGameId === normId(currentGame.id) ? currentGame : null);
    if (pathBoard && getTempoType(pathBoard) === 'live' && accType !== 'live') {
      return { navigate: false, reason: 'hard-live-board-block' };
    }
  }

  const curType = currentGame ? getTempoType(currentGame) : null;

  if (currentPath.startsWith('/game/')) {
    if (curType === 'live' && accType !== 'live') {
      return { navigate: false, reason: 'live-board-explicit-block' };
    }
    if (!currentGame) {
      return { navigate: false, reason: 'on-board-missing-current-game' };
    }
    const ok = shouldRedirectOnAccept(currentGame, acceptedGame);
    return {
      navigate: ok,
      reason: ok ? 'priority-accepted-higher' : 'priority-current-wins-or-tie',
    };
  }

  if (!currentGame) {
    return { navigate: true, reason: 'not-on-board-no-current' };
  }
  const ok = shouldRedirectOnAccept(currentGame, acceptedGame);
  return {
    navigate: ok,
    reason: ok ? 'priority-accepted-higher' : 'priority-current-wins-or-tie',
  };
}

export function shouldNavigateToAcceptedGame(input: RedirectDecisionInput): boolean {
  return getAcceptRedirectDecision(input).navigate;
}
