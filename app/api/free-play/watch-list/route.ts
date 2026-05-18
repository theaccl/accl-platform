import { getSupabaseUserFromCookies } from '@/lib/auth/getSupabaseUserFromCookies';
import { fetchFreePlaySpectatableLobby } from '@/lib/server/freePlayWatchList';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
/** Seated users must not rely on a cached list that still shows their own game, or a stale pre-accept snapshot. */
export const dynamic = 'force-dynamic';

/**
 * Lobby: list free live seated games by PLAT mode for “Watch as spectator” discovery.
 * Logged-in users’ own games are excluded server-side; use session cookies.
 */
export async function GET(request: Request): Promise<Response> {
  const eco = request.headers.get('x-accl-viewer-ecosystem') === 'k12' ? 'k12' : 'adult';
  try {
    const user = await getSupabaseUserFromCookies();
    const payload = await fetchFreePlaySpectatableLobby(eco, { excludeUserId: user?.id ?? null });
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'private, no-store, must-revalidate',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'watch_list_error';
    console.error('[api/free-play/watch-list]', message);
    return NextResponse.json({ error: 'watch_list_unavailable', message }, { status: 503 });
  }
}
