import { handleEmailConfirmCallback } from '@/lib/auth/emailConfirmCallback';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  return handleEmailConfirmCallback(request);
}
