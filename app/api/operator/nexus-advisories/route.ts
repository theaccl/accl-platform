import { requireModerator } from '@/lib/moderatorAuth';
import { mapAdvisoryToEligibleActions } from '@/lib/nexus/actionMapping';
import { rankAndDedupeAdvisories } from '@/lib/nexus/presentation';
import {
  NexusOutputRegistryService,
  SupabaseNexusOutputRegistryRepo,
} from '@/lib/nexus/outputRegistry';
import type { NexusOutputType, NexusSubjectScope } from '@/lib/nexus/contract';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const OUTPUT_TYPES: NexusOutputType[] = ['insight', 'warning', 'recommendation', 'anomaly_flag'];
const SUBJECT_SCOPES: NexusSubjectScope[] = ['player', 'game', 'system', 'moderation'];

export async function GET(request: Request): Promise<Response> {
  const guard = await requireModerator(request);
  if (!guard.ok) return json({ error: guard.error }, guard.status);

  const url = new URL(request.url);
  const outputTypeRaw = (url.searchParams.get('output_type') ?? '').trim();
  const subjectScopeRaw = (url.searchParams.get('subject_scope') ?? '').trim();
  const statusRaw = (url.searchParams.get('status') ?? 'active').trim().toLowerCase();
  const windowHours = Math.max(1, Math.min(24 * 30, parseInt(url.searchParams.get('window_hours') ?? '168', 10) || 168));
  const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') ?? '40', 10) || 40));

  const output_type = OUTPUT_TYPES.includes(outputTypeRaw as NexusOutputType)
    ? (outputTypeRaw as NexusOutputType)
    : undefined;
  const subject_scope = SUBJECT_SCOPES.includes(subjectScopeRaw as NexusSubjectScope)
    ? (subjectScopeRaw as NexusSubjectScope)
    : undefined;

  if (outputTypeRaw && !output_type) return json({ error: 'Invalid output_type filter' }, 400);
  if (subjectScopeRaw && !subject_scope) return json({ error: 'Invalid subject_scope filter' }, 400);
  if (!['all', 'active', 'expired'].includes(statusRaw)) return json({ error: 'Invalid status filter' }, 400);

  const generated_after = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

  try {
    const service = new NexusOutputRegistryService(new SupabaseNexusOutputRegistryRepo());
    const records = await service.query({
      output_type,
      subject_scope,
      generated_after,
      active_only: statusRaw === 'active',
      expired_only: statusRaw === 'expired',
      limit,
    });

    const ranked = rankAndDedupeAdvisories({
      rows: records,
      keep_expired: statusRaw !== 'active',
      keep_stale_active: true,
      stale_after_hours: 72,
      dedupe_window_hours: 72,
    });
    const items = ranked
      .map((r) => ({
        ...r,
        status: r.presentation_status,
        nexus_advisory: {
          id: r.id,
          output_type: r.output_type,
          subject_scope: r.subject_scope,
          subject_id: r.subject_id,
          confidence: r.confidence,
        },
        operator_actions: mapAdvisoryToEligibleActions(r),
      }))
      .sort((a, b) => b.display_priority - a.display_priority || Date.parse(b.generated_at) - Date.parse(a.generated_at));

    return json({
      filters: {
        output_type: output_type ?? null,
        subject_scope: subject_scope ?? null,
        status: statusRaw,
        window_hours: windowHours,
        limit,
      },
      total: items.length,
      items,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Failed to read NEXUS advisories' }, 503);
  }
}

