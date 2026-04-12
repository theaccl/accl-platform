/** Internal-only auth for payment operator routes (server-side). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function verifyInternalPaymentsSecret(request: Request): boolean {
  const expected =
    process.env.ACCL_INTERNAL_PAYMENTS_SECRET?.trim() ||
    process.env.ACCL_ANALYSIS_QUEUE_SECRET?.trim() ||
    '';
  if (!expected) return false;
  const header = request.headers.get('x-accl-internal-payments-secret') ?? '';
  return timingSafeEqual(header, expected);
}
