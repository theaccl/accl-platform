/**
 * ACCL health stack — **DB / chat migration parity**
 *
 * Meaning: service-role Supabase client can reach **all** tester-chat tables
 * (`20260430230000_tester_chat_communication.sql`). Used as a release gate for
 * chat-related schema (not a full DB audit).
 *
 * Release gate (with `/api/health` + `/api/health/system`): expect `ok: true` and HTTP 200.
 */
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { isNextProductionBuild } from '@/lib/server/isNextProductionBuild';

export const runtime = 'nodejs';

const CHAT_MIGRATION_TABLES = [
  'tester_chat_messages',
  'tester_chat_mutes',
  'tester_chat_blocks',
  'tester_chat_reports',
  'tester_dm_threads',
] as const;

type TableName = (typeof CHAT_MIGRATION_TABLES)[number];

type CheckValue = 'ok' | 'missing' | string;

function probeStatus(err: { code?: string; message?: string } | null): CheckValue {
  if (!err) return 'ok';
  const code = String(err.code ?? '');
  const msg = String(err.message ?? '');
  if (code === 'PGRST205' || /schema cache|could not find the table/i.test(msg)) {
    return 'missing';
  }
  return msg.slice(0, 500) || code || 'error';
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function GET(): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();

    const checks = {} as Record<TableName, CheckValue>;
    for (const table of CHAT_MIGRATION_TABLES) {
      const { error } = await supabase.from(table).select('id').limit(1);
      checks[table] = probeStatus(error);
    }

    const ok = CHAT_MIGRATION_TABLES.every((t) => checks[t] === 'ok');

    if (!ok && !isNextProductionBuild()) {
      console.error('[api/health/db] one_or_more_checks_failed', checks);
    }

    return json({ ok, checks }, ok ? 200 : 503);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/health/db] unreachable', message.slice(0, 200));
    return json(
      { ok: false, code: 'DB_UNREACHABLE', error: 'internal_error', availability: 'unavailable' },
      503
    );
  }
}
