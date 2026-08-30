import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { jsonResponse } from '@/lib/server/httpJson';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const result = await createServiceRoleClient()
    .from('membership_entitlements')
    .select('entitlement,status,valid_until')
    .eq('user_id', user.id)
    .eq('status', 'active');
  if (result.error) return jsonResponse({ error: 'Could not load entitlements' }, 500);
  const now = Date.now();
  const active = (result.data ?? []).filter(
    (item) => !item.valid_until || new Date(item.valid_until).getTime() > now
  );
  return jsonResponse({
    image_generator: active.some((item) => item.entitlement === 'image_generator'),
    profile_motion: active.some((item) => item.entitlement === 'profile_motion'),
  });
}
