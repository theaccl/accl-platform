import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { jsonResponse } from '@/lib/server/httpJson';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const result = await createServiceRoleClient()
    .from('image_saved_creations')
    .select('id,candidate_id,generation_request_id,parent_creation_id,root_creation_id,status,created_at,updated_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });
  if (result.error) return jsonResponse({ error: 'Could not load Saved Creations' }, 500);
  return jsonResponse({ creations: result.data ?? [] }, 200, { 'Cache-Control': 'private, no-store' });
}
