/**
 * ACCL public usernames: unique, URL-safe, no email leakage.
 * Stored normalized (lowercase trim).
 */

const MIN_LEN = 3;
const MAX_LEN = 20;
const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;
const GENERATED_FALLBACK_RE = /^player_[a-f0-9]{8}$/;

const RESERVED = new Set([
  'admin',
  'administrator',
  'accl',
  'root',
  'system',
  'support',
  'help',
  'null',
  'undefined',
  'moderator',
  'mod',
  'official',
  'staff',
]);

export function normalizeAcclUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export type UsernameValidation =
  | { ok: true; username: string }
  | { ok: false; error: string };

export function validateAcclUsername(raw: string): UsernameValidation {
  const normalized = normalizeAcclUsername(raw);
  if (!normalized) {
    return { ok: false, error: 'Username is required.' };
  }
  if (normalized.length < MIN_LEN || normalized.length > MAX_LEN) {
    return { ok: false, error: `Username must be ${MIN_LEN}–${MAX_LEN} characters.` };
  }
  if (!USERNAME_RE.test(normalized)) {
    return {
      ok: false,
      error: 'Use letters, numbers, and underscores only; must start with a letter.',
    };
  }
  if (RESERVED.has(normalized)) {
    return { ok: false, error: 'This username is reserved.' };
  }
  return { ok: true, username: normalized };
}

export function profileRowNeedsUsername(username: string | null | undefined): boolean {
  const trimmed = String(username ?? '').trim();
  return !trimmed || GENERATED_FALLBACK_RE.test(trimmed.toLowerCase());
}
