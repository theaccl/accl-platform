import sharp from 'sharp';

import type { ProfileImageSurface } from '@/lib/imageGenerator/domain';

export const PROFILE_DERIVATIVE_VERSION = 'placement.v1' as const;

export const PROFILE_STILL_SPECS = {
  profile_image: { width: 512, height: 512, maxBytes: 5 * 1024 * 1024 },
  profile_background: { width: 1600, height: 900, maxBytes: 8 * 1024 * 1024 },
} as const;

export type ProfileStillDerivative = {
  bytes: Buffer;
  mimeType: 'image/webp';
  extension: 'webp';
  width: number;
  height: number;
  byteSize: number;
  version: typeof PROFILE_DERIVATIVE_VERSION;
};

export async function createProfileStillDerivative(
  source: Uint8Array,
  surface: ProfileImageSurface
): Promise<ProfileStillDerivative> {
  const spec = PROFILE_STILL_SPECS[surface];
  const bytes = await sharp(source, {
    animated: false,
    failOn: 'warning',
    limitInputPixels: 40_000_000,
    sequentialRead: true,
  })
    .rotate()
    .resize({
      width: spec.width,
      height: spec.height,
      fit: 'cover',
      position: sharp.strategy.attention,
      kernel: sharp.kernel.lanczos3,
    })
    .webp({ quality: 86, alphaQuality: 90, effort: 4, smartSubsample: true })
    .toBuffer();

  if (bytes.byteLength < 1 || bytes.byteLength > spec.maxBytes) {
    throw new Error('profile_derivative_size_invalid');
  }
  const metadata = await sharp(bytes, { animated: false }).metadata();
  if (metadata.format !== 'webp' || metadata.width !== spec.width || metadata.height !== spec.height) {
    throw new Error('profile_derivative_dimensions_invalid');
  }
  if (metadata.pages != null && metadata.pages > 1) {
    throw new Error('profile_derivative_must_be_still');
  }

  return {
    bytes,
    mimeType: 'image/webp',
    extension: 'webp',
    width: spec.width,
    height: spec.height,
    byteSize: bytes.byteLength,
    version: PROFILE_DERIVATIVE_VERSION,
  };
}
