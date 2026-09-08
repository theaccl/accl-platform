import { expect, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImageGenerationCandidateRow } from '../../lib/imageGenerator/domain';
import { preflightProfilePlacement } from '../../lib/imageGenerator/placementPreflight';

const candidate = { id: 'winner', request_id: 'commission', owner_id: 'owner', status: 'approved', moderation_status: 'approved' } as ImageGenerationCandidateRow;
const icon = { surface: 'profile_image', candidate_id: 'winner', published_storage_path: 'owner/generated/winner/icon.webp', still_only_in_community: true, derivative_format: 'webp', derivative_width: 512, derivative_height: 512, derivative_byte_size: 1000, derivative_version: 'placement.v1' };
const background = { ...icon, surface: 'profile_background', published_storage_path: 'owner/generated/winner/background.webp', derivative_width: 1600, derivative_height: 900 };

function client(options: { tier?: string; status?: string; events?: unknown[]; assignments?: unknown[]; avatar?: string; background?: string; failure?: string } = {}) {
  const queries: Array<{ table: string; filters: unknown[][] }> = [];
  const data: Record<string, unknown[]> = {
    image_generation_requests: [{ id: 'commission', owner_id: 'owner', status: options.status ?? 'approved', membership_tier: options.tier ?? 'plus' }],
    image_generation_approval_events: (options.events ?? []).map((event) => ({ request_id: 'commission', owner_id: 'owner', event_type: 'placed', ...(event as object) })),
    profile_imagery_assignments: (options.assignments ?? []).map((assignment) => ({ user_id: 'owner', ...(assignment as object) })),
    profiles: [{ id: 'owner', avatar_path: options.avatar ?? icon.published_storage_path, profile_background_path: options.background ?? background.published_storage_path }],
  };
  return { queries, supabase: { from(table: string) {
    const filters: unknown[][] = [];
    queries.push({ table, filters });
    let rows = data[table] as Record<string, unknown>[];
    const result = () => ({ data: rows, error: options.failure === table ? { message: 'unavailable' } : null });
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { filters.push([key, value]); rows = rows.filter((row) => row[key] === value); return query; },
      in(key: string, values: unknown[]) { filters.push([key, values]); rows = rows.filter((row) => values.includes(row[key])); return query; },
      async maybeSingle() { return { ...result(), data: rows[0] ?? null }; },
      then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); },
    };
    return query;
  } } as unknown as SupabaseClient };
}

test('placement conceals non-owner, rejected, and unmoderated candidates before querying', async () => {
  for (const change of [{ owner_id: 'other' }, { status: 'rejected' }, { moderation_status: 'pending' }]) {
    const mock = client();
    expect(await preflightProfilePlacement(mock.supabase, 'owner', { ...candidate, ...change } as ImageGenerationCandidateRow, 'profile_image')).toMatchObject({ status: 404 });
    expect(mock.queries).toHaveLength(0);
  }
});

test('placement rejects missing approval and unknown membership contracts', async () => {
  for (const options of [{ status: 'review' }, { tier: 'constructor' }, { tier: 'unknown' }]) {
    expect(await preflightProfilePlacement(client(options).supabase, 'owner', candidate, 'profile_image')).toMatchObject({ status: 404 });
  }
});

test('Free and Plus cannot create a set or change their historically selected surface', async () => {
  for (const tier of ['free', 'plus']) {
    const set = client({ tier });
    expect(await preflightProfilePlacement(set.supabase, 'owner', candidate, 'matching_set')).toMatchObject({ status: 403 });
    expect(set.queries.map((query) => query.table)).toEqual(['image_generation_requests']);
    const single = client({ tier, events: [{ surface: 'profile_image' }] });
    expect(await preflightProfilePlacement(single.supabase, 'owner', candidate, 'profile_background')).toMatchObject({ status: 403 });
    expect(single.queries).toHaveLength(2);
  }
});

test('completed single placements replay their existing still derivative', async () => {
  const mock = client({ events: [{ surface: 'profile_image' }], assignments: [icon] });
  expect(await preflightProfilePlacement(mock.supabase, 'owner', candidate, 'profile_image')).toMatchObject({ replay: { profile_image: icon } });
  expect(mock.queries[0].filters).toContainEqual(['owner_id', 'owner']);
  expect(mock.queries[0].filters).toContainEqual(['status', 'approved']);
  expect(mock.queries[2].filters).toContainEqual(['user_id', 'owner']);
});

test('Pro and Unlimited replay only a complete currently placed matching set', async () => {
  for (const tier of ['pro', 'internal_unlimited']) {
    expect(await preflightProfilePlacement(client({ tier, assignments: [icon, background] }).supabase, 'owner', candidate, 'matching_set'))
      .toMatchObject({ replay: { profile_image: icon, profile_background: background } });
    expect(await preflightProfilePlacement(client({ tier, assignments: [icon] }).supabase, 'owner', candidate, 'matching_set')).toEqual({ replay: null });
  }
});

test('replacing profile imagery allows intentional restoration instead of a false replay', async () => {
  expect(await preflightProfilePlacement(client({ assignments: [icon], avatar: 'owner/manual-avatar.webp' }).supabase, 'owner', candidate, 'profile_image')).toEqual({ replay: null });
});

test('old, unsafe or incorrectly sized assignments are not replayed', async () => {
  for (const change of [{ derivative_version: 'old' }, { derivative_width: 1 }, { still_only_in_community: false }, { derivative_byte_size: 0 }]) {
    expect(await preflightProfilePlacement(client({ assignments: [{ ...icon, ...change }] }).supabase, 'owner', candidate, 'profile_image')).toEqual({ replay: null });
  }
});

test('database read failures fail closed at every preflight stage', async () => {
  for (const failure of ['image_generation_requests', 'image_generation_approval_events', 'profile_imagery_assignments', 'profiles']) {
    expect(await preflightProfilePlacement(client({ failure, assignments: [icon] }).supabase, 'owner', candidate, 'profile_image')).toMatchObject({ status: 500 });
  }
});
