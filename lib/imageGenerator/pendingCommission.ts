import { createGenerationSchema } from './api';

/** Tab-scoped retry state. Never stores auth tokens or image bytes. */
export type PendingCommission = {
  key: string;
  prompt: string;
  style: 'automatic' | 'royal' | 'storm' | 'gold' | 'crimson';
  references: string[];
};
const storageKey = (userId: string) => `accl:pending-generation:${userId}`;

export function readPendingCommission(storage: Storage, userId: string): PendingCommission | null {
  try {
    const value = JSON.parse(storage.getItem(storageKey(userId)) ?? 'null');
    if (!value || typeof value.key !== 'string' || value.key.length < 8 || value.key.length > 200) return null;
    const parsed = createGenerationSchema.safeParse({ prompt: value.prompt, style: value.style, reference_ids: value.references });
    if (!parsed.success || !Array.isArray(value.references)) return null;
    return { key: value.key, prompt: parsed.data.prompt, style: parsed.data.style, references: parsed.data.reference_ids ?? [] };
  } catch { return null; }
}

export function savePendingCommission(storage: Storage, userId: string, value: PendingCommission): void {
  storage.setItem(storageKey(userId), JSON.stringify(value));
}

export function clearPendingCommission(storage: Storage, userId: string): void {
  storage.removeItem(storageKey(userId));
}
