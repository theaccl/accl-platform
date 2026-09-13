import { createHash } from 'node:crypto';

import { APICallError, gateway, generateText } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  ALBERT_MODEL_ID,
  buildAlbertFallbackReply,
  buildAlbertModelAttempts,
  buildAlbertSystemPrompt,
  classifyAlbertGatewayFailure,
  sanitizeAlbertReply,
  validateAlbertMessage,
} from '@/lib/albert/communication';
import { resolveUserNexusEcosystemFromAuthMetadata } from '@/lib/auth/resolveUserNexusEcosystem';
import { evaluateAlbertRouteAccess } from '@/lib/coreIntelligence/albertRouteAccess';
import { loadSeatedAuthoritativeGamesForPlayer } from '@/lib/coreIntelligence/loadSeatedGamesForAuthorization';
import type { LoadSeatedGamesResult, UntrustedCallerAuthorizationInput } from '@/lib/coreIntelligence';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export type AlbertModelAttemptResult = {
  text: string;
  usage: { inputTokens?: number; outputTokens?: number };
};

export type AlbertMessageRouteDeps = {
  resolveAuthenticatedUser: typeof resolveAuthenticatedUser;
  createServiceRoleClient: typeof createServiceRoleClient;
  loadSeatedGames: (
    client: SupabaseClient,
    authenticatedPlayerId: string,
  ) => Promise<LoadSeatedGamesResult>;
  completeModelAttempt: (input: {
    modelId: string;
    system: string;
    prompt: string;
    timeoutMs: number;
    gatewayUser: string;
  }) => Promise<AlbertModelAttemptResult>;
};

async function defaultCompleteModelAttempt(input: {
  modelId: string;
  system: string;
  prompt: string;
  timeoutMs: number;
  gatewayUser: string;
}): Promise<AlbertModelAttemptResult> {
  const result = await generateText({
    model: gateway(input.modelId),
    system: input.system,
    prompt: input.prompt,
    maxOutputTokens: 220,
    maxRetries: 0,
    timeout: { totalMs: input.timeoutMs },
    providerOptions: {
      gateway: {
        user: input.gatewayUser,
        tags: ['feature:albert', 'surface:nexus', 'authority:advisory-only'],
      },
    },
  });
  return { text: result.text, usage: { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens } };
}

const defaultAlbertMessageRouteDeps: AlbertMessageRouteDeps = {
  resolveAuthenticatedUser,
  createServiceRoleClient,
  loadSeatedGames: loadSeatedAuthoritativeGamesForPlayer,
  completeModelAttempt: defaultCompleteModelAttempt,
};

function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function untrustedCallerFromBody(body: Record<string, unknown>): UntrustedCallerAuthorizationInput {
  return {
    gameType: body.gameType,
    mode: body.mode,
    classification: body.classification,
    completed: body.completed,
    training: body.training,
    capabilities: body.capabilities,
    playerId: body.playerId,
    playerModelId: body.playerModelId,
  };
}

export async function handleAlbertMessage(
  request: Request,
  deps: AlbertMessageRouteDeps = defaultAlbertMessageRouteDeps,
): Promise<Response> {
  const user = await deps.resolveAuthenticatedUser(request);
  if (!user) return json({ ok: false, error: 'Sign in to speak with Albert.' }, 401);
  if (resolveUserNexusEcosystemFromAuthMetadata(user) === 'k12') {
    return json({ ok: false, error: 'Albert’s communication preview is not available for K–12 accounts.' }, 403);
  }

  const limited = checkRateLimit(`albert-message:${user.id}`, 8, 60_000);
  if (!limited.allowed) {
    return json(
      { ok: false, error: 'Albert needs a moment. Please try again shortly.' },
      429,
      { 'Retry-After': String(limited.retryAfterSec) },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'The message could not be read.' }, 400);
  }

  const validated = validateAlbertMessage(body.message);
  if (!validated.ok) {
    return json({ ok: false, error: validated.message, code: validated.code }, 400);
  }

  let loadResult: LoadSeatedGamesResult;
  try {
    const serviceClient = deps.createServiceRoleClient();
    loadResult = await deps.loadSeatedGames(serviceClient, user.id);
  } catch {
    return json(
      {
        ok: false,
        error: 'Albert is unavailable until game state can be verified.',
        code: 'albert_lookup_failed',
      },
      403,
    );
  }

  const access = evaluateAlbertRouteAccess({
    loadResult,
    untrustedCaller: untrustedCallerFromBody(body),
  });
  if (!access.allowed) {
    auditApiLog('albert_message', {
      result: 'denied',
      user: shortId(user.id),
      code: access.code,
    });
    return json(
      {
        ok: false,
        error: 'Albert is not available during an active game.',
        code: access.code,
      },
      403,
    );
  }

  const startedAt = Date.now();
  const gatewayUser = createHash('sha256').update(`albert:${user.id}`).digest('hex');
  const failedAttempts: Array<{
    model: string;
    status: number | null;
    reason: ReturnType<typeof classifyAlbertGatewayFailure>;
    errorName: string;
  }> = [];

  for (const [attemptIndex, attempt] of buildAlbertModelAttempts().entries()) {
    try {
      const result = await deps.completeModelAttempt({
        modelId: attempt.modelId,
        system: buildAlbertSystemPrompt(),
        prompt: validated.value,
        timeoutMs: attempt.timeoutMs,
        gatewayUser,
      });

      const reply = sanitizeAlbertReply(result.text);
      if (!reply) throw new Error('empty_albert_reply');

      auditApiLog('albert_message', {
        result: 'generated',
        user: shortId(user.id),
        model: attempt.modelId,
        attempt_count: attemptIndex + 1,
        failover_reason: failedAttempts[0]?.reason ?? null,
        ms: Date.now() - startedAt,
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
      });

      return json({ ok: true, reply, mode: 'generated', model: attempt.modelId });
    } catch (error) {
      const status = APICallError.isInstance(error) ? (error.statusCode ?? null) : null;
      failedAttempts.push({
        model: attempt.modelId,
        status,
        reason: classifyAlbertGatewayFailure(error, status),
        errorName: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  const finalFailure = failedAttempts.at(-1);
  auditApiLog('albert_message', {
    result: 'fallback',
    user: shortId(user.id),
    model: finalFailure?.model ?? ALBERT_MODEL_ID,
    attempt_count: failedAttempts.length,
    provider_status: finalFailure?.status ?? null,
    provider_error: finalFailure?.reason ?? 'provider_error',
    error_name: finalFailure?.errorName ?? 'unknown',
    ms: Date.now() - startedAt,
  });

  return json({
    ok: true,
    reply: buildAlbertFallbackReply(validated.value),
    mode: 'fallback',
    model: null,
  });
}
