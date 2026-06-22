import { depositPost } from '@/app/api/payments/deposit/handler';
import { guardRequest } from '@/lib/server/requestGuard';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const guard = guardRequest(request, 'payments');
  if (!guard.ok) return guard.response;

  try {
    return await depositPost(request);
  } finally {
    guard.release();
  }
}
