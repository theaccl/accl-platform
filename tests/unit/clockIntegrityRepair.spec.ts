import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20260813170000_clock_integrity_terminal_snapshot.sql';

test.describe('clock integrity repair', () => {
  test('snapshots only the active clock at the shared terminal transition', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');

    expect(sql).toContain("in ('live', 'daily')");
    expect(sql).toContain('g.last_move_at is not null');
    expect(sql).toContain("if lower(trim(g.turn)) = 'white'");
    expect(sql).toContain('v_white_clock_ms - v_elapsed_ms');
    expect(sql).toContain('v_black_clock_ms - v_elapsed_ms');
    expect(sql).toContain('greatest(0,');
    expect(sql).toContain('white_clock_ms = v_white_clock_ms::integer');
    expect(sql).toContain('black_clock_ms = v_black_clock_ms::integer');
    expect(sql).toMatch(/\nbegin;\s*\n/i);
    expect(sql.trimEnd().toLowerCase()).toMatch(/commit;\s*$/);
  });

  test('preserves clocks supplied by trusted atomic terminal moves', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
    const terminalReasons = sql.match(/v_end_reason in \(([\s\S]*?)\);/i)?.[1] ?? '';

    expect(sql).toContain('v_preserve_supplied_clocks := p_actor is null');
    expect(sql).toContain('and not v_preserve_supplied_clocks then');
    expect(terminalReasons).toContain("'checkmate'");
    expect(terminalReasons).toContain("'stalemate'");
    expect(terminalReasons).toContain("'insufficient_material'");
    expect(terminalReasons).toContain("'threefold_repetition'");
    expect(terminalReasons).toContain("'fifty_move_rule'");
    expect(terminalReasons).not.toContain("'resign'");
    expect(terminalReasons).not.toContain("'timeout'");
    expect(terminalReasons).not.toContain("'draw_agreement'");
  });

  test('uses the application daily fallback when the clock token is missing or invalid', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');

    expect(sql).toContain("when lower(trim(g.tempo)) = 'daily'");
    expect(sql).toContain("v_clock_token !~ '^([0-9]+d|[0-9]+\\+[0-9]+|[0-9]+m)$'");
    expect(sql).toContain('then 30::bigint * 60000');
    expect(sql).toContain('else public.clock_budget_ms_for_live_sweep(g.live_time_control)');
  });

  test('keeps the privileged core function non-callable by runtime roles', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');

    expect(sql).toContain("set search_path = ''");
    expect(sql).toMatch(
      /alter function public\.clock_budget_ms_for_live_sweep\(text\)\s+set search_path = ''/i
    );
    expect(sql).toContain(
      'revoke all on function public.finish_game_core(uuid, text, text, uuid) from authenticated'
    );
    expect(sql).not.toContain('grant execute on function public.finish_game_core');
  });

  test('bundles private game and move-log reconciliation on incoming move events', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');

    expect(page).toContain("includeMoveLogs ? 'with-logs' : 'game-only'");
    expect(page).toContain('const [gameResult, moveLogsResult] = await Promise.all([');
    expect(page).toContain("event: 'INSERT', schema: 'public', table: 'game_move_logs'");
    expect(page).toMatch(/snapshot:\s*true,\s*logs:\s*false,\s*debounceMs:\s*0/);
    expect(page).not.toMatch(/event: 'INSERT'[\s\S]{0,300}snapshot:\s*false/);
  });

  test('loads initial move history only through the sequenced snapshot', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');

    expect(page).toContain('await loadGameSnapshot(uid);');
    expect(page).not.toContain("loadMoveLogs('bootstrap')");
    expect(page).not.toContain('logsBootstrapKeyRef');
    expect(page).not.toContain('spectateRpcBootstrapMoveLogsHydratedKeyRef');
  });

  test('keeps the two-second clock poll game-row only', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');

    expect(page).toMatch(
      /setInterval\(\(\) => \{\s*void loadGameSnapshot\(undefined, \{ includeMoveLogs: false \}\);\s*\}, 2000\)/
    );
  });

  test('keeps the authoritative game available when auxiliary move history fails', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');
    const setGameIndex = page.indexOf('setGame(gameRow);');
    const moveLogsErrorIndex = page.indexOf('if (moveLogsResult?.error)');

    expect(setGameIndex).toBeGreaterThan(-1);
    expect(moveLogsErrorIndex).toBeGreaterThan(setGameIndex);
    expect(page).toContain('Move history temporarily unavailable:');
  });

  test('prevents stale snapshot responses from overwriting newer state', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');

    expect(page).toContain('const snapshotRequestSequenceRef = useRef(0);');
    expect(page).toContain('snapshotRequestSequenceRef.current = requestSequence;');
    expect(page.match(/if \(!requestIsCurrent\(\)\) return;/g)?.length).toBeGreaterThanOrEqual(3);
  });

  test('keeps game-only polls from cancelling an in-flight history refresh', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');
    const historyPriorityIndex = page.indexOf(
      "!includeMoveLogs &&\n        snapshotWait.key.endsWith('|with-logs')"
    );
    const sequenceAdvanceIndex = page.indexOf(
      'const requestSequence = snapshotRequestSequenceRef.current + 1;'
    );

    expect(historyPriorityIndex).toBeGreaterThan(-1);
    expect(sequenceAdvanceIndex).toBeGreaterThan(historyPriorityIndex);
    expect(page.slice(historyPriorityIndex, sequenceAdvanceIndex)).toContain(
      'await snapshotWait.promise;'
    );
  });

  test('clears only the recovered move-history warning', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');

    expect(page).toContain("const MOVE_HISTORY_UNAVAILABLE_PREFIX = 'Move history temporarily unavailable:';");
    expect(page).toContain("current.startsWith(MOVE_HISTORY_UNAVAILABLE_PREFIX) ? '' : current");
  });

  test('keeps legacy last-move highlights on finished game records', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');
    const replayState = readFileSync(join(process.cwd(), 'hooks', 'useReplayState.ts'), 'utf8');

    expect(page).toMatch(
      /useReplayState\([\s\S]*?game\?\.fen \?\? null,\s*game\?\.status !== 'finished'\s*\)/
    );
    expect(replayState).toContain('enforceAuthoritativeCoherence = true');
    expect(replayState).toMatch(
      /enforceAuthoritativeCoherence &&\s*authoritativeFen != null &&\s*!lastMoveMatchesAuthoritativePosition/
    );
  });
});
