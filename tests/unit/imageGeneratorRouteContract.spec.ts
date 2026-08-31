import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

async function source(path: string): Promise<string> {
  return readFile(join(process.cwd(), path), 'utf8');
}

test('create route requires authentication, idempotency, and server-derived tier limits', async () => {
  const code = await source('app/api/image-generations/route.ts');
  expect(code).toContain('resolveAuthenticatedUser(request)');
  expect(code).toContain("request.headers.get('idempotency-key')");
  expect(code).toContain("rpc('create_image_generation_request_with_references'");
  expect(code).toContain("rpc('effective_image_generator_tier'");
  expect(code).toContain("tier === 'free' ? 3 : tier === 'plus' ? 4 : 5");
  expect(code).toContain('insufficient_generation_tokens');
});

test('candidate access uses an expiring private signed URL', async () => {
  const code = await source(
    'app/api/image-generations/[id]/candidates/[candidateId]/access/route.ts'
  );
  expect(code).toContain(".from('image-generation-candidates')");
  expect(code).toContain('.createSignedUrl(');
  expect(code).toContain(".eq('status', 'review')");
  expect(code).toContain(".gt('review_expires_at', new Date().toISOString())");
  expect(code).toContain("'Cache-Control': 'private, no-store'");
});

test('placement copies only an approved candidate into the two allowed public surfaces', async () => {
  const code = await source('app/api/profile/imagery/route.ts');
  expect(code).toContain(".eq('status', 'approved')");
  expect(code).toContain("'profile-avatars'");
  expect(code).toContain("'profile-backgrounds'");
  expect(code).toContain("rpc('place_approved_profile_image'");
});

test('worker refuses to claim jobs until both secret and provider are configured', async () => {
  const code = await source('app/api/internal/image-generation/process/route.ts');
  expect(code).toContain('imageGenerationWorkerConfigured()');
  expect(code).toContain('verifyImageGenerationWorkerRequest(request)');
  expect(code).toContain('configuredImageGenerationProvider()');
  expect(code).toContain('processImageGenerationBatch(');
  expect(code).toContain("rpc('mint_due_generation_token_allowances'");
  expect(code).toContain("rpc('transition_generation_token_redemption'");
});
