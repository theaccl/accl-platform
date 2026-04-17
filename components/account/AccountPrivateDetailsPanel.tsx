'use client';

import { useState } from 'react';

export default function AccountPrivateDetailsPanel() {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-white">Private details</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          data-testid="account-private-details-toggle"
          className="shrink-0 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100"
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Not shown on your public profile. Storage backend not wired yet — placeholders only.
      </p>

      {open ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2" data-testid="account-private-details-panel">
          <input
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none"
            placeholder="Real name"
            disabled
            readOnly
            aria-label="Real name"
          />
          <input
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none"
            placeholder="Address"
            disabled
            readOnly
            aria-label="Address"
          />
          <input
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none"
            placeholder="City"
            disabled
            readOnly
            aria-label="City"
          />
          <input
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none"
            placeholder="State"
            disabled
            readOnly
            aria-label="State"
          />
          <input
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none md:col-span-2"
            placeholder="ZIP"
            disabled
            readOnly
            aria-label="ZIP"
          />
        </div>
      ) : null}
    </section>
  );
}
