import sharp from 'sharp';
import type { ImageGenerationProvider, ImageGenerationResult } from './provider';

export function fixtureScope(environment: Record<string, string | undefined> = process.env): string | null {
  const mode = environment.ACCL_IMAGE_GENERATION_TEST_MODE?.trim();
  if (!mode || mode === 'live') return null;
  if (mode !== 'fixtures') throw new Error('Unknown Generator test mode');
  const scope = environment.ACCL_IMAGE_GENERATION_FIXTURE_SCOPE?.trim() ?? '';
  if (!/^[a-z0-9-]{8,60}$/.test(scope)) throw new Error('A bounded Generator fixture scope is required');
  const url = new URL(environment.NEXT_PUBLIC_SUPABASE_URL ?? '');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && environment.NODE_ENV !== 'production';
  const staging = url.origin === 'https://qquttuyopiqxfwzceitc.supabase.co' && environment.VERCEL_ENV === 'preview';
  if (!local && !staging) throw new Error('Generator fixtures require local or identified disposable staging storage');
  return scope;
}

/** Synthetic crop fixtures, not quality examples. Never invokes a model. */
export class FixtureImageGenerationProvider implements ImageGenerationProvider {
  readonly name: string;
  readonly model = 'synthetic-crop-fixtures-v1';
  constructor(scope: string) { this.name = `fixture:${scope}`; }
  async generate(input: Parameters<ImageGenerationProvider['generate']>[0]): Promise<ImageGenerationResult> {
    if (!Number.isInteger(input.candidateCount) || input.candidateCount < 1 || input.candidateCount > 5) throw new Error('Invalid fixture candidate count');
    const colors = ['#d4a017', '#4488aa', '#aa5588', '#557744', '#7755aa'];
    const images = await Promise.all(Array.from({ length: input.candidateCount }, async (_, n) => ({
      bytes: await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#17202a"/><rect x="64" y="64" width="896" height="896" fill="${colors[n]}"/><circle cx="512" cy="512" r="240" fill="#ffffff"/><path d="M512 240L650 710H374Z" fill="#17202a"/><rect x="0" y="0" width="64" height="1024" fill="#ff3333"/><rect x="960" y="0" width="64" height="1024" fill="#3333ff"/></svg>`)).png().toBuffer(),
      mimeType: 'image/png' as const, width: 1024, height: 1024,
    })));
    return { images, receipt: { inputTokens: 0, outputTokens: 0, totalTokens: 0, providerCostUsd: 0, providerCallCount: 0, measuredDurationMs: 0 } };
  }
}
