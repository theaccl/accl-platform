import { payoutRequestPost } from '@/app/api/payouts/request/handler';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  return payoutRequestPost(request);
}
