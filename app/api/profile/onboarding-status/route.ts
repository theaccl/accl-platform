import { onboardingStatusGet } from './handler';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  return onboardingStatusGet(request);
}
