import { z } from 'zod';

export const createGenerationSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  candidate_count: z.number().int().min(1).max(4).default(4),
});

export const approveCandidateSchema = z.object({
  candidate_id: z.string().uuid(),
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
