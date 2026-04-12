export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startPayoutRetryInterval } = await import('@/lib/payments/payoutRetryWorker');
    startPayoutRetryInterval();
  }
}
