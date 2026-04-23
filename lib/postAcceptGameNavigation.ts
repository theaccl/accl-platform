import type { SupabaseClient } from '@supabase/supabase-js';

import { acclPerfTime } from '@/lib/acclPerfDebug';
import { parseGameIdFromPath } from '@/lib/gameAcceptRedirectPriority';
import { getActiveFreePlayGameForUser } from '@/lib/getActiveFreePlayGameForUser';
import {
  getAcceptRedirectDecision,
  mergeCurrentGameForAcceptNavigation,
  type AcceptGameRef,
} from '@/lib/shouldNavigateToAcceptedGame';

export type { AcceptGameRef as AcceptRedirectGameRef, RedirectDecisionInput, AcceptRedirectDecision } from '@/lib/shouldNavigateToAcceptedGame';
export {
  getAcceptRedirectDecision,
  mergeCurrentGameForAcceptNavigation,
  pathBoardRefForHardRule,
  shouldNavigateToAcceptedGame,
} from '@/lib/shouldNavigateToAcceptedGame';

function normId(id: string | undefined | null): string {
  return String(id ?? '').trim();
}

export function acceptRedirectTraceEnabled(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  if (process.env.NEXT_PUBLIC_ACCL_DEBUG_ACCEPT_REDIRECT === '1') return true;
  if (typeof window !== 'undefined' && window.localStorage?.getItem('accl_debug_accept_redirect') === '1') {
    return true;
  }
  return false;
}

/** Temporary verification log (dev / opt-in only). */
export function logAcceptRedirectTrace(
  flow: string,
  payload: {
    pathname: string;
    currentGameId: string | null;
    currentTempo: string | null;
    acceptedGameId: string;
    acceptedTempo: string | null;
    decision: boolean;
  }
): void {
  if (!acceptRedirectTraceEnabled()) return;
  console.log('[ACCEPT_REDIRECT_TRACE]', {
    flow,
    pathname: payload.pathname,
    currentGameId: payload.currentGameId,
    currentTempo: payload.currentTempo,
    acceptedGameId: payload.acceptedGameId,
    acceptedTempo: payload.acceptedTempo,
    decision: payload.decision,
  });
}

/** @deprecated Prefer {@link resolveAcceptNavigationContext} when path DB row is needed for the hard live rule. */
export async function resolveCurrentGameForPostAcceptNavigation(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    pathname: string;
    acceptedGameId: string;
    boardGameFromPage?: AcceptGameRef | null;
  }
): Promise<AcceptGameRef | null> {
  const ctx = await resolveAcceptNavigationContext(supabase, userId, opts);
  return ctx.currentGame;
}

export async function resolveAcceptNavigationContext(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    pathname: string;
    acceptedGameId: string;
    boardGameFromPage?: AcceptGameRef | null;
  }
): Promise<{ currentGame: AcceptGameRef | null; pathBoardFromDb: AcceptGameRef | null }> {
  const acc = normId(opts.acceptedGameId);
  const pathId = parseGameIdFromPath(opts.pathname);
  const hint = opts.boardGameFromPage ?? null;

  let pathGameFromDb: AcceptGameRef | null = null;
  let offPath: AcceptGameRef | null = null;

  if (pathId && pathId !== acc) {
    const [pathRes, offRes] = await Promise.all([
      supabase.from('games').select('id,tempo').eq('id', pathId).maybeSingle(),
      getActiveFreePlayGameForUser(supabase, userId, acc),
    ]);
    const { data, error } = pathRes;
    if (!error && data) {
      const row = data as { id?: string; tempo?: string | null };
      if (normId(row.id) === pathId) {
        pathGameFromDb = { id: pathId, tempo: row.tempo ?? null };
      }
    }
    offPath = offRes;
  } else {
    offPath = await getActiveFreePlayGameForUser(supabase, userId, acc);
  }

  const currentGame = mergeCurrentGameForAcceptNavigation({
    pathname: opts.pathname,
    acceptedGameId: acc,
    inMemoryBoardGame: hint,
    pathGameFromDb,
    offPathActiveGameFromDb: offPath,
  });

  return { currentGame, pathBoardFromDb: pathGameFromDb };
}

export type PostAcceptNavigateArgs = {
  flow: string;
  pathname: string;
  router: { push: (href: string) => void };
  supabase: SupabaseClient;
  authUserId: string | null;
  acceptedGameId: string;
  acceptedTempoHint?: string | null;
  boardGameFromPage?: AcceptGameRef | null;
  onSkipNavigate?: () => void;
};

/**
 * Async resolve + gate + `[ACCEPT_REDIRECT_TRACE]` + optional `router.push`.
 * @returns whether `router.push` to the accepted game was invoked.
 */
export async function navigateAfterAcceptIfAllowed(args: PostAcceptNavigateArgs): Promise<boolean> {
  const gid = normId(args.acceptedGameId);
  if (!gid) return false;

  const perf = acclPerfTime(`postAcceptNavigate:${args.flow}`);
  const emitTrace = (currentGame: AcceptGameRef | null, acceptedTempo: string | null, decision: boolean) => {
    logAcceptRedirectTrace(args.flow, {
      pathname: args.pathname,
      currentGameId: currentGame ? normId(currentGame.id) : null,
      currentTempo: currentGame ? (currentGame.tempo ?? null) : null,
      acceptedGameId: gid,
      acceptedTempo,
      decision,
    });
  };

  if (!args.authUserId) {
    emitTrace(null, args.acceptedTempoHint ?? null, true);
    args.router.push(`/game/${gid}`);
    perf.end({ branch: 'no-auth', pushed: true });
    return true;
  }

  const [{ data: accRow, error: accErr }, { currentGame, pathBoardFromDb }] = await Promise.all([
    args.supabase.from('games').select('id,tempo').eq('id', gid).maybeSingle(),
    resolveAcceptNavigationContext(args.supabase, args.authUserId, {
      pathname: args.pathname,
      acceptedGameId: gid,
      boardGameFromPage: args.boardGameFromPage ?? null,
    }),
  ]);

  if (accErr || !accRow) {
    const tempoHint =
      args.acceptedTempoHint != null && String(args.acceptedTempoHint).trim() !== ''
        ? String(args.acceptedTempoHint).trim()
        : null;
    if (tempoHint) {
      const fallbackDecision = getAcceptRedirectDecision({
        currentPath: args.pathname,
        currentGame,
        acceptedGame: { id: gid, tempo: tempoHint },
        inMemoryBoardGame: args.boardGameFromPage ?? null,
        pathBoardFromDb,
      });
      emitTrace(currentGame, tempoHint, fallbackDecision.navigate);
      if (fallbackDecision.navigate) {
        args.router.push(`/game/${gid}`);
        perf.end({ branch: 'missing-acc-row+hint', pushed: true });
        return true;
      }
      args.onSkipNavigate?.();
      perf.end({ branch: 'missing-acc-row+hint', pushed: false });
      return false;
    }
    if (args.pathname.startsWith('/game/')) {
      emitTrace(args.boardGameFromPage ?? null, null, false);
      args.onSkipNavigate?.();
      perf.end({ branch: 'missing-acc-row-on-board', pushed: false });
      return false;
    }
    emitTrace(null, null, true);
    args.router.push(`/game/${gid}`);
    perf.end({ branch: 'missing-acc-row-fallback-push', pushed: true });
    return true;
  }

  const rowTempo = ((accRow as { tempo?: string | null }).tempo ?? null) as string | null;
  const hint = args.acceptedTempoHint;
  const acceptedTempo =
    hint != null && String(hint).trim() !== '' ? String(hint).trim() : rowTempo;

  const decision = getAcceptRedirectDecision({
    currentPath: args.pathname,
    currentGame,
    acceptedGame: { id: gid, tempo: acceptedTempo },
    inMemoryBoardGame: args.boardGameFromPage ?? null,
    pathBoardFromDb: pathBoardFromDb,
  });

  emitTrace(currentGame, acceptedTempo, decision.navigate);

  if (decision.navigate) {
    args.router.push(`/game/${gid}`);
    perf.end({ branch: 'decision', pushed: true, reason: decision.reason });
    return true;
  }
  if (acceptRedirectTraceEnabled()) {
    console.log('[accept-redirect] skipped navigation', {
      flow: args.flow,
      reason: decision.reason,
      pathname: args.pathname,
    });
  }
  args.onSkipNavigate?.();
  perf.end({ branch: 'decision', pushed: false, reason: decision.reason });
  return false;
}
