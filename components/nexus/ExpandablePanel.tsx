"use client";

import { startTransition, useState } from "react";

type Props = {
  title: string;
  subtitle?: string;
  statusText?: string;
  defaultExpanded?: boolean;
  collapsed: React.ReactNode;
  expanded?: React.ReactNode;
  k12?: boolean;
};

export default function ExpandablePanel({
  title,
  subtitle,
  statusText,
  defaultExpanded = false,
  collapsed,
  expanded,
  k12 = false,
}: Props) {
  const [open, setOpen] = useState(defaultExpanded);
  return (
    <section
      className={`rounded-2xl border shadow-[0_10px_35px_rgba(0,0,0,0.25)] transition overflow-x-hidden ${
        k12 ? "border-[#29435f] bg-[#0f1a2a]" : "border-[#2a3442] bg-[#111723]"
      }`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => startTransition(() => setOpen((v) => !v))}
        className={`w-full min-h-[48px] flex items-center justify-between gap-3 px-4 py-3.5 text-left border-b touch-manipulation active:bg-white/[0.04] ${
          k12 ? "border-[#20324a]" : "border-[#202938]"
        }`}
      >
        <div className="min-w-0">
          <h3 className="text-white font-semibold text-base leading-snug">{title}</h3>
          {subtitle ? <p className="text-xs text-gray-400 hidden sm:block mt-0.5">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {statusText ? (
            <span className={`text-[11px] px-2.5 py-1.5 rounded-full border max-w-[10rem] truncate ${k12 ? "border-cyan-500/30 text-cyan-200" : "border-red-500/30 text-red-200"}`}>
              {statusText}
            </span>
          ) : null}
          <span className="text-xs text-gray-300 whitespace-nowrap">{open ? "Collapse" : "Expand"}</span>
        </div>
      </button>
      <div className="p-3 sm:p-4">
        {!open ? (
          <div className="max-h-[min(65vh,18rem)] sm:max-h-64 overflow-y-auto overflow-x-hidden touch-pan-y pr-1 -mr-1">
            {collapsed}
          </div>
        ) : null}
        <div
          className={`overflow-hidden transition-all duration-300 ease-out ${
            open ? "max-h-[min(92vh,2000px)] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          {open ? (
            <div className="max-h-[min(92vh,2000px)] overflow-y-auto overflow-x-hidden touch-pan-y">{expanded ?? collapsed}</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

