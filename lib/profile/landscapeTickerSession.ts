/**
 * Pure session reducer for the expanded landscape ticker.
 * Selection, hero-vs-quiet reveal, and activation queue — no chart data mutation.
 */

import type { LandscapeTickerCategoryId } from '@/lib/profile/landscapeTickerCategories';

export type LandscapeTickerRevealKind = 'hero' | 'quiet' | 'instant';

export type LandscapeTickerActiveReveal = {
  categoryId: LandscapeTickerCategoryId;
  kind: LandscapeTickerRevealKind;
  serial: number;
};

export type LandscapeTickerSession = {
  selectedIds: LandscapeTickerCategoryId[];
  heroRevealedIds: LandscapeTickerCategoryId[];
  pendingActivations: LandscapeTickerCategoryId[];
  activeReveal: LandscapeTickerActiveReveal | null;
  nextSerial: number;
  /**
   * Activation dominance, back-most first / front-most last.
   * Separate from registry order, chronological events, and hero history.
   * A category is appended only when its visible line is introduced.
   */
  dominanceOrder: LandscapeTickerCategoryId[];
};

export type LandscapeTickerAction =
  | { type: 'reset' }
  | { type: 'toggle'; categoryId: LandscapeTickerCategoryId; reducedMotion: boolean }
  | {
      type: 'revealComplete';
      categoryId: LandscapeTickerCategoryId;
      serial: number;
      reducedMotion: boolean;
    }
  /** Genuine viewport/orientation change. */
  | { type: 'settleForViewportChange' }
  /**
   * Lane/range change: settle currently selected lines into the new readable range.
   * Does not replay heroes. Session heroRevealedIds is preserved (plus selected ids).
   */
  | { type: 'settleSelected' };

export const LANDSCAPE_TICKER_HERO_MS = 1800;
export const LANDSCAPE_TICKER_QUIET_MS = 480;

export function createLandscapeTickerSession(): LandscapeTickerSession {
  return {
    selectedIds: [],
    heroRevealedIds: [],
    pendingActivations: [],
    activeReveal: null,
    nextSerial: 1,
    dominanceOrder: [],
  };
}

export function reduceLandscapeTickerSession(
  session: LandscapeTickerSession,
  action: LandscapeTickerAction,
): LandscapeTickerSession {
  switch (action.type) {
    case 'reset':
      return createLandscapeTickerSession();
    case 'toggle':
      return drainInstant(
        toggleCategory(session, action.categoryId, action.reducedMotion),
        action.reducedMotion,
      );
    case 'revealComplete':
      if (
        !session.activeReveal ||
        session.activeReveal.categoryId !== action.categoryId ||
        session.activeReveal.serial !== action.serial
      ) {
        return session;
      }
      return drainInstant(
        startNextPending({ ...session, activeReveal: null }, action.reducedMotion),
        action.reducedMotion,
      );
    case 'settleForViewportChange':
    case 'settleSelected':
      return settleSelectedLines(session);
    default:
      return session;
  }
}

export function isCategorySelected(
  session: LandscapeTickerSession,
  categoryId: LandscapeTickerCategoryId,
): boolean {
  return session.selectedIds.includes(categoryId);
}

export function isCategoryQueued(
  session: LandscapeTickerSession,
  categoryId: LandscapeTickerCategoryId,
): boolean {
  return session.pendingActivations.includes(categoryId);
}

/**
 * A line is plotted only after its activation has started (hero/quiet/instant) or settled.
 * Queued selections stay pressed on the control but do not draw yet.
 */
export function isCategoryLineVisible(
  session: LandscapeTickerSession,
  categoryId: LandscapeTickerCategoryId,
): boolean {
  if (!session.selectedIds.includes(categoryId)) return false;
  if (session.pendingActivations.includes(categoryId)) return false;
  return true;
}

export function categoryRevealPhase(
  session: LandscapeTickerSession,
  categoryId: LandscapeTickerCategoryId,
): 'hidden' | 'queued' | 'hero' | 'quiet' | 'instant' | 'settled' {
  if (!session.selectedIds.includes(categoryId)) return 'hidden';
  if (session.pendingActivations.includes(categoryId)) return 'queued';
  if (session.activeReveal?.categoryId === categoryId) return session.activeReveal.kind;
  return 'settled';
}

export function visibleCategoryIds(session: LandscapeTickerSession): LandscapeTickerCategoryId[] {
  return session.selectedIds.filter((id) => isCategoryLineVisible(session, id));
}

/** Visible lines, back-most first and front-most last. */
export function visibleDominanceOrder(
  session: LandscapeTickerSession,
): LandscapeTickerCategoryId[] {
  return session.dominanceOrder.filter((id) => isCategoryLineVisible(session, id));
}

export function frontMostVisibleCategory(
  session: LandscapeTickerSession,
): LandscapeTickerCategoryId | null {
  const order = visibleDominanceOrder(session);
  return order[order.length - 1] ?? null;
}

export function dominanceRank(
  session: LandscapeTickerSession,
  categoryId: LandscapeTickerCategoryId,
): number {
  return session.dominanceOrder.indexOf(categoryId);
}

function moveToFront(
  order: LandscapeTickerCategoryId[],
  categoryId: LandscapeTickerCategoryId,
): LandscapeTickerCategoryId[] {
  return uniqueIds([...order.filter((id) => id !== categoryId), categoryId]);
}

function toggleCategory(
  session: LandscapeTickerSession,
  categoryId: LandscapeTickerCategoryId,
  reducedMotion: boolean,
): LandscapeTickerSession {
  if (session.selectedIds.includes(categoryId)) {
    return deselectCategory(session, categoryId, reducedMotion);
  }
  return selectCategory(session, categoryId, reducedMotion);
}

function selectCategory(
  session: LandscapeTickerSession,
  categoryId: LandscapeTickerCategoryId,
  reducedMotion: boolean,
): LandscapeTickerSession {
  const selectedIds = [...session.selectedIds, categoryId];
  const kind = revealKindFor(session, categoryId, reducedMotion);
  if (session.activeReveal && session.activeReveal.kind !== 'instant') {
    return {
      ...session,
      selectedIds,
      pendingActivations: [...session.pendingActivations, categoryId],
    };
  }
  return startReveal({ ...session, selectedIds }, categoryId, kind);
}

function deselectCategory(
  session: LandscapeTickerSession,
  categoryId: LandscapeTickerCategoryId,
  reducedMotion: boolean,
): LandscapeTickerSession {
  const selectedIds = session.selectedIds.filter((id) => id !== categoryId);
  const pendingActivations = session.pendingActivations.filter((id) => id !== categoryId);
  const cancelledActive = session.activeReveal?.categoryId === categoryId;
  const next: LandscapeTickerSession = {
    ...session,
    selectedIds,
    pendingActivations,
    dominanceOrder: session.dominanceOrder.filter((id) => id !== categoryId),
    activeReveal: cancelledActive ? null : session.activeReveal,
  };
  if (cancelledActive) {
    return startNextPending(next, reducedMotion);
  }
  return next;
}

function startReveal(
  session: LandscapeTickerSession,
  categoryId: LandscapeTickerCategoryId,
  kind: LandscapeTickerRevealKind,
): LandscapeTickerSession {
  const heroRevealedIds =
    kind === 'hero' || kind === 'instant'
      ? uniqueIds([...session.heroRevealedIds, categoryId])
      : session.heroRevealedIds;
  return {
    ...session,
    heroRevealedIds,
    dominanceOrder: moveToFront(session.dominanceOrder, categoryId),
    activeReveal: { categoryId, kind, serial: session.nextSerial },
    nextSerial: session.nextSerial + 1,
  };
}

function startNextPending(
  session: LandscapeTickerSession,
  reducedMotion: boolean,
): LandscapeTickerSession {
  const nextId = session.pendingActivations[0];
  if (!nextId) return session;
  const pendingActivations = session.pendingActivations.slice(1);
  const kind = revealKindFor(session, nextId, reducedMotion);
  return startReveal({ ...session, pendingActivations }, nextId, kind);
}

function revealKindFor(
  session: LandscapeTickerSession,
  categoryId: LandscapeTickerCategoryId,
  reducedMotion: boolean,
): LandscapeTickerRevealKind {
  if (reducedMotion) return 'instant';
  return session.heroRevealedIds.includes(categoryId) ? 'quiet' : 'hero';
}

function drainInstant(
  session: LandscapeTickerSession,
  reducedMotion: boolean,
): LandscapeTickerSession {
  let current = session;
  let guard = 0;
  while (current.activeReveal?.kind === 'instant' && guard < 16) {
    guard += 1;
    current = startNextPending({ ...current, activeReveal: null }, reducedMotion);
  }
  return current;
}

function uniqueIds(ids: LandscapeTickerCategoryId[]): LandscapeTickerCategoryId[] {
  return [...new Set(ids)];
}

function settleSelectedLines(session: LandscapeTickerSession): LandscapeTickerSession {
  const selectedIds = [...session.selectedIds];
  let dominanceOrder = session.dominanceOrder.filter((id) => selectedIds.includes(id));
  for (const id of session.pendingActivations) {
    if (selectedIds.includes(id)) {
      dominanceOrder = moveToFront(dominanceOrder, id);
    }
  }
  for (const id of selectedIds) {
    if (!dominanceOrder.includes(id)) {
      dominanceOrder = [...dominanceOrder, id];
    }
  }
  return {
    selectedIds,
    heroRevealedIds: uniqueIds([...session.heroRevealedIds, ...selectedIds]),
    pendingActivations: [],
    activeReveal: null,
    nextSerial: session.nextSerial,
    dominanceOrder,
  };
}
