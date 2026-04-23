import { fetchFreePlaySpectatableLobby } from '@/lib/server/freePlayWatchList';

export const runtime = 'nodejs';

/**
 * Authenticated lobby: list free live seated games by PLAT mode for “Watch as spectator” discovery.
 */
export async function GET(request: Request): Promise<Response> {
  const eco = request.headers.get('x-accl-viewer-ecosystem') === 'k12' ? 'k12' : 'adult';
  try {
    const payload = await fetchFreePlaySpectatableLobby(eco);
    return Response.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'watch_list_error';
    console.error('[api/free-play/watch-list]', message);
    return Response.json({ error: 'watch_list_unavailable', message }, { status: 503 });
  }
}
