import { Chess } from 'chess.js';

import {
  buildBotCandidatesFromFen,
  shouldAuditBotEngineDegradation,
} from '@/lib/bot/botCandidates';
import { getBotDifficultyProfile, randomThinkTimeMs } from '@/lib/bot/botDifficulty';
import {
  applySanitizedUciToBoard,
  parseBotConfigFromRows,
  terminalStateFromBoard,
  verifyBotReplyPreconditions,
} from '@/lib/bot/botMoveCommit';
import { defaultBotGameConfig } from '@/lib/bot/botGameConfig';
import { botNameFromUserId } from '@/lib/bot/botIdentity';
import { selectBotMoveForStyle } from '@/lib/bot/botPersonalityStyle';
import { buildAuthoritativeMovePatch } from '@/lib/gameStateSourceOfTruth';
import {
  committedLogMatchesPayload,
  findCommittedMoveLogByKey,
} from '@/lib/replay/idempotentMoveRecovery';
import { buildBotGameTurnRpcParams } from '@/lib/replay/botGameTurnRpc';
import { buildMoveIdempotencyKey } from '@/lib/replay/moveIdempotencyKey';
import { validateRpcMoveLogPayload } from '@/lib/replay/rpcMoveLogPayload';
import { recordShadowBotMoveJob, type BotMoveShadowRecordInput } from '@/lib/server/botMoveJobShadow';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import type { SupabaseClient } from '@supabase/supabase-js';

const GAME_ROW_SELECT =
  'id,fen,turn,status,tempo,live_time_control,last_move_at,white_clock_ms,black_clock_ms,white_player_id,black_player_id,source_type,bot_settings,rating_last_update';

export type SubmitMoveBotGameInput = {
  gameId: string;
  userId: string;
  preMoveFen: string;
  nextFen: string;
  fromSquare: string;
  toSquare: string;
  moveDurationMs: number;
  humanIdempotencyKey: string;
  initialGameRow: Record<string, unknown>;
  gameRow: Record<string, unknown>;
  humanAlreadyCommitted: boolean;
  movePatch: {
    fen: string;
    turn: string;
    last_move_at: string | null;
    move_deadline_at: string | null;
    white_clock_ms: number | null;
    black_clock_ms: number | null;
    status: string;
  } | null;
  terminal: { result: string; endReason: string } | null;
  board: Chess;
};

export type SubmitMoveBotGameSuccess = {
  ok: true;
  finalRow: Record<string, unknown>;
  botMoveApplied: boolean;
  thinkMs: number | null;
  humanWasIdempotentDuplicate: boolean;
};

export type SubmitMoveBotGameFailure = {
  ok: false;
  kind:
    | 'move_log_invalid'
    | 'idempotency_conflict'
    | 'optimistic_conflict'
    | 'bot_precondition'
    | 'bot_no_candidates'
    | 'bot_invalid_uci'
    | 'commit_failed';
  message: string;
  humanRow?: Record<string, unknown>;
  thinkMs?: number | null;
  expectedFen?: string | null;
  actualFen?: string | null;
  botCode?: string;
};

export type SubmitMoveBotGameResult = SubmitMoveBotGameSuccess | SubmitMoveBotGameFailure;

function dbMessage(err: unknown): string {
  return String((err as { message?: string } | null)?.message ?? '').toLowerCase();
}

function buildPostHumanRow(
  gameRow: Record<string, unknown>,
  movePatch: SubmitMoveBotGameInput['movePatch'],
): Record<string, unknown> {
  if (!movePatch) return gameRow;
  return {
    ...gameRow,
    fen: movePatch.fen,
    turn: movePatch.turn,
    last_move_at: movePatch.last_move_at,
    move_deadline_at: movePatch.move_deadline_at,
    white_clock_ms: movePatch.white_clock_ms ?? gameRow.white_clock_ms,
    black_clock_ms: movePatch.black_clock_ms ?? gameRow.black_clock_ms,
    status: movePatch.status === 'active' ? 'active' : gameRow.status,
  };
}

type BotShadowContext = BotMoveShadowRecordInput;

async function finalizeBotGameSuccess(
  supabase: SupabaseClient,
  result: SubmitMoveBotGameSuccess,
  shadow: BotShadowContext | null,
): Promise<SubmitMoveBotGameSuccess> {
  if (result.botMoveApplied && shadow) {
    await recordShadowBotMoveJob(supabase, shadow);
  }
  return result;
}

function humanPatchFromRow(
  row: Record<string, unknown>,
  promoteWaiting: boolean,
): NonNullable<SubmitMoveBotGameInput['movePatch']> {
  return {
    fen: String(row.fen ?? '').trim(),
    turn: String(row.turn ?? 'white'),
    last_move_at: row.last_move_at == null ? null : String(row.last_move_at),
    move_deadline_at: row.move_deadline_at == null ? null : String(row.move_deadline_at),
    white_clock_ms: typeof row.white_clock_ms === 'number' ? row.white_clock_ms : null,
    black_clock_ms: typeof row.black_clock_ms === 'number' ? row.black_clock_ms : null,
    status: promoteWaiting ? 'active' : String(row.status ?? 'active'),
  };
}

export async function commitBotGameTurn(
  input: SubmitMoveBotGameInput,
): Promise<SubmitMoveBotGameResult> {
  const supabase = createServiceRoleClient();
  const {
    gameId,
    userId,
    preMoveFen,
    nextFen,
    fromSquare,
    toSquare,
    moveDurationMs,
    humanIdempotencyKey,
    initialGameRow,
    gameRow,
    humanAlreadyCommitted,
    movePatch,
    terminal,
    board,
  } = input;

  const lastVerboseMove = board.history({ verbose: true }).at(-1);
  const humanLogPayload = validateRpcMoveLogPayload(
    gameId,
    {
      game_id: gameId,
      player_id: userId,
      san: lastVerboseMove?.san ?? '',
      from_sq: fromSquare,
      to_sq: toSquare,
      fen_before: preMoveFen || null,
      fen_after: nextFen,
      move_duration_ms: moveDurationMs,
    },
    { idempotencyKey: humanIdempotencyKey },
  );
  if (!humanLogPayload.ok) {
    return { ok: false, kind: 'move_log_invalid', message: humanLogPayload.message };
  }

  const postHumanRow = buildPostHumanRow(gameRow, movePatch);
  const humanPatch = movePatch ?? humanPatchFromRow(postHumanRow, false);

  let botLogPayload: ReturnType<typeof validateRpcMoveLogPayload> | null = null;
  let botPatch: ReturnType<typeof buildAuthoritativeMovePatch> | null = null;
  let botTerminal: ReturnType<typeof terminalStateFromBoard> = null;
  let thinkMs: number | null = null;
  let botShadow: BotShadowContext | null = null;
  const correlationId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : null;

  if (!terminal && String(postHumanRow.status ?? '').trim().toLowerCase() === 'active') {
    let botConfig = parseBotConfigFromRows(initialGameRow, postHumanRow);
    if (!botConfig) {
      const isWhiteTurn = String(postHumanRow.turn ?? '') === 'white';
      const sideToMoveUserId = isWhiteTurn
        ? String(postHumanRow.white_player_id ?? '')
        : String(postHumanRow.black_player_id ?? '');
      const legacyName = botNameFromUserId(sideToMoveUserId);
      if (legacyName) {
        botConfig = defaultBotGameConfig(3, 'balanced', legacyName);
      }
    }

    const postHumanFen = String(postHumanRow.fen ?? '').trim();
    const pre = verifyBotReplyPreconditions(postHumanRow, {
      humanPlayerId: userId,
      expectedFen: postHumanFen,
      botConfig,
    });
    if (!pre.ok) {
      return {
        ok: false,
        kind: 'bot_precondition',
        message: pre.message,
        botCode: pre.code,
        humanRow: postHumanRow,
      };
    }

    const difficultyProfile = getBotDifficultyProfile(pre.botConfig.accl_bot_v1.difficulty);
    thinkMs = randomThinkTimeMs(difficultyProfile);

    const candidates = await buildBotCandidatesFromFen(pre.fenNow, difficultyProfile, {
      allowOpeningReference: true,
      personalityStyle: pre.botConfig.accl_bot_v1.personalityStyle,
    });
    const selected = selectBotMoveForStyle(
      pre.botConfig.accl_bot_v1.personalityStyle,
      candidates,
      pre.botConfig.accl_bot_v1.difficulty,
      difficultyProfile.blunderProbability,
    );
    if (!selected) {
      return {
        ok: false,
        kind: 'bot_no_candidates',
        message: 'Computer could not find a legal move.',
        humanRow: postHumanRow,
        thinkMs,
      };
    }

    if (shouldAuditBotEngineDegradation(difficultyProfile, selected.rationale)) {
      auditApiLog('bot_move_engine_degraded', {
        game_id: shortId(gameId),
        difficulty: pre.botConfig.accl_bot_v1.difficulty,
        personality: pre.botConfig.accl_bot_v1.personalityStyle,
      });
    }

    const applied = applySanitizedUciToBoard(pre.fenNow, selected.move);
    if (!applied) {
      return {
        ok: false,
        kind: 'bot_invalid_uci',
        message: 'Computer selected an illegal move.',
        humanRow: postHumanRow,
        thinkMs,
      };
    }

    const { board: botBoard, moved: botMoved } = applied;
    const botNextFen = botBoard.fen();
    const botNextTurn = botBoard.turn() === 'w' ? 'white' : 'black';
    botTerminal = terminalStateFromBoard(botBoard, pre.botMoverColor);

    botPatch = buildAuthoritativeMovePatch({
      nextFen: botNextFen,
      nextTurn: botNextTurn,
      statusBefore: String(postHumanRow.status ?? 'active'),
      tempo: postHumanRow.tempo == null ? null : String(postHumanRow.tempo),
      liveTimeControl:
        postHumanRow.live_time_control == null ? null : String(postHumanRow.live_time_control),
      currentTurn: String(postHumanRow.turn ?? 'white'),
      whiteClockMs:
        typeof postHumanRow.white_clock_ms === 'number' ? postHumanRow.white_clock_ms : null,
      blackClockMs:
        typeof postHumanRow.black_clock_ms === 'number' ? postHumanRow.black_clock_ms : null,
      lastMoveAt: postHumanRow.last_move_at == null ? null : String(postHumanRow.last_move_at),
    });

    const botIdempotencyKey = buildMoveIdempotencyKey({
      gameId,
      fenBefore: pre.fenNow,
      playerId: pre.sideToMoveUserId,
      fromSq: botMoved.from,
      toSq: botMoved.to,
      promotion: botMoved.promotion ?? null,
    });

    botLogPayload = validateRpcMoveLogPayload(
      gameId,
      {
        game_id: gameId,
        player_id: pre.sideToMoveUserId,
        san: botMoved.san,
        from_sq: botMoved.from,
        to_sq: botMoved.to,
        fen_before: pre.fenNow,
        fen_after: botNextFen,
        move_duration_ms: thinkMs,
      },
      { idempotencyKey: botIdempotencyKey },
    );
    if (!botLogPayload.ok) {
      return { ok: false, kind: 'move_log_invalid', message: botLogPayload.message, thinkMs };
    }

    botShadow = {
      gameId,
      postHumanFen: pre.fenNow,
      botPlayerId: pre.sideToMoveUserId,
      idempotencyKey: botIdempotencyKey,
      selectedUci: selected.move,
      thinkMs,
      correlationId,
    };
  }

  const compositeParams = buildBotGameTurnRpcParams({
    gameId,
    expectedFen: preMoveFen,
    humanPatch: {
      fen: humanPatch.fen,
      turn: humanPatch.turn,
      last_move_at: humanPatch.last_move_at,
      move_deadline_at: humanPatch.move_deadline_at,
      white_clock_ms: humanPatch.white_clock_ms,
      black_clock_ms: humanPatch.black_clock_ms,
      promote_waiting_to_active: humanPatch.status === 'active' && String(gameRow.status ?? '') === 'waiting',
    },
    humanTerminal: terminal,
    humanMoveLog: humanLogPayload.payload,
    botPatch: botPatch
      ? {
          fen: botPatch.fen,
          turn: botPatch.turn,
          last_move_at: botPatch.last_move_at,
          move_deadline_at: botPatch.move_deadline_at,
          white_clock_ms: botPatch.white_clock_ms ?? null,
          black_clock_ms: botPatch.black_clock_ms ?? null,
        }
      : null,
    botTerminal,
    botMoveLog: botLogPayload?.ok ? botLogPayload.payload : null,
  });

  const { data: compositeRow, error: compositeErr } = await supabase.rpc(
    'apply_bot_game_turn_system',
    compositeParams,
  );

  if (!compositeErr && compositeRow) {
    return finalizeBotGameSuccess(
      supabase,
      {
        ok: true,
        finalRow: compositeRow as Record<string, unknown>,
        botMoveApplied: Boolean(botLogPayload?.ok),
        thinkMs,
        humanWasIdempotentDuplicate: humanAlreadyCommitted,
      },
      botShadow,
    );
  }

  const current = await supabase.from('games').select('fen').eq('id', gameId).maybeSingle();
  const actualFen = String(current.data?.fen ?? '').trim() || null;
  const dbMsg = dbMessage(compositeErr);

  if (dbMsg.includes('move_log_invalid_payload')) {
    return { ok: false, kind: 'move_log_invalid', message: 'Move history payload was rejected.' };
  }
  if (dbMsg.includes('idempotency_key_conflict')) {
    return {
      ok: false,
      kind: 'idempotency_conflict',
      message: 'This move idempotency key was already used for a different move.',
    };
  }

  const humanRecovered = await findCommittedMoveLogByKey(supabase, gameId, humanIdempotencyKey);
  if (humanRecovered.found) {
    const humanMatch = committedLogMatchesPayload(humanRecovered.log, {
      playerId: userId,
      fromSq: fromSquare,
      toSq: toSquare,
      fenBefore: preMoveFen || null,
      fenAfter: nextFen,
    });
    if (humanMatch.ok) {
      if (botLogPayload?.ok) {
        const botKey = botLogPayload.payload.idempotency_key ?? '';
        if (botKey) {
          const botRecovered = await findCommittedMoveLogByKey(supabase, gameId, botKey);
          if (botRecovered.found) {
            const botMatch = committedLogMatchesPayload(botRecovered.log, {
              playerId: botLogPayload.payload.player_id,
              fromSq: botLogPayload.payload.from_sq,
              toSq: botLogPayload.payload.to_sq,
              fenBefore: botLogPayload.payload.fen_before,
              fenAfter: botLogPayload.payload.fen_after,
            });
            if (botMatch.ok && actualFen === botLogPayload.payload.fen_after) {
              const full = await supabase.from('games').select(GAME_ROW_SELECT).eq('id', gameId).single();
              if (!full.error && full.data) {
                const shadowFromLog: BotShadowContext = {
                  gameId,
                  postHumanFen: String(botLogPayload.payload.fen_before ?? ''),
                  botPlayerId: String(botLogPayload.payload.player_id),
                  idempotencyKey: botKey,
                  selectedUci: `${botLogPayload.payload.from_sq}${botLogPayload.payload.to_sq}`,
                  thinkMs,
                  correlationId,
                };
                return finalizeBotGameSuccess(
                  supabase,
                  {
                    ok: true,
                    finalRow: full.data as Record<string, unknown>,
                    botMoveApplied: true,
                    thinkMs,
                    humanWasIdempotentDuplicate: true,
                  },
                  botShadow ?? shadowFromLog,
                );
              }
            }
          }
        }
      } else if (terminal) {
        const full = await supabase.from('games').select(GAME_ROW_SELECT).eq('id', gameId).single();
        if (!full.error && full.data) {
          const status = String(full.data.status ?? '').toLowerCase();
          if (status === 'finished') {
            return {
              ok: true,
              finalRow: full.data as Record<string, unknown>,
              botMoveApplied: false,
              thinkMs,
              humanWasIdempotentDuplicate: true,
            };
          }
        }
      } else if (botLogPayload === null && actualFen === nextFen) {
        const full = await supabase.from('games').select(GAME_ROW_SELECT).eq('id', gameId).single();
        if (!full.error && full.data) {
          return {
            ok: true,
            finalRow: full.data as Record<string, unknown>,
            botMoveApplied: false,
            thinkMs,
            humanWasIdempotentDuplicate: true,
          };
        }
      }
    } else {
      return { ok: false, kind: 'idempotency_conflict', message: humanMatch.message };
    }
  }

  if (dbMsg.includes('optimistic_conflict')) {
    return {
      ok: false,
      kind: 'optimistic_conflict',
      message: 'Game position changed before this move was committed.',
      expectedFen: preMoveFen,
      actualFen,
    };
  }

  return {
    ok: false,
    kind: 'commit_failed',
    message: terminal
      ? 'Move could not be committed. Refresh and try again.'
      : 'Computer turn could not be committed. Refresh and try again.',
    humanRow: postHumanRow,
    thinkMs,
    expectedFen: preMoveFen,
    actualFen,
  };
}
