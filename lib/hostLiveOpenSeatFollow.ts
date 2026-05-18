/**
 * Register that the current browser session is hosting a **live** free-play open seat (`games.id`),
 * so `HostLiveOpenSeatFollowListener` can subscribe with `id=eq.<gameId>` and redirect when Black joins.
 *
 * sessionStorage: normal tab flow. localStorage: same-browser survival across tabs / bfcache restore.
 */

const STORAGE_KEY = 'accl_host_live_open_seat_v1';

export const HOST_LIVE_OPEN_SEAT_REGISTER_EVENT = 'accl-host-live-open-seat';

/** Clears registration + notifies listeners (no payload). */
export const HOST_LIVE_OPEN_SEAT_CLEAR_EVENT = 'accl-host-live-open-seat-clear';

export function readStoredHostLiveOpenSeatGameId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const a = sessionStorage.getItem(STORAGE_KEY)?.trim();
    if (a && a.length > 0) return a;
    const b = localStorage.getItem(STORAGE_KEY)?.trim();
    return b && b.length > 0 ? b : null;
  } catch {
    return null;
  }
}

export function registerHostLiveOpenSeatFollow(gameId: string): void {
  const id = String(gameId ?? '').trim();
  if (!id || typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore quota / private mode */
  }
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent(HOST_LIVE_OPEN_SEAT_REGISTER_EVENT, { detail: { gameId: id } })
  );
}

export function clearHostLiveOpenSeatFollow(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(HOST_LIVE_OPEN_SEAT_CLEAR_EVENT));
}
