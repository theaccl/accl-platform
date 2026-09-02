import type { SupabaseClient } from '@supabase/supabase-js';

import type { ImageGenerationCostReceipt, ImageGenerationProvider } from '@/lib/imageGenerator/provider';

type ProviderOperation = 'opening' | 'refinement';

export async function enforceImageGenerationCostGuard(
  supabase: SupabaseClient,
  input: {
    requestId: string;
    refinementId?: string;
    attemptNumber: number;
  }
): Promise<void> {
  const guarded = await supabase.rpc('enforce_image_generation_cost_guard', {
    p_request_id: input.requestId,
    p_refinement_id: input.refinementId ?? null,
    p_attempt_number: input.attemptNumber,
  });
  if (guarded.error) throw new Error(`cost_guard_failed:${guarded.error.message}`);
  if (!guarded.data || typeof guarded.data !== 'object' || guarded.data.allowed !== true) {
    throw new Error('cost_guard_failed:not_allowed');
  }
}

export async function recordProviderGenerationCost(
  supabase: SupabaseClient,
  input: {
    requestId: string;
    refinementId?: string;
    operation: ProviderOperation;
    attemptNumber: number;
    provider: ImageGenerationProvider;
    generatedImageCount: number;
    outputBytes: number;
    receipt: ImageGenerationCostReceipt;
    partialFailure?: boolean;
  }
): Promise<void> {
  const recorded = await supabase.rpc('record_image_generation_cost_event', {
    p_request_id: input.requestId,
    p_refinement_id: input.refinementId ?? null,
    p_event_type: 'provider_generation',
    p_operation: input.operation,
    p_attempt_number: input.attemptNumber,
    p_provider: input.provider.name,
    p_model: input.provider.model,
    p_generated_image_count: input.generatedImageCount,
    p_input_tokens: input.receipt.inputTokens,
    p_output_tokens: input.receipt.outputTokens,
    p_total_tokens: input.receipt.totalTokens,
    p_provider_cost_usd: input.receipt.providerCostUsd,
    p_measured_duration_ms: input.receipt.measuredDurationMs,
    p_output_bytes: input.outputBytes,
    p_idempotency_key: [
      'provider',
      input.requestId,
      input.operation,
      input.refinementId ?? 'opening',
      `attempt-${input.attemptNumber}`,
    ].join(':'),
    p_metadata: {
      provider_call_count: input.receipt.providerCallCount,
      partial_failure: input.partialFailure === true,
    },
  });
  if (recorded.error) throw new Error(`cost_receipt_failed:${recorded.error.message}`);
}

export async function recordPlacementDerivativeCost(
  supabase: SupabaseClient,
  input: {
    requestId: string;
    candidateId: string;
    surface: 'profile_image' | 'profile_background';
    derivativeVersion: string;
    runId: string;
    measuredDurationMs: number;
    outputBytes: number;
  }
): Promise<void> {
  const recorded = await supabase.rpc('record_image_generation_cost_event', {
    p_request_id: input.requestId,
    p_refinement_id: null,
    p_event_type: 'derivative_compute',
    p_operation: 'placement_derivative',
    p_attempt_number: 1,
    p_provider: null,
    p_model: null,
    p_generated_image_count: 0,
    p_input_tokens: null,
    p_output_tokens: null,
    p_total_tokens: null,
    p_provider_cost_usd: null,
    p_measured_duration_ms: input.measuredDurationMs,
    p_output_bytes: input.outputBytes,
    p_idempotency_key: `derivative:${input.requestId}:${input.candidateId}:${input.surface}:${input.runId}`,
    p_metadata: {
      candidate_id: input.candidateId,
      surface: input.surface,
      derivative_version: input.derivativeVersion,
    },
  });
  if (recorded.error) throw new Error(`derivative_cost_receipt_failed:${recorded.error.message}`);
}

export async function recordPlacementDerivativeSetCosts(
  supabase: SupabaseClient,
  input: {
    requestId: string;
    candidateId: string;
    runId: string;
    derivatives: [
      {
        surface: 'profile_image';
        derivativeVersion: string;
        measuredDurationMs: number;
        outputBytes: number;
      },
      {
        surface: 'profile_background';
        derivativeVersion: string;
        measuredDurationMs: number;
        outputBytes: number;
      },
    ];
  }
): Promise<void> {
  const receipts = await Promise.allSettled(
    input.derivatives.map((derivative) =>
      recordPlacementDerivativeCost(supabase, {
        requestId: input.requestId,
        candidateId: input.candidateId,
        runId: input.runId,
        ...derivative,
      })
    )
  );
  const failed = receipts.find(
    (receipt): receipt is PromiseRejectedResult => receipt.status === 'rejected'
  );
  if (failed) throw failed.reason;
}
