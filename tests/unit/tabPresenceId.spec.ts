import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  getOrCreateTabPresenceId,
  isValidTabPresenceId,
  resetTabPresenceIdMemoryFallbackForTests,
} from '@/lib/presence/tabPresenceId';

const STORAGE_KEY = 'accl:tab_presence_id';

test.describe('tabPresenceId', () => {
  test.afterEach(() => {
    resetTabPresenceIdMemoryFallbackForTests();
  });

  test('isValidTabPresenceId accepts canonical UUIDs', () => {
    expect(isValidTabPresenceId('770e8400-e29b-41d4-a716-446655440002')).toBe(true);
    expect(isValidTabPresenceId('not-uuid')).toBe(false);
    expect(isValidTabPresenceId(null)).toBe(false);
  });

  test('stable within one sessionStorage context', () => {
    const store = new Map<string, string>();
    const sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    const g = globalThis as typeof globalThis & {
      window?: { sessionStorage: typeof sessionStorage };
      crypto: Crypto;
    };
    const priorWindow = g.window;
    g.window = { sessionStorage } as unknown as Window & typeof globalThis;

    const first = getOrCreateTabPresenceId();
    const second = getOrCreateTabPresenceId();
    expect(first).toBe(second);
    expect(isValidTabPresenceId(store.get(STORAGE_KEY))).toBe(true);

    g.window = priorWindow;
  });

  test('regenerated when absent and malformed stored value replaced', () => {
    const store = new Map<string, string>([[STORAGE_KEY, 'bad-value']]);
    const sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    const g = globalThis as typeof globalThis & {
      window?: { sessionStorage: typeof sessionStorage };
    };
    const priorWindow = g.window;
    g.window = { sessionStorage } as unknown as Window & typeof globalThis;

    const id = getOrCreateTabPresenceId();
    expect(isValidTabPresenceId(id)).toBe(true);
    expect(store.get(STORAGE_KEY)).toBe(id);
    expect(id).not.toBe('bad-value');

    g.window = priorWindow;
  });

  test('safe fallback when storage is unavailable', () => {
    const g = globalThis as typeof globalThis & { window?: { sessionStorage: Storage } };
    const priorWindow = g.window;
    g.window = {
      sessionStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      } as unknown as Storage,
    } as unknown as Window & typeof globalThis;

    const a = getOrCreateTabPresenceId();
    const b = getOrCreateTabPresenceId();
    expect(isValidTabPresenceId(a)).toBe(true);
    expect(a).toBe(b);

    resetTabPresenceIdMemoryFallbackForTests();
    const c = getOrCreateTabPresenceId();
    expect(c).not.toBe(a);

    g.window = priorWindow;
  });

  test('M-3: crypto.randomUUID unavailable still returns valid UUID via getRandomValues', () => {
    const store = new Map<string, string>();
    const sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    const g = globalThis as typeof globalThis & {
      window?: { sessionStorage: typeof sessionStorage };
    };
    const priorWindow = g.window;
    g.window = { sessionStorage } as unknown as Window & typeof globalThis;

    const originalRandomUuid = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: undefined,
    });

    const id = getOrCreateTabPresenceId();
    expect(isValidTabPresenceId(id)).toBe(true);

    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: originalRandomUuid,
    });
    if (priorWindow !== undefined) {
      g.window = priorWindow;
    } else {
      delete (g as { window?: unknown }).window;
    }
  });

  test('M-3: hook safely no-ops when tab id cannot be created', () => {
    const hook = readFileSync(join(process.cwd(), 'hooks/usePresenceHeartbeat.ts'), 'utf8');
    expect(hook).toContain('if (!tabPresenceIdRef.current)');
    expect(hook).toContain('return;');
  });

  test('separate tab contexts can have separate IDs via distinct storage maps', () => {
    const tabA = new Map<string, string>();
    const tabB = new Map<string, string>();

    const readTab = (store: Map<string, string>) => {
      const g = globalThis as typeof globalThis & {
        window?: { sessionStorage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } };
      };
      g.window = {
        sessionStorage: {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => {
            store.set(k, v);
          },
        },
      } as unknown as Window & typeof globalThis;
      resetTabPresenceIdMemoryFallbackForTests();
      return getOrCreateTabPresenceId();
    };

    const idA = readTab(tabA);
    const idB = readTab(tabB);
    expect(idA).not.toBe(idB);
  });
});

test.describe('tabPresenceId static wiring', () => {
  test('hook uses sessionStorage-backed helper', () => {
    const hook = readFileSync(join(process.cwd(), 'hooks/usePresenceHeartbeat.ts'), 'utf8');
    expect(hook).toContain('getOrCreateTabPresenceId');
    expect(hook).toContain('sessionUserId');
  });
});
