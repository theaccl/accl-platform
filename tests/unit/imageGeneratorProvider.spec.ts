import { expect, test } from '@playwright/test';

import {
  DEFAULT_IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_PROVIDER,
  VercelGatewayImageGenerationProvider,
  imageGenerationProviderCredentialsAvailable,
} from '../../lib/imageGenerator/provider';

test('provider is fixed to GPT Image 2 through Vercel AI Gateway', () => {
  const provider = new VercelGatewayImageGenerationProvider();
  expect(provider.name).toBe(IMAGE_GENERATION_PROVIDER);
  expect(provider.model).toBe(DEFAULT_IMAGE_GENERATION_MODEL);
  expect(provider.model).toBe('openai/gpt-image-2');
});

test('provider requires server-side Gateway credentials or a Vercel runtime', () => {
  expect(imageGenerationProviderCredentialsAvailable({})).toBe(false);
  expect(imageGenerationProviderCredentialsAvailable({ AI_GATEWAY_API_KEY: 'gateway-key' })).toBe(true);
  expect(imageGenerationProviderCredentialsAvailable({ VERCEL_OIDC_TOKEN: 'oidc-token' })).toBe(true);
  expect(imageGenerationProviderCredentialsAvailable({ VERCEL: '1' })).toBe(true);
});

test('provider requests four private, medium-quality, moderated square candidates', async () => {
  let call: Record<string, unknown> | undefined;
  const fakeGenerateImage = async (options: Record<string, unknown>) => {
    call = options;
    return {
      images: Array.from({ length: 4 }, () => ({
        uint8Array: new Uint8Array([137, 80, 78, 71]),
        mediaType: 'image/png',
      })),
    };
  };
  const provider = new VercelGatewayImageGenerationProvider(
    DEFAULT_IMAGE_GENERATION_MODEL,
    fakeGenerateImage as never
  );

  const images = await provider.generate({
    prompt: 'A dignified chess knight emblem',
    candidateCount: 4,
    requestId: 'request-123',
    ownerId: 'player-456',
  });

  expect(images).toHaveLength(4);
  expect(images[0]).toMatchObject({ mimeType: 'image/png', width: 1024, height: 1024 });
  expect(call).toMatchObject({
    model: 'openai/gpt-image-2',
    n: 4,
    maxImagesPerCall: 1,
    size: '1024x1024',
    maxRetries: 2,
    providerOptions: {
      openai: { quality: 'medium', outputFormat: 'png', moderation: 'auto' },
      gateway: {
        user: 'player-456',
        tags: ['accl', 'image-generator', 'request:request-123'],
      },
    },
  });
});

test('provider uses the sanitized reference image together with the written direction', async () => {
  let call: Record<string, unknown> | undefined;
  const referenceBytes = new Uint8Array([82, 69, 70]);
  const fakeGenerateImage = async (options: Record<string, unknown>) => {
    call = options;
    return {
      images: Array.from({ length: 4 }, () => ({
        uint8Array: new Uint8Array([137, 80, 78, 71]),
        mediaType: 'image/png',
      })),
    };
  };
  const provider = new VercelGatewayImageGenerationProvider(
    DEFAULT_IMAGE_GENERATION_MODEL,
    fakeGenerateImage as never
  );

  await provider.generate({
    prompt: 'Keep the silhouette and add a sovereign gold chess atmosphere',
    candidateCount: 4,
    requestId: 'request-with-reference',
    ownerId: 'player-456',
    referenceImages: [{ bytes: referenceBytes, mimeType: 'image/webp' }],
  });

  expect(call?.prompt).toEqual({
    text: 'Keep the silhouette and add a sovereign gold chess atmosphere',
    images: [referenceBytes],
  });
});

test('provider sends two sanitized Pro references in one guided request', async () => {
  let call: Record<string, unknown> | undefined;
  const references = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];
  const fakeGenerateImage = async (options: Record<string, unknown>) => {
    call = options;
    return {
      images: Array.from({ length: 5 }, () => ({
        uint8Array: new Uint8Array([137, 80, 78, 71]),
        mediaType: 'image/png',
      })),
    };
  };
  const provider = new VercelGatewayImageGenerationProvider(
    DEFAULT_IMAGE_GENERATION_MODEL,
    fakeGenerateImage as never
  );
  await provider.generate({
    prompt: 'Coordinate both references',
    candidateCount: 5,
    requestId: 'two-reference-request',
    ownerId: 'player-456',
    referenceImages: references.map((bytes) => ({ bytes, mimeType: 'image/webp' })),
  });

  expect(call?.prompt).toEqual({ text: 'Coordinate both references', images: references });
});

test('provider rejects an incomplete candidate response', async () => {
  const fakeGenerateImage = async () => ({
    images: [{ uint8Array: new Uint8Array([1]), mediaType: 'image/png' }],
  });
  const provider = new VercelGatewayImageGenerationProvider(
    DEFAULT_IMAGE_GENERATION_MODEL,
    fakeGenerateImage as never
  );

  await expect(
    provider.generate({
      prompt: 'Chess crest',
      candidateCount: 4,
      requestId: 'request-123',
      ownerId: 'player-456',
    })
  ).rejects.toThrow('provider_candidate_count_invalid');
});

test('provider supports the five opening concepts in a Pro commission', async () => {
  const fakeGenerateImage = async () => ({
    images: Array.from({ length: 5 }, () => ({
      uint8Array: new Uint8Array([137, 80, 78, 71]),
      mediaType: 'image/png',
    })),
  });
  const provider = new VercelGatewayImageGenerationProvider(
    DEFAULT_IMAGE_GENERATION_MODEL,
    fakeGenerateImage as never
  );

  const images = await provider.generate({
    prompt: 'A coordinated sovereign chess identity',
    candidateCount: 5,
    requestId: 'pro-request-123',
    ownerId: 'player-456',
  });
  expect(images).toHaveLength(5);
});
