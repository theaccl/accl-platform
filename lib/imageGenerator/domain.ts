export const IMAGE_GENERATOR_ENTITLEMENT = 'image_generator' as const;
export const PROFILE_MOTION_ENTITLEMENT = 'profile_motion' as const;
export const MAX_IMAGE_CANDIDATES = 4;
export const CANDIDATE_REVIEW_HOURS = 24;
export const CANDIDATE_SIGNED_URL_SECONDS = 60;
export const REFERENCE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const REFERENCE_IMAGE_MAX_DIMENSION = 4096;
export const REFERENCE_IMAGE_MIN_DIMENSION = 256;

export type ImageGenerationStatus =
  | 'queued'
  | 'running'
  | 'review'
  | 'approved'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type CandidateStatus = 'review' | 'approved' | 'rejected' | 'expired' | 'deleted';
export type ProfileImageSurface = 'profile_image' | 'profile_background';

export type ImageGenerationRequestRow = {
  id: string;
  owner_id: string;
  status: ImageGenerationStatus;
  prompt: string;
  provider: string;
  model: string | null;
  candidate_count: number;
  idempotency_key: string;
  reference_id: string | null;
  attempt_count: number;
  review_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ImageGenerationReferenceRow = {
  id: string;
  owner_id: string;
  status: 'ready' | 'cleanup_pending' | 'deleted' | 'rejected';
  storage_path: string;
  mime_type: 'image/png' | 'image/jpeg' | 'image/webp';
  byte_size: number;
  width: number;
  height: number;
  sha256: string;
  expires_at: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ImageGenerationCandidateRow = {
  id: string;
  request_id: string;
  owner_id: string;
  ordinal: number;
  status: CandidateStatus;
  storage_path: string;
  mime_type: 'image/png' | 'image/jpeg' | 'image/webp';
  byte_size: number;
  width: number | null;
  height: number | null;
  moderation_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

export function publicCandidate(candidate: ImageGenerationCandidateRow) {
  return {
    id: candidate.id,
    request_id: candidate.request_id,
    owner_id: candidate.owner_id,
    ordinal: candidate.ordinal,
    status: candidate.status,
    mime_type: candidate.mime_type,
    byte_size: candidate.byte_size,
    width: candidate.width,
    height: candidate.height,
    moderation_status: candidate.moderation_status,
    created_at: candidate.created_at,
  };
}

export function extensionForMimeType(mimeType: ImageGenerationCandidateRow['mime_type']): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}
