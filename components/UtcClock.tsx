'use client';

import { useEffect, useState } from 'react';

const UTC_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function utcParts(d: Date) {
  const y = d.getUTCFullYear();
  const mon = UTC_MONTHS[d.getUTCMonth()];
  const day = d.getUTCDate();
  const h = pad2(d.getUTCHours());
  const min = pad2(d.getUTCMinutes());
  const s = pad2(d.getUTCSeconds());
  return {
    dateLine: `${mon} ${day}, ${y}`,
    timeLine: `${h}:${min}:${s}`,
  };
}

function formatUtcInline(d: Date): string {
  const { dateLine, timeLine } = utcParts(d);
  return `UTC • ${dateLine} • ${timeLine}`;
}

type UtcClockProps = {
  className?: string;
  /** `stacked` = label / large time / date (Nexus). `inline` = single line. */
  variant?: 'inline' | 'stacked';
};

/**
 * Live wall clock in UTC only (getUTC*). Updates every second; clears interval on unmount.
 */
export function UtcClock({ className = '', variant = 'inline' }: UtcClockProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (variant === 'stacked') {
    const { dateLine, timeLine } = utcParts(now);
    return (
      <div
        className={`flex flex-col items-center text-center ${className}`.trim()}
        role="timer"
        aria-live="off"
        title="Current time in Coordinated Universal Time (UTC)"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-400/95">UTC</span>
        <span className="mt-1 text-xl font-semibold tabular-nums leading-none tracking-tight text-sky-100 sm:text-2xl">
          {timeLine}
        </span>
        <span className="mt-1.5 text-[12px] font-medium tabular-nums text-sky-300/90">{dateLine}</span>
      </div>
    );
  }

  return (
    <p
      className={className}
      role="timer"
      aria-live="off"
      title="Current time in Coordinated Universal Time (UTC)"
    >
      {formatUtcInline(now)}
    </p>
  );
}
