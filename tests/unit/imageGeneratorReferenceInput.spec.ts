import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';

import { sanitizeReferenceImage } from '../../lib/imageGenerator/referenceImage';

const migration = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260831015904_image_generation_reference_inputs.sql'
);

test('reference image migration keeps uploads private and binds each reference to one request', async () => {
  const sql = (await readFile(migration, 'utf8')).toLowerCase();
  expect(sql).toContain('create table public.image_generation_references');
  expect(sql).toContain("'image-generation-references',\n  'image-generation-references',\n  false,");
  expect(sql).toContain('create unique index image_generation_requests_reference_once_idx');
  expect(sql).toContain("where r.id = p_reference_id and r.owner_id = p_owner_id");
  expect(sql).toContain("v_reference.status <> 'ready'");
  expect(sql).toContain('v_reference.expires_at <= now()');
  expect(sql).toContain('alter table public.image_generation_references enable row level security');
  expect(sql).not.toContain('create policy image_generation_references_storage');
});

test('reference route authenticates, checks Pro access, sanitizes, and writes only to private storage', async () => {
  const code = await readFile(
    join(process.cwd(), 'app/api/image-generations/references/route.ts'),
    'utf8'
  );
  expect(code).toContain('resolveAuthenticatedUser(request)');
  expect(code).toContain(".eq('entitlement', 'image_generator')");
  expect(code).toContain('sanitizeReferenceImage(');
  expect(code).toContain(".from('image-generation-references')");
  expect(code).toContain("'Cache-Control': 'private, no-store'");
});

test('worker downloads the private reference for generation and disposes it afterward', async () => {
  const code = await readFile(join(process.cwd(), 'lib/imageGenerator/worker.ts'), 'utf8');
  expect(code).toContain(".from('image_generation_references')");
  expect(code).toContain(".from('image-generation-references')");
  expect(code).toContain('.download(reference.storage_path)');
  expect(code).toContain('referenceImage,');
  expect(code).toContain('disposeReferenceImage(supabase, request.reference_id, referenceStoragePath)');
  expect(code).toContain("status: removed.error ? 'cleanup_pending' : 'deleted'");
});

test('reference sanitizer decodes and re-encodes a safe provider input', async () => {
  const input = await sharp({
    create: { width: 512, height: 384, channels: 4, background: '#7c3aed' },
  })
    .png()
    .toBuffer();

  const output = await sanitizeReferenceImage(new Uint8Array(input), 'image/png');
  expect(output.mimeType).toBe('image/webp');
  expect(output.width).toBe(512);
  expect(output.height).toBe(384);
  expect(output.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(await sharp(output.bytes).metadata()).toMatchObject({ format: 'webp' });
});

test('reference sanitizer rejects unsupported or undecodable input', async () => {
  await expect(sanitizeReferenceImage(new Uint8Array(20), 'image/gif')).rejects.toThrow(
    'reference_mime_invalid'
  );
  await expect(sanitizeReferenceImage(new Uint8Array(20), 'image/png')).rejects.toThrow(
    'reference_decode_invalid'
  );
});
