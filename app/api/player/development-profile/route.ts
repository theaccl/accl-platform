import { createClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import {
  buildSkillSummaryFromSignals,
  generateDevelopmentInsights,
  generateImprovementSuggestions,
  type PlayerSkillSummary,
} from '@/lib/trainer/skillAggregation';

export const runtime = 'nodejs';

const nativeFetch = globalThis.fetch.bind(globalThis);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function resolveAuthenticatedUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return null;
  const token = m[1]?.trim();
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: nativeFetch },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error) return null;
  return data.user?.id ?? null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? '').trim()).filter(Boolean);
}

export async function GET(request: Request): Promise<Response> {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Service configuration error' }, 503);
  }

  const { data: profile } = await supabase
    .from('player_pattern_profiles')
    .select('pattern_tags,suggested_themes,updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  const { count: trainerN } = await supabase
    .from('trainer_generated_positions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const pattern_tags = asStringArray(profile?.pattern_tags);
  const suggested_themes = asStringArray(profile?.suggested_themes);
  const trainer_position_count = Math.min(50, trainerN ?? 0);

  const summary: PlayerSkillSummary = buildSkillSummaryFromSignals({
    pattern_tags,
    suggested_themes,
    trainer_position_count,
    profile_updated_at: profile?.updated_at ?? null,
  });

  const k12 = request.headers.get('x-accl-ecosystem') === 'k12';

  return json({
    ok: true,
    player_skill_summary: summary,
    skill_category_scores: summary.skill_category_scores,
    insights: generateDevelopmentInsights(summary, k12),
    suggestions: generateImprovementSuggestions(summary, k12),
    last_updated: summary.last_updated,
  });
}
