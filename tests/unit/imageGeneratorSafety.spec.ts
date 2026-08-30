import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import {
  moderateImagePrompt,
  validateGeneratedCandidateSafety,
} from '../../lib/imageGenerator/safety';

test('prompt safety blocks high-confidence prohibited profile imagery', () => {
  expect(moderateImagePrompt('A nude underage child')).toEqual({
    allowed: false,
    code: 'sexual_minors',
  });
  expect(moderateImagePrompt('ISIS recruitment propaganda poster')).toEqual({
    allowed: false,
    code: 'extremist_praise',
  });
  expect(moderateImagePrompt('A graphic gore beheading')).toEqual({
    allowed: false,
    code: 'graphic_violence',
  });
});

test('prompt safety preserves ordinary fantasy and chess language', () => {
  expect(moderateImagePrompt('A fierce chess knight attacking a neon king')).toEqual({
    allowed: true,
    code: null,
  });
  expect(moderateImagePrompt('Electric purple badge with a slow pulse aura')).toEqual({
    allowed: true,
    code: null,
  });
});

test('candidate safety verifies signature, size, and dimensions', () => {
  expect(() =>
    validateGeneratedCandidateSafety({
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
    })
  ).not.toThrow();
  expect(() =>
    validateGeneratedCandidateSafety({
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]),
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
    })
  ).toThrow('candidate_safety_signature_invalid');
});

test('provider moderation and database review gates are both explicit', async () => {
  const provider = await readFile(join(process.cwd(), 'lib/imageGenerator/provider.ts'), 'utf8');
  const worker = await readFile(join(process.cwd(), 'lib/imageGenerator/worker.ts'), 'utf8');
  const migration = (
    await readFile(
      join(
        process.cwd(),
        'supabase/migrations/20260830233000_image_generation_moderation_safety.sql'
      ),
      'utf8'
    )
  ).toLowerCase();
  expect(provider).toContain("moderation: 'auto'");
  expect(worker).toContain('validateGeneratedCandidateSafety(candidate)');
  expect(worker).toContain("p_moderation_status: 'approved'");
  expect(migration).toContain("alter column moderation_status set default 'pending'");
  expect(migration).toContain("and c.moderation_status = 'approved'");
  expect(migration).toContain('candidate must pass moderation before registration');
});
