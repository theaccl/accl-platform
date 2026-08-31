import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';

import {
  createProfileStillDerivative,
  PROFILE_DERIVATIVE_VERSION,
} from '../../lib/imageGenerator/derivatives';

async function sourceImage(): Promise<Buffer> {
  return sharp({
    create: { width: 1024, height: 1024, channels: 4, background: '#6d28d9' },
  })
    .png()
    .toBuffer();
}

test('profile icon derivative is a stripped 512px still WebP', async () => {
  const derivative = await createProfileStillDerivative(await sourceImage(), 'profile_image');
  const metadata = await sharp(derivative.bytes).metadata();
  expect(derivative).toMatchObject({
    mimeType: 'image/webp',
    extension: 'webp',
    width: 512,
    height: 512,
    version: PROFILE_DERIVATIVE_VERSION,
  });
  expect(metadata).toMatchObject({ format: 'webp', width: 512, height: 512 });
  expect(metadata.pages ?? 1).toBe(1);
});

test('profile background derivative is a cropped 1600x900 still WebP', async () => {
  const derivative = await createProfileStillDerivative(await sourceImage(), 'profile_background');
  const metadata = await sharp(derivative.bytes).metadata();
  expect(derivative).toMatchObject({ width: 1600, height: 900, mimeType: 'image/webp' });
  expect(metadata).toMatchObject({ format: 'webp', width: 1600, height: 900 });
  expect(metadata.pages ?? 1).toBe(1);
});

test('placement route uploads the derivative instead of the private raw candidate', async () => {
  const code = await readFile(join(process.cwd(), 'app/api/profile/imagery/route.ts'), 'utf8');
  expect(code).toContain('createProfileStillDerivative(');
  expect(code).toContain('upload(path, derivative.bytes');
  expect(code).toContain('contentType: derivative.mimeType');
  expect(code).toContain('recordPlacementDerivativeCost(');
  expect(code).not.toContain('upload(path, downloaded.data');
});

test('database locks derivative dimensions and community still-only behavior', async () => {
  const sql = (
    await readFile(
      join(process.cwd(), 'supabase/migrations/20260830234500_profile_imagery_derivatives.sql'),
      'utf8'
    )
  ).toLowerCase();
  expect(sql).toContain("p_derivative_format <> 'webp'");
  expect(sql).toContain('p_derivative_width <> 512');
  expect(sql).toContain('p_derivative_width <> 1600');
  expect(sql).toContain('still_only_in_community = true');
  expect(sql).toContain('motion_enabled_on_profile = false');
  expect(sql).toContain("c.moderation_status = 'approved'");
});
