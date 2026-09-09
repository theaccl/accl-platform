import Link from 'next/link';
import { Coins, Compass, Scale } from 'lucide-react';

// balance is the server's total spendable amount. purchased_balance is a
// protected subset, not an extra amount for the browser to add to the total.
export type GeneratorWalletBalance = { balance: number | null; purchased_balance?: number | null; unlimited?: boolean };
export type GeneratorWalletStatus = 'loading' | 'signed_out' | 'ready' | 'error';

type GeneratorWalletsProps = {
  status: GeneratorWalletStatus;
  generation: GeneratorWalletBalance;
  guidance?: GeneratorWalletBalance;
  compare?: GeneratorWalletBalance;
};

function walletDisplay(status: GeneratorWalletStatus, wallet?: GeneratorWalletBalance) {
  if (status === 'loading') return { amount: '…', detail: 'Loading' };
  if (status === 'signed_out') return { amount: '—', detail: 'Sign in' };
  if (status === 'error') return { amount: '—', detail: 'Unavailable' };
  if (!wallet) return { amount: '—', detail: 'Coming soon' };
  if (wallet.unlimited === true) return { amount: '∞', detail: 'Unlimited' };
  if (wallet.balance === null || !Number.isSafeInteger(wallet.balance) || wallet.balance < 0) {
    return { amount: '—', detail: 'Unavailable' };
  }
  return { amount: String(wallet.balance), detail: wallet.balance === 1 ? 'Token' : 'Tokens' };
}

export function GeneratorWallets({ status, generation, guidance, compare }: GeneratorWalletsProps) {
  const wallets = [
    { key: 'generation', label: 'Generation', icon: Coins, balance: generation, color: 'text-amber-200', border: 'border-amber-300/25', glow: 'from-amber-300/[0.09]' },
    { key: 'guidance', label: 'Guidance', icon: Compass, balance: guidance, color: 'text-sky-200', border: 'border-sky-300/20', glow: 'from-sky-300/[0.07]' },
    { key: 'compare', label: 'Compare', icon: Scale, balance: compare, color: 'text-violet-200', border: 'border-violet-300/20', glow: 'from-violet-300/[0.08]' },
  ] as const;

  return (
    <section aria-labelledby="generator-wallets-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="generator-wallets-title" className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Your wallets</h2>
        <Link href={status === 'signed_out' ? '/login?next=/image-generator' : '/vault'} className="inline-flex min-h-10 items-center rounded-md px-1 text-xs font-semibold text-amber-200 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
          {status === 'signed_out' ? 'Sign in' : 'View Vault'}
        </Link>
      </div>
      <dl className="grid auto-cols-[minmax(11rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2" aria-busy={status === 'loading'}>
        {wallets.map((wallet) => {
          const display = walletDisplay(status, wallet.balance);
          const Icon = wallet.icon;
          return (
            <div key={wallet.key} data-wallet={wallet.key} className={`flex aspect-square min-w-0 flex-col items-center justify-center gap-3 rounded-xl border ${wallet.border} bg-gradient-to-br ${wallet.glow} to-black/30 p-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-2xl`}>
              <Icon className={`h-4 w-4 shrink-0 ${wallet.color}`} aria-hidden="true" />
              <dt className="text-xs font-semibold text-white/85">{wallet.label}</dt>
              <dd className="min-w-0 w-full">
                <span data-wallet-total className={`block break-all font-mono text-4xl font-bold leading-none tabular-nums ${wallet.color}`} aria-label={display.amount === '∞' ? 'Unlimited tokens' : undefined}>{display.amount}</span>
                <span className="mt-1 block text-[9px] text-white/55 sm:text-[10px]">{display.detail === 'Token' || display.detail === 'Tokens' ? 'Available' : display.detail}</span>
                <span className="mt-2 flex flex-wrap items-center justify-center gap-x-1 border-t border-white/10 pt-1 text-[9px] text-white/60 sm:text-[10px]">
                  <span>Purchased</span>
                  <span data-wallet-purchased className="break-all font-mono font-semibold tabular-nums text-white/85">{status === 'loading' ? '…' : status === 'ready' && typeof wallet.balance?.purchased_balance === 'number' && Number.isSafeInteger(wallet.balance.purchased_balance) && wallet.balance.purchased_balance >= 0 ? String(wallet.balance.purchased_balance) : '—'}</span>
                </span>

              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-2 text-[10px] leading-relaxed text-white/45">Purchased tokens are included in Available and don’t reset. Guidance and Compare actions are coming soon.</p>
    </section>
  );
}
