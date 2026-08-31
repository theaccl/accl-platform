import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

async function source(path: string): Promise<string> {
  return readFile(join(process.cwd(), path), 'utf8');
}

test('Pro receives two private references while Free and Plus remain capped at one', async () => {
  const sql = await source(
    'supabase/migrations/20260831063000_generation_tier_reference_and_placement_contracts.sql'
  );
  const route = await source('app/api/image-generations/route.ts');
  const screen = await source('components/image-generator/ImageGeneratorCreateScreen.tsx');
  const followUp = await source(
    'supabase/migrations/20260831064500_allow_multiple_references_per_request.sql'
  );

  expect(sql).toContain("v_max_references := case when v_tier in ('pro', 'internal_unlimited') then 2 else 1 end");
  expect(sql).toContain('reference count exceeds effective membership tier');
  expect(sql).toContain('add column request_id uuid');
  expect(sql).not.toContain('add column request_id uuid unique');
  expect(followUp).toContain('drop constraint if exists image_generation_references_request_id_key');
  expect(route).toContain("rpc('create_image_generation_request_with_references'");
  expect(screen).toContain('Add second Pro reference');
});

test('Free and Plus permit one placement while Pro gets an atomic matching set', async () => {
  const sql = await source(
    'supabase/migrations/20260831063000_generation_tier_reference_and_placement_contracts.sql'
  );
  const setRoute = await source('app/api/profile/imagery/set/route.ts');
  const screen = await source('components/image-generator/ImageGeneratorCreateScreen.tsx');

  expect(sql).toContain('this commission permits either icon or background placement, not both');
  expect(sql).toContain('create or replace function public.place_approved_profile_image_set');
  expect(sql).toContain("matching icon and background placement requires Pro");
  expect(setRoute).toContain("rpc('place_approved_profile_image_set'");
  expect(setRoute).toContain("createProfileStillDerivative(source, 'profile_image')");
  expect(setRoute).toContain("createProfileStillDerivative(source, 'profile_background')");
  expect(screen).toContain('Place matching icon + background');
});

test('multi-reference provider input remains server-sanitized and private', async () => {
  const worker = await source('lib/imageGenerator/worker.ts');
  const provider = await source('lib/imageGenerator/provider.ts');

  expect(worker).toContain('const referenceIds = [request.reference_id, request.reference_id_2]');
  expect(worker).toContain(".from('image-generation-references')");
  expect(worker).toContain('disposeReferenceImages(supabase, consumedReferences)');
  expect(provider).toContain('images: input.referenceImages.map((image) => image.bytes)');
});
