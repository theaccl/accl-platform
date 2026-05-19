import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { isSafeHubDocumentId } from '@/lib/nexus/nexusHubMapping';
import {
  insertTesterBugReport,
  TESTER_BUG_REPORT_CATEGORIES,
  type TesterBugReportCategory,
} from '@/lib/tester/insertTesterBugReport';
import { parseGameIdFromRoute } from '@/lib/tester/parseGameIdFromRoute';
import { testerBugReportClientMessage } from '@/lib/tester/testerBugReportClient';

export const runtime = 'nodejs';

const CATEGORIES = new Set<string>(TESTER_BUG_REPORT_CATEGORIES);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clientError(
  code: Parameters<typeof testerBugReportClientMessage>[0],
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return json({ code, error: testerBugReportClientMessage(code), ...extra }, status);
}

export async function POST(request: Request): Promise<Response> {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) {
    auditApiLog('tester_bug_report', { result: 'unauthorized' });
    return clientError('unauthorized', 401);
  }

  const rl = checkRateLimit(`tester-bug-report:${userId}`, 20, 60_000);
  if (!rl.allowed) {
    auditApiLog('tester_bug_report', { result: 'rate_limited', user: shortId(userId) });
    return clientError('rate_limited', 429, { retry_after_sec: rl.retryAfterSec });
  }

  let body: { message?: unknown; category?: unknown; route?: unknown; gameId?: unknown };
  try {
    body = (await request.json()) as {
      message?: unknown;
      category?: unknown;
      route?: unknown;
      gameId?: unknown;
    };
  } catch {
    return clientError('invalid_json', 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length < 1 || message.length > 8000) {
    return clientError('message_invalid', 400);
  }

  const c = typeof body.category === 'string' ? body.category.trim().toLowerCase() : '';
  if (!c || !CATEGORIES.has(c)) {
    return clientError('category_invalid', 400);
  }
  const category = c as TesterBugReportCategory;

  const route =
    typeof body.route === 'string' && body.route.trim()
      ? body.route.trim().slice(0, 2048)
      : new URL(request.url).pathname;

  let gameId: string | null = null;
  if (body.gameId != null && body.gameId !== '') {
    const raw = String(body.gameId).trim();
    if (!isSafeHubDocumentId(raw)) {
      return clientError('game_id_invalid', 400);
    }
    gameId = raw;
  } else {
    gameId = parseGameIdFromRoute(route);
  }

  const supabase = createServiceRoleClient();
  const ok = await insertTesterBugReport(supabase, userId, {
    body: message,
    category,
    route,
    gameId,
  });
  if (!ok) {
    auditApiLog('tester_bug_report', { result: 'insert_failed', user: shortId(userId) });
    return clientError('save_failed', 503);
  }

  auditApiLog('tester_bug_report', {
    result: 'ok',
    user: shortId(userId),
    route_len: route.length,
    has_game: Boolean(gameId),
  });
  return json({ ok: true });
}
