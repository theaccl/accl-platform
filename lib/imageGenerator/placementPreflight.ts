import type { SupabaseClient } from '@supabase/supabase-js';

import type { ImageGenerationCandidateRow, ProfileImageSurface } from './domain';
import { PROFILE_DERIVATIVE_VERSION, PROFILE_STILL_SPECS } from './derivatives';
import { generatorTierSupportsMatchingSet, isGeneratorMembershipTier } from './membership';

type Placement = {
  surface: ProfileImageSurface;
  candidate_id: string;
  published_storage_path: string;
  still_only_in_community: boolean;
  derivative_format: string;
  derivative_width: number;
  derivative_height: number;
  derivative_byte_size: number;
  derivative_version: string;
};

type PreflightResult =
  | { error: string; status: 403 | 404 | 500 }
  | { replay: Partial<Record<ProfileImageSurface, Placement>> | null };

// A completed placement can be replayed without downloading, encoding or publishing again.
// The placement transaction still arbitrates competing requests; this read is not a lock.
export async function preflightProfilePlacement(
  supabase: SupabaseClient,
  ownerId: string,
  candidate: ImageGenerationCandidateRow,
  target: ProfileImageSurface | 'matching_set'
): Promise<PreflightResult> {
  if (candidate.owner_id !== ownerId || candidate.status !== 'approved' || candidate.moderation_status !== 'approved') {
    return { error: 'Approved candidate not found', status: 404 };
  }
  const commission = await supabase.from('image_generation_requests')
    .select('membership_tier').eq('id', candidate.request_id).eq('owner_id', ownerId)
    .eq('status', 'approved').maybeSingle();
  if (commission.error) return { error: 'Could not verify the placement commission', status: 500 };
  if (!commission.data || !isGeneratorMembershipTier(commission.data.membership_tier)) {
    return { error: 'Approved commission not found', status: 404 };
  }
  const supportsSet = generatorTierSupportsMatchingSet(commission.data.membership_tier);
  if (target === 'matching_set' && !supportsSet) {
    return { error: 'Matching icon and background placement requires Pro', status: 403 };
  }
  if (!supportsSet) {
    const previous = await supabase.from('image_generation_approval_events')
      .select('surface').eq('request_id', candidate.request_id).eq('owner_id', ownerId)
      .eq('event_type', 'placed');
    if (previous.error) return { error: 'Could not verify previous placement', status: 500 };
    if ((previous.data ?? []).some((event) => event.surface !== target)) {
      return { error: 'This commission can be placed as either an icon or a background, not both', status: 403 };
    }
  }

  const surfaces: ProfileImageSurface[] = target === 'matching_set'
    ? ['profile_image', 'profile_background'] : [target];
  const assignments = await supabase.from('profile_imagery_assignments')
    .select('surface,candidate_id,published_storage_path,still_only_in_community,derivative_format,derivative_width,derivative_height,derivative_byte_size,derivative_version')
    .eq('user_id', ownerId).eq('candidate_id', candidate.id).in('surface', surfaces);
  if (assignments.error) return { error: 'Could not recover previous placement', status: 500 };
  if ((assignments.data ?? []).length !== surfaces.length) return { replay: null };

  // Direct profile uploads can replace a path without changing the generated assignment.
  const profile = await supabase.from('profiles').select('avatar_path,profile_background_path')
    .eq('id', ownerId).maybeSingle();
  if (profile.error) return { error: 'Could not verify current profile imagery', status: 500 };
  if (!profile.data) return { error: 'Profile not found', status: 404 };
  const replay: Partial<Record<ProfileImageSurface, Placement>> = {};
  for (const surface of surfaces) {
    const assignment = assignments.data?.find((row) => row.surface === surface) as Placement | undefined;
    const spec = PROFILE_STILL_SPECS[surface];
    const activePath = surface === 'profile_image' ? profile.data.avatar_path : profile.data.profile_background_path;
    if (!assignment || assignment.published_storage_path !== activePath
      || !assignment.published_storage_path.startsWith(`${ownerId}/generated/${candidate.id}/`)
      || assignment.derivative_version !== PROFILE_DERIVATIVE_VERSION
      || assignment.derivative_format !== 'webp' || !assignment.still_only_in_community
      || assignment.derivative_width !== spec.width || assignment.derivative_height !== spec.height
      || assignment.derivative_byte_size < 1 || assignment.derivative_byte_size > spec.maxBytes) {
      return { replay: null };
    }
    replay[surface] = assignment;
  }
  return { replay };
}
