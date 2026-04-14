import type { ViewerEcosystem } from './chatGameAccess';

export function viewerEcosystemFromRequest(request: Request): ViewerEcosystem {
  const raw = request.headers.get('x-accl-viewer-ecosystem')?.trim().toLowerCase();
  return raw === 'k12' ? 'k12' : 'adult';
}
