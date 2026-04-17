/**
 * Client-only persistence for which notification rows the user has acknowledged.
 * Replaces a server read table until notifications are backed by schema.
 */
const STORAGE_KEY = "accl_notification_read_ids_v1";

function safeParse(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return new Set();
    return new Set(j.filter((x): x is string => typeof x === "string" && x.length > 0));
  } catch {
    return new Set();
  }
}

export function getReadNotificationIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function markNotificationRead(id: string): void {
  if (typeof window === "undefined" || !id.trim()) return;
  const next = getReadNotificationIds();
  next.add(id.trim());
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  window.dispatchEvent(new CustomEvent("accl-notifications-read"));
}

export function markAllNotificationsRead(ids: string[]): void {
  if (typeof window === "undefined" || !ids.length) return;
  const next = getReadNotificationIds();
  for (const id of ids) {
    if (id.trim()) next.add(id.trim());
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  window.dispatchEvent(new CustomEvent("accl-notifications-read"));
}

export function isNotificationUnread(id: string): boolean {
  return !getReadNotificationIds().has(id.trim());
}
