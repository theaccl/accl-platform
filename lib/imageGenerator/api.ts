import { z } from 'zod';
import { promptWithinLimit } from './promptOptions';

const playerPrompt = z.string().trim().max(2000).refine(promptWithinLimit, 'Prompts are limited to 50 words.').default('');

export const createGenerationSchema = z.object({
  prompt: playerPrompt,
  style: z.enum(['automatic', 'royal', 'storm', 'gold', 'crimson']).default('automatic'),
  // The server derives the actual count from the effective membership tier.
  candidate_count: z.number().int().min(1).max(5).optional(),
  reference_id: z.string().uuid().nullable().optional(),
  reference_ids: z.array(z.string().uuid()).max(2).optional(),
});

export const approveCandidateSchema = z.union([
  z.object({ candidate_id: z.string().uuid() }).strict().transform(({ candidate_id }) => ({ candidate_ids: [candidate_id] })),
  z.object({ candidate_ids: z.array(z.string().uuid()).min(1).max(2).refine((ids) => new Set(ids).size === ids.length) }).strict(),
]);

export const createRefinementSchema = z.object({
  source_candidate_id: z.string().uuid(),
  guidance: playerPrompt,
});

export const placeProfileImageSchema = z.object({
  candidate_id: z.string().uuid(),
  surface: z.enum(['profile_image', 'profile_background']),
});

export function apiErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
