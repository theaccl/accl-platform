'use client';

import { useState } from 'react';

export default function AccountBillingPanel() {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-white">Payment and billing</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          data-testid="account-billing-toggle"
          className="shrink-0 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100"
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      {open ? (
        <div className="mt-6 text-slate-300" data-testid="account-billing-panel">
          Billing / card management will appear here when connected.
        </div>
      ) : null}
    </section>
  );
}
