const TAB_PRESENCE_STORAGE_KEY = 'accl:tab_presence_id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let memoryFallbackId: string | null = null;

export function isValidTabPresenceId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

function formatUuidV4Bytes(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function uuidV4FromGetRandomValues(): string | null {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    return null;
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const id = formatUuidV4Bytes(bytes);
  return isValidTabPresenceId(id) ? id : null;
}

function uuidV4FromMathRandom(): string | null {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const id = formatUuidV4Bytes(bytes);
  return isValidTabPresenceId(id) ? id : null;
}

/** Generate a client-local tab id; returns null when no safe UUID source exists. */
function generateTabPresenceId(): string | null {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    const id = crypto.randomUUID();
    return isValidTabPresenceId(id) ? id : null;
  }
  return uuidV4FromGetRandomValues() ?? uuidV4FromMathRandom();
}

/**
 * Stable per-tab identifier stored in sessionStorage when available.
 * Returns null when no UUID can be produced safely (heartbeat should no-op).
 */
export function getOrCreateTabPresenceId(): string | null {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.sessionStorage.getItem(TAB_PRESENCE_STORAGE_KEY);
      if (isValidTabPresenceId(stored)) {
        return stored.trim();
      }
      const created = generateTabPresenceId();
      if (!created) return null;
      window.sessionStorage.setItem(TAB_PRESENCE_STORAGE_KEY, created);
      return created;
    } catch {
      // sessionStorage blocked or unavailable — use memory fallback for this tab.
    }
  }

  if (!memoryFallbackId) {
    memoryFallbackId = generateTabPresenceId();
  }
  return memoryFallbackId;
}

/** Test helper: reset in-memory fallback between isolated runs. */
export function resetTabPresenceIdMemoryFallbackForTests(): void {
  memoryFallbackId = null;
}
