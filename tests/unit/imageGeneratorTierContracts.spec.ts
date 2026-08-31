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

test('Plus and Pro guided refinements stay inside the original token-funded commission', async () => {
  const sql = await source(
    'supabase/migrations/20260831070000_generation_guided_refinements.sql'
  );
  const api = await source('app/api/image-generations/[id]/refinements/route.ts');
  const worker = await source('lib/imageGenerator/refinementWorker.ts');
  const recovery = await source(
    'supabase/migrations/20260831071000_refinement_stale_job_recovery.sql'
  );
  const screen = await source('components/image-generator/ImageGeneratorCreateScreen.tsx');

  expect(sql).toContain("when 'plus' then 1");
  expect(sql).toContain("when 'pro' then 4");
  expect(sql).toContain("when 'internal_unlimited' then 4");
  expect(sql).toContain("if v_candidate_start + 1 > 13");
  expect(sql).toContain('guided refinement is still processing');
  expect(sql).not.toContain('transition_generation_token_redemption');
  expect(sql).not.toContain('commission_reservation');
  expect(api).toContain("rpc('create_image_generation_refinement'");
  expect(worker).toContain('candidateCount: 2');
  expect(worker).toContain(".from('image-generation-candidates')");
  expect(recovery).toContain('recover_stale_image_generation_refinements');
  expect(recovery).toContain("failure_code = 'worker_interrupted'");
  expect(screen).toContain('without spending another token');
});

test('accepted creations preserve immutable Pro evolution lineage', async () => {
  const sql = await source('supabase/migrations/20260831072000_saved_creation_lineage.sql');
  const worker = await source('lib/imageGenerator/worker.ts');
  const vault = await source('components/image-generator/SavedCreationsCard.tsx');

  expect(sql).toContain('create table public.image_saved_creations');
  expect(sql).toContain('parent_creation_id uuid references public.image_saved_creations');
  expect(sql).toContain('root_creation_id uuid references public.image_saved_creations');
  expect(sql).toContain('create trigger preserve_approved_image_creation_trigger');
  expect(sql).toContain('furthering a saved creation requires Pro');
  expect(sql).toContain("p_prompt, 5::smallint");
  expect(worker).toContain('request.parent_saved_creation_id');
  expect(worker).toContain(".from('image_saved_creations')");
  expect(vault).toContain('Spend 1 token and further');
});

test('one central motion policy protects audience and reduced-motion boundaries', async () => {
  const policy = await source('lib/imageGenerator/motionPolicy.ts');
  const route = await source('app/api/profiles/[id]/motion-policy/route.ts');

  expect(policy).toContain("input.tier === 'free'");
  expect(policy).toContain("input.tier === 'plus'");
  expect(policy).toContain("input.context !== 'owner_profile'");
  expect(policy).toContain("input.context === 'chat' || input.context === 'game'");
  expect(policy).toContain("input.surface !== 'profile_icon'");
  expect(policy).toContain("requiresStillFallback: true");
  expect(policy).toContain("if (input.reducedMotion)");
  expect(route).toContain("rpc('effective_image_generator_tier'");
  expect(route).toContain('explicitlyAuthorizedPublicSurface: false');
});

test('licensed presentation effects remain lazy, reduced-motion safe, and mobile bounded', async () => {
  const screen = await source('components/image-generator/ImageGeneratorCreateScreen.tsx');
  const review = await source('components/image-generator/CandidateReviewGrid.tsx');
  const rays = await source('components/blurred-rays.tsx');

  expect(screen).toContain('dynamic(() => import("@/components/blurred-rays")');
  expect(screen).toContain('useReducedMotion() === true');
  expect(screen).toContain('window.matchMedia("(min-width: 768px)")');
  expect(screen).toContain('presentationMotionEnabled');
  expect(review).toContain('BlurHighlight');
  expect(review).toContain('<Flicker');
  expect(review).toContain('!prefersReducedMotion');
  expect(rays).toContain('dpr={[1, 1.5]}');
  expect(rays).toContain('powerPreference: "low-power"');
});
