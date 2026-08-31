import { generateImage } from 'ai';

import type { ImageGenerationCandidateRow, ImageGenerationRequestRow } from '@/lib/imageGenerator/domain';

export const IMAGE_GENERATION_PROVIDER = 'vercel_ai_gateway';
export const DEFAULT_IMAGE_GENERATION_MODEL = 'openai/gpt-image-2';
export const IMAGE_GENERATION_SIZE = '1024x1024' as const;
export const IMAGE_GENERATION_QUALITY = 'medium' as const;

export type GeneratedImage = {
  bytes: Uint8Array;
  mimeType: ImageGenerationCandidateRow['mime_type'];
  width?: number;
  height?: number;
};

export interface ImageGenerationProvider {
  readonly name: string;
  readonly model: string | null;
  generate(input: {
    prompt: string;
    candidateCount: number;
    requestId: string;
    ownerId: string;
    membershipTier?: 'free' | 'plus' | 'pro' | 'internal_unlimited';
    operation?: 'opening' | 'refinement';
    attemptNumber?: number;
    refinementId?: string;
    referenceImages?: Array<{
      bytes: Uint8Array;
      mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
    }>;
  }): Promise<GeneratedImage[]>;
}

type GenerateImageFn = typeof generateImage;

function acceptedImageMimeType(value: string): ImageGenerationCandidateRow['mime_type'] {
  if (value === 'image/png' || value === 'image/jpeg' || value === 'image/webp') return value;
  throw new Error('provider_candidate_mime_invalid');
}

/** Server-only adapter for OpenAI GPT Image through Vercel AI Gateway. */
export class VercelGatewayImageGenerationProvider implements ImageGenerationProvider {
  readonly name = IMAGE_GENERATION_PROVIDER;

  constructor(
    readonly model = DEFAULT_IMAGE_GENERATION_MODEL,
    private readonly generateImageFn: GenerateImageFn = generateImage
  ) {}

  async generate(input: {
    prompt: string;
    candidateCount: number;
    requestId: string;
    ownerId: string;
    membershipTier?: 'free' | 'plus' | 'pro' | 'internal_unlimited';
    operation?: 'opening' | 'refinement';
    attemptNumber?: number;
    refinementId?: string;
    referenceImages?: Array<{
      bytes: Uint8Array;
      mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
    }>;
  }): Promise<GeneratedImage[]> {
    if (!Number.isInteger(input.candidateCount) || input.candidateCount < 1 || input.candidateCount > 5) {
      throw new Error('provider_candidate_count_invalid');
    }

    const operation = input.operation ?? 'opening';
    const attemptNumber = Number.isInteger(input.attemptNumber) && (input.attemptNumber ?? 0) > 0
      ? input.attemptNumber!
      : 1;
    const environment = process.env.VERCEL_ENV?.trim().toLowerCase() || 'local';
    const gatewayTags = [
      'feature:image-generator',
      `request:${input.requestId}`,
      `operation:${operation}`,
      `tier:${input.membershipTier ?? 'unknown'}`,
      `attempt:${attemptNumber}`,
      `environment:${environment}`,
      ...(input.refinementId ? [`refinement:${input.refinementId}`] : []),
    ];

    const result = await this.generateImageFn({
      model: this.model,
      prompt: input.referenceImages?.length
        ? { text: input.prompt, images: input.referenceImages.map((image) => image.bytes) }
        : input.prompt,
      n: input.candidateCount,
      // Some Gateway image providers only return one image per upstream call.
      // Let the AI SDK split the four-candidate commission into compatible calls.
      maxImagesPerCall: 1,
      size: IMAGE_GENERATION_SIZE,
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(180_000),
      providerOptions: {
        openai: {
          quality: IMAGE_GENERATION_QUALITY,
          outputFormat: 'png',
          moderation: 'auto',
        },
        gateway: {
          user: input.ownerId,
          tags: gatewayTags,
        },
      },
    });

    if (result.images.length !== input.candidateCount) {
      throw new Error('provider_candidate_count_invalid');
    }

    return result.images.map((image) => {
      const bytes = image.uint8Array;
      if (bytes.byteLength < 1 || bytes.byteLength > 20 * 1024 * 1024) {
        throw new Error('provider_candidate_size_invalid');
      }
      return {
        bytes,
        mimeType: acceptedImageMimeType(image.mediaType),
        width: 1024,
        height: 1024,
      };
    });
  }
}

export function imageGenerationProviderCredentialsAvailable(
  environment: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(
    environment.AI_GATEWAY_API_KEY?.trim() ||
      environment.VERCEL_OIDC_TOKEN?.trim() ||
      environment.VERCEL === '1'
  );
}

export function configuredImageGenerationProvider(): ImageGenerationProvider | null {
  if (!imageGenerationProviderCredentialsAvailable()) return null;
  return new VercelGatewayImageGenerationProvider(
    process.env.ACCL_IMAGE_GENERATION_MODEL?.trim() || DEFAULT_IMAGE_GENERATION_MODEL
  );
}

export function parseClaimedRequest(value: unknown): ImageGenerationRequestRow | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<ImageGenerationRequestRow>;
  return typeof row.id === 'string' && typeof row.owner_id === 'string' && row.status === 'running'
    ? (row as ImageGenerationRequestRow)
    : null;
}
