import { requireModerator } from '@/lib/moderatorAuth';
import { evaluateTesterProfileReadiness } from '@/lib/tester/testerReadiness';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Moderator-only: list tester-cohort profiles (`accl_tester = true`) with readiness evaluation.
 * Does not expose email addresses.
 */
export async function GET(request: Request): Promise<Response> {
  const guard = await requireModerator(request);
  if (!guard.ok) return json({ error: guard.error }, guard.status);

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch {
    return json({ error: 'service_unavailable', message: 'Server configuration incomplete.' }, 503);
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id,username,accl_tester')
    .eq('accl_tester', true)
    .order('username', { ascending: true, nullsFirst: false });

  if (error) {
    return json({ error: 'query_failed', message: 'Could not load tester profiles.' }, 503);
  }

  const rows = (data ?? []) as { id: string; username: string | null; accl_tester: boolean }[];
  const testers = rows.map((r) => evaluateTesterProfileReadiness(r));
  const cohort_ready = testers.filter((t) => t.cohort_ready).length;

  return json({
    policy: 'profiles.accl_tester is the cohort source of truth; /tester/* routes use auth+username only.',
    summary: {
      total_flagged: testers.length,
      cohort_ready,
      needs_attention: testers.length - cohort_ready,
    },
    testers,
  });
}
