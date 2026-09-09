import { expect, test } from '@playwright/test';
import { clearPendingCommission, readPendingCommission, savePendingCommission } from '../../lib/imageGenerator/pendingCommission';

test('pending commissions survive reload per account without storing credentials or image bytes', () => {
  const rows = new Map<string, string>();
  const storage: Storage = {
    get length() { return rows.size; },
    key: (index) => [...rows.keys()][index] ?? null,
    clear: () => rows.clear(),
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => { rows.set(key, value); },
    removeItem: (key) => { rows.delete(key); },
  };
  const attempt = { key: 'one-stable-attempt', prompt: 'Blue armor', style: 'gold' as const, references: ['00000000-0000-4000-8000-000000000001'] };
  savePendingCommission(storage, 'owner', attempt);
  expect(readPendingCommission(storage, 'owner')).toEqual(attempt);
  expect(readPendingCommission(storage, 'stranger')).toBeNull();
  clearPendingCommission(storage, 'stranger');
  expect(readPendingCommission(storage, 'owner')).toEqual(attempt);
  clearPendingCommission(storage, 'owner');
  expect(readPendingCommission(storage, 'owner')).toBeNull();
  storage.setItem('accl:pending-generation:owner', JSON.stringify({ ...attempt, references: ['not-a-uuid'] }));
  expect(readPendingCommission(storage, 'owner')).toBeNull();
  storage.setItem('accl:pending-generation:owner', '{broken');
  expect(readPendingCommission(storage, 'owner')).toBeNull();
});
