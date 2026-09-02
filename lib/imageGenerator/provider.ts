import { generateImage } from 'ai';

import {
  ACCL_IMAGE_STYLE_VERSION,
  composeAcclImagePrompt,
} from '@/lib/imageGenerator/acclArtDirection';
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

export type ImageGenerationCostReceipt = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  providerCostUsd: number | null;
  providerCallCount: number;
  measuredDurationMs: number;
};

export type ImageGenerationResult = {
  images: GeneratedImage[];
  receipt: ImageGenerationCostReceipt;
};

export class ImageGenerationProviderError extends Error {
  readonly name = 'ImageGenerationProviderError';

  constructor(
    message: string,
    readonly partialResult: ImageGenerationResult,
    options?: { cause?: unknown; generatedImageCount?: number; outputBytes?: number }
  ) {
    super(message, options);
    this.generatedImageCount = options?.generatedImageCount ?? partialResult.images.length;
    this.outputBytes = options?.outputBytes ?? partialResult.images.reduce(
      (total, image) => total + image.bytes.byteLength,
      0
    );
  }

  readonly generatedImageCount: number;
  readonly outputBytes: number;
}

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
  }): Promise<ImageGenerationResult>;
}

type GenerateImageFn = typeof generateImage;
type GenerateImageCallResult = Awaited<ReturnType<GenerateImageFn>>;

function acceptedImageMimeType(value: string): ImageGenerationCandidateRow['mime_type'] {
  if (value === 'image/png' || value === 'image/jpeg' || value === 'image/webp') return value;
  throw new Error('provider_candidate_mime_invalid');
}

export function gatewayProviderCostUsd(providerMetadata: unknown): number | null {
  if (!providerMetadata || typeof providerMetadata !== 'object') return null;
  const gateway = (providerMetadata as Record<string, unknown>).gateway;
  if (!gateway || typeof gateway !== 'object') return null;
  const rawCost = (gateway as Record<string, unknown>).cost;
  if (typeof rawCost !== 'string' && typeof rawCost !== 'number') return null;
  const cost = Number(rawCost);
  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}

function tokenCount(value: number | undefined): number | null {
  return Number.isSafeInteger(value) && (value ?? -1) >= 0 ? value! : null;
}

function sumKnown(values: Array<number | null>): number | null {
  return values.every((value): value is number => value !== null)
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

function costReceiptForResults(
  results: GenerateImageCallResult[],
  startedAt: number
): ImageGenerationCostReceipt {
  const providerCostUsd = sumKnown(
    results.map((result) => gatewayProviderCostUsd(result.providerMetadata))
  );
  return {
    inputTokens: sumKnown(results.map((result) => tokenCount(result.usage?.inputTokens))),
    outputTokens: sumKnown(results.map((result) => tokenCount(result.usage?.outputTokens))),
    totalTokens: sumKnown(results.map((result) => tokenCount(result.usage?.totalTokens))),
    providerCostUsd: providerCostUsd === null ? null : Number(providerCostUsd.toFixed(8)),
    providerCallCount: results.reduce(
      (total, result) => total + (Array.isArray(result.responses) ? result.responses.length : 1),
      0
    ),
    measuredDurationMs: Math.max(0, Date.now() - startedAt),
  };
}

function generatedImagesForResults(results: GenerateImageCallResult[]): GeneratedImage[] {
  return results.flatMap((result) => result.images).map((image) => {
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
  }): Promise<ImageGenerationResult> {
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
      `style:${ACCL_IMAGE_STYLE_VERSION}`,
      ...(input.refinementId ? [`refinement:${input.refinementId}`] : []),
    ];

    const composedPrompt = composeAcclImagePrompt({
      playerDirection: input.prompt,
      operation,
      hasReferences: Boolean(input.referenceImages?.length),
    });
    const prompt = input.referenceImages?.length
      ? { text: composedPrompt, images: input.referenceImages.map((image) => image.bytes) }
      : composedPrompt;
    const startedAt = Date.now();
    // Keep one upstream call per candidate. Besides provider compatibility, this
    // preserves every Gateway cost receipt; AI SDK's multi-call metadata merge
    // otherwise retains only the last call's `gateway.cost` value.
    const settledResults = await Promise.allSettled(
      Array.from({ length: input.candidateCount }, (_, index) => this.generateImageFn({
        model: this.model,
        prompt,
        n: 1,
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
            tags: [...gatewayTags, `candidate-call:${index + 1}`],
          },
        },
      }))
    );
    const results = settledResults.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    const receipt = costReceiptForResults(results, startedAt);
    const rawGeneratedFiles = results.flatMap((result) => result.images);
    const rawOutputBytes = rawGeneratedFiles.reduce(
      (total, image) => total + image.uint8Array.byteLength,
      0
    );
    let images: GeneratedImage[];
    try {
      images = generatedImagesForResults(results);
    } catch (error) {
      throw new ImageGenerationProviderError(
        error instanceof Error ? error.message : String(error),
        { images: [], receipt },
        {
          cause: error,
          generatedImageCount: rawGeneratedFiles.length,
          outputBytes: rawOutputBytes,
        }
      );
    }
    const rejected = settledResults.find((result) => result.status === 'rejected');
    if (rejected) {
      const cause = rejected.reason;
      if (images.length === 0) throw cause;
      throw new ImageGenerationProviderError(
        cause instanceof Error ? cause.message : String(cause),
        { images, receipt },
        { cause }
      );
    }
    if (images.length !== input.candidateCount || results.some((result) => result.images.length !== 1)) {
      throw new ImageGenerationProviderError(
        'provider_candidate_count_invalid',
        { images, receipt }
      );
    }
    return {
      images,
      receipt,
    };
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
