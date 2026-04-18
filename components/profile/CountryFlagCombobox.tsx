'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { flagEmojiFromIso2, formatFlagDisplay } from '@/lib/flagDisplay';
import countries from 'i18n-iso-countries';

export type CountryFlagComboboxProps = {
  id: string;
  value: string;
  onChange: (isoCode: string) => void;
  disabled?: boolean;
};

function buildOptions() {
  const raw = countries.getNames('en', { select: 'official' });
  const rows = Object.entries(raw).map(([code, name]) => ({
    code,
    name,
    emoji: flagEmojiFromIso2(code),
  }));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return [{ code: '', name: '— None —', emoji: null as string | null }, ...rows, { code: 'OTHER', name: 'Other / prefer not to say', emoji: null }];
}

const ALL_OPTIONS = buildOptions();

export default function CountryFlagCombobox({ id, value, onChange, disabled }: CountryFlagComboboxProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) {
      return ALL_OPTIONS;
    }
    return ALL_OPTIONS.filter(
      (o) =>
        o.name.toLowerCase().includes(needle) || o.code.toLowerCase().includes(needle),
    );
  }, [q]);

  const summary = useMemo(() => {
    const v = value.trim();
    if (!v) {
      return 'Select country…';
    }
    return formatFlagDisplay(v) ?? v;
  }, [value]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-left text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="edit-profile-flag-trigger"
      >
        <span className="min-w-0 truncate">{summary}</span>
        <span className="shrink-0 text-slate-500" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-hidden rounded-xl border border-slate-700 bg-[#0f1723] shadow-xl shadow-black/40"
          role="listbox"
          aria-labelledby={id}
        >
          <div className="border-b border-slate-800 p-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search country or code…"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600"
              autoFocus
              data-testid="edit-profile-flag-search"
            />
          </div>
          <ul className="max-h-56 overflow-auto py-1">
            {filtered.map((o) => (
              <li key={o.code || 'none'}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.code === value.trim()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800"
                  onClick={() => {
                    onChange(o.code);
                    setOpen(false);
                    setQ('');
                  }}
                  data-testid={o.code ? `edit-profile-flag-option-${o.code}` : 'edit-profile-flag-option-none'}
                >
                  {o.emoji ? <span className="text-lg leading-none">{o.emoji}</span> : null}
                  <span className="min-w-0 flex-1">
                    {o.name}
                    {o.code && o.code !== 'OTHER' ? (
                      <span className="ml-2 text-xs text-slate-500">{o.code}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
