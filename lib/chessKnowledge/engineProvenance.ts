/** Structured engine-verification provenance (offline staging only). */

import type { EngineVerificationStatus } from './engineVerificationReport';

export type EngineScoreUnit = 'cp' | 'mate';

/**
 * Persist enough metadata to reproduce (or honestly report non-occurrence of)
 * an engine verification attempt. Never fabricate version or score.
 */
export type EngineVerificationProvenance = {
  engine_name: string | null;
  engine_version: string | null;
  /** Depth when the run was depth-controlled; otherwise null. */
  depth: number | null;
  /** Movetime in milliseconds when the run was time-controlled; otherwise null. */
  movetime_ms: number | null;
  multipv: number | null;
  score_unit: EngineScoreUnit | null;
  score_value: number | null;
  verification_status: EngineVerificationStatus;
  verified_at: string | null;
  unavailable_reason: string | null;
};

export function emptyEngineProvenance(
  status: EngineVerificationStatus = 'engine_not_available',
  unavailableReason: string | null = 'engine_verification_not_run'
): EngineVerificationProvenance {
  return {
    engine_name: null,
    engine_version: null,
    depth: null,
    movetime_ms: null,
    multipv: null,
    score_unit: null,
    score_value: null,
    verification_status: status,
    verified_at: null,
    unavailable_reason: unavailableReason,
  };
}

/** True only when status claims a completed engine pass. */
export function provenanceClaimsEngineVerification(
  provenance: Pick<EngineVerificationProvenance, 'verification_status'>
): boolean {
  return provenance.verification_status === 'engine_verified';
}

/**
 * A record must not claim engine verification merely because parameters were configured.
 * Completed verification requires an engine name and a verification timestamp; version/score
 * remain nullable when the engine did not report them (never fabricated).
 */
export function assertHonestEngineProvenance(provenance: EngineVerificationProvenance): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (provenanceClaimsEngineVerification(provenance)) {
    if (!provenance.engine_name) {
      issues.push('engine_verified_without_engine_name');
    }
    if (!provenance.verified_at) {
      issues.push('engine_verified_without_timestamp');
    }
    if (provenance.unavailable_reason) {
      issues.push('engine_verified_with_unavailable_reason');
    }
    if (provenance.depth == null && provenance.movetime_ms == null) {
      issues.push('engine_verified_without_depth_or_movetime');
    }
  }

  if (
    (provenance.verification_status === 'legal_moves_validated' ||
      provenance.verification_status === 'engine_not_available') &&
    provenance.verified_at
  ) {
    issues.push('non_engine_status_with_verified_at');
  }

  if (
    provenance.verification_status === 'engine_not_available' &&
    !provenance.unavailable_reason
  ) {
    issues.push('engine_not_available_missing_reason');
  }

  return { ok: issues.length === 0, issues };
}
