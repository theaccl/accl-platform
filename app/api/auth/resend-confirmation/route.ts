import { resendConfirmationPost } from '@/lib/auth/resendConfirmationHandler';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  return resendConfirmationPost(request);
}
