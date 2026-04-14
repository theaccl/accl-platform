import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { insertTesterBugReport, type TesterBugReportCategory } from '@/lib/tester/insertTesterBugReport';

export const runtime = 'nodejs';

const CATEGORIES = new Set<TesterBugReportCategory>(['bug', 'ux', 'suggestion', 'suspicious']);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) {
    auditApiLog('tester_bug_report', { result: 'unauthorized' });
    return json({ error: 'Unauthorized' }, 401);
  }

  const rl = checkRateLimit(`tester-bug-report:${userId}`, 20, 60_000);
  if (!rl.allowed) {
    auditApiLog('tester_bug_report', { result: 'rate_limited', user: shortId(userId) });
    return json(
      {
        error: 'rate_limited',
        retry_after_sec: rl.retryAfterSec,
        message: 'Too many reports. Wait before submitting another.',
      },
      429,
    );
  }

  let body: { message?: unknown; category?: unknown; route?: unknown };
  try {
    body = (await request.json()) as { message?: unknown; category?: unknown; route?: unknown };
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length < 1 || message.length > 8000) {
    return json({ error: 'message_invalid' }, 400);
  }

  let category: TesterBugReportCategory | null = null;
  if (body.category != null && body.category !== '') {
    const c = String(body.category).trim().toLowerCase();
    if (!CATEGORIES.has(c as TesterBugReportCategory)) {
      return json({ error: 'category_invalid' }, 400);
    }
    category = c as TesterBugReportCategory;
  }

  const route =
    typeof body.route === 'string' && body.route.trim()
      ? body.route.trim().slice(0, 2048)
      : new URL(request.url).pathname;

  const supabase = createServiceRoleClient();
  const ok = await insertTesterBugReport(supabase, userId, { body: message, category, route });
  if (!ok) {
    auditApiLog('tester_bug_report', { result: 'insert_failed', user: shortId(userId) });
    return json({ error: 'save_failed' }, 503);
  }

  auditApiLog('tester_bug_report', { result: 'ok', user: shortId(userId), route_len: route.length });
  return json({ ok: true });
}
