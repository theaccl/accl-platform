import { expect, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  adaptOwnSuccessfulPerformanceRpc,
  broadModeUnlockPolicyForMode,
  loadOwnSuccessfulPerformance,
  routeASatisfied,
  routeBSatisfied,
  SUCCESSFUL_PERFORMANCE_CONTRACT_VERSION,
} from '../../lib/profile/loadOwnSuccessfulPerformance';
import { resolveSuccessfulPerformanceView } from '../../lib/profile/successfulPerformanceUnlock';
import { scoreSuccessfulPerformance } from '../../lib/profile/successfulPerformance';

function envelope(over: Record<string, unknown> = {}) {
  return {
    contract_version: SUCCESSFUL_PERFORMANCE_CONTRACT_VERSION,
    source_status: 'available',
    free_play: { modes: [], exact_controls: [] },
    battlefield: {
      lifetime: {
        scope: 'battlefield',
        mode: null,
        color: 'combined',
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        eligible_games: 0,
        score: null,
        percentage: null,
        unlocked: true,
        source_status: 'available',
      },
      tournaments: [],
    },
    ...over,
  };
}

function broadModeCell(
  mode: string,
  color: 'white' | 'black',
  counts: { wins: number; draws: number; losses: number },
  unlocked = false,
) {
  const eligible = counts.wins + counts.draws + counts.losses;
  return {
    scope: 'mode',
    mode,
    color,
    exact_control: null,
    games: eligible,
    wins: counts.wins,
    draws: counts.draws,
    losses: counts.losses,
    eligible_games: eligible,
    score: counts.wins + counts.draws * 0.5,
    percentage: eligible > 0 ? 50 : null,
    unlocked,
    source_status: 'available',
  };
}

function exactControlCell(
  mode: string,
  color: 'white' | 'black',
  exactControl: string,
  eligibleGames: number,
) {
  return {
    scope: 'exact_control',
    mode,
    color,
    exact_control: exactControl,
    games: eligibleGames,
    wins: eligibleGames,
    draws: 0,
    losses: 0,
    eligible_games: eligibleGames,
    score: eligibleGames,
    percentage: eligibleGames > 0 ? 100 : null,
    unlocked: eligibleGames >= 10,
    source_status: 'available',
  };
}

test.describe('adaptOwnSuccessfulPerformanceRpc', () => {
  test('accepts exact contract_version successful_performance_v1', () => {
    const result = adaptOwnSuccessfulPerformanceRpc(envelope());
    expect(result.status).toBe('loaded');
  });

  test('unknown contract version degrades to unavailable', () => {
    const result = adaptOwnSuccessfulPerformanceRpc(
      envelope({ contract_version: 'successful_performance_v2' }),
    );
    expect(result).toEqual({ status: 'unavailable' });
  });

  test('unknown source_status degrades to unavailable', () => {
    const result = adaptOwnSuccessfulPerformanceRpc(
      envelope({ source_status: 'pending' }),
    );
    expect(result).toEqual({ status: 'unavailable' });
  });

  test('non-available cell source_status maps aggregate to unavailable', () => {
    const result = adaptOwnSuccessfulPerformanceRpc(
      envelope({
        free_play: {
          modes: [
            {
              scope: 'mode',
              mode: 'bullet',
              color: 'white',
              games: 5,
              wins: 3,
              draws: 0,
              losses: 2,
              eligible_games: 5,
              source_status: 'degraded',
            },
          ],
          exact_controls: [],
        },
      }),
    );
    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(result.broadModeAggregates.bullet.white.sourceStatus).toBe('unavailable');
  });

  test('snake_case maps to camelCase eligibleGames on broad-mode cells', () => {
    const result = adaptOwnSuccessfulPerformanceRpc(
      envelope({
        free_play: {
          modes: [broadModeCell('blitz', 'white', { wins: 4, draws: 2, losses: 4 })],
          exact_controls: [],
        },
      }),
    );
    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(result.broadModeAggregates.blitz.white.eligibleGames).toBe(10);
    expect(result.broadModeAggregates.blitz.white.wins).toBe(4);
    expect(result.broadModeAggregates.blitz.white.draws).toBe(2);
    expect(result.broadModeAggregates.blitz.white.losses).toBe(4);
  });

  test('absent broad-mode/color cells synthesize exactly eight zero-game locked cells', () => {
    const result = adaptOwnSuccessfulPerformanceRpc(envelope());
    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;

    const modes = ['bullet', 'blitz', 'rapid', 'daily'] as const;
    let count = 0;
    for (const mode of modes) {
      for (const color of ['white', 'black'] as const) {
        count += 1;
        const aggregate = result.broadModeAggregates[mode][color];
        expect(aggregate.scope).toBe('mode');
        expect(aggregate.mode).toBe(mode);
        expect(aggregate.color).toBe(color);
        expect(aggregate.eligibleGames).toBe(0);
        const view = resolveSuccessfulPerformanceView(
          aggregate,
          broadModeUnlockPolicyForMode(mode, result.exactControlUnlocksByMode[mode]),
        );
        expect(view.state).toBe('locked');
      }
    }
    expect(count).toBe(8);
  });

  test('no free-play Overall record is synthesized', () => {
    const result = adaptOwnSuccessfulPerformanceRpc(envelope());
    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('"scope":"overall"');
    expect(serialized).not.toContain('"overall"');
  });

  test('exact-control and tournament records cannot escape adapter boundary', () => {
    const result = adaptOwnSuccessfulPerformanceRpc(
      envelope({
        free_play: {
          modes: [],
          exact_controls: [
            exactControlCell('bullet', 'white', '1+0', 10),
            exactControlCell('bullet', 'white', '20+0', 99),
          ],
        },
        battlefield: {
          lifetime: {
            scope: 'battlefield',
            mode: null,
            color: 'combined',
            games: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            eligible_games: 0,
            unlocked: true,
            source_status: 'available',
          },
          tournaments: [
            {
              scope: 'tournament',
              tournament_id: 't-1',
              color: 'combined',
              games: 4,
              wins: 2,
              draws: 0,
              losses: 2,
              eligible_games: 4,
              unlocked: true,
              source_status: 'available',
            },
          ],
        },
      }),
    );
    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(result).not.toHaveProperty('exact_controls');
    expect(result).not.toHaveProperty('tournaments');
    expect(result).not.toHaveProperty('free_play');
    expect(result.exactControlUnlocksByMode.bullet.some((d) => d.exactControl === '20+0')).toBe(
      false,
    );
    expect(result.exactControlUnlocksByMode.bullet.some((d) => d.exactControl === '1+0')).toBe(
      true,
    );
  });

  test('battlefield zero-game behavior remains insufficient-data/null semantic', () => {
    const result = adaptOwnSuccessfulPerformanceRpc(envelope());
    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    const aggregate = result.battlefieldLifetime;
    expect(aggregate.eligibleGames).toBe(0);
    const score = scoreSuccessfulPerformance(aggregate);
    expect(score.status).toBe('insufficient_data');
    const view = resolveSuccessfulPerformanceView(aggregate, { kind: 'no_threshold' });
    expect(view.state).toBe('insufficient_data');
    expect(view.percentage).toBeNull();
  });

  test('rpc unlock mismatch on broad-mode cell returns invalid', () => {
    const result = adaptOwnSuccessfulPerformanceRpc(
      envelope({
        free_play: {
          modes: [broadModeCell('rapid', 'white', { wins: 0, draws: 0, losses: 0 }, true)],
          exact_controls: [],
        },
      }),
    );
    expect(result).toEqual({
      status: 'invalid',
      reason: 'rpc_unlock_mismatch:rapid:white',
    });
  });

  test('Route A broad-mode unlock at 100 eligible games', () => {
    const result = adaptOwnSuccessfulPerformanceRpc(
      envelope({
        free_play: {
          modes: [broadModeCell('daily', 'black', { wins: 60, draws: 40, losses: 0 }, true)],
          exact_controls: [],
        },
      }),
    );
    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    const aggregate = result.broadModeAggregates.daily.black;
    expect(routeASatisfied(aggregate, 'daily')).toBe(true);
    const view = resolveSuccessfulPerformanceView(
      aggregate,
      broadModeUnlockPolicyForMode('daily', result.exactControlUnlocksByMode.daily),
    );
    expect(view.state).toBe('unlocked');
    expect(view.percentage).toBe(80);
  });

  test('Route B broad-mode unlock when every frozen exact control has 10 games', () => {
    const exactControls = [
      exactControlCell('blitz', 'white', '3+0', 10),
      exactControlCell('blitz', 'white', '3+2', 10),
      exactControlCell('blitz', 'white', '5+0', 10),
      exactControlCell('blitz', 'white', '5+5', 10),
    ];
    const result = adaptOwnSuccessfulPerformanceRpc(
      envelope({
        free_play: {
          modes: [broadModeCell('blitz', 'white', { wins: 2, draws: 0, losses: 3 }, true)],
          exact_controls: exactControls,
        },
      }),
    );
    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(
      routeBSatisfied('blitz', 'white', result.exactControlUnlocksByMode.blitz),
    ).toBe(true);
    const view = resolveSuccessfulPerformanceView(
      result.broadModeAggregates.blitz.white,
      broadModeUnlockPolicyForMode('blitz', result.exactControlUnlocksByMode.blitz),
    );
    expect(view.state).toBe('unlocked');
  });

  test('exact-control 9-game boundary remains locked for broad mode via Route B', () => {
    const exactControls = [
      exactControlCell('bullet', 'black', '1+0', 9),
      exactControlCell('bullet', 'black', '1+1', 10),
      exactControlCell('bullet', 'black', '2+0', 10),
      exactControlCell('bullet', 'black', '2+1', 10),
    ];
    const result = adaptOwnSuccessfulPerformanceRpc(
      envelope({
        free_play: {
          modes: [],
          exact_controls: exactControls,
        },
      }),
    );
    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(
      routeBSatisfied('bullet', 'black', result.exactControlUnlocksByMode.bullet),
    ).toBe(false);
    const view = resolveSuccessfulPerformanceView(
      result.broadModeAggregates.bullet.black,
      broadModeUnlockPolicyForMode('bullet', result.exactControlUnlocksByMode.bullet),
    );
    expect(view.state).toBe('locked');
  });
});

test.describe('loadOwnSuccessfulPerformance', () => {
  function mockSupabase(
    impl: () => Promise<{ data: unknown; error: { message: string } | null }>,
  ): SupabaseClient {
    return {
      rpc: () => impl(),
    } as unknown as SupabaseClient;
  }

  test('RPC error degrades to unavailable without fallback', async () => {
    const result = await loadOwnSuccessfulPerformance(
      mockSupabase(async () => ({ data: null, error: { message: 'network down' } })),
    );
    expect(result).toEqual({ status: 'unavailable' });
  });

  test('not_authenticated degrades to unavailable', async () => {
    const result = await loadOwnSuccessfulPerformance(
      mockSupabase(async () => ({
        data: null,
        error: { message: 'not_authenticated' },
      })),
    );
    expect(result).toEqual({ status: 'unavailable' });
  });

  test('successful RPC delegates to adapter', async () => {
    const payload = envelope();
    const result = await loadOwnSuccessfulPerformance(
      mockSupabase(async () => ({ data: payload, error: null })),
    );
    expect(result.status).toBe('loaded');
  });
});
