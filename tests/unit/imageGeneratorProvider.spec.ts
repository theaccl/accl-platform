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
    maxImagesPerCall: 4,
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
