/**
 * ACCL health stack — **system / service-role + core tables**
 *
 * Meaning: `createServiceRoleClient()` works and minimal reads succeed on
 * `tester_chat_messages`, `games`, and `profiles`. Release gate: `ok: true` and HTTP 200.
 *
 * See also: `/api/health` (liveness only), `/api/health/db` (all chat migration tables with per-table checks).
 */
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { isNextProductionBuild } from '@/lib/server/isNextProductionBuild';

export const runtime = 'nodejs';

type CheckResult = 'ok' | string;

type SystemHealthBody = {
  ok: boolean;
  checks: {
    chat_table: CheckResult;
    games_table: CheckResult;
    profiles: CheckResult;
  };
};

function json(
  body: SystemHealthBody | { ok: false; error: string; code?: string; availability?: string },
  status: number
): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function GET(): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();

    const { error: chatErr } = await supabase.from('tester_chat_messages').select('id').limit(1);

    const { error: gameErr } = await supabase.from('games').select('id').limit(1);

    const { error: profileErr } = await supabase.from('profiles').select('id').limit(1);

    const result: SystemHealthBody = {
      ok: !chatErr && !gameErr && !profileErr,
      checks: {
        chat_table: chatErr ? chatErr.message : 'ok',
        games_table: gameErr ? gameErr.message : 'ok',
        profiles: profileErr ? profileErr.message : 'ok',
      },
    };

    if (!result.ok && !isNextProductionBuild()) {
      console.error('[api/health/system] check_failed', {
        chat_table: result.checks.chat_table,
        games_table: result.checks.games_table,
        profiles: result.checks.profiles,
      });
    }

    return json(result, result.ok ? 200 : 503);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/health/system] unreachable', message.slice(0, 200));
    return json(
      { ok: false, error: 'internal_error', code: 'INTERNAL', availability: 'unavailable' },
      503
    );
  }
}
