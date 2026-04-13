/**
 * Phase 7 — centralized route validation and href construction for NEXUS UI.
 * Delegates UUID rules to mapping layer; does not duplicate scoring or data logic.
 *
 * Document IDs: `isSafeHubDocumentId` uses `UUID_RE` in nexusHubMapping with the `i` flag —
 * lowercase and uppercase hex UUIDs both validate.
 */

import { isSafeHubDocumentId, isValidNexusHubHref } from "@/lib/nexus/nexusHubMapping";

const DEFAULT_POST_LOGIN_PATH = "/modes";

/**
 * Strict post-login redirect target. URLSearchParams already decodes `next` once.
 * Allows only same-origin relative paths; blocks open redirects and traversal.
 */
export function getSafePostLoginRedirect(nextParam: string | null | undefined): string {
  if (nextParam == null) return DEFAULT_POST_LOGIN_PATH;
  const next = String(nextParam).trim();
  if (!next) return DEFAULT_POST_LOGIN_PATH;

  if (!next.startsWith("/")) return DEFAULT_POST_LOGIN_PATH;
  if (next.startsWith("//")) return DEFAULT_POST_LOGIN_PATH;
  if (next.includes("://")) return DEFAULT_POST_LOGIN_PATH;
  if (next.includes("\\\\")) return DEFAULT_POST_LOGIN_PATH;
  if (next.includes("\\")) return DEFAULT_POST_LOGIN_PATH;
  if (next.includes("..")) return DEFAULT_POST_LOGIN_PATH;
  if (next.length > 512) return DEFAULT_POST_LOGIN_PATH;
  if (next === "/login" || next.startsWith("/login?") || next.startsWith("/login/")) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  return next;
}

export function isValidGameRoute(id: unknown): boolean {
  return isSafeHubDocumentId(id);
}

export function isValidTournamentRoute(id: unknown): boolean {
  return isSafeHubDocumentId(id);
}

/** Returns empty string if id is not a safe document id — callers must check before linking. */
export function buildGameHref(id: string): string {
  if (!isSafeHubDocumentId(id)) return "";
  return `/game/${id.trim()}`;
}

/** Returns empty string if id is not a safe document id. */
export function buildTournamentHref(id: string): string {
  if (!isSafeHubDocumentId(id)) return "";
  return `/tournaments/${id.trim()}`;
}

/**
 * Login redirect with encoded `next` path (RFC 3986).
 * Empty `next` defaults to /nexus for hub handoff.
 */
export function buildLoginRedirect(next: string): string {
  const raw = String(next ?? "").trim();
  const path = raw ? (raw.startsWith("/") ? raw : `/${raw}`) : "/nexus";
  return `/login?next=${encodeURIComponent(path)}`;
}

/** Same URL as `buildLoginRedirect("/nexus")` — safe for client components and middleware. */
export const NEXUS_LOGIN_ENTRY_HREF = "/login?next=%2Fnexus" as const;

/** Same validation as action cards / hub links use today. */
export function isValidHubHandoffHref(href: string): boolean {
  return isValidNexusHubHref(href);
}

/**
 * Map activity feed item id (`t-<uuid>` / `g-<uuid>`) to a hub route when unambiguous.
 * No inference from message text — id pattern only.
 */
export function hubHrefFromActivityFeedId(feedItemId: string): string | null {
  const id = feedItemId.trim();
  const t = /^t-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(id);
  if (t?.[1]) {
    const h = buildTournamentHref(t[1]);
    return h && isValidHubHandoffHref(h) ? h : null;
  }
  const g = /^g-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(id);
  if (g?.[1]) {
    const h = buildGameHref(g[1]);
    return h && isValidHubHandoffHref(h) ? h : null;
  }
  return null;
}
