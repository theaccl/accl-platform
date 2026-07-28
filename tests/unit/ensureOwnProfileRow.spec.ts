import { expect, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { ensureOwnProfileRow } from '../../lib/ensureOwnProfileRow';

const AUTH_UID = '550e8400-e29b-41d4-a716-446655440000';

type LookupOutcome =
  | { data: { id: string } | null; error: null }
  | { data: null; error: { message: string; code?: string } };

type InsertOutcome = { error: null } | { error: { message: string; code?: string } };

function createMockClient(config: {
  lookups: LookupOutcome[];
  insert?: InsertOutcome;
}): {
  client: SupabaseClient;
  insertCalls: unknown[];
  updateCalls: unknown[];
  upsertCalls: unknown[];
  eqFilters: string[];
} {
  let lookupIndex = 0;
  const insertCalls: unknown[] = [];
  const updateCalls: unknown[] = [];
  const upsertCalls: unknown[] = [];
  const eqFilters: string[] = [];

  const client = {
    from: (table: string) => {
      expect(table).toBe('profiles');
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            expect(column).toBe('id');
            eqFilters.push(value);
            return {
              maybeSingle: async () => {
                const outcome = config.lookups[lookupIndex];
                if (!outcome) {
                  throw new Error(`unexpected lookup #${lookupIndex}`);
                }
                lookupIndex += 1;
                return outcome;
              },
            };
          },
        }),
        insert: (payload: unknown) => {
          insertCalls.push(payload);
          return config.insert ?? { error: null };
        },
        update: (payload: unknown) => {
          updateCalls.push(payload);
          return {};
        },
        upsert: (payload: unknown) => {
          upsertCalls.push(payload);
          return {};
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, insertCalls, updateCalls, upsertCalls, eqFilters };
}

test.describe('ensureOwnProfileRow', () => {
  test('existing row returns success, reports pre-existing, performs no INSERT', async () => {
    const { client, insertCalls, updateCalls, upsertCalls, eqFilters } = createMockClient({
      lookups: [{ data: { id: AUTH_UID }, error: null }],
    });

    const result = await ensureOwnProfileRow(client, AUTH_UID);

    expect(result).toEqual({ ok: true, existed: true });
    expect(insertCalls).toEqual([]);
    expect(updateCalls).toEqual([]);
    expect(upsertCalls).toEqual([]);
    expect(eqFilters).toEqual([AUTH_UID]);
  });

  test('missing row performs plain INSERT with exact minimal payload and returns newly created success', async () => {
    const { client, insertCalls, eqFilters } = createMockClient({
      lookups: [{ data: null, error: null }],
      insert: { error: null },
    });

    const result = await ensureOwnProfileRow(client, AUTH_UID);

    expect(result).toEqual({ ok: true, existed: false });
    expect(insertCalls).toEqual([{ id: AUTH_UID, username: null }]);
    expect(eqFilters).toEqual([AUTH_UID]);
  });

  test('insert 23505 with re-read finding row returns concurrent pre-existing success', async () => {
    const { client, insertCalls } = createMockClient({
      lookups: [
        { data: null, error: null },
        { data: { id: AUTH_UID }, error: null },
      ],
      insert: { error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
    });

    const result = await ensureOwnProfileRow(client, AUTH_UID);

    expect(result).toEqual({ ok: true, existed: true });
    expect(insertCalls).toEqual([{ id: AUTH_UID, username: null }]);
  });

  test('insert 23505 with re-read finding no row returns profile_provision_failed', async () => {
    const { client, insertCalls } = createMockClient({
      lookups: [
        { data: null, error: null },
        { data: null, error: null },
      ],
      insert: { error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
    });

    const result = await ensureOwnProfileRow(client, AUTH_UID);

    expect(result).toEqual({
      ok: false,
      error: 'profile_provision_failed',
      detail: 'duplicate key value violates unique constraint',
    });
    expect(insertCalls).toEqual([{ id: AUTH_UID, username: null }]);
  });

  test('non-23505 insert failure returns profile_provision_failed', async () => {
    const { client } = createMockClient({
      lookups: [{ data: null, error: null }],
      insert: { error: { code: '23503', message: 'insert or update on table "profiles" violates foreign key constraint' } },
    });

    const result = await ensureOwnProfileRow(client, AUTH_UID);

    expect(result).toEqual({
      ok: false,
      error: 'profile_provision_failed',
      detail: 'insert or update on table "profiles" violates foreign key constraint',
    });
  });

  test('initial lookup database failure returns structured lookup failure', async () => {
    const { client, insertCalls } = createMockClient({
      lookups: [{ data: null, error: { message: 'connection reset', code: '08006' } }],
    });

    const result = await ensureOwnProfileRow(client, AUTH_UID);

    expect(result).toEqual({
      ok: false,
      error: 'profile_lookup_failed',
      detail: 'connection reset',
    });
    expect(insertCalls).toEqual([]);
  });

  test('post-23505 re-read database failure returns structured lookup failure', async () => {
    const { client } = createMockClient({
      lookups: [
        { data: null, error: null },
        { data: null, error: { message: 'read timed out', code: '57014' } },
      ],
      insert: { error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
    });

    const result = await ensureOwnProfileRow(client, AUTH_UID);

    expect(result).toEqual({
      ok: false,
      error: 'profile_lookup_failed',
      detail: 'read timed out',
    });
  });

  test('never performs UPDATE or UPSERT and constrains all profile queries to supplied UID', async () => {
    const otherUid = '660e8400-e29b-41d4-a716-446655440001';
    const { client, updateCalls, upsertCalls, eqFilters } = createMockClient({
      lookups: [{ data: { id: AUTH_UID }, error: null }],
    });

    await ensureOwnProfileRow(client, otherUid);

    expect(updateCalls).toEqual([]);
    expect(upsertCalls).toEqual([]);
    expect(eqFilters).toEqual([otherUid]);
    expect(eqFilters).not.toContain(AUTH_UID);
  });
});
