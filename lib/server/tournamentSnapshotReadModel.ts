/**
 * Trusted tournament detail snapshot — service-role reads with explicit allow-lists.
 * Does not change RLS. Visibility is enforced here (anonymous vs auth, ecosystem, role).
 */

import type { NexusEcosystem } from '@/lib/nexus/getNexusData';
import { matchBoardStatus } from '@/lib/tournamentReadModel';
import type { SupabaseClient } from '@supabase/supabase-js';

import { DEFAULT_FREE_TOURNAMENT_MAX_ENTRANTS } from '@/lib/server/tournamentFreeJoin';
import {
  canUserOperateTournament,
  isTournamentBracketFull,
  tournamentBracketTargetSize,
  tournamentPhaseStatus,
  tournamentPhaseStatusLabel,
} from '@/lib/server/tournamentOperator';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTournamentSnapshotId(id: string): boolean {
  return UUID_RE.test(String(id ?? '').trim());
}

function normalizeStatus(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toLowerCase();
}

function asEcosystem(raw: string | null | undefined): NexusEcosystem | null {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'k12') return 'k12';
  if (s === 'adult') return 'adult';
  return null;
}

function k12MaskDisplay(userId: string): string {
  const hex = userId.replace(/-/g, '').slice(0, 6);
  return `K12-${hex || 'player'}`;
}

export function snapshotDisplayName(
  tournamentEcosystem: NexusEcosystem,
  userId: string,
  username: string | null | undefined
): string {
  if (tournamentEcosystem === 'k12') return k12MaskDisplay(userId);
  const u = username?.trim();
  return u && u.length > 0 ? u : `${userId.slice(0, 8)}…`;
}

type TournamentDbRow = {
  id: string;
  name: string;
  status: string;
  format: string;
  tempo: string | null;
  live_time_control: string | null;
  rated: boolean | null;
  ecosystem_scope: string;
  entry_fee_cents: number | null;
  prize_pool_cents: number | null;
  sponsor_label: string | null;
  sponsor_tag: string | null;
  created_by: string | null;
  created_at: string;
};

type EntryDbRow = {
  user_id: string;
  seed: number | null;
  eliminated: boolean;
  current_round: number;
};

type MatchDbRow = {
  id: string;
  round_number: number;
  match_number: number;
  player1_id: string | null;
  player2_id: string | null;
  game_id: string | null;
  winner_id: string | null;
  next_match_id: string | null;
  advance_winner_as: string | null;
};

export type TournamentSnapshotAccessReason =
  | 'ok'
  | 'invalid_id'
  | 'not_found'
  | 'k12_requires_auth'
  | 'cross_ecosystem'
  | 'not_visible';

export type TournamentSnapshotResult =
  | {
      access: 'allowed';
      reason: 'ok';
      viewer: {
        authenticated: boolean;
        userId: string | null;
        viewerEcosystem: NexusEcosystem | null;
        isCreator: boolean;
        isParticipant: boolean;
        /** Same as participant or creator (full bracket + pending eligibility). */
        isInsider: boolean;
        isModerator: boolean;
        canOperate: boolean;
      };
      operator: {
        entrantCount: number;
        bracketTargetSize: number;
        maxEntrants: number;
        isBracketFull: boolean;
        canBootstrap: boolean;
        phaseStatus: string;
        phaseLabel: string;
      };
      tournamentEcosystem: NexusEcosystem;
      tournament: {
        id: string;
        name: string;
        status: string;
        format: string;
        tempo: string | null;
        liveTimeControl: string | null;
        rated: boolean;
        ecosystemScope: NexusEcosystem;
        entryFeeCents: number | null;
        prizePoolCents: number | null;
        sponsorLabel: string | null;
        sponsorTag: string | null;
        createdAt: string;
        createdById: string | null;
        createdByDisplayName: string | null;
      };
      entries: Array<{
        userId: string;
        displayName: string;
        seed: number | null;
        eliminated: boolean;
        currentRound: number;
      }>;
      matches: Array<{
        id: string;
        round: number;
        matchNumber: number;
        player1: { userId: string | null; displayName: string | null };
        player2: { userId: string | null; displayName: string | null };
        winnerUserId: string | null;
        winnerDisplayName: string | null;
        gameId: string | null;
        boardStatus: 'waiting' | 'ready' | 'live' | 'resolved';
        nextMatchId: string | null;
        advanceWinnerAs: string | null;
      }>;
      /** Minimal statuses for `matchBoardStatus` derivation — ids only, no positions. */
      gameStatusById: Record<string, string>;
      displayNamesByUserId: Record<string, string>;
    }
  | {
      access: 'denied';
      reason: TournamentSnapshotAccessReason;
      httpStatus: number;
      message: string;
      code?: string;
    };

type ViewerInput = {
  authenticated: boolean;
  userId: string | null;
  viewerEcosystem: NexusEcosystem | null;
  isModerator?: boolean;
};

async function isUserEntrant(
  supabase: SupabaseClient,
  tournamentId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tournament_entries')
    .select('user_id')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

function buildDisplayMap(
  tournamentEcosystem: NexusEcosystem,
  profiles: { id: string; username: string | null }[],
  extraIds: string[]
): Map<string, string> {
  const map = new Map<string, string>();
  const byId = new Map(profiles.map((p) => [p.id, p]));
  for (const id of extraIds) {
    if (!id || map.has(id)) continue;
    const row = byId.get(id);
    map.set(id, snapshotDisplayName(tournamentEcosystem, id, row?.username ?? null));
  }
  return map;
}

/**
 * Build a full snapshot for a tournament id, enforcing visibility without widening client RLS.
 */
export async function buildTournamentSnapshot(params: {
  tournamentId: string;
  viewer: ViewerInput;
}): Promise<TournamentSnapshotResult> {
  const tournamentId = String(params.tournamentId ?? '').trim();
  if (!isTournamentSnapshotId(tournamentId)) {
    return {
      access: 'denied',
      reason: 'invalid_id',
      httpStatus: 400,
      message: 'Invalid tournament id.',
      code: 'INVALID_TOURNAMENT_ID',
    };
  }

  const supabase = createServiceRoleClient();
  const { data: tRaw, error: tErr } = await supabase
    .from('tournaments')
    .select(
      'id,name,status,format,tempo,live_time_control,rated,ecosystem_scope,entry_fee_cents,prize_pool_cents,sponsor_label,sponsor_tag,created_by,created_at',
    )
    .eq('id', tournamentId)
    .maybeSingle();

  if (tErr) {
    return {
      access: 'denied',
      reason: 'not_found',
      httpStatus: 502,
      message: tErr.message,
      code: 'TOURNAMENT_LOOKUP_FAILED',
    };
  }
  if (!tRaw) {
    return {
      access: 'denied',
      reason: 'not_found',
      httpStatus: 404,
      message: 'Tournament not found.',
      code: 'TOURNAMENT_NOT_FOUND',
    };
  }

  const t = tRaw as TournamentDbRow;
  const tEco = asEcosystem(t.ecosystem_scope);
  if (!tEco) {
    return {
      access: 'denied',
      reason: 'not_found',
      httpStatus: 404,
      message: 'Tournament not found.',
      code: 'TOURNAMENT_NOT_FOUND',
    };
  }

  const st = normalizeStatus(t.status);
  const v = params.viewer;

  let isCreator = false;
  let isParticipant = false;

  if (!v.authenticated) {
    if (tEco === 'k12') {
      return {
        access: 'denied',
        reason: 'k12_requires_auth',
        httpStatus: 401,
        message: 'Sign in required for school ecosystem tournaments.',
        code: 'K12_REQUIRES_AUTH',
      };
    }
    if (st === 'pending') {
      return {
        access: 'denied',
        reason: 'not_visible',
        httpStatus: 404,
        message: 'Tournament is not publicly visible yet.',
        code: 'NOT_VISIBLE',
      };
    }
    if (st !== 'active' && st !== 'completed') {
      return {
        access: 'denied',
        reason: 'not_visible',
        httpStatus: 404,
        message: 'Tournament not found.',
        code: 'NOT_VISIBLE',
      };
    }
  } else {
    if (!v.userId || !v.viewerEcosystem) {
      return {
        access: 'denied',
        reason: 'not_visible',
        httpStatus: 401,
        message: 'Session could not be resolved.',
        code: 'UNAUTHORIZED',
      };
    }
    if (v.viewerEcosystem !== tEco) {
      return {
        access: 'denied',
        reason: 'cross_ecosystem',
        httpStatus: 404,
        message: 'Tournament not found.',
        code: 'NOT_FOUND',
      };
    }

    isCreator = Boolean(t.created_by && t.created_by === v.userId);
    isParticipant = await isUserEntrant(supabase, tournamentId, v.userId);

    if (st === 'pending' && !isCreator && !isParticipant) {
      return {
        access: 'denied',
        reason: 'not_visible',
        httpStatus: 404,
        message: 'Tournament is not publicly visible yet.',
        code: 'NOT_VISIBLE',
      };
    }
  }

  const isInsider = isCreator || isParticipant;
  const isModerator = Boolean(v.authenticated && v.isModerator);
  const canOperate = v.authenticated
    ? canUserOperateTournament({
        userId: v.userId ?? '',
        createdById: t.created_by != null ? String(t.created_by) : null,
        isModerator,
      })
    : false;

  const [{ data: entriesRaw, error: eErr }, { data: mRaw, error: mErr }] = await Promise.all([
    supabase
      .from('tournament_entries')
      .select('user_id, seed, eliminated, current_round')
      .eq('tournament_id', tournamentId)
      .order('seed', { ascending: true, nullsFirst: false }),
    supabase
      .from('tournament_matches')
      .select(
        'id, round_number, match_number, player1_id, player2_id, game_id, winner_id, next_match_id, advance_winner_as',
      )
      .eq('tournament_id', tournamentId)
      .order('round_number', { ascending: true })
      .order('match_number', { ascending: true }),
  ]);

  if (eErr || mErr) {
    return {
      access: 'denied',
      reason: 'not_found',
      httpStatus: 502,
      message: eErr?.message ?? mErr?.message ?? 'Load failed',
      code: 'SNAPSHOT_LOAD_FAILED',
    };
  }

  const entries = (entriesRaw ?? []) as EntryDbRow[];
  const matches = (mRaw ?? []) as MatchDbRow[];

  const idSet = new Set<string>();
  if (t.created_by) idSet.add(t.created_by);
  for (const e of entries) idSet.add(e.user_id);
  for (const m of matches) {
    if (m.player1_id) idSet.add(m.player1_id);
    if (m.player2_id) idSet.add(m.player2_id);
    if (m.winner_id) idSet.add(m.winner_id);
  }
  const allIds = [...idSet];

  const { data: profs, error: pErr } =
    allIds.length === 0
      ? { data: [] as { id: string; username: string | null }[], error: null }
      : await supabase.from('profiles').select('id, username').in('id', allIds);

  if (pErr) {
    return {
      access: 'denied',
      reason: 'not_found',
      httpStatus: 502,
      message: pErr.message,
      code: 'PROFILE_LOOKUP_FAILED',
    };
  }

  const displayByUser = buildDisplayMap(tEco, (profs ?? []) as { id: string; username: string | null }[], allIds);

  const gameIds = [...new Set(matches.map((m) => m.game_id).filter((x): x is string => Boolean(x)))];
  const gameStatusById: Record<string, string> = {};
  if (gameIds.length > 0) {
    const { data: games, error: gErr } = await supabase.from('games').select('id, status').in('id', gameIds);
    if (!gErr && games) {
      for (const g of games as { id: string; status: string }[]) {
        gameStatusById[g.id] = g.status;
      }
    }
  }

  const matchesOut = matches.map((m) => {
    const p1 = m.player1_id;
    const p2 = m.player2_id;
    const w = m.winner_id;
    const boardStatus = matchBoardStatus(m, m.game_id ? gameStatusById[m.game_id] : null);
    return {
      id: m.id,
      round: m.round_number,
      matchNumber: m.match_number,
      player1: {
        userId: p1,
        displayName: p1 ? (displayByUser.get(p1) ?? snapshotDisplayName(tEco, p1, null)) : null,
      },
      player2: {
        userId: p2,
        displayName: p2 ? (displayByUser.get(p2) ?? snapshotDisplayName(tEco, p2, null)) : null,
      },
      winnerUserId: w,
      winnerDisplayName: w ? (displayByUser.get(w) ?? snapshotDisplayName(tEco, w, null)) : null,
      gameId: m.game_id,
      boardStatus,
      nextMatchId: m.next_match_id,
      advanceWinnerAs: m.advance_winner_as,
    };
  });

  const createdById = t.created_by;
  const createdByDisplayName = createdById
    ? (displayByUser.get(createdById) ?? snapshotDisplayName(tEco, createdById, null))
    : null;

  const economicsBlocked = tEco === 'k12';

  const displayNamesByUserId: Record<string, string> = {};
  for (const [uid, name] of displayByUser) displayNamesByUserId[uid] = name;

  const entrantCount = entries.length;
  const bracketTargetSize = tournamentBracketTargetSize(entrantCount);
  const isBracketFull = isTournamentBracketFull(entrantCount);
  const phase = tournamentPhaseStatus({
    status: st,
    entrantCount,
    matchCount: matches.length,
  });
  const canBootstrap =
    canOperate && st === 'pending' && matches.length === 0 && isBracketFull;

  return {
    access: 'allowed',
    reason: 'ok',
    viewer: {
      authenticated: v.authenticated,
      userId: v.userId,
      viewerEcosystem: v.viewerEcosystem,
      isCreator,
      isParticipant,
      isInsider,
      isModerator,
      canOperate,
    },
    operator: {
      entrantCount,
      bracketTargetSize,
      maxEntrants: DEFAULT_FREE_TOURNAMENT_MAX_ENTRANTS,
      isBracketFull,
      canBootstrap,
      phaseStatus: phase,
      phaseLabel: tournamentPhaseStatusLabel(phase),
    },
    tournamentEcosystem: tEco,
    tournament: {
      id: t.id,
      name: String(t.name ?? 'Tournament'),
      status: String(t.status ?? 'pending'),
      format: String(t.format ?? 'single_elimination'),
      tempo: t.tempo != null ? String(t.tempo) : null,
      liveTimeControl: t.live_time_control != null ? String(t.live_time_control) : null,
      rated: t.rated === true,
      ecosystemScope: tEco,
      entryFeeCents: economicsBlocked ? null : typeof t.entry_fee_cents === 'number' ? t.entry_fee_cents : null,
      prizePoolCents: economicsBlocked ? null : typeof t.prize_pool_cents === 'number' ? t.prize_pool_cents : null,
      sponsorLabel:
        economicsBlocked
          ? null
          : t.sponsor_label != null && String(t.sponsor_label).trim()
            ? String(t.sponsor_label).trim()
            : null,
      sponsorTag:
        economicsBlocked
          ? null
          : t.sponsor_tag != null && String(t.sponsor_tag).trim()
            ? String(t.sponsor_tag).trim()
            : null,
      createdAt: String(t.created_at ?? ''),
      createdById,
      createdByDisplayName,
    },
    entries: entries.map((e) => ({
      userId: e.user_id,
      displayName: displayByUser.get(e.user_id) ?? snapshotDisplayName(tEco, e.user_id, null),
      seed: e.seed,
      eliminated: e.eliminated,
      currentRound: e.current_round,
    })),
    matches: matchesOut,
    gameStatusById,
    displayNamesByUserId,
  };
}
