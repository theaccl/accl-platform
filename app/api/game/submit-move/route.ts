import { createClient } from '@supabase/supabase-js';
import fetchPolyfill from 'cross-fetch';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { buildAuthoritativeMovePatch } from '@/lib/gameStateSourceOfTruth';
import { Chess } from 'chess.js';
import { terminalStateFromBoard, type BotMoveFailureCode } from '@/lib/bot/botMoveCommit';
import {
  committedLogMatchesPayload,
  findCommittedMoveLogByKey,
} from '@/lib/replay/idempotentMoveRecovery';
import { buildMoveIdempotencyKey } from '@/lib/replay/moveIdempotencyKey';
import { validateRpcMoveLogPayload } from '@/lib/replay/rpcMoveLogPayload';
import { commitBotGameTurn } from '@/lib/server/submitMoveBotGameCommit';
import { auditApiLog, logSlowRequest, shortId } from '@/lib/server/prodLog';
import { guardRequest } from '@/lib/server/requestGuard';

type Body = {
  gameId?: unknown;
  fenBefore?: unknown;
  move?: unknown;
  clientMoveId?: unknown;
};

const GAME_ROW_SELECT =
  'id,fen,turn,status,tempo,live_time_control,last_move_at,white_clock_ms,black_clock_ms,white_player_id,black_player_id,source_type,bot_settings,rating_last_update';

type AuthenticatedRequest = {
  userId: string;
};

async function resolveAuthenticatedRequest(request: Request): Promise<AuthenticatedRequest | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return null;
  const token = m[1]?.trim();
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  const client = createClient(url, anon, {
    global: { fetch: fetchPolyfill as unknown as typeof fetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error) return null;
  const userId = data.user?.id ?? null;
  if (!userId) return null;
  return { userId };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function badMoveJson(message: string, status = 409): Response {
  return json({ error: 'invalid_move', message }, status);
}

function conflictJson(details: {
  gameId: string;
  expectedFen: string | null;
  actualFen: string | null;
}) {
  return json(
    {
      error: {
        code: 'optimistic_state_conflict',
        message: 'Game position changed before this move was committed. Refresh and try again.',
        retryable: true,
        game_id: details.gameId,
        expected_fen: details.expectedFen,
        actual_fen: details.actualFen,
      },
    },
    409
  );
}

function idempotencyConflictJson(message: string): Response {
  auditApiLog('submit_move', { result: 'idempotency_key_conflict' });
  return json(
    {
      error: {
        code: 'idempotency_key_conflict',
        message,
        retryable: false,
      },
    },
    409,
  );
}

function idempotentSuccessJson(row: unknown, extras?: { botMoveApplied?: boolean; thinkMs?: number | null }) {
  return json(
    {
      ok: true,
      idempotent_duplicate: true,
      row,
      bot_move_applied: extras?.botMoveApplied ?? false,
      think_ms: extras?.thinkMs ?? null,
    },
    200,
  );
}

function moveLogInvalidPayloadJson(message: string): Response {
  auditApiLog('submit_move', { result: 'move_log_invalid_payload' });
  return json(
    {
      error: {
        code: 'move_log_invalid_payload',
        message,
        retryable: false,
      },
    },
    400,
  );
}

function botMoveFailedJson(
  code: BotMoveFailureCode,
  message: string,
  humanRow: unknown,
  extra?: { thinkMs?: number; expectedFen?: string | null; actualFen?: string | null },
): Response {
  return json(
    {
      error: {
        code,
        message,
        retryable: true,
        ...extra,
      },
      human_move_applied: true,
      bot_move_applied: false,
      think_ms: extra?.thinkMs ?? null,
      row: humanRow,
    },
    409,
  );
}

function sanitizeSquare(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase();
  return /^[a-h][1-8]$/.test(s) ? s : '';
}

function sanitizePromotion(raw: unknown): 'q' | 'r' | 'b' | 'n' | undefined {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'q' || s === 'r' || s === 'b' || s === 'n') return s;
  return undefined;
}

function dbMessage(err: unknown): string {
  return String((err as { message?: string } | null)?.message ?? '').toLowerCase();
}

async function loadGameRow(supabase: ReturnType<typeof createServiceRoleClient>, gameId: string) {
  return supabase.from('games').select(GAME_ROW_SELECT).eq('id', gameId).single();
}

async function tryRecoverIdempotentHumanMove(
  supabase: ReturnType<typeof createServiceRoleClient>,
  details: {
    gameId: string;
    idempotencyKey: string;
    playerId: string;
    fromSquare: string;
    toSquare: string;
    fenBefore: string | null;
    fenAfter: string;
  },
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; conflictMessage?: string }> {
  const lookup = await findCommittedMoveLogByKey(supabase, details.gameId, details.idempotencyKey);
  if (!lookup.found) return { ok: false };

  const match = committedLogMatchesPayload(lookup.log, {
    playerId: details.playerId,
    fromSq: details.fromSquare,
    toSq: details.toSquare,
    fenBefore: details.fenBefore,
    fenAfter: details.fenAfter,
  });
  if (!match.ok) {
    return { ok: false, conflictMessage: match.message };
  }

  const current = await loadGameRow(supabase, details.gameId);
  if (current.error || !current.data) return { ok: false };

  const actualFen = String(current.data.fen ?? '').trim();
  const expectedAfter = String(details.fenAfter).trim();
  if (actualFen !== expectedAfter) {
    return { ok: false };
  }

  auditApiLog('submit_move', { result: 'idempotent_duplicate', game_id: shortId(details.gameId) });
  return { ok: true, row: current.data as Record<string, unknown> };
}

export async function POST(request: Request): Promise<Response> {
  const guard = guardRequest(request, 'submit_move');
  if (!guard.ok) return guard.response;

  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  try {
  const auth = await resolveAuthenticatedRequest(request);
  if (!auth) {
    auditApiLog('submit_move', { result: 'unauthorized' });
    return json({ error: 'Unauthorized', message: 'Sign in again to make moves.' }, 401);
  }
  const userId = auth.userId;
  const body = (await request.json().catch(() => ({}))) as Body;
  const gameId = String(body.gameId ?? '').trim();
  const fenBefore = String(body.fenBefore ?? '').trim();
  if (!gameId) {
    auditApiLog('submit_move', { result: 'bad_request', user: shortId(userId) });
    return json(
      { error: 'invalid_request', message: 'Game id is required.' },
      400,
    );
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    auditApiLog('submit_move', { result: 'service_config_error', user: shortId(userId) });
    return json(
      { error: 'service_unavailable', message: 'Service temporarily unavailable. Try again in a moment.' },
      503,
    );
  }

  const clientMoveId = String(body.clientMoveId ?? '').trim() || null;

  const initialGame = await supabase.from('games').select(GAME_ROW_SELECT).eq('id', gameId).single();
  if (initialGame.error || !initialGame.data) {
    auditApiLog('submit_move', {
      result: 'game_not_found',
      game_id: shortId(gameId),
      user: shortId(userId),
    });
    return json(
      { error: 'game_unavailable', message: 'This game is not available or no longer exists.' },
      404,
    );
  }
  let gameRow = initialGame.data;
  if (gameRow.white_player_id !== userId && gameRow.black_player_id !== userId) {
    auditApiLog('submit_move', { result: 'forbidden', game_id: shortId(gameId), user: shortId(userId) });
    return json(
      { error: 'forbidden', message: 'You are not a player in this game.' },
      403,
    );
  }
  if (!gameRow.white_player_id || !gameRow.black_player_id || gameRow.white_player_id === gameRow.black_player_id) {
    auditApiLog('submit_move', { result: 'not_both_seated', game_id: shortId(gameId), user: shortId(userId) });
    return badMoveJson('Game has not started. Both seats must be filled before moves are allowed.');
  }
  const normalizedStatus = String(gameRow.status ?? '').trim().toLowerCase();
  if (normalizedStatus !== 'active' && normalizedStatus !== 'waiting') {
    auditApiLog('submit_move', { result: 'invalid_status', game_id: shortId(gameId), user: shortId(userId) });
    return badMoveJson('Game is not in a playable state.');
  }
  const actorColor: 'white' | 'black' = gameRow.white_player_id === userId ? 'white' : 'black';
  const inputMove = (body.move ?? {}) as {
    from_sq?: unknown;
    to_sq?: unknown;
    promotion?: unknown;
    move_duration_ms?: unknown;
  };
  const fromSquare = sanitizeSquare(inputMove.from_sq);
  const toSquare = sanitizeSquare(inputMove.to_sq);
  const promotion = sanitizePromotion(inputMove.promotion);
  if (!fromSquare || !toSquare) {
    auditApiLog('submit_move', { result: 'bad_move_shape', game_id: shortId(gameId), user: shortId(userId) });
    return badMoveJson('Move coordinates are required.');
  }

  const humanIdempotencyKey = buildMoveIdempotencyKey({
    gameId,
    fenBefore: fenBefore || String(gameRow.fen ?? '').trim(),
    playerId: userId,
    fromSq: fromSquare,
    toSq: toSquare,
    promotion,
    clientMoveId,
  });

  let humanAlreadyCommitted = false;

  if (fenBefore && fenBefore !== String(gameRow.fen ?? '').trim()) {
    const actualFen = String(gameRow.fen ?? '').trim() || null;
    let boardProbe: Chess;
    try {
      boardProbe = new Chess(fenBefore);
    } catch {
      auditApiLog('submit_move', {
        result: 'optimistic_conflict',
        game_id: shortId(gameId),
        user: shortId(userId),
      });
      return conflictJson({ gameId, expectedFen: fenBefore || null, actualFen });
    }
    const probeMove = boardProbe.move({ from: fromSquare, to: toSquare, promotion });
    if (!probeMove) {
      return badMoveJson('Illegal move.');
    }
    const probeNextFen = boardProbe.fen();
    const recoveredStale = await tryRecoverIdempotentHumanMove(supabase, {
      gameId,
      idempotencyKey: humanIdempotencyKey,
      playerId: userId,
      fromSquare,
      toSquare,
      fenBefore: fenBefore || null,
      fenAfter: probeNextFen,
    });
    if (!recoveredStale.ok) {
      auditApiLog('submit_move', {
        result: 'optimistic_conflict',
        game_id: shortId(gameId),
        user: shortId(userId),
        ms: typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0,
      });
      return conflictJson({ gameId, expectedFen: fenBefore || null, actualFen });
    }
    gameRow = recoveredStale.row as typeof initialGame.data;
    humanAlreadyCommitted = true;
  }

  if (!humanAlreadyCommitted) {
    const currentTurn = String(gameRow.turn ?? '').trim().toLowerCase();
    if (currentTurn !== actorColor) {
      auditApiLog('submit_move', { result: 'out_of_turn', game_id: shortId(gameId), user: shortId(userId) });
      return badMoveJson('It is not your turn.');
    }
  }

  let board: Chess;
  let nextFen = '';
  let terminal: ReturnType<typeof terminalStateFromBoard> = null;
  let movePatch: ReturnType<typeof buildAuthoritativeMovePatch> | null = null;

  if (humanAlreadyCommitted) {
    nextFen = String(gameRow.fen ?? '').trim();
    try {
      board = new Chess(nextFen);
    } catch {
      return json({ error: 'game_unavailable', message: 'Game position is invalid. Please refresh.' }, 409);
    }
    terminal = terminalStateFromBoard(board, actorColor);
  } else {
    try {
      board = new Chess(String(gameRow.fen ?? '').trim());
    } catch {
      auditApiLog('submit_move', { result: 'invalid_server_fen', game_id: shortId(gameId), user: shortId(userId) });
      return json({ error: 'game_unavailable', message: 'Game position is invalid. Please refresh.' }, 409);
    }
    const moved = board.move({ from: fromSquare, to: toSquare, promotion });
    if (!moved) {
      auditApiLog('submit_move', { result: 'illegal_move', game_id: shortId(gameId), user: shortId(userId) });
      return badMoveJson('Illegal move.');
    }

    nextFen = board.fen();
    const nextTurn = board.turn() === 'w' ? 'white' : 'black';
    terminal = terminalStateFromBoard(board, actorColor);

    movePatch = buildAuthoritativeMovePatch({
      nextFen,
      nextTurn,
      statusBefore: String(gameRow.status ?? 'active'),
      tempo: gameRow.tempo == null ? null : String(gameRow.tempo),
      liveTimeControl: gameRow.live_time_control == null ? null : String(gameRow.live_time_control),
      currentTurn: String(gameRow.turn ?? 'white'),
      whiteClockMs: typeof gameRow.white_clock_ms === 'number' ? gameRow.white_clock_ms : null,
      blackClockMs: typeof gameRow.black_clock_ms === 'number' ? gameRow.black_clock_ms : null,
      lastMoveAt: gameRow.last_move_at == null ? null : String(gameRow.last_move_at),
    });
  }

  const preMoveFen = fenBefore || String(initialGame.data.fen ?? '').trim();
  const isBotGame = String(initialGame.data.source_type ?? '').trim() === 'bot_game';

  if (isBotGame) {
    const botResult = await commitBotGameTurn({
      gameId,
      userId,
      preMoveFen,
      nextFen,
      fromSquare,
      toSquare,
      moveDurationMs: Number(inputMove.move_duration_ms ?? 0),
      humanIdempotencyKey,
      initialGameRow: initialGame.data as Record<string, unknown>,
      gameRow: gameRow as Record<string, unknown>,
      humanAlreadyCommitted,
      movePatch: movePatch
        ? {
            fen: movePatch.fen,
            turn: movePatch.turn,
            last_move_at: movePatch.last_move_at,
            move_deadline_at: movePatch.move_deadline_at,
            white_clock_ms: movePatch.white_clock_ms ?? null,
            black_clock_ms: movePatch.black_clock_ms ?? null,
            status: String(movePatch.status ?? 'active'),
          }
        : null,
      terminal,
      board,
    });

    if (!botResult.ok) {
      if (botResult.kind === 'move_log_invalid') {
        return moveLogInvalidPayloadJson(botResult.message);
      }
      if (botResult.kind === 'idempotency_conflict') {
        return idempotencyConflictJson(botResult.message);
      }
      if (botResult.kind === 'optimistic_conflict') {
        auditApiLog('submit_move', {
          result: 'optimistic_conflict',
          game_id: shortId(gameId),
          user: shortId(userId),
        });
        return conflictJson({
          gameId,
          expectedFen: botResult.expectedFen ?? null,
          actualFen: botResult.actualFen ?? null,
        });
      }
      if (
        botResult.kind === 'bot_precondition' ||
        botResult.kind === 'bot_no_candidates' ||
        botResult.kind === 'bot_invalid_uci'
      ) {
        const code =
          botResult.kind === 'bot_precondition'
            ? (botResult.botCode as BotMoveFailureCode)
            : botResult.kind === 'bot_no_candidates'
              ? 'bot_no_candidates'
              : 'bot_move_invalid_uci';
        auditApiLog('submit_move', {
          result: code,
          game_id: shortId(gameId),
          user: shortId(userId),
        });
        return botMoveFailedJson(code, botResult.message, botResult.humanRow, {
          thinkMs: botResult.thinkMs ?? undefined,
          expectedFen: botResult.expectedFen,
          actualFen: botResult.actualFen,
        });
      }
      auditApiLog('submit_move', { result: 'move_commit_failed', game_id: shortId(gameId), user: shortId(userId) });
      return json(
        { error: 'move_commit_failed', message: botResult.message },
        409,
      );
    }

    const elapsedBot =
      typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0;
    logSlowRequest('submit_move', elapsedBot, { user: shortId(userId) });
    auditApiLog('submit_move', {
      result: 'ok',
      game_id: shortId(gameId),
      user: shortId(userId),
      ms: elapsedBot,
      bot_move_applied: botResult.botMoveApplied,
      bot_composite_rpc: true,
    });
    if (botResult.humanWasIdempotentDuplicate && !botResult.botMoveApplied) {
      return idempotentSuccessJson(botResult.finalRow, {
        botMoveApplied: botResult.botMoveApplied,
        thinkMs: botResult.thinkMs,
      });
    }
    return json(
      {
        ok: true,
        idempotent_duplicate: botResult.humanWasIdempotentDuplicate,
        row: botResult.finalRow,
        bot_move_applied: botResult.botMoveApplied,
        think_ms: botResult.thinkMs,
      },
      200,
    );
  }

  let committedHumanRow: Record<string, unknown> | null = humanAlreadyCommitted
    ? (gameRow as Record<string, unknown>)
    : null;
  let humanWasIdempotentDuplicate = humanAlreadyCommitted;

  if (!humanAlreadyCommitted && movePatch) {
    const moved = board.history({ verbose: true }).at(-1);
    const humanLogRow = {
      game_id: gameId,
      player_id: userId,
      san: moved?.san ?? '',
      from_sq: fromSquare,
      to_sq: toSquare,
      fen_before: String(initialGame.data.fen ?? '').trim() || null,
      fen_after: nextFen,
      move_duration_ms: Number(inputMove.move_duration_ms ?? 0),
    };

    const humanLogPayload = validateRpcMoveLogPayload(gameId, humanLogRow, {
      idempotencyKey: humanIdempotencyKey,
    });
    if (!humanLogPayload.ok) {
      return moveLogInvalidPayloadJson(humanLogPayload.message);
    }

    const { data: rpcHumanRow, error: updateErr } = await supabase.rpc('apply_move_and_maybe_finish_system', {
      p_game_id: gameId,
      p_expected_fen: String(gameRow.fen ?? '').trim(),
      p_next_fen: movePatch.fen,
      p_next_turn: movePatch.turn,
      p_last_move_at: movePatch.last_move_at,
      p_move_deadline_at: movePatch.move_deadline_at,
      p_white_clock_ms: movePatch.white_clock_ms ?? null,
      p_black_clock_ms: movePatch.black_clock_ms ?? null,
      p_promote_waiting_to_active: movePatch.status === 'active',
      p_result: terminal?.result ?? null,
      p_end_reason: terminal?.endReason ?? null,
      p_move_log: humanLogPayload.payload,
    });

    committedHumanRow = rpcHumanRow as Record<string, unknown> | null;

    if (updateErr || !committedHumanRow) {
    const current = await supabase.from('games').select('fen').eq('id', gameId).maybeSingle();
    const actualFen = String(current.data?.fen ?? '').trim() || null;
    const dbMsg = dbMessage(updateErr);
    if (dbMsg.includes('move_log_invalid_payload')) {
      auditApiLog('submit_move', {
        result: 'move_log_invalid_payload',
        game_id: shortId(gameId),
        user: shortId(userId),
      });
      return moveLogInvalidPayloadJson('Move history payload was rejected.');
    }
    if (dbMsg.includes('idempotency_key_conflict')) {
      return idempotencyConflictJson('This move idempotency key was already used for a different move.');
    }

    const recovered = await tryRecoverIdempotentHumanMove(supabase, {
      gameId,
      idempotencyKey: humanIdempotencyKey,
      playerId: userId,
      fromSquare,
      toSquare,
      fenBefore: preMoveFen || null,
      fenAfter: nextFen,
    });
    if (recovered.ok) {
      committedHumanRow = recovered.row;
      humanWasIdempotentDuplicate = true;
    } else if (recovered.conflictMessage) {
      return idempotencyConflictJson(recovered.conflictMessage);
    } else if (dbMsg.includes('optimistic_conflict')) {
      auditApiLog('submit_move', {
        result: 'optimistic_conflict',
        game_id: shortId(gameId),
        user: shortId(userId),
        ms: typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0,
      });
      return conflictJson({
        gameId,
        expectedFen: String(gameRow.fen ?? '').trim() || null,
        actualFen,
      });
    } else {
      auditApiLog('submit_move', { result: 'move_commit_failed', game_id: shortId(gameId), user: shortId(userId) });
      return json(
        { error: 'move_commit_failed', message: 'Move could not be committed. Refresh and try again.' },
        409,
      );
    }
    }
  }

  if (!committedHumanRow) {
    auditApiLog('submit_move', { result: 'move_commit_failed', game_id: shortId(gameId), user: shortId(userId) });
    return json(
      { error: 'move_commit_failed', message: 'Move could not be committed. Refresh and try again.' },
      409,
    );
  }

  const finalRow = committedHumanRow as typeof initialGame.data;

  const elapsed =
    typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0;
  logSlowRequest('submit_move', elapsed, { user: shortId(userId) });
  auditApiLog('submit_move', {
    result: 'ok',
    game_id: shortId(gameId),
    user: shortId(userId),
    ms: elapsed,
    bot_move_applied: false,
  });
  if (humanWasIdempotentDuplicate) {
    return idempotentSuccessJson(finalRow, { botMoveApplied: false, thinkMs: null });
  }

  return json(
    {
      ok: true,
      idempotent_duplicate: humanWasIdempotentDuplicate,
      row: finalRow,
      bot_move_applied: false,
      think_ms: null,
    },
    200,
  );
  } finally {
    guard.release();
  }
}
