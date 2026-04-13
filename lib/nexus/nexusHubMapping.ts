/**
 * Pure hub mapping + route safety (no Next.js server APIs).
 * Used by getNexusHubData and unit tests.
 */

import type { NexusActivityItem } from "@/lib/nexus/getNexusData";
import type { NexusLiveGame, NexusWinner } from "@/lib/nexus/getNexusData";
import type {
  NexusActionCard,
  NexusActivityKind,
  NexusActivityRow,
  NexusRecentResultRow,
  NexusTournamentRow,
} from "@/lib/nexus/types";

/** Login redirect to /nexus — query encoded per RFC 3986. */
export const NEXUS_HUB_LOGIN_HREF = `/login?next=${encodeURIComponent("/nexus")}`;

/** UUID-shaped document ids (games, tournaments) — safe for path segments. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSafeHubDocumentId(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id.trim());
}

export function pickActiveGameForUser(games: NexusLiveGame[], userId: string): NexusLiveGame | null {
  for (const g of games) {
    if (!isSafeHubDocumentId(g.id)) continue;
    if (g.white_player_id === userId || g.black_player_id === userId) return g;
  }
  return null;
}

const STATIC_ROUTES = new Set([
  "/profile",
  "/free",
  "/tournaments",
  "/finished",
  "/players",
  "/modes",
  "/login",
]);

function isAllowedStaticHref(href: string): boolean {
  if (!href.startsWith("/")) return false;
  const path = href.split("?")[0] ?? "";
  if (STATIC_ROUTES.has(path)) return true;
  if (path === "/login") return href.startsWith("/login?");
  return false;
}

function isAllowedDynamicHref(href: string): boolean {
  const mGame = /^\/game\/([^/?#]+)$/.exec(href);
  if (mGame) return isSafeHubDocumentId(mGame[1]);
  const mTour = /^\/tournaments\/([^/?#]+)$/.exec(href);
  if (mTour) return isSafeHubDocumentId(mTour[1]);
  return false;
}

export function isValidNexusHubHref(href: string): boolean {
  if (!href || href === "#" || href.includes("undefined")) return false;
  if (href.startsWith("/login")) {
    return href === NEXUS_HUB_LOGIN_HREF || href.startsWith("/login?next=");
  }
  if (isAllowedStaticHref(href)) return true;
  return isAllowedDynamicHref(href);
}

/** Safe stage line from DB status only — no invented round numbers. */
export function stageLabelFromStatus(status: string): string | undefined {
  const s = String(status ?? "").toLowerCase().trim();
  if (s === "in_progress" || s === "live") return "In progress";
  if (s === "active") return "Active";
  return undefined;
}

const TIER_HIGHLIGHT = /^(elite|a)$/i;

export function shouldHighlightResultTier(tier: string | undefined): boolean {
  if (!tier) return false;
  return TIER_HIGHLIGHT.test(tier.trim());
}

/** Relative time for finished results (deterministic if nowMs passed in tests). */
export function formatRelativeTimeUtc(iso: string, nowMs: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  let diffSec = Math.round((t - nowMs) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(Math.round(diffSec / 60) || -1, "minute");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diffSec / 86400), "day");
  return rtf.format(Math.round(diffSec / (86400 * 7)), "week");
}

export function mapWinnersToRecentRows(winners: NexusWinner[], max = 8, nowMs?: number): NexusRecentResultRow[] {
  const now = nowMs ?? Date.now();
  const rows = winners
    .map((w, i) => {
      const id = String(w.id ?? "").trim() || `result-${i}`;
      const playerLabel = String(w.player_label ?? "—").trim() || "—";
      const eventLabel = String(w.event_name ?? "—").trim() || "—";
      const utc = String(w.utc ?? new Date().toISOString());
      const tier = String(w.tier ?? "").trim();
      return {
        id,
        playerLabel,
        eventLabel,
        result: "Win recorded",
        utc,
        tierHighlight: shouldHighlightResultTier(tier),
        relativeLabel: formatRelativeTimeUtc(utc, now),
      };
    })
    .filter((r) => r.id.length > 0);

  rows.sort((a, b) => {
    if (a.tierHighlight !== b.tierHighlight) return a.tierHighlight ? -1 : 1;
    return Date.parse(b.utc) - Date.parse(a.utc);
  });
  return rows.slice(0, max);
}

function classifyActivityKind(kind: string): NexusActivityKind {
  const k = String(kind ?? "").toLowerCase();
  if (k === "game") return "game_finished";
  if (k === "tournament") return "tournament_update";
  if (k === "narrative") return "player_advance";
  return "system";
}

function normalizeActivityMessage(item: NexusActivityItem): string {
  const raw = String(item.message ?? "").trim() || "System update";
  const k = String(item.kind ?? "").toLowerCase();
  if (k === "game" && item.game_id) {
    if (raw.toLowerCase().includes("winner") || raw.toLowerCase().includes("finished")) {
      return `Game finished: ${raw.replace(/^Winner recorded\s*\(/i, "").replace(/\)\s*$/, "").trim() || "result recorded"}`;
    }
    return `Game update: ${raw}`;
  }
  if (k === "tournament") {
    return raw.startsWith("Tournament") ? raw : `Tournament update: ${raw}`;
  }
  if (k === "announcement") {
    return raw.startsWith("Announcement:") ? raw : `Announcement: ${raw.replace(/^Announcement:\s*/i, "")}`;
  }
  return raw;
}

function baseImportance(kind: NexusActivityKind): number {
  switch (kind) {
    case "game_finished":
    case "player_advance":
      return 3;
    case "tournament_update":
      return 2;
    default:
      return 1;
  }
}

/** Recent window for optional +1 importance (verifiable recency only). */
const ACTIVITY_RECENT_WINDOW_MS = 2 * 60 * 60 * 1000;

function extractTournamentIdFromActivityItem(item: NexusActivityItem): string | null {
  const id = String(item.id ?? "").trim();
  if (id.startsWith("t-")) {
    const rest = id.slice(2).trim();
    if (isSafeHubDocumentId(rest)) return rest;
  }
  return null;
}

function activityUserTournamentBoost(
  item: NexusActivityItem,
  type: NexusActivityKind,
  entrySet: Set<string>,
  liveGames: NexusLiveGame[],
  userId: string | null | undefined,
): boolean {
  const tid = extractTournamentIdFromActivityItem(item);
  if (tid && entrySet.has(tid)) return true;
  if (type === "game_finished" && item.game_id && userId) {
    const gid = String(item.game_id).trim();
    const g = liveGames.find((lg) => String(lg.id ?? "").trim() === gid);
    const tourId = g?.tournament_id != null ? String(g.tournament_id).trim() : "";
    if (tourId && isSafeHubDocumentId(tourId) && entrySet.has(tourId)) return true;
  }
  return false;
}

export type MapActivityFeedOptions = {
  nowMs?: number;
  userParticipatingTournamentIds?: Set<string>;
  liveGames?: NexusLiveGame[];
  userId?: string | null;
};

/**
 * Normalize raw feed items to bounded, typed rows (max `limit`).
 * Sort: importance desc, timestamp desc; dedupe duplicate messages.
 */
export function mapActivityFeedToRows(
  feed: NexusActivityItem[],
  limit = 10,
  options?: MapActivityFeedOptions,
): NexusActivityRow[] {
  const nowMs = options?.nowMs ?? Date.now();
  const entrySet = options?.userParticipatingTournamentIds ?? new Set<string>();
  const liveGames = options?.liveGames ?? [];
  const userId = options?.userId;

  const candidates: NexusActivityRow[] = [];
  const seenIds = new Set<string>();

  for (const item of feed) {
    const id = String(item.id ?? "").trim();
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    const type = classifyActivityKind(item.kind);
    const message = normalizeActivityMessage(item);
    if (!message.trim()) continue;

    const ts = String(item.utc ?? new Date().toISOString());
    const tsMs = Date.parse(ts);

    let importance = baseImportance(type);
    if (activityUserTournamentBoost(item, type, entrySet, liveGames, userId)) {
      importance += 1;
    }
    if (Number.isFinite(tsMs) && nowMs - tsMs >= 0 && nowMs - tsMs < ACTIVITY_RECENT_WINDOW_MS) {
      importance += 1;
    }

    candidates.push({ id, type, message, timestamp: ts, importance });
  }

  candidates.sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    return Date.parse(b.timestamp) - Date.parse(a.timestamp);
  });

  const seenMsg = new Set<string>();
  const out: NexusActivityRow[] = [];
  for (const row of candidates) {
    const key = row.message.trim().toLowerCase();
    if (seenMsg.has(key)) continue;
    seenMsg.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

export function mapTournamentRows(raw: NexusTournamentRow[], max = 12): NexusTournamentRow[] {
  return raw
    .filter((r) => isSafeHubDocumentId(r.id))
    .slice(0, max)
    .map((r) => {
      const id = r.id.trim();
      const stageLabel = r.stageLabel ?? stageLabelFromStatus(r.status);
      const tierLabel = r.tierLabel?.trim() ? r.tierLabel.trim() : undefined;
      const base: NexusTournamentRow = {
        ...r,
        id,
        name: String(r.name ?? "Tournament").trim() || "Tournament",
        status: String(r.status ?? "—").trim() || "—",
        updatedAt: String(r.updatedAt ?? ""),
        href: `/tournaments/${id}`,
      };
      if (stageLabel) base.stageLabel = stageLabel;
      if (tierLabel) base.tierLabel = tierLabel;
      return base;
    });
}

function tournamentRelevanceScore(r: NexusTournamentRow): number {
  if (r.userHasActiveGame) return 100;
  if (r.userParticipating) return 80;
  const s = String(r.status ?? "").toLowerCase().trim();
  if (s === "active" || s === "in_progress" || s === "live") return 50;
  return 20;
}

/**
 * Assigns `relevance`, sorts by relevance desc then updatedAt desc, caps length.
 * Call after user context flags are set.
 */
export function scoreAndSortTournamentRows(rows: NexusTournamentRow[], max = 12): NexusTournamentRow[] {
  const scored = rows.map((r) => ({
    ...r,
    relevance: tournamentRelevanceScore(r),
  }));
  scored.sort((a, b) => {
    const dr = (b.relevance ?? 0) - (a.relevance ?? 0);
    if (dr !== 0) return dr;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
  return scored.slice(0, max);
}

/** Inputs for prioritized hub action cards (Phase 2). */
export type HubActionCardsParams = {
  userId: string | null;
  liveGames: NexusLiveGame[];
  /** Tournament IDs the user is entered in (tournament_entries). */
  userTournamentEntryIds: string[];
  /** Recent winners feed non-empty — safe signal that finished results exist in system. */
  hasRecentFinishedWins: boolean;
};

function sortActionCardsByUrgency(cards: NexusActionCard[]): NexusActionCard[] {
  return [...cards].sort((a, b) => {
    if (b.urgency !== a.urgency) return b.urgency - a.urgency;
    return a.priority - b.priority;
  });
}

/**
 * Urgency: higher = more urgent. Sort: urgency desc, priority asc tie-breaker.
 * Dedupes by href; invalid routes dropped.
 */
export function buildNexusHubActionCards(params: HubActionCardsParams): NexusActionCard[] {
  const { userId, liveGames, userTournamentEntryIds, hasRecentFinishedWins } = params;
  const candidates: NexusActionCard[] = [];

  const push = (c: NexusActionCard) => {
    if (!isValidNexusHubHref(c.href)) return;
    candidates.push(c);
  };

  if (!userId) {
    push({
      id: "login",
      title: "Sign in",
      description: "Required for personalized standings and saves.",
      href: NEXUS_HUB_LOGIN_HREF,
      priority: 10,
      urgency: 90,
      emphasis: "primary",
    });
    push({
      id: "free",
      title: "Free play",
      description: "Rated or casual games outside bracket pressure.",
      href: "/free",
      priority: 20,
      urgency: 30,
      emphasis: "secondary",
    });
    push({
      id: "tournaments",
      title: "Tournament area",
      description: "Browse and join structured events.",
      href: "/tournaments",
      priority: 30,
      urgency: 25,
      emphasis: "secondary",
    });
    push({
      id: "finished",
      title: "Review finished games",
      description: "Analysis and history from completed games.",
      href: "/finished",
      priority: hasRecentFinishedWins ? 25 : 40,
      urgency: hasRecentFinishedWins ? 35 : 20,
      emphasis: "secondary",
    });
  } else {
    const continueGame = pickActiveGameForUser(liveGames, userId);
    const hasContinue = Boolean(continueGame && isSafeHubDocumentId(continueGame.id));

    if (hasContinue && continueGame) {
      push({
        id: "continue-game",
        title: "Continue active game",
        description: `Resume your current match · ${continueGame.white_label} vs ${continueGame.black_label} · ${continueGame.time_control}`,
        href: `/game/${continueGame.id.trim()}`,
        priority: 10,
        urgency: 100,
        emphasis: "primary",
      });
    }

    const firstEntryTid = userTournamentEntryIds.find((tid) => isSafeHubDocumentId(tid));
    if (firstEntryTid) {
      push({
        id: "tournament-status",
        title: "Check tournament status",
        description: "Open a tournament you are entered in.",
        href: `/tournaments/${firstEntryTid.trim()}`,
        priority: 25,
        urgency: 80,
        emphasis: "secondary",
      });
    }

    push({
      id: "profile",
      title: "Open profile",
      description: "Identity, stats, and account controls.",
      href: "/profile",
      priority: 35,
      urgency: 40,
      emphasis: hasContinue ? "secondary" : "primary",
    });

    if (hasRecentFinishedWins) {
      push({
        id: "finished-priority",
        title: "Review finished games",
        description: "Recent finishes are on record — review or analyze.",
        href: "/finished",
        priority: 38,
        urgency: 60,
        emphasis: "secondary",
      });
    }

    push({
      id: "free",
      title: "Free play",
      description: "Rated or casual games outside bracket pressure.",
      href: "/free",
      priority: 45,
      urgency: 30,
      emphasis: "secondary",
    });
    push({
      id: "tournaments",
      title: "Tournament area",
      description: "Browse and join structured events.",
      href: "/tournaments",
      priority: 50,
      urgency: 25,
      emphasis: "secondary",
    });

    if (!hasRecentFinishedWins) {
      push({
        id: "finished",
        title: "Review finished games",
        description: "Analysis and history from completed games.",
        href: "/finished",
        priority: 52,
        urgency: 20,
        emphasis: "secondary",
      });
    }
  }

  const sorted = sortActionCardsByUrgency(candidates);
  const seenHref = new Set<string>();
  const out: NexusActionCard[] = [];
  for (const c of sorted) {
    if (seenHref.has(c.href)) continue;
    seenHref.add(c.href);
    out.push(c);
  }
  return out.slice(0, 8);
}
