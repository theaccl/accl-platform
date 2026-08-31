import { createHash } from 'node:crypto';
import sharp from 'sharp';

import {
  REFERENCE_IMAGE_MAX_BYTES,
  REFERENCE_IMAGE_MAX_DIMENSION,
  REFERENCE_IMAGE_MIN_DIMENSION,
} from '@/lib/imageGenerator/domain';

export const REFERENCE_IMAGE_INPUT_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type ReferenceImageInputMimeType = (typeof REFERENCE_IMAGE_INPUT_MIME_TYPES)[number];

export type SanitizedReferenceImage = {
  bytes: Uint8Array;
  mimeType: 'image/webp';
  width: number;
  height: number;
  sha256: string;
};

export function acceptedReferenceImageMimeType(value: string): value is ReferenceImageInputMimeType {
  return REFERENCE_IMAGE_INPUT_MIME_TYPES.includes(value as ReferenceImageInputMimeType);
}

/** Decode, orient, resize, and re-encode user input so provider calls never receive raw uploads. */
export async function sanitizeReferenceImage(
  input: Uint8Array,
  declaredMimeType: string
): Promise<SanitizedReferenceImage> {
  if (!acceptedReferenceImageMimeType(declaredMimeType)) {
    throw new Error('reference_mime_invalid');
  }
  if (input.byteLength < 8 || input.byteLength > REFERENCE_IMAGE_MAX_BYTES) {
    throw new Error('reference_size_invalid');
  }

  let result: { data: Buffer; info: sharp.OutputInfo };
  try {
    result = await sharp(input, {
      animated: false,
      failOn: 'error',
      limitInputPixels: REFERENCE_IMAGE_MAX_DIMENSION * REFERENCE_IMAGE_MAX_DIMENSION,
    })
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: 'inside',
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      })
      .webp({ quality: 90, alphaQuality: 100, effort: 4 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new Error('reference_decode_invalid');
  }

  const { width, height } = result.info;
  if (
    width < REFERENCE_IMAGE_MIN_DIMENSION ||
    height < REFERENCE_IMAGE_MIN_DIMENSION ||
    width > REFERENCE_IMAGE_MAX_DIMENSION ||
    height > REFERENCE_IMAGE_MAX_DIMENSION
  ) {
    throw new Error('reference_dimensions_invalid');
  }
  if (result.data.byteLength > REFERENCE_IMAGE_MAX_BYTES) {
    throw new Error('reference_sanitized_size_invalid');
  }

  return {
    bytes: new Uint8Array(result.data),
    mimeType: 'image/webp',
    width,
    height,
    sha256: createHash('sha256').update(result.data).digest('hex'),
  };
}
