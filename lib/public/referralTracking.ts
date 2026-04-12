/**
 * Client-side referral + entry attribution (paired with server profile columns after signup).
 */

export const STORAGE_REF = 'accl_ref';
export const STORAGE_ENTRY = 'accl_entry_source';
export const STORAGE_FIRST_ACTION = 'accl_first_action';

export type EntrySource = 'landing' | 'share' | 'spectate' | 'direct' | 'other';

export function getStoredReferral(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_REF)?.trim();
    return v && v.length <= 120 ? v : null;
  } catch {
    return null;
  }
}

export function setStoredReferral(ref: string): void {
  if (typeof window === 'undefined') return;
  const t = ref.trim();
  if (!t || t.length > 120) return;
  try {
    window.localStorage.setItem(STORAGE_REF, t);
  } catch {
    /* ignore */
  }
}

export function getStoredEntrySource(): EntrySource {
  if (typeof window === 'undefined') return 'direct';
  try {
    const v = window.localStorage.getItem(STORAGE_ENTRY)?.trim();
    if (v === 'landing' || v === 'share' || v === 'spectate' || v === 'direct' || v === 'other') return v;
  } catch {
    /* ignore */
  }
  return 'direct';
}

export function setStoredEntrySource(source: EntrySource): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_ENTRY, source);
  } catch {
    /* ignore */
  }
}

export function setFirstAction(action: 'spectate' | 'signup' | 'play' | 'tournament'): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(STORAGE_FIRST_ACTION)) return;
    window.localStorage.setItem(STORAGE_FIRST_ACTION, action);
  } catch {
    /* ignore */
  }
}

export function getFirstAction(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_FIRST_ACTION);
  } catch {
    return null;
  }
}
