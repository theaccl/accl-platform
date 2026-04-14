'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import {
  clearBatchedDisplayNameFetchNotice,
  DisplayNameLoadNotice,
  recordBatchedDisplayNameFetchFailure,
} from '@/lib/displayNameLoadNotice';
import {
  heuristicClassificationLabel,
  type AnalyzedMove,
  type HeuristicClassification,
  type IntelligenceMode,
} from '@/lib/analysis';
import {
  afterMoveTimingFields,
  gameTimingRuleSummaryLine,
  isCorrespondenceDeadlineActive,
  isLiveDailyClockTicking,
} from '@/lib/gameTiming';
import { normalizeGameTempo } from '@/lib/gameTempo';
import { gameDisplayTempoLabel, gameModeBannerLabel } from '@/lib/gameDisplayLabel';
import {
  canonicalLiveTimeControlForInsert,
  clockBudgetMsForGame,
  correspondenceMoveDeadlineMs,
} from '@/lib/gameTimeControl';
import { RequestSuccessBanner } from '@/components/RequestSuccessBanner';
import { userMessageForMatchRequestInsertError } from '@/lib/matchRequestInsertError';
import { canPickPieceForMove } from '@/lib/boardInteraction';
import {
  finishedGameResultBannerText,
  formatFinishedAtLocal,
  isGameRecordFinished,
} from '@/lib/finishedGame';
import {
  classifyGameForRating,
  ratingClassificationSummaryLine,
} from '@/lib/ratingClassification';
import { START_FEN } from '@/lib/startFen';
import { supabase } from '@/lib/supabaseClient';
import {
  fetchLatestFinishedGameAnalysisArtifacts,
  type FinishedGameAnalysisArtifactRow,
} from '@/lib/finishedGameAnalysisArtifacts';
import {
  fetchFinishedGameAnalysisJobSummary,
  type FinishedGameAnalysisJobSummary,
} from '@/lib/finishedGameAnalysisJobSummary';
import { useReplayState, type MoveLogRow, type ReplayPairedRow } from '@/hooks/useReplayState';
import { trackGrowthEvent } from '@/lib/public/funnelTracking';
import { getStoredEntrySource, getStoredReferral, setFirstAction } from '@/lib/public/referralTracking';
import TrainerPanel from '@/components/trainer/TrainerPanel';
import {
  accessFromPublicHint,
  type GameRouteAccessKind,
  shouldUsePublicSpectateRpc,
} from '@/lib/gameRouteVisibility';
import { buildGameLoginRedirect } from '@/lib/nexus/nexusRouteHelpers';
import { publicDisplayNameFromProfileUsername } from '@/lib/profileIdentity';
import GameTesterChatPanels from '@/components/game/GameTesterChatPanels';
import { TesterBugReportTrigger } from '@/components/TesterBugReportDialog';

type GameRow = {
  id: string;
  white_player_id: string;
  black_player_id: string | null;
  status: string;
  mode: 'SKETCH' | 'PIT';
  fen: string;
  turn: string;
  created_at: string;
  winner_id?: string | null;
  result?: string | null;
  end_reason?: string | null;
  finished_at?: string | null;
  draw_offered_by?: string | null;
  draw_offered_at?: string | null;
  source_type?: string | null;
  source_request_id?: string | null;
  source_game_id?: string | null;
  tempo?: string | null;
  live_time_control?: string | null;
  /** When true, game is intended to count toward rating. */
  rated?: boolean | null;
  play_context?: string | null;
  tournament_id?: string | null;
  /** Set by DB after free-play rating pass (idempotent). */
  rating_applied?: boolean | null;
  /** JSON snapshot: bucket, white/black before & after, deltas (debug). */
  rating_last_update?: unknown | null;
  last_move_at?: string | null;
  move_deadline_at?: string | null;
  white_clock_ms?: number | null;
  black_clock_ms?: number | null;
};

type PublicFinishedGameSnapshot = {
  game: Pick<
    GameRow,
    | 'id'
    | 'status'
    | 'white_player_id'
    | 'black_player_id'
    | 'winner_id'
    | 'result'
    | 'end_reason'
    | 'finished_at'
    | 'created_at'
    | 'mode'
    | 'fen'
    | 'turn'
    | 'tempo'
    | 'live_time_control'
    | 'rated'
    | 'play_context'
    | 'source_type'
    | 'tournament_id'
  >;
  players: {
    white: { id: string; username: string | null } | null;
    black: { id: string; username: string | null } | null;
  };
  move_logs: MoveLogRow[];
};

/** chess.js promotion piece letters */
type PromotionPiece = 'q' | 'r' | 'b' | 'n';

/** Both seats committed with distinct user ids (trimmed). Used to gate all move input (hotfix: solo / bad row). */
function bothPlayersSeated(g: Pick<GameRow, 'white_player_id' | 'black_player_id'>): boolean {
  const w = String(g.white_player_id ?? '').trim();
  const b = String(g.black_player_id ?? '').trim();
  return w.length > 0 && b.length > 0 && w !== b;
}

/** react-chessboard parses `position` as FEN; invalid strings yield impossible pieceType keys and crash Piece. */
function normalizeFenForReactChessboard(raw: string): string {
  if (!raw || raw === 'start') return START_FEN;
  try {
    const c = new Chess();
    c.load(raw);
    return c.fen();
  } catch {
    return START_FEN;
  }
}

/** True when `from`→`to` is a pawn advance that requires a promotion piece. */
function isPawnPromotionMove(board: Chess, from: string, to: string): boolean {
  const piece = board.get(from as Square);
  if (!piece || piece.type !== 'p') return false;
  const verbose = board.moves({ square: from as Square, verbose: true });
  return verbose.some((m) => m.to === to && m.promotion !== undefined);
}

/**
 * After a legal move, FEN reflects the side to move (the mated/stalemated player).
 * Returns DB fields to mark the game finished, or null if play continues.
 */
function gameOverFieldsAfterMove(fenAfterMove: string, g: GameRow): {
  status: string;
  result: string | null;
  winner_id: string | null;
  end_reason: string;
  finished_at: string;
  move_deadline_at: null;
  draw_offered_by: null;
  draw_offered_at: null;
} | null {
  let c: Chess;
  try {
    c = new Chess(fenAfterMove);
  } catch {
    return null;
  }
  const finishedAt = new Date().toISOString();
  const clearDraw = {
    draw_offered_by: null as null,
    draw_offered_at: null as null,
  };
  if (c.isCheckmate()) {
    const mated = c.turn();
    const winnerId =
      mated === 'w' ? g.black_player_id : g.white_player_id;
    const result = mated === 'w' ? 'black_win' : 'white_win';
    return {
      status: 'finished',
      result,
      winner_id: winnerId ?? null,
      end_reason: 'checkmate',
      finished_at: finishedAt,
      move_deadline_at: null,
      ...clearDraw,
    };
  }
  if (c.isStalemate()) {
    return {
      status: 'finished',
      result: 'draw',
      winner_id: null,
      end_reason: 'stalemate',
      finished_at: finishedAt,
      move_deadline_at: null,
      ...clearDraw,
    };
  }
  if (c.isInsufficientMaterial()) {
    return {
      status: 'finished',
      result: 'draw',
      winner_id: null,
      end_reason: 'insufficient_material',
      finished_at: finishedAt,
      move_deadline_at: null,
      ...clearDraw,
    };
  }
  if (c.isThreefoldRepetition()) {
    return {
      status: 'finished',
      result: 'draw',
      winner_id: null,
      end_reason: 'threefold_repetition',
      finished_at: finishedAt,
      move_deadline_at: null,
      ...clearDraw,
    };
  }
  if (c.isDrawByFiftyMoves()) {
    return {
      status: 'finished',
      result: 'draw',
      winner_id: null,
      end_reason: 'fifty_move_rule',
      finished_at: finishedAt,
      move_deadline_at: null,
      ...clearDraw,
    };
  }
  return null;
}

const NEXT_PUBLIC_ENGINE_ANALYSIS_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_ENGINE_ANALYSIS === 'true';

const IS_DEV_BUILD = process.env.NODE_ENV === 'development';

/** Search depth for the first integrated engine pass (keep modest for UX). */
const FINISHED_GAME_ENGINE_DEPTH = 12;

function analysisRowColor(c: HeuristicClassification): string {
  switch (c) {
    case 'blunder':
      return '#e57373';
    case 'inaccuracy':
      return '#d4a574';
    case 'strong':
      return '#81c784';
    default:
      return '#9e9e9e';
  }
}

/** Compact display for `AnalyzedMove.engineScore` (pawns; mate band ±900…1000). */
function formatEngineScore(pawns: number): string {
  if (pawns > 900 && pawns <= 1000) {
    const plies = Math.round(1000 - pawns);
    return `M${plies}`;
  }
  if (pawns < -900 && pawns >= -1000) {
    const plies = Math.round(pawns + 1000);
    return `−M${plies}`;
  }
  const rounded = Math.round(pawns * 100) / 100;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}`;
}

/** `move_deadline_at` (UTC ISO) → local string for read-only display (no ticking). */
function formatMoveDeadlineLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatClockMs(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const totalSec = Math.floor(safe / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function formatClockHms(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const totalSec = Math.floor(safe / 1000);
  const h = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const hPart = h > 0 ? `${h}h ` : '';
  return `${hPart}${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function correspondencePaceCompactLabel(token: string | null | undefined): string {
  if (token === '2d') return '2/day';
  if (token === '3d') return '3/day';
  return '1/day';
}

function displayClockTurn(raw: string | undefined | null): 'white' | 'black' {
  const t = (raw ?? 'white').toLowerCase();
  if (t === 'black' || t === 'b') return 'black';
  return 'white';
}

function DigitalChessClock({
  whiteMs,
  blackMs,
  activeTurn,
  isCorrespondence,
  paceLabel,
}: {
  whiteMs: number;
  blackMs: number;
  activeTurn: 'white' | 'black' | null;
  isCorrespondence?: boolean;
  paceLabel?: string;
}) {
  const whiteActive = activeTurn === 'white';
  const blackActive = activeTurn === 'black';

  const LED_SLOT_PX = 14;
  const runningLed = (active: boolean) => (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: active ? '#f43f5e' : '#334155',
        boxShadow: active ? '0 0 8px #f43f5e' : 'none',
        transition: 'all 0.2s ease',
      }}
    />
  );

  const formatClock = isCorrespondence ? formatClockHms : formatClockMs;
  const digitSize = isCorrespondence ? 'clamp(20px, 4.5vw, 32px)' : 'clamp(28px, 6vw, 48px)';

  return (
    <div
      data-testid="digital-chess-clock"
      data-clock-ticking={activeTurn != null ? 'true' : 'false'}
      style={{
        display: 'flex',
        gap: 16,
        justifyContent: 'center',
        padding: '20px 0',
        background: '#0f172a',
        borderRadius: 12,
        border: '1px solid #1e293b',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
      }}
    >
      <div data-testid="clock-white" style={{ textAlign: 'center', flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
          WHITE {isCorrespondence && paceLabel ? `(${paceLabel})` : ''}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '8px 16px',
              background: whiteActive ? '#1e293b' : 'transparent',
              borderRadius: 8,
              width: '100%',
              minHeight: LED_SLOT_PX,
            }}
          >
            <span style={{ width: LED_SLOT_PX, display: 'flex', justifyContent: 'center' }}>
              {runningLed(whiteActive)}
            </span>
            <div
              style={{
                fontSize: digitSize,
                fontWeight: 800,
                color: '#f8fafc',
                letterSpacing: '0.07em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.1,
              }}
            >
              {formatClock(whiteMs)}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          width: 1,
          background: 'linear-gradient(180deg, transparent, #1e293b, transparent)',
        }}
      />

      <div data-testid="clock-black" style={{ textAlign: 'center', flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
          BLACK {isCorrespondence && paceLabel ? `(${paceLabel})` : ''}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '8px 16px',
              background: blackActive ? '#1e293b' : 'transparent',
              borderRadius: 8,
              width: '100%',
              minHeight: LED_SLOT_PX,
            }}
          >
            <span style={{ width: LED_SLOT_PX, display: 'flex', justifyContent: 'center' }}>
              {runningLed(blackActive)}
            </span>
            <div
              style={{
                fontSize: digitSize,
                fontWeight: 800,
                color: '#f8fafc',
                letterSpacing: '0.07em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.1,
              }}
            >
              {formatClock(blackMs)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Live/daily clock model only (not correspondence).
 * `flaggedLoser` is the side to move when their remaining time is <= 0.
 */
function liveDailyClockTimeoutState(
  g: GameRow,
  nowMs: number
): {
  applies: boolean;
  flaggedLoser: 'white' | 'black' | null;
  whiteMs: number;
  blackMs: number;
} {
  const t = normalizeGameTempo(g.tempo);
  if (t !== 'live' && t !== 'daily') {
    return { applies: false, flaggedLoser: null, whiteMs: 0, blackMs: 0 };
  }
  if (
    !g.white_player_id ||
    !g.black_player_id ||
    g.status === 'finished' ||
    g.status !== 'active' ||
    !g.last_move_at
  ) {
    return { applies: false, flaggedLoser: null, whiteMs: 0, blackMs: 0 };
  }
  const base = clockBudgetMsForGame(g.tempo, g.live_time_control);
  const whiteStored = Number.isFinite(g.white_clock_ms) ? Number(g.white_clock_ms) : base;
  const blackStored = Number.isFinite(g.black_clock_ms) ? Number(g.black_clock_ms) : base;
  const elapsed = Math.max(0, nowMs - new Date(g.last_move_at).getTime());
  const activeStored = g.turn === 'white' ? whiteStored : blackStored;
  const activeRemaining = activeStored - elapsed;

  let flagged: 'white' | 'black' | null = null;
  if (g.turn === 'white' && activeRemaining <= 0) flagged = 'white';
  else if (g.turn === 'black' && activeRemaining <= 0) flagged = 'black';

  const whiteMs = g.turn === 'white' ? Math.max(0, activeRemaining) : whiteStored;
  const blackMs = g.turn === 'black' ? Math.max(0, activeRemaining) : blackStored;

  return {
    applies: true,
    flaggedLoser: flagged,
    whiteMs,
    blackMs,
  };
}

/** UI-only: detect e.p. by replaying from stored FEN/squares (does not change stored SAN). */
function isEnPassantMoveLog(m: MoveLogRow): boolean {
  const from = m.from_sq?.trim();
  const to = m.to_sq?.trim();
  if (!from || !to) return false;
  try {
    const c = new Chess();
    const fb = m.fen_before;
    if (fb && fb !== 'start') {
      c.load(fb);
    }
    const move = c.move({ from: from as Square, to: to as Square });
    if (!move) return false;
    return move.isEnPassant();
  } catch {
    return false;
  }
}

/** Notation shown in Replay / Analysis; PGN and DB keep raw SAN. */
function sanForDisplay(m: MoveLogRow): string {
  return isEnPassantMoveLog(m) ? `${m.san} e.p.` : m.san;
}

/** One full-move row for analysis display (white half-move + optional black). */
function buildPairedAnalysisRows(moves: AnalyzedMove[]): {
  num: number;
  white: AnalyzedMove;
  black?: AnalyzedMove;
}[] {
  const rows: { num: number; white: AnalyzedMove; black?: AnalyzedMove }[] = [];
  let i = 0;
  let num = 1;
  while (i < moves.length) {
    const white = moves[i]!;
    if (i + 1 < moves.length) {
      rows.push({ num: num++, white, black: moves[i + 1]! });
      i += 2;
    } else {
      rows.push({ num: num++, white, black: undefined });
      i += 1;
    }
  }
  return rows;
}

function escapePgnHeaderValue(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function pgnResultTag(game: GameRow): string {
  if (game.status !== 'finished') return '*';
  if (game.result === 'draw' || game.result === '1/2-1/2') return '1/2-1/2';
  if (game.result === 'white_win') return '1-0';
  if (game.result === 'black_win') return '0-1';
  return '*';
}

/** PGN [Termination "..."] for finished games; omit when unknown */
function terminationPgnTag(game: GameRow): string | null {
  if (game.status !== 'finished') return null;
  const er = game.end_reason;
  if (!er) return null;
  const m: Record<string, string> = {
    resign: 'resignation',
    draw_agreement: 'draw agreement',
    checkmate: 'checkmate',
    stalemate: 'stalemate',
    timeout: 'timeout',
  };
  const label = m[er];
  return label ?? null;
}

function formatPgnDate(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  } catch {
    return '????.??.??';
  }
}

function buildMovetext(moveLogs: MoveLogRow[]): string {
  if (moveLogs.length === 0) return '';
  const sans = moveLogs.map((m) => m.san);
  const rows: { num: number; white: string; black?: string }[] = [];
  let i = 0;
  let num = 1;
  while (i < sans.length) {
    const white = sans[i]!;
    if (i + 1 < sans.length) {
      rows.push({ num: num++, white, black: sans[i + 1]! });
      i += 2;
    } else {
      rows.push({ num: num++, white, black: undefined });
      i += 1;
    }
  }
  return rows
    .map((r) => `${r.num}. ${r.white}${r.black !== undefined ? ` ${r.black}` : ''}`)
    .join(' ');
}

function buildPgn(
  game: GameRow,
  moveLogs: MoveLogRow[],
  displayNameById: Record<string, string>
): string {
  const res = pgnResultTag(game);
  const whiteHeader = escapePgnHeaderValue(
    displayNameById[game.white_player_id] ?? game.white_player_id
  );
  const blackHeader = game.black_player_id
    ? escapePgnHeaderValue(
        displayNameById[game.black_player_id] ?? game.black_player_id
      )
    : '?';
  const term = terminationPgnTag(game);
  const lines = [
    `[Event "Online game"]`,
    `[Site "ACCL"]`,
    `[Date "${formatPgnDate(game.created_at)}"]`,
    `[Round "-"]`,
    `[White "${whiteHeader}"]`,
    `[Black "${blackHeader}"]`,
    `[Result "${res}"]`,
  ];
  if (term) {
    lines.push(`[Termination "${escapePgnHeaderValue(term)}"]`);
  }
  lines.push(`[GameId "${escapePgnHeaderValue(game.id)}"]`, '');
  const movetext = buildMovetext(moveLogs);
  const body = movetext ? `${movetext} ${res}` : res;
  return `${lines.join('\n')}${body}\n`;
}

function downloadPgn(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const PGN_EXPORT_LS_KEY = 'pgn_export_count';
const PGN_EXPORT_FREE_LIMIT = 3;

function readPgnExportCount(): number {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem(PGN_EXPORT_LS_KEY);
  const n = parseInt(raw ?? '0', 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function isPgnExportLimitBypassed(): boolean {
  if (process.env.NEXT_PUBLIC_DISABLE_PGN_EXPORT_LIMIT === 'true') return true;
  if (process.env.NODE_ENV === 'development') return true;
  return false;
}

function analysisArtifactStubMeta(a: FinishedGameAnalysisArtifactRow): {
  artifactVersion: string;
  artifactType: string;
  processorVersion: string | null;
  partition: string | null;
  moveCount: number | null;
  note: string | null;
} {
  const p = a.payload ?? {};
  return {
    artifactVersion: a.artifact_version,
    artifactType: a.artifact_type,
    processorVersion: typeof p.processor_version === 'string' ? p.processor_version : null,
    partition:
      a.analysis_partition ??
      (typeof (p as { analysis_partition?: unknown }).analysis_partition === 'string'
        ? (p as { analysis_partition: string }).analysis_partition
        : null),
    moveCount: typeof p.move_count === 'number' ? p.move_count : null,
    note: typeof p.note === 'string' ? p.note : null,
  };
}

type PrivateAnalysisLifecycleState =
  | 'not_queued'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'no_finished_intake';

function analysisLifecycleFromSummary(
  summary: FinishedGameAnalysisJobSummary | null
): PrivateAnalysisLifecycleState {
  if (!summary || summary.never_queued || !summary.job) return 'not_queued';
  const st = summary.job.status;
  if (st === 'queued') return 'queued';
  if (st === 'running') return 'running';
  if (st === 'completed') return 'completed';
  if (st === 'failed') return 'failed';
  return 'no_finished_intake';
}

export default function GamePage() {
  const params = useParams();
  const gameId = params?.id as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const publicSpectate =
    searchParams.get('public') === '1' || searchParams.get('spectate') === '1';
  const viewerEcosystem = searchParams.get('eco') === 'k12' ? 'k12' : 'adult';

  const [game, setGame] = useState<GameRow | null>(null);
  const [gameAccess, setGameAccess] = useState<GameRouteAccessKind>('loading');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [chatAccessToken, setChatAccessToken] = useState<string | null>(null);
  const [savingMove, setSavingMove] = useState(false);
  const [resigning, setResigning] = useState(false);
  const [drawBusy, setDrawBusy] = useState(false);
  const [rematchRequestBusy, setRematchRequestBusy] = useState(false);
  const [rematchSentBanner, setRematchSentBanner] = useState(false);
  /** Subscribe like DirectChallengePanel so the rematch requester auto-navigates when the row is accepted. */
  const [pendingRematchRequestId, setPendingRematchRequestId] = useState<string | null>(null);
  const [promotionPending, setPromotionPending] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false);
  const [devEngineAnalysisEnabled, setDevEngineAnalysisEnabled] = useState(false);
  const [engineAnalysisRows, setEngineAnalysisRows] = useState<AnalyzedMove[] | null>(null);
  const [engineAnalysisBusy, setEngineAnalysisBusy] = useState(false);
  
  const {
    moveLogs,
    setMoveLogs,
    replayStep,
    setReplayStep,
    pairedRows,
    boardPosition: replayBoardPosition,
    lastMoveSquareStyles,
  } = useReplayState(sanForDisplay, START_FEN);

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pgnExportCount, setPgnExportCount] = useState(0);
  const chessRef = useRef<Chess | null>(null);
  const [liveChessVersion, setLiveChessVersion] = useState(0);
  const [displayNameById, setDisplayNameById] = useState<Record<string, string>>({});
  const displayNameFetchFailuresRef = useRef(0);
  const [showDisplayNameLoadNotice, setShowDisplayNameLoadNotice] = useState(false);
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const liveTimeoutInFlightRef = useRef(false);
  const [finishedGameArtifacts, setFinishedGameArtifacts] = useState<FinishedGameAnalysisArtifactRow[] | null>(
    null
  );
  const [finishedGameArtifactsLoading, setFinishedGameArtifactsLoading] = useState(false);
  const [finishedGameArtifactsError, setFinishedGameArtifactsError] = useState<string | null>(null);
  const [finishedAnalysisSummary, setFinishedAnalysisSummary] = useState<FinishedGameAnalysisJobSummary | null>(
    null
  );
  const [finishedAnalysisSummaryLoading, setFinishedAnalysisSummaryLoading] = useState(false);
  const [finishedAnalysisSummaryError, setFinishedAnalysisSummaryError] = useState<string | null>(null);

  const spectateGrowthTracked = useRef(false);

  useEffect(() => {
    liveTimeoutInFlightRef.current = false;
  }, [gameId]);

  useEffect(() => {
    if (!gameId || spectateGrowthTracked.current) return;
    if (userId && !publicSpectate) return;
    spectateGrowthTracked.current = true;
    setFirstAction('spectate');
    trackGrowthEvent({
      event_type: 'spectate_open',
      entry_source: getStoredEntrySource(),
      referral_id: getStoredReferral(),
      ecosystem: viewerEcosystem,
      meta: { game_id: gameId },
    });
  }, [publicSpectate, gameId, viewerEcosystem, userId]);

  useEffect(() => {
    setPgnExportCount(readPgnExportCount());
  }, []);

  useEffect(() => {
    setRematchSentBanner(false);
    setPendingRematchRequestId(null);
  }, [gameId]);

  useEffect(() => {
    if (!pendingRematchRequestId) return;
    const channel = supabase
      .channel(`rematch-accept-${pendingRematchRequestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'match_requests',
          filter: `id=eq.${pendingRematchRequestId}`,
        },
        (payload) => {
          const p = payload as {
            eventType?: string;
            new: { status?: string; resolution_game_id?: string | null };
            old: { status?: string };
          };
          if (p.eventType !== 'UPDATE') return;
          const oldSt = p.old?.status;
          if (oldSt !== undefined && oldSt !== 'pending') return;
          const row = p.new;
          if (row.status === 'accepted' && row.resolution_game_id) {
            router.push(`/game/${row.resolution_game_id}`);
            setPendingRematchRequestId(null);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pendingRematchRequestId, router]);

  useEffect(() => {
    if (!promotionPending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPromotionPending(null);
        setSelectedSquare(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [promotionPending]);

  useEffect(() => {
    const onDisplayNameUpdated = (ev: Event) => {
      const e = ev as CustomEvent<{ userId: string; displayName: string }>;
      const d = e.detail;
      if (!d?.userId) return;
      setDisplayNameById((prev) => ({ ...prev, [d.userId]: d.displayName }));
    };
    window.addEventListener('accl-display-name-updated', onDisplayNameUpdated);
    return () => window.removeEventListener('accl-display-name-updated', onDisplayNameUpdated);
  }, []);

  useEffect(() => {
    if (!game?.id) {
      clearBatchedDisplayNameFetchNotice(displayNameFetchFailuresRef, setShowDisplayNameLoadNotice);
      return;
    }
    const ids = [
      ...new Set(
        [game.white_player_id, game.black_player_id].filter((x): x is string => Boolean(x))
      ),
    ];
    if (ids.length === 0) {
      clearBatchedDisplayNameFetchNotice(displayNameFetchFailuresRef, setShowDisplayNameLoadNotice);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from('profiles').select('id, username, email').in('id', ids);
      if (cancelled) return;
      if (error) {
        console.log('Display names fetch:', error);
        recordBatchedDisplayNameFetchFailure(
          displayNameFetchFailuresRef,
          setShowDisplayNameLoadNotice
        );
        return;
      }
      clearBatchedDisplayNameFetchNotice(displayNameFetchFailuresRef, setShowDisplayNameLoadNotice);
      setDisplayNameById((prev) => {
        const next = { ...prev };
        for (const row of (data ?? []) as { id: string; username: string | null; email: string | null }[]) {
          next[row.id] = publicDisplayNameFromProfileUsername(row.username, row.id, row.email);
        }
        for (const id of ids) {
          if (!(id in next)) next[id] = publicDisplayNameFromProfileUsername(null, id);
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [game?.id, game?.white_player_id, game?.black_player_id]);

  const syncChessFen = game?.fen ?? '';
  const syncChessGameId = game?.id ?? '';

  /**
   * Click-to-move / promotion UI must not survive opponent moves, replay mode, or FEN sync.
   * (If `promotionPending` were left up after a remote position change, the backdrop could block input.)
   */
  useEffect(() => {
    setSelectedSquare(null);
    setPromotionPending(null);
  }, [syncChessFen, game?.turn, game?.id]);

  useEffect(() => {
    if (replayStep !== null) setSelectedSquare(null);
  }, [replayStep]);

  useLayoutEffect(() => {
    if (!syncChessGameId) return;
    if (savingMove) return;

    if (chessRef.current && chessRef.current.fen() === syncChessFen) {
      return;
    }

    const c = new Chess();
    if (syncChessFen && syncChessFen !== 'start') {
      try {
        c.load(syncChessFen);
      } catch {
        // start position
      }
    }
    chessRef.current = c;
    setLiveChessVersion((v) => v + 1);
  }, [syncChessFen, syncChessGameId, savingMove]);

  const myColor = useMemo(() => {
    if (!game || !userId) return null;
    if (game.white_player_id === userId) return 'white';
    if (game.black_player_id === userId) return 'black';
    return null;
  }, [game, userId]);

  const isSpectator = myColor === null;
  const isPublicViewer = !userId && !!game;

  useEffect(() => {
    if (!isPublicViewer) return;
    setShowAnalysisPanel(false);
    setDevEngineAnalysisEnabled(false);
    setEngineAnalysisRows(null);
    setEngineAnalysisBusy(false);
  }, [isPublicViewer]);

  /** Server-side analysis artifacts: participants only, never on public replay. */
  const canLoadFinishedGameArtifacts =
    !publicSpectate &&
    !!userId &&
    game?.status === 'finished' &&
    (userId === game?.white_player_id || userId === game?.black_player_id);

  useEffect(() => {
    if (!canLoadFinishedGameArtifacts || !gameId) {
      setFinishedGameArtifacts(null);
      setFinishedGameArtifactsLoading(false);
      setFinishedGameArtifactsError(null);
      setFinishedAnalysisSummary(null);
      setFinishedAnalysisSummaryLoading(false);
      setFinishedAnalysisSummaryError(null);
      return;
    }
    let cancelled = false;
    setFinishedGameArtifactsLoading(true);
    setFinishedGameArtifactsError(null);
    setFinishedAnalysisSummaryLoading(true);
    setFinishedAnalysisSummaryError(null);
    void Promise.all([
      fetchLatestFinishedGameAnalysisArtifacts(supabase, gameId),
      fetchFinishedGameAnalysisJobSummary(supabase, gameId),
    ]).then(([artifactsRes, summaryRes]) => {
      if (cancelled) return;
      setFinishedGameArtifactsLoading(false);
      setFinishedAnalysisSummaryLoading(false);

      if (artifactsRes.error) {
        setFinishedGameArtifactsError(artifactsRes.error.message);
        setFinishedGameArtifacts([]);
      } else {
        setFinishedGameArtifacts(artifactsRes.data);
      }

      if (summaryRes.error) {
        setFinishedAnalysisSummaryError(summaryRes.error.message);
        setFinishedAnalysisSummary(null);
      } else if (summaryRes.data?.error === 'forbidden') {
        setFinishedAnalysisSummaryError('Analysis status is not available for this viewer.');
        setFinishedAnalysisSummary(null);
      } else {
        setFinishedAnalysisSummary(summaryRes.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canLoadFinishedGameArtifacts, gameId]);

  const latestFinishedArtifact = finishedGameArtifacts?.[0] ?? null;
  const finishedLifecycleState = analysisLifecycleFromSummary(finishedAnalysisSummary);
  const finishedAnalysisStatusCopy = (() => {
    if (finishedAnalysisSummaryLoading || finishedGameArtifactsLoading) {
      return { tone: '#94a3b8', title: 'Loading analysis status…', detail: 'Checking queue + artifact records.' };
    }
    if (finishedAnalysisSummaryError || finishedGameArtifactsError) {
      return {
        tone: '#fca5a5',
        title: 'Status unavailable',
        detail:
          finishedAnalysisSummaryError ??
          finishedGameArtifactsError ??
          'Could not load analysis status right now. You can reload and try again.',
      };
    }
    if (finishedLifecycleState === 'not_queued') {
      return {
        tone: '#cbd5e1',
        title: 'Not queued yet',
        detail: 'Analysis has not entered the queue yet. It will appear after the finished-game enqueue trigger runs.',
      };
    }
    if (finishedLifecycleState === 'queued') {
      return {
        tone: '#fde68a',
        title: 'Queued',
        detail: 'Analysis has started and is waiting for the processor.',
      };
    }
    if (finishedLifecycleState === 'running') {
      return {
        tone: '#93c5fd',
        title: 'Running',
        detail: 'Analysis is being processed now. Refresh shortly for updates.',
      };
    }
    if (finishedLifecycleState === 'failed') {
      return {
        tone: '#fca5a5',
        title: 'Failed',
        detail:
          finishedAnalysisSummary?.job?.error_message?.trim() ||
          'Processing failed. A retry/re-enqueue is required to produce a placeholder artifact.',
      };
    }
    if (finishedLifecycleState === 'no_finished_intake') {
      return {
        tone: '#fca5a5',
        title: 'Unavailable (no finished intake)',
        detail: 'Queue record exists, but canonical finished intake is unavailable for this game.',
      };
    }
    if (latestFinishedArtifact) {
      return {
        tone: '#86efac',
        title: 'Completed (placeholder artifact available)',
        detail: 'Foundation artifact is ready. This is not full engine analysis output.',
      };
    }
    return {
      tone: '#cbd5e1',
      title: 'Completed (artifact pending)',
      detail: 'Job completed but no artifact is visible yet. Refresh shortly.',
    };
  })();

  const loadMoveLogs = useCallback(async () => {
    if (!gameId) return;
    const readOnlyPublic = publicSpectate || !userId;
    if (readOnlyPublic && (!game || !isGameRecordFinished(game))) return;
    const { data } = await supabase
      .from('game_move_logs')
      .select('san, fen_before, fen_after, created_at, from_sq, to_sq')
      .eq('game_id', gameId)
      .order('created_at', { ascending: true });
    setMoveLogs((data ?? []) as MoveLogRow[]);
  }, [gameId, publicSpectate, userId, game, setMoveLogs]);

  const loadGameSnapshot = useCallback(
    async (authUid?: string | null) => {
      if (!gameId) return;
      const uid = authUid !== undefined ? authUid : userId;
      const usePublicRpc = shouldUsePublicSpectateRpc({ publicSpectateUrlFlag: publicSpectate, userId: uid });

      if (usePublicRpc) {
        const { data, error } = await supabase.rpc('get_public_spectate_game_snapshot', {
          p_game_id: gameId,
          p_viewer_ecosystem: viewerEcosystem,
        });
        if (error) {
          setMessage(`Spectate unavailable: ${error.message}`);
          setGame(null);
          setMoveLogs([]);
          setGameAccess('spectate_unavailable');
          return;
        }
        if (!data || typeof data !== 'object') {
          if (!uid) {
            const { data: hint, error: hintErr } = await supabase.rpc('game_public_route_hint', {
              p_game_id: gameId,
              p_viewer_ecosystem: viewerEcosystem,
            });
            if (hintErr) {
              setMessage(hintErr.message);
              setGameAccess('spectate_unavailable');
            } else {
              setGameAccess(accessFromPublicHint(hint as string));
            }
          } else {
            setMessage(
              'This game is not available for public viewing (wrong track, not found, or not spectatable yet).'
            );
            setGameAccess('spectate_unavailable');
          }
          setGame(null);
          setMoveLogs([]);
          return;
        }
        const snap = data as Record<string, unknown>;
        const gamePayload = snap.game as GameRow | undefined;
        if (!gamePayload) {
          setMessage('Spectate payload incomplete.');
          setGame(null);
          setMoveLogs([]);
          setGameAccess('spectate_unavailable');
          return;
        }
        setGame(gamePayload);
        setMoveLogs((Array.isArray(snap.move_logs) ? snap.move_logs : []) as MoveLogRow[]);
        const labels = snap.spectate_labels as { white?: string; black?: string } | undefined;
        if (labels && typeof labels === 'object') {
          setDisplayNameById((prev) => {
            const next = { ...prev };
            if (labels.white && gamePayload.white_player_id) next[gamePayload.white_player_id] = labels.white;
            if (labels.black && gamePayload.black_player_id) next[gamePayload.black_player_id] = labels.black;
            return next;
          });
        }
        setGameAccess('ok');
        return;
      }

      const { data, error } = await supabase.from('games').select('*').eq('id', gameId).single();
      if (error) {
        setMessage(error.message);
        setGame(null);
        setMoveLogs([]);
        if (error.code === 'PGRST116') {
          setGameAccess('not_found');
        } else {
          setGameAccess('spectate_unavailable');
        }
        return;
      }
      setGame(data as GameRow);
      setGameAccess('ok');
    },
    [gameId, publicSpectate, userId, viewerEcosystem, setMoveLogs]
  );

  useEffect(() => {
    const loadGame = async () => {
      if (!gameId) {
        setLoading(false);
        setGame(null);
        setGameAccess('not_found');
        return;
      }

      setLoading(true);
      setMessage('');
      setGame(null);
      setGameAccess('loading');

      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id ?? '';
      setUserId(uid);

      try {
        await loadGameSnapshot(uid);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load game';
        setMessage(msg);
        setGame(null);
        setGameAccess('spectate_unavailable');
      } finally {
        setLoading(false);
      }
    };

    void loadGame();
  }, [gameId, loadGameSnapshot]);

  useEffect(() => {
    if (!userId) {
      setChatAccessToken(null);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setChatAccessToken(data.session?.access_token ?? null);
    });
  }, [userId]);

  useEffect(() => {
    if (publicSpectate || !userId) return;
    void loadMoveLogs();
  }, [loadMoveLogs, publicSpectate, userId]);

  useEffect(() => {
    if (!gameId) return;
    if (publicSpectate || !userId) return;

    const channel = supabase
      .channel(`game-${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        () => {
          void loadGameSnapshot();
          void loadMoveLogs();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_move_logs', filter: `game_id=eq.${gameId}` },
        () => {
          void loadGameSnapshot();
          void loadMoveLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, loadGameSnapshot, loadMoveLogs, publicSpectate, userId]);

  /** Tab focus / visibility: reconcile if realtime missed a frame or user was backgrounded. */
  useEffect(() => {
    if (!gameId) return;
    if (publicSpectate || !userId) return;
    const refresh = () => {
      void loadGameSnapshot();
      void loadMoveLogs();
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [gameId, loadGameSnapshot, loadMoveLogs, publicSpectate, userId]);

  /**
   * Live / daily: soft polling while in live mode so turn + clocks match even if
   * postgres_changes for `games` is not enabled in the Supabase project yet.
   *
   * E2E / gameplay tests assume ~2000ms polling for convergence — do not reduce without updating those tests.
   */
  useEffect(() => {
    if (!gameId || loading || replayStep !== null) return;
    if (!game) return;
    if (publicSpectate || !userId) return;
    if (game.status !== 'active' && game.status !== 'waiting') return;
    const tempo = normalizeGameTempo(game.tempo);
    if (tempo !== 'live' && tempo !== 'daily') return;

    const t = window.setInterval(() => {
      void loadGameSnapshot();
      void loadMoveLogs();
    }, 2000);
    return () => window.clearInterval(t);
  }, [
    gameId,
    loading,
    replayStep,
    game?.id,
    game?.status,
    game?.tempo,
    loadGameSnapshot,
    loadMoveLogs,
    publicSpectate,
    userId,
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setClockNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const scheduleLiveTimeoutFinish = useCallback(
    async (g: GameRow, flaggedLoser: 'white' | 'black') => {
      if (liveTimeoutInFlightRef.current) return;
      liveTimeoutInFlightRef.current = true;

      const result = flaggedLoser === 'white' ? 'black_win' : 'white_win';

      const { data, error } = await supabase.rpc('finish_game', {
        p_game_id: g.id,
        p_result: result,
        p_end_reason: 'timeout',
      });

      if (error) {
        liveTimeoutInFlightRef.current = false;
        return;
      }
      setGame(data as GameRow);
      void loadMoveLogs();
      window.setTimeout(() => {
        void loadGameSnapshot();
        void loadMoveLogs();
      }, 200);
      window.setTimeout(() => {
        void loadGameSnapshot();
        void loadMoveLogs();
      }, 900);
    },
    [loadGameSnapshot, loadMoveLogs]
  );

  useEffect(() => {
    if (!game || game.status !== 'active') return;
    if (!bothPlayersSeated(game)) return;
    const tempo = normalizeGameTempo(game.tempo);
    if (tempo !== 'live' && tempo !== 'daily') return;

    const check = () => {
      const state = liveDailyClockTimeoutState(game, Date.now());
      if (state.applies && state.flaggedLoser) {
        void scheduleLiveTimeoutFinish(game, state.flaggedLoser);
      }
    };

    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [game, scheduleLiveTimeoutFinish]);

  const handleResign = async () => {
    if (!game || !myColor || resigning) return;
    setResigning(true);
    setMessage('');
    const result = myColor === 'white' ? 'black_win' : 'white_win';
    const { data, error } = await supabase.rpc('finish_game', {
      p_game_id: game.id,
      p_result: result,
      p_end_reason: 'resign',
    });
    setResigning(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setGame(data as GameRow);
    void loadMoveLogs();
    window.setTimeout(() => {
      void loadGameSnapshot();
      void loadMoveLogs();
    }, 200);
    window.setTimeout(() => {
      void loadGameSnapshot();
      void loadMoveLogs();
    }, 900);
  };

  /** Open-seat creator exits before Black joins — same RPC as resign (white vacates). */
  const handleAbandonOpenSeat = async () => {
    if (!game || !userId || resigning) return;
    if (game.white_player_id !== userId || bothPlayersSeated(game)) return;
    if (game.status !== 'active' && game.status !== 'waiting') return;
    setResigning(true);
    setMessage('');
    const { data, error } = await supabase.rpc('finish_game', {
      p_game_id: game.id,
      p_result: 'black_win',
      p_end_reason: 'resign',
    });
    setResigning(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setGame(data as GameRow);
    void loadMoveLogs();
    window.setTimeout(() => {
      void loadGameSnapshot();
      void loadMoveLogs();
    }, 200);
    window.setTimeout(() => {
      void loadGameSnapshot();
      void loadMoveLogs();
    }, 900);
  };

  const handleOfferDraw = async () => {
    if (!game || !myColor || drawBusy) return;
    setDrawBusy(true);
    setMessage('');
    const { data, error } = await supabase
      .from('games')
      .update({
        draw_offered_by: userId,
        draw_offered_at: new Date().toISOString(),
      })
      .eq('id', game.id)
      .select('*')
      .single();
    setDrawBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setGame(data as GameRow);
  };

  const handleAcceptDraw = async () => {
    if (!game || !myColor || drawBusy) return;
    if (!game.draw_offered_by || game.draw_offered_by === userId) return;

    setDrawBusy(true);
    setMessage('');
    const { data, error } = await supabase.rpc('finish_game', {
      p_game_id: game.id,
      p_result: 'draw',
      p_end_reason: 'draw_agreement',
    });
    setDrawBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setGame(data as GameRow);
  };

  const handleDeclineDraw = async () => {
    if (!game || !myColor || drawBusy) return;
    if (!game.draw_offered_by || game.draw_offered_by === userId) return;

    setDrawBusy(true);
    setMessage('');
    const { data, error } = await supabase
      .from('games')
      .update({
        draw_offered_by: null,
        draw_offered_at: null,
      })
      .eq('id', game.id)
      .select('*')
      .single();
    setDrawBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setGame(data as GameRow);
  };

  const handleSendRematchRequest = async () => {
    if (
      !game ||
      game.status !== 'finished' ||
      !game.black_player_id ||
      !userId ||
      rematchRequestBusy
    ) {
      return;
    }
    if (userId !== game.white_player_id && userId !== game.black_player_id) {
      return;
    }
    const toUserId =
      userId === game.white_player_id ? game.black_player_id : game.white_player_id;

    setRematchRequestBusy(true);
    setMessage('');
    setRematchSentBanner(false);
    setPendingRematchRequestId(null);
    try {
      const rematchTempo = normalizeGameTempo(game.tempo);
      const rawRematchLtc = game.live_time_control ?? null;
      const rematchLtc =
        canonicalLiveTimeControlForInsert(rematchTempo, rawRematchLtc) ?? rawRematchLtc;
      const { data: inserted, error } = await supabase
        .from('match_requests')
        .insert({
          from_user_id: userId,
          to_user_id: toUserId,
          request_type: 'rematch',
          source_game_id: game.id,
          white_player_id: game.white_player_id,
          black_player_id: game.black_player_id,
          status: 'pending',
          visibility: 'direct',
          tempo: rematchTempo,
          live_time_control: rematchLtc,
          rated: game.rated === true,
        })
        .select('id')
        .single();

      if (error) {
        setMessage(userMessageForMatchRequestInsertError(error));
        return;
      }
      if (!inserted?.id) {
        setMessage('Could not confirm rematch request was saved.');
        return;
      }
      setRematchSentBanner(true);
      setPendingRematchRequestId(inserted.id);
    } finally {
      setRematchRequestBusy(false);
    }
  };

  const persistMove = async (
    sourceSquare: string,
    targetSquare: string,
    move: { san: string; promotion?: string },
    nextFen: string,
    nextTurn: string,
    fenBefore: string,
    statusBefore: string
  ) => {
    const toRun = liveDailyClockTimeoutState(game!, Date.now());
    if (toRun.applies && toRun.flaggedLoser) {
      setSavingMove(false);
      scheduleLiveTimeoutFinish(game!, toRun.flaggedLoser);
      chessRef.current?.undo();
      setLiveChessVersion((v) => v + 1);
      setSelectedSquare(null);
      return;
    }

    setSavingMove(true);
    setMessage('');
    const startedAt = Date.now();

    const tempo = normalizeGameTempo(game!.tempo);
    const gameOver = gameOverFieldsAfterMove(nextFen, game!);
    const moveDurationMs = Date.now() - startedAt;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      chessRef.current?.undo();
      setLiveChessVersion((v) => v + 1);
      setSavingMove(false);
      setSelectedSquare(null);
      setMessage('Sign in again to submit moves.');
      return;
    }
    const moveSubmitRes = await fetch('/api/game/submit-move', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        gameId: game!.id,
        fenBefore,
        nextFen,
        nextTurn,
        statusBefore,
        tempo: game!.tempo,
        liveTimeControl: game!.live_time_control,
        currentTurn: game!.turn,
        whiteClockMs: game!.white_clock_ms,
        blackClockMs: game!.black_clock_ms,
        lastMoveAt: game!.last_move_at,
        move: {
          san: move.san,
          from_sq: sourceSquare,
          to_sq: targetSquare,
          promotion: move.promotion ?? null,
          move_duration_ms: moveDurationMs,
        },
        gameOver,
      }),
    });
    const moveSubmitPayload = (await moveSubmitRes.json().catch(() => ({}))) as {
      row?: GameRow;
      error?: string;
    };
    if (!moveSubmitRes.ok || !moveSubmitPayload.row) {
      chessRef.current?.undo();
      setLiveChessVersion((v) => v + 1);
      setSavingMove(false);
      setSelectedSquare(null);
      setMessage(moveSubmitPayload.error || 'Move submit failed.');
      return;
    }
    const finalRow = moveSubmitPayload.row;
    setGame(finalRow);

    setReplayStep(null);
    setSavingMove(false);
    // E2E: immediate + 200ms + 900ms reconciliation (keep in sync with resign / terminal handlers).
    void loadMoveLogs();
    window.setTimeout(() => {
      void loadGameSnapshot();
      void loadMoveLogs();
    }, 200);
    window.setTimeout(() => {
      void loadGameSnapshot();
      void loadMoveLogs();
    }, 900);
  };

  const applyPlayerMove = (
    sourceSquare: string,
    targetSquare: string,
    promotion?: PromotionPiece
  ): boolean => {
    const board = chessRef.current;
    if (!board || !game) return false;
    if (!canPlayMoves(game)) {
      setMessage('Game is not ready to play (need two players and active/waiting status)');
      return false;
    }

    const ts = liveDailyClockTimeoutState(game, Date.now());
    if (ts.applies && ts.flaggedLoser) {
      scheduleLiveTimeoutFinish(game, ts.flaggedLoser);
      return false;
    }

    let move: { san: string } | null = null;
    try {
      const opts: { from: string; to: string; promotion?: string } = {
        from: sourceSquare,
        to: targetSquare,
      };
      if (promotion) opts.promotion = promotion;
      move = board.move(opts);
    } catch {
      setMessage('Illegal move');
      return false;
    }
    if (!move) {
      setMessage('Illegal move');
      return false;
    }

    setSelectedSquare(null);

    const nextFen = board.fen();
    const nextTurn = board.turn() === 'w' ? 'white' : 'black';
    const fenBefore = game.fen;
    const statusBefore = game.status;

    setLiveChessVersion((v) => v + 1);

    void persistMove(
      sourceSquare,
      targetSquare,
      move,
      nextFen,
      nextTurn,
      fenBefore,
      statusBefore
    );
    return true;
  };

  const completePromotion = (piece: PromotionPiece) => {
    const pending = promotionPending;
    if (!pending) return;
    const board = chessRef.current;
    if (
      replayStep !== null ||
      !game ||
      savingMove ||
      !myColor ||
      game.status === 'finished' ||
      !board
    ) {
      setPromotionPending(null);
      setSelectedSquare(null);
      return;
    }
    if (!canPlayMoves(game)) {
      setPromotionPending(null);
      setSelectedSquare(null);
      return;
    }
    const turnColor = board.turn() === 'w' ? 'white' : 'black';
    if (turnColor !== myColor) {
      setPromotionPending(null);
      setSelectedSquare(null);
      return;
    }
    if (!isPawnPromotionMove(board, pending.from, pending.to)) {
      setPromotionPending(null);
      setSelectedSquare(null);
      return;
    }

    setPromotionPending(null);
    applyPlayerMove(pending.from, pending.to, piece);
  };

  const onPieceDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => {
    if (isPublicViewer) {
      return false;
    }
    if (replayStep !== null) {
      return false;
    }
    if (!targetSquare) {
      return false;
    }
    if (!game || savingMove) {
      return false;
    }
    if (!myColor) {
      return false;
    }
    if (game.status === 'finished') {
      return false;
    }
    if (!canPlayMoves(game)) {
      setMessage('Game is not ready to play (need two players and active/waiting status)');
      return false;
    }

    const board = chessRef.current;
    if (!board) {
      return false;
    }

    const turnColor = board.turn() === 'w' ? 'white' : 'black';
    if (turnColor !== myColor) {
      setMessage(`It is ${turnColor}'s turn`);
      return false;
    }

    if (isPawnPromotionMove(board, sourceSquare, targetSquare)) {
      setSelectedSquare(null);
      setPromotionPending({ from: sourceSquare, to: targetSquare });
      return false;
    }

    return applyPlayerMove(sourceSquare, targetSquare);
  };

  const isEngineProhibited = game?.mode === 'PIT' && game?.status === 'active';

  const wantEngineAnalysis =
    !isEngineProhibited && (NEXT_PUBLIC_ENGINE_ANALYSIS_ENABLED || (IS_DEV_BUILD && devEngineAnalysisEnabled));

  useEffect(() => {
    if (
      isPublicViewer ||
      isEngineProhibited ||
      !showAnalysisPanel ||
      game?.status !== 'finished' ||
      moveLogs.length === 0
    ) {
      setEngineAnalysisRows(null);
      setEngineAnalysisBusy(false);
      return;
    }

    let cancelled = false;
    const mode: IntelligenceMode = wantEngineAnalysis ? 'analyst' : 'explainer';
    setEngineAnalysisBusy(true);

    void supabase.auth
      .getSession()
      .then((sessionRes) => sessionRes.data.session?.access_token ?? null)
      .then(async (accessToken) => {
        const res = await fetch('/api/protected/analysis', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            fen: START_FEN,
            mode,
            gameId: game?.id ?? null,
            overlap: {
              activeGameFen: game?.fen,
              requestMoves: moveLogs.map((m) => m.san),
            },
          }),
        });
        const payload = (await res.json()) as {
          error?: string;
          truth?: { rows?: AnalyzedMove[] };
          refusal?: { reason?: string };
        };
        if (!res.ok) {
          const err = new Error(payload.error ?? payload.refusal?.reason ?? 'analysis_request_failed');
          throw err;
        }
        return payload.truth?.rows ?? [];
      })
      .then((rows) => {
        if (cancelled) return;
        const ok =
          rows.length > 0 &&
          rows.length === moveLogs.length &&
          rows.every((r) => (wantEngineAnalysis ? r.analyzerType === 'engine' : true));
        if (ok) {
          setEngineAnalysisRows(rows);
        } else {
          setEngineAnalysisRows(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setEngineAnalysisRows(null);
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('INVALID_FEN')) setMessage('Analysis unavailable: invalid board state.');
        else if (msg.includes('ENGINE_TIMEOUT')) setMessage('Analysis timed out. Try again shortly.');
        else if (msg.includes('INTEGRITY_BLOCKED')) setMessage('Analysis blocked by integrity controls.');
        else if (msg.toLowerCase().includes('unauthorized')) setMessage('Sign in to run protected analysis.');
        else setMessage('Analysis unavailable right now.');
      })
      .finally(() => {
        if (!cancelled) setEngineAnalysisBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isPublicViewer,
    isEngineProhibited,
    showAnalysisPanel,
    game?.status,
    game?.id,
    game?.fen,
    moveLogs,
    wantEngineAnalysis,
  ]);

  const effectiveAnalysis = useMemo(() => {
    if (!engineAnalysisRows?.length) return null;
    return engineAnalysisRows;
  }, [engineAnalysisRows]);

  const analysisUsedEngine = effectiveAnalysis?.[0]?.analyzerType === 'engine';

  const analysisPairedRows = useMemo(() => {
    if (!effectiveAnalysis?.length) return [];
    return buildPairedAnalysisRows(effectiveAnalysis);
  }, [effectiveAnalysis]);

  if (loading) {
    return (
      <div
        style={{
          padding: 24,
          color: '#888',
          background: 'black',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        Loading game...
      </div>
    );
  }

  if (!loading && !game) {
    if (gameAccess === 'not_found') {
      return (
        <div
          data-testid="game-route-not-found"
          style={{
            padding: 24,
            color: '#888',
            background: 'black',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p style={{ fontSize: 18, marginBottom: 16 }}>Game not found</p>
          <button
            type="button"
            onClick={() => router.push('/')}
            style={{ padding: '8px 16px' }}
          >
            Back to lobby
          </button>
        </div>
      );
    }
    if (gameAccess === 'sign_in_required') {
      const loginHref = buildGameLoginRedirect(gameId);
      return (
        <div
          data-testid="game-route-sign-in-required"
          style={{
            padding: 24,
            color: '#e2e8f0',
            background: 'black',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            maxWidth: 480,
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 18, margin: 0 }}>Sign in required</p>
          <p style={{ fontSize: 14, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
            This game is not available for anonymous viewing. Sign in if you have access to this board.
          </p>
          <Link
            href={loginHref}
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              background: '#2563eb',
              color: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Sign in to view
          </Link>
          <button
            type="button"
            onClick={() => router.push('/')}
            style={{ padding: '8px 16px', background: 'transparent', color: '#888', border: '1px solid #444' }}
          >
            Back to lobby
          </button>
        </div>
      );
    }
    if (gameAccess === 'ecosystem_mismatch') {
      return (
        <div
          data-testid="game-route-ecosystem-mismatch"
          style={{
            padding: 24,
            color: '#e2e8f0',
            background: 'black',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            maxWidth: 480,
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 18, margin: 0 }}>Different ecosystem</p>
          <p style={{ fontSize: 14, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
            This game is on another track (for example K–12 vs adult). Open the link from the matching Nexus or add{' '}
            <code style={{ color: '#cbd5e1' }}>?eco=k12</code> or <code style={{ color: '#cbd5e1' }}>?eco=adult</code> as
            appropriate.
          </p>
          <button
            type="button"
            onClick={() => router.push('/')}
            style={{ padding: '8px 16px' }}
          >
            Back to lobby
          </button>
        </div>
      );
    }
    return (
      <div
        data-testid="game-route-unavailable"
        style={{
          padding: 24,
          color: '#888',
          background: 'black',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ fontSize: 18, marginBottom: 16 }}>{message || 'Unable to load this game.'}</p>
        <button
          type="button"
          onClick={() => router.push('/')}
          style={{ padding: '8px 16px' }}
        >
          Back to lobby
        </button>
      </div>
    );
  }

  if (!game) {
    return null;
  }

  const canPlayMoves = (g: GameRow) =>
    !isGameRecordFinished(g) && bothPlayersSeated(g) && (g.status === 'active' || g.status === 'waiting');

  const finishedRatingClass = game.status === 'finished' ? classifyGameForRating(game) : null;

  const showAbandonOpenSeat =
    !isSpectator &&
    !!userId &&
    userId === game.white_player_id &&
    !bothPlayersSeated(game) &&
    (game.status === 'active' || game.status === 'waiting');

  const showPlayerActions = !isSpectator && !!userId && canPlayMoves(game);
  const canOfferDraw =
    showPlayerActions &&
    !game.draw_offered_by &&
    canPlayMoves(game);
  const opponentOfferedDraw =
    showPlayerActions &&
    game.draw_offered_by &&
    game.draw_offered_by !== userId;
  const youOfferedDraw =
    showPlayerActions &&
    game.draw_offered_by === userId;

  const isMyTurn =
    bothPlayersSeated(game) &&
    (game.status === 'active' || game.status === 'waiting') &&
    ((game.turn === 'white' && userId === game.white_player_id) ||
      (game.turn === 'black' && userId === game.black_player_id));
  const boardInputEnabled =
    replayStep === null &&
    !savingMove &&
    !promotionPending &&
    !!game &&
    canPlayMoves(game) &&
    !isSpectator &&
    isMyTurn;

  const finishedPgnBlocked =
    !isPgnExportLimitBypassed() &&
    game.status === 'finished' &&
    pgnExportCount >= PGN_EXPORT_FREE_LIMIT;

  const modeBannerText = gameModeBannerLabel({
    sourceType: game.source_type,
    tempo: game.tempo,
    liveTimeControl: game.live_time_control,
    rated: game.rated,
  });
  const drawOfferedByLabel = game.draw_offered_by
    ? displayNameById[game.draw_offered_by] ?? game.draw_offered_by
    : null;
  const tempoNorm = normalizeGameTempo(game.tempo);
  const showLiveClocks =
    (tempoNorm === 'live' || tempoNorm === 'daily') &&
    bothPlayersSeated(game) &&
    game.status !== 'finished';
  const showCorrespondenceClocks = isCorrespondenceDeadlineActive(game);
  const showAnyClocks = showLiveClocks || showCorrespondenceClocks;
  const liveDailyTicking = isLiveDailyClockTicking(game);
  const liveClockBaseMs = clockBudgetMsForGame(game.tempo, game.live_time_control);
  const correspondenceBaseMs = correspondenceMoveDeadlineMs(game.live_time_control);
  const whiteStoredNow = Number.isFinite(game.white_clock_ms)
    ? Number(game.white_clock_ms)
    : liveClockBaseMs;
  const blackStoredNow = Number.isFinite(game.black_clock_ms)
    ? Number(game.black_clock_ms)
    : liveClockBaseMs;
  const elapsedSinceLastMoveMs = game.last_move_at
    ? Math.max(0, clockNowMs - new Date(game.last_move_at).getTime())
    : 0;
  const correspondenceRemainingMs = game.move_deadline_at
    ? Math.max(0, new Date(game.move_deadline_at).getTime() - clockNowMs)
    : correspondenceBaseMs;
  const whiteClockMs = showCorrespondenceClocks
    ? game.turn === 'white'
      ? correspondenceRemainingMs
      : correspondenceBaseMs
    : game.turn === 'white'
      ? Math.max(0, whiteStoredNow - elapsedSinceLastMoveMs)
      : whiteStoredNow;
  const blackClockMs = showCorrespondenceClocks
    ? game.turn === 'black'
      ? correspondenceRemainingMs
      : correspondenceBaseMs
    : game.turn === 'black'
      ? Math.max(0, blackStoredNow - elapsedSinceLastMoveMs)
      : blackStoredNow;
  const clockTurn = displayClockTurn(game.turn);
  const correspondencePaceLabel = correspondencePaceCompactLabel(game.live_time_control);

  void liveChessVersion;
  const boardPositionRaw = replayBoardPosition ?? (chessRef.current?.fen() ?? START_FEN);
  const boardPosition = normalizeFenForReactChessboard(boardPositionRaw);
  const boardOrientation = myColor === 'black' ? 'black' : 'white';

  const maxReplayStep = moveLogs.length;

  return (
    <div style={{ padding: 24, color: 'white', background: 'black', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: 6 }}>Game Board</h1>
      <p
        role="status"
        aria-label={`Game mode: ${game.mode} - ${modeBannerText}`}
        style={{
          margin: '0 0 16px 0',
          textAlign: 'center',
          fontSize: 'clamp(16px, 2.8vw, 22px)',
          fontWeight: 700,
          lineHeight: 1.3,
          letterSpacing: '0.04em',
          color: '#f0e8dc',
          textTransform: 'uppercase',
          textShadow: '0 1px 2px rgba(0,0,0,0.65)',
        }}
      >
        <span style={{ color: '#fff', borderRight: '1px solid #444', paddingRight: 12, marginRight: 12 }}>
          {game.mode}
        </span>
        {modeBannerText}
      </p>
      {showAnyClocks && (
        <DigitalChessClock
          whiteMs={whiteClockMs}
          blackMs={blackClockMs}
          activeTurn={
            showCorrespondenceClocks ? clockTurn : liveDailyTicking ? clockTurn : null
          }
          isCorrespondence={showCorrespondenceClocks}
          paceLabel={correspondencePaceLabel}
        />
      )}
      <p
        style={{
          margin: showAnyClocks ? '10px 0 4px 0' : '0 0 4px 0',
          fontSize: 13,
          color: '#9e9e9e',
        }}
      >
        <strong style={{ color: '#bdbdbd' }}>Tempo:</strong>{' '}
        {gameDisplayTempoLabel({
          tempo: game.tempo,
          liveTimeControl: game.live_time_control,
        })}
        <span style={{ color: '#666', marginLeft: 8 }}>
          {tempoNorm === 'live' || tempoNorm === 'daily'
            ? liveDailyTicking
              ? '(game clock running)'
              : '(clocks start after first move)'
            : '(per-move deadline)'}
        </span>
      </p>
      {game.source_type === 'random_match' && (
        <p style={{ margin: '0 0 4px 0', fontSize: 12, color: '#7d8792' }}>
          <strong style={{ color: '#9aa4af' }}>Random queue:</strong>{' '}
          {gameDisplayTempoLabel({
            tempo: game.tempo,
            liveTimeControl: game.live_time_control,
          })}
        </p>
      )}
      <p style={{ margin: '0 0 12px 0', fontSize: 12, color: '#777', lineHeight: 1.45 }}>
        {gameTimingRuleSummaryLine(normalizeGameTempo(game.tempo))}
      </p>
      {showCorrespondenceClocks &&
        game.move_deadline_at &&
        normalizeGameTempo(game.tempo) === 'correspondence' && (
          <p
            data-testid="correspondence-deadline"
            style={{ margin: '0 0 12px 0', fontSize: 11, color: '#666', lineHeight: 1.35 }}
          >
            Move due: {formatMoveDeadlineLocal(game.move_deadline_at)}
          </p>
        )}
      <DisplayNameLoadNotice visible={showDisplayNameLoadNotice} />

      {isPublicViewer ? (
        <p
          data-testid="spectate-signup-cta"
          style={{
            margin: '0 0 12px 0',
            padding: '10px 12px',
            maxWidth: 560,
            fontSize: 13,
            lineHeight: 1.45,
            color: '#cbd5e1',
            border: '1px solid #334155',
            borderRadius: 8,
            background: '#0f172a',
          }}
        >
          <strong style={{ color: '#e2e8f0' }}>Spectate mode</strong> — create an account to play rated games and track
          progress. <strong style={{ color: '#e2e8f0' }}>Play your first game</strong> after signup — no advantage sold,
          same rules for everyone. Use <strong style={{ color: '#e2e8f0' }}>Sign Up</strong> or{' '}
          <strong style={{ color: '#e2e8f0' }}>Log In</strong> in the top navigation bar.
        </p>
      ) : null}

      {isSpectator && !isPublicViewer && (
        <p style={{ marginBottom: 8 }} data-testid="game-logged-in-spectator-label">
          <strong>Spectating</strong>
        </p>
      )}

      <p data-testid="game-row-id">
        <strong>Game ID:</strong>{' '}
        {isPublicViewer ? (
          <span data-testid="game-row-id-public">{`${game.id.slice(0, 8)}…`}</span>
        ) : (
          game.id
        )}
      </p>
      <p data-testid="game-row-status">
        <strong>Status:</strong> {game.status}
      </p>
      <div
        data-testid="game-startup-snapshot"
        data-fen={game.fen}
        data-turn={game.status === 'finished' ? '' : game.turn}
        data-last-move-at={game.last_move_at ?? ''}
        data-move-deadline-at={game.move_deadline_at ?? ''}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          pointerEvents: 'none',
        }}
        aria-hidden
      />
      <p>
        <strong>White:</strong> {displayNameById[game.white_player_id] ?? game.white_player_id}
      </p>
      <p>
        <strong>Black:</strong>{' '}
        {game.black_player_id
          ? displayNameById[game.black_player_id] ?? game.black_player_id
          : '-'}
      </p>
      <p><strong>You are:</strong> {myColor ?? 'spectator'}</p>
      {game.status !== 'finished' && (
        <p>
          <strong>Turn:</strong>{' '}
          {chessRef.current
            ? chessRef.current.turn() === 'w'
              ? 'white'
              : 'black'
            : game.turn}
        </p>
      )}

      {game.status === 'finished' && (
        <>
          {isPublicViewer ? (
            <p
              data-testid="game-public-replay-banner"
              style={{
                margin: '0 0 12px 0',
                padding: '10px 12px',
                maxWidth: 560,
                fontSize: 13,
                lineHeight: 1.45,
                color: '#cbd5e1',
                border: '1px solid #334155',
                borderRadius: 8,
                background: '#0f172a',
              }}
            >
              <strong style={{ color: '#e2e8f0' }}>Public replay</strong> — read-only viewing of a finished
              game record. No interactive actions are available in public mode.
            </p>
          ) : null}
          {!isPublicViewer ? (
          <p
            data-testid="game-record-readonly"
            style={{
              margin: '0 0 12px 0',
              padding: '10px 12px',
              maxWidth: 560,
              fontSize: 13,
              lineHeight: 1.45,
              color: '#cbd5e1',
            }}
          >
            <strong style={{ color: '#e2e8f0' }}>Completed game</strong> — this board is a read-only
            record. Dragging is disabled; use <strong>Replay</strong> below to step through the moves (
            <strong>Final position</strong> returns to the end of the game).
          </p>
          ) : null}
          <div
            style={{ marginBottom: 10 }}
          >
            {isPublicViewer ? (
              <p data-testid="game-public-back-link" style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
                Use <strong style={{ color: '#e2e8f0' }}>Home</strong> or <strong style={{ color: '#e2e8f0' }}>Back</strong> in the top bar to leave this replay.
              </p>
            ) : (
              <Link
                href="/finished"
                data-testid="game-finished-history-link"
                style={{ color: '#93c5fd', fontSize: 14, fontWeight: 600 }}
              >
                ← All finished games
              </Link>
            )}
          </div>
          <div
            data-testid="game-over-banner"
            role="status"
            style={{
              marginBottom: 16,
              marginTop: 4,
              padding: '14px 16px',
              maxWidth: 560,
              border: '1px solid #6b5420',
              borderRadius: 8,
              background: 'linear-gradient(180deg, #2a2210 0%, #1a1508 100%)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.45)',
            }}
          >
            <p
              style={{
                margin: '0 0 8px 0',
                fontSize: 13,
                letterSpacing: '0.12em',
                fontWeight: 600,
                color: '#c4a35a',
                textTransform: 'uppercase',
              }}
            >
              Game over
            </p>
            {game.finished_at ? (
              <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#a8a29e' }}>
                Finished {formatFinishedAtLocal(game.finished_at)}
              </p>
            ) : null}
            <p
              data-testid="finished-result-summary"
              data-result={game.result ?? ''}
              data-end-reason={game.end_reason ?? ''}
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                lineHeight: 1.35,
                color: '#f5e6c8',
              }}
            >
              {finishedGameResultBannerText(game)}
            </p>
          </div>
          {!isPublicViewer ? (
          <p
            data-testid="rating-classification-debug"
            data-rating-bucket={finishedRatingClass?.bucket ?? ''}
            data-rating-update-timing={finishedRatingClass?.updateTiming ?? ''}
            data-rating-skip-reason={finishedRatingClass?.skipReason ?? ''}
            data-rating-play-context={finishedRatingClass?.playContext ?? ''}
            data-rating-pace={game.tempo ?? ''}
            data-rating-white-eligible={finishedRatingClass ? String(finishedRatingClass.whiteEligible) : ''}
            data-rating-black-eligible={finishedRatingClass ? String(finishedRatingClass.blackEligible) : ''}
            style={{
              marginBottom: 16,
              maxWidth: 560,
              fontSize: 12,
              color: '#94a3b8',
              lineHeight: 1.45,
            }}
          >
            {finishedRatingClass ? ratingClassificationSummaryLine(finishedRatingClass) : null}
          </p>
          ) : null}
          {!isPublicViewer ? (
          <pre
            data-testid="rating-update-debug"
            style={{
              marginBottom: 16,
              maxWidth: 560,
              fontSize: 11,
              lineHeight: 1.4,
              color: '#cbd5e1',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: 12,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {game.rating_last_update != null
              ? JSON.stringify(game.rating_last_update, null, 2)
              : 'No rating snapshot on this row yet (unrated free, tournament game, skipped result, or refetch after finish). Trigger runs when status → finished; reload if migration just applied.'}
          </pre>
          ) : null}
          {canLoadFinishedGameArtifacts ? (
            <div
              data-testid="game-finished-analysis-stub"
              style={{
                marginBottom: 16,
                maxWidth: 560,
                padding: '12px 14px',
                border: '1px solid #334155',
                borderRadius: 8,
                background: '#0f172a',
              }}
            >
              <p
                style={{
                  margin: '0 0 6px 0',
                  fontSize: 12,
                  letterSpacing: '0.1em',
                  fontWeight: 600,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                }}
              >
                Post-game analysis
              </p>
              <p style={{ margin: '0 0 10px 0', fontSize: 13, lineHeight: 1.45, color: '#cbd5e1' }}>
                <strong style={{ color: '#e2e8f0' }}>Foundation record</strong> — server-side analysis pipeline
                only. This is not full engine output.
              </p>
              <div
                data-testid="game-finished-analysis-lifecycle"
                style={{
                  margin: '0 0 10px 0',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #334155',
                  background: '#111827',
                }}
              >
                <p style={{ margin: 0, fontSize: 13, color: finishedAnalysisStatusCopy.tone, fontWeight: 700 }}>
                  Status: {finishedAnalysisStatusCopy.title}
                </p>
                <p style={{ margin: '6px 0 0 0', fontSize: 12, color: '#cbd5e1', lineHeight: 1.45 }}>
                  {finishedAnalysisStatusCopy.detail}
                </p>
              </div>
              {finishedAnalysisSummary?.job ? (
                <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.45 }}>
                  Queue row: <strong style={{ color: '#cbd5e1' }}>{finishedAnalysisSummary.job.status}</strong>
                  {finishedAnalysisSummary.job.analysis_partition ? (
                    <>
                      {' '}
                      · partition <strong style={{ color: '#cbd5e1' }}>{finishedAnalysisSummary.job.analysis_partition}</strong>
                    </>
                  ) : null}
                  {finishedAnalysisSummary.job.move_count != null ? (
                    <>
                      {' '}
                      · moves <strong style={{ color: '#cbd5e1' }}>{finishedAnalysisSummary.job.move_count}</strong>
                    </>
                  ) : null}
                </p>
              ) : null}
              {!latestFinishedArtifact ? (
                <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }} data-testid="game-finished-analysis-empty">
                  No placeholder artifact is stored yet. Once queue processing completes, this section will show the
                  latest private artifact metadata.
                </p>
              ) : (
                (() => {
                  const meta = analysisArtifactStubMeta(latestFinishedArtifact);
                  return (
                    <div data-testid="game-finished-analysis-placeholder">
                      <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#86efac' }}>
                        Foundation placeholder artifact (latest) — non-engine result
                      </p>
                      <ul
                        style={{
                          margin: 0,
                          paddingLeft: 18,
                          fontSize: 13,
                          color: '#e2e8f0',
                          lineHeight: 1.5,
                        }}
                      >
                        <li>
                          <strong style={{ color: '#94a3b8' }}>Type:</strong> {meta.artifactType}
                        </li>
                        <li>
                          <strong style={{ color: '#94a3b8' }}>Artifact version:</strong> {meta.artifactVersion}
                        </li>
                        {meta.processorVersion ? (
                          <li>
                            <strong style={{ color: '#94a3b8' }}>Processor version:</strong>{' '}
                            {meta.processorVersion}
                          </li>
                        ) : null}
                        {meta.partition ? (
                          <li>
                            <strong style={{ color: '#94a3b8' }}>Analysis partition:</strong> {meta.partition}
                          </li>
                        ) : null}
                        {meta.moveCount != null ? (
                          <li>
                            <strong style={{ color: '#94a3b8' }}>Move count:</strong> {meta.moveCount}
                          </li>
                        ) : null}
                      </ul>
                      {meta.note ? (
                        <p style={{ margin: '10px 0 0 0', fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                          {meta.note}
                        </p>
                      ) : null}
                    </div>
                  );
                })()
              )}
            </div>
          ) : null}
        </>
      )}

      {showPlayerActions && game.status !== 'finished' && game.draw_offered_by && (
        <div
          data-testid="draw-offer-banner"
          role="status"
          aria-live="polite"
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            maxWidth: 560,
            borderRadius: 8,
            border: '1px solid #4a4a4a',
            background: '#151515',
            color: '#d4d4d4',
            lineHeight: 1.45,
          }}
        >
          {youOfferedDraw ? (
            <>
              <strong style={{ color: '#e5e5e5' }}>Draw offer sent.</strong> Waiting for opponent
              response.
            </>
          ) : (
            <>
              <strong style={{ color: '#f6d28b' }}>Draw offer received.</strong>{' '}
              {drawOfferedByLabel ? `${drawOfferedByLabel} offered a draw.` : 'Your opponent offered a draw.'}{' '}
              Use <strong>Accept Draw</strong> or <strong>Decline Draw</strong> below.
            </>
          )}
        </div>
      )}

      {message && <p>{message}</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => router.push('/')}
          style={{ padding: '8px 12px' }}
        >
          Back to lobby
        </button>
        {!isPublicViewer ? (
        <button
          type="button"
          data-testid="game-export-pgn"
          onClick={() => {
            if (
              !isPgnExportLimitBypassed() &&
              game.status === 'finished' &&
              readPgnExportCount() >= PGN_EXPORT_FREE_LIMIT
            ) {
              return;
            }
            const pgn = buildPgn(game, moveLogs, displayNameById);
            if (game.status === 'finished' && !isPgnExportLimitBypassed()) {
              const next = readPgnExportCount() + 1;
              localStorage.setItem(PGN_EXPORT_LS_KEY, String(next));
              setPgnExportCount(next);
            }
            downloadPgn(`game-${game.id.slice(0, 8)}.pgn`, pgn);
          }}
          disabled={finishedPgnBlocked}
          style={{ padding: '8px 12px' }}
        >
          Export PGN
        </button>
        ) : null}
        {!isPublicViewer && !isEngineProhibited && game.status === 'finished' && (
          <button
            type="button"
            onClick={() => setShowAnalysisPanel((open) => !open)}
            style={{ padding: '8px 12px' }}
          >
            {showAnalysisPanel ? 'Hide analysis' : 'Analyze Game'}
          </button>
        )}
        {!isPublicViewer && game.status === 'finished' && game.black_player_id && (
          <>
            <p
              style={{
                width: '100%',
                flexBasis: '100%',
                margin: '0 0 8px 0',
                fontSize: 13,
                color: '#888',
                lineHeight: 1.45,
                maxWidth: 560,
              }}
            >
              <strong>Send Rematch Request</strong> asks your opponent for a new game. They must
              accept under <strong>Match requests</strong> on the home page before play starts.
            </p>
            {rematchRequestBusy ? (
              <p
                style={{
                  width: '100%',
                  flexBasis: '100%',
                  margin: '0 0 8px 0',
                  fontSize: 13,
                  color: '#9aa5b1',
                }}
              >
                Sending rematch request…
              </p>
            ) : !rematchSentBanner ? (
              <p
                style={{
                  width: '100%',
                  flexBasis: '100%',
                  margin: '0 0 8px 0',
                  fontSize: 12,
                  color: '#768090',
                }}
              >
                State: not sent yet.
              </p>
            ) : null}
            {(userId === game.white_player_id || userId === game.black_player_id) && (
              <button
                type="button"
                data-testid="rematch-request-button"
                onClick={handleSendRematchRequest}
                disabled={rematchRequestBusy}
                style={{ padding: '8px 12px' }}
              >
                Send Rematch Request
              </button>
            )}
            {rematchSentBanner ? (
              <div style={{ flexBasis: '100%', width: '100%', maxWidth: 560 }}>
                <RequestSuccessBanner headline="Rematch request sent." />
              </div>
            ) : null}
          </>
        )}
        {showPlayerActions && (
          <>
            <button
              type="button"
              data-testid="resign-button"
              onClick={handleResign}
              disabled={resigning}
              style={{ padding: '8px 12px' }}
            >
              Resign
            </button>
            {canOfferDraw && (
              <button
                type="button"
                data-testid="offer-draw-button"
                onClick={handleOfferDraw}
                disabled={drawBusy}
                style={{ padding: '8px 12px' }}
              >
                Offer Draw
              </button>
            )}
            {opponentOfferedDraw && (
              <>
                <button
                  type="button"
                  data-testid="draw-accept-button"
                  onClick={handleAcceptDraw}
                  disabled={drawBusy}
                  style={{ padding: '8px 12px' }}
                >
                  Accept Draw
                </button>
                <button
                  type="button"
                  data-testid="draw-decline-button"
                  onClick={handleDeclineDraw}
                  disabled={drawBusy}
                  style={{ padding: '8px 12px' }}
                >
                  Decline Draw
                </button>
              </>
            )}
            {youOfferedDraw && (
              <span style={{ alignSelf: 'center', color: '#9aa5b1' }}>
                Draw offer sent — awaiting response
              </span>
            )}
          </>
        )}
      </div>

      {finishedPgnBlocked && (
        <p style={{ marginBottom: 16, color: '#e88', maxWidth: 560 }}>
          Free limit reached. Upgrade for unlimited exports and analysis.
        </p>
      )}

      {!isPublicViewer && !isEngineProhibited && showAnalysisPanel && game.status === 'finished' && (
        <div
          style={{
            marginBottom: 16,
            maxWidth: 560,
            padding: '12px 14px',
            border: '1px solid #333',
            borderRadius: 8,
            background: '#141414',
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>Analysis</h3>
          {analysisUsedEngine ? (
            <p
              style={{
                margin: '0 0 8px 0',
                fontSize: 12,
                color: '#9a9',
                letterSpacing: '0.02em',
              }}
            >
              <strong style={{ color: '#8c8' }}>Engine analysis</strong>
              <span style={{ color: '#555', margin: '0 6px' }}>·</span>
              Depth {effectiveAnalysis?.[0]?.depth ?? FINISHED_GAME_ENGINE_DEPTH}
            </p>
          ) : null}
          {IS_DEV_BUILD && !isEngineProhibited && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                margin: '0 0 10px 0',
                fontSize: 12,
                color: '#aaa',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={devEngineAnalysisEnabled}
                onChange={(e) => setDevEngineAnalysisEnabled(e.target.checked)}
              />
              <span>
                Use Stockfish (dev){' '}
                {NEXT_PUBLIC_ENGINE_ANALYSIS_ENABLED ? (
                  <span style={{ color: '#6a6' }}>(env also on)</span>
                ) : null}
              </span>
            </label>
          )}
          {wantEngineAnalysis && engineAnalysisBusy ? (
            <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#888' }}>
              Engine analysis running… showing material heuristic until it finishes.
            </p>
          ) : null}
          <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#888', lineHeight: 1.45 }}>
            {analysisUsedEngine ? (
              <>
                Move labels follow material heuristics; eval is for the side to move before each
                half-move (pawns; mates Mn / −Mn).
              </>
            ) : (
              <>
                Material swing per move (heuristic). <strong>Strong</strong> is rare; most sound moves
                read as <strong>Good</strong>. Enable engine analysis via{' '}
                <code style={{ fontSize: 11 }}>NEXT_PUBLIC_ENABLE_ENGINE_ANALYSIS=true</code> or the
                dev toggle above.
              </>
            )}
          </p>
          {!effectiveAnalysis || effectiveAnalysis.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: '#777' }}>No moves to analyze.</p>
          ) : (
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                fontSize: 14,
                lineHeight: 1.65,
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {analysisPairedRows.map((row) => (
                <li key={row.num} style={{ marginBottom: 8 }}>
                  <span style={{ color: '#888', userSelect: 'none' }}>{row.num}. </span>
                  <span style={{ color: '#e5e5e5' }}>
                    {sanForDisplay(moveLogs[row.white.index])}
                  </span>
                  {row.white.engineScore != null ? (
                    <span style={{ color: '#6e9b8e', fontSize: 12, marginLeft: 6 }}>
                      {formatEngineScore(row.white.engineScore)}
                    </span>
                  ) : null}
                  <span style={{ color: '#666' }}> — </span>
                  <span style={{ color: analysisRowColor(row.white.classification) }}>
                    {heuristicClassificationLabel(row.white.classification)}
                  </span>
                  {row.black ? (
                    <>
                      <span style={{ color: '#555', margin: '0 10px' }}>...</span>
                      <span style={{ color: '#e5e5e5' }}>
                        {sanForDisplay(moveLogs[row.black.index])}
                      </span>
                      {row.black.engineScore != null ? (
                        <span style={{ color: '#6e9b8e', fontSize: 12, marginLeft: 6 }}>
                          {formatEngineScore(row.black.engineScore)}
                        </span>
                      ) : null}
                      <span style={{ color: '#666' }}> — </span>
                      <span style={{ color: analysisRowColor(row.black.classification) }}>
                        {heuristicClassificationLabel(row.black.classification)}
                      </span>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 16 }}>
            <TrainerPanel fen={boardPositionRaw} gameId={game.id} allowFenEdit={false} />
          </div>
        </div>
      )}

      {moveLogs.length > 0 && (
        <div style={{ marginBottom: 16, maxWidth: 560 }}>
          <h3 style={{ marginTop: 0 }}>Replay</h3>
          <div
            style={{
              marginBottom: 10,
              border: '1px solid #444',
              borderRadius: 6,
              background: '#111',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '6px 10px',
                borderBottom: '1px solid #333',
                color: '#aaa',
                fontSize: 12,
              }}
            >
              Notation — click a move to jump
            </div>
            <div
              style={{
                maxHeight: 180,
                overflowY: 'auto',
                padding: '8px 10px',
                fontSize: 13,
                lineHeight: 1.55,
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {(() => {
                let flat = 0;
                const hl = (idx: number) =>
                  replayStep !== null && idx >= 0 && replayStep === idx + 1;
                const sanBtn = (idx: number, label: string) => (
                  <button
                    key={idx}
                    type="button"
                    title="Jump to position after this move"
                    onClick={() => setReplayStep(idx + 1)}
                    style={{
                      padding: '1px 4px',
                      margin: 0,
                      border: 'none',
                      borderRadius: 3,
                      background: hl(idx) ? 'rgba(255, 180, 60, 0.4)' : 'transparent',
                      color: '#eee',
                      fontSize: 'inherit',
                      lineHeight: 'inherit',
                      fontFamily: 'inherit',
                      fontWeight: hl(idx) ? 600 : 400,
                      cursor: 'pointer',
                      verticalAlign: 'baseline',
                    }}
                  >
                    {label}
                  </button>
                );
                return pairedRows.map((row: ReplayPairedRow) => {
                  const wIdx = flat++;
                  const bIdx = row.black !== undefined ? flat++ : -1;
                  return (
                    <div key={row.num} style={{ marginBottom: 3 }}>
                      <span style={{ color: '#888', userSelect: 'none' }}>{row.num}. </span>
                      {sanBtn(wIdx, row.white)}
                      {row.black !== undefined && (
                        <>
                          {' '}
                          {sanBtn(bIdx, row.black)}
                        </>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setReplayStep(0)}
              disabled={replayStep === 0}
              style={{ padding: '6px 10px' }}
            >
              First
            </button>
            <button
              type="button"
              onClick={() =>
                setReplayStep((s: number | null) => (s === null ? 0 : Math.max(0, s - 1)))
              }
              disabled={replayStep !== null && replayStep <= 0}
              style={{ padding: '6px 10px' }}
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() =>
                setReplayStep((s: number | null) => {
                  if (s === null) return 0;
                  return Math.min(maxReplayStep, s + 1);
                })
              }
              disabled={replayStep !== null && replayStep >= maxReplayStep}
              style={{ padding: '6px 10px' }}
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => setReplayStep(maxReplayStep)}
              disabled={replayStep === maxReplayStep}
              style={{ padding: '6px 10px' }}
            >
              Last
            </button>
            <button type="button" onClick={() => setReplayStep(null)} style={{ padding: '6px 10px' }}>
              {game.status === 'finished' ? 'Final position' : 'Live'}
            </button>
            {replayStep !== null && (
              <span style={{ fontSize: 14 }}>
                Step {replayStep} / {maxReplayStep}
              </span>
            )}
          </div>
        </div>
      )}

      {/* TEST CONTRACT: `game-turn-indicator` + `data-game-state` — E2E; UI "waiting" here does not change DB status */}
      {game.status !== 'finished' && (
        <p
          data-testid="game-turn-indicator"
          data-game-state={!bothPlayersSeated(game) ? 'waiting' : 'seated'}
          data-spectator-readonly={isPublicViewer || (isSpectator && !!userId) ? '1' : '0'}
          style={{
            marginBottom: 8,
            fontWeight: isMyTurn && !isSpectator ? 'bold' : undefined,
            color: isMyTurn && !isSpectator ? 'red' : '#777',
          }}
        >
          {isPublicViewer || (isSpectator && !!userId) ? (
            !bothPlayersSeated(game) ? (
              <>Waiting for players — you are watching (read-only).</>
            ) : (
              <>Live position — read-only for spectators.</>
            )
          ) : !bothPlayersSeated(game) ? (
            'Waiting for an opponent to join — the board is shown but play starts once Black is seated.'
          ) : !canPlayMoves(game) ? (
            'Game is not ready for moves yet.'
          ) : isMyTurn ? (
            'YOUR TURN'
          ) : (
            "OPPONENT'S TURN"
          )}
        </p>
      )}

      {showAbandonOpenSeat ? (
        <p style={{ margin: '0 0 12px 0' }}>
          <button
            type="button"
            data-testid="game-abandon-open-seat"
            onClick={() => void handleAbandonOpenSeat()}
            disabled={resigning}
            style={{ padding: '8px 12px' }}
          >
            {resigning ? 'Leaving…' : 'Leave waiting seat'}
          </button>
        </p>
      ) : null}

      <div
        data-testid="game-board"
        data-spectator-readonly={isPublicViewer ? '1' : '0'}
        style={{
          position: 'relative',
          zIndex: 100,
          maxWidth: 520,
          width: '100%',
          marginTop: 20,
          isolation: 'isolate',
          scrollMarginTop: 72,
        }}
      >
        <Chessboard
          options={{
            id: 'accl-e2e-board',
            position: boardPosition,
            boardOrientation,
            onPieceDrop,
            onSquareClick: ({ square }) => {
              if (isPublicViewer) return;
              if (!boardInputEnabled) return;
              const board = chessRef.current;
              if (!board) return;
              const clicked = square;
              const sel = selectedSquare;
              if (!sel) {
                if (!myColor || !canPickPieceForMove(board, clicked, myColor)) return;
                setSelectedSquare(clicked);
                return;
              }
              if (sel === clicked) {
                setSelectedSquare(null);
                return;
              }
              setSelectedSquare(null);
              void onPieceDrop({ sourceSquare: sel, targetSquare: clicked });
            },
            showAnimations: false,
            squareStyles: lastMoveSquareStyles,
            allowDragging: boardInputEnabled && !isPublicViewer,
            canDragPiece: ({ square }) => {
              if (isPublicViewer) return false;
              if (!square || !boardInputEnabled || !myColor) return false;
              const board = chessRef.current;
              if (!board) return false;
              return canPickPieceForMove(board, square, myColor);
            },
          }}
        />
        {promotionPending && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="promotion-dialog-title"
            data-testid="promotion-overlay"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 50,
              background: 'rgba(0,0,0,0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
              borderRadius: 4,
              touchAction: 'none',
            }}
            onClick={() => {
              setPromotionPending(null);
              setSelectedSquare(null);
            }}
          >
            <div
              style={{
                background: '#1a1a1a',
                border: '1px solid #444',
                borderRadius: 8,
                padding: '16px 20px',
                maxWidth: 360,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p
                id="promotion-dialog-title"
                style={{ margin: '0 0 6px 0', fontSize: 16, fontWeight: 600 }}
              >
                Choose promotion
              </p>
              <p style={{ margin: '0 0 14px 0', fontSize: 13, color: '#aaa', lineHeight: 1.45 }}>
                Pick the piece to replace your pawn.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(
                  [
                    { piece: 'q' as const, label: 'Queen' },
                    { piece: 'r' as const, label: 'Rook' },
                    { piece: 'b' as const, label: 'Bishop' },
                    { piece: 'n' as const, label: 'Knight' },
                  ] as const
                ).map(({ piece, label }) => (
                  <button
                    key={piece}
                    type="button"
                    onClick={() => completePromotion(piece)}
                    style={{
                      padding: '8px 12px',
                      fontSize: 14,
                      cursor: 'pointer',
                      borderRadius: 6,
                      border: '1px solid #555',
                      background: '#2a2a2a',
                      color: '#eee',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPromotionPending(null);
                  setSelectedSquare(null);
                }}
                style={{
                  marginTop: 14,
                  padding: '6px 10px',
                  fontSize: 13,
                  color: '#888',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      {userId ? (
        <div style={{ marginTop: 20, maxWidth: 520 }}>
          <TesterBugReportTrigger
            label="Report issue"
            className="rounded-md border border-amber-500/35 bg-amber-950/20 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-950/35"
          />
        </div>
      ) : null}
      {!isPublicViewer && game ? (
        <GameTesterChatPanels
          gameId={game.id}
          gameStatus={game.status}
          userId={userId}
          isSpectator={isSpectator}
          viewerEcosystem={viewerEcosystem}
          accessToken={chatAccessToken}
        />
      ) : null}
      {isEngineProhibited && (
        <p style={{ marginTop: 20, color: '#e57373', fontSize: 12 }}>
          Analysis features are strictly disabled for this live PIT match.
        </p>
      )}
    </div>
  );
}