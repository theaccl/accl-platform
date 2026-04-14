'use client';

import { TesterBugReportTrigger } from '@/components/TesterBugReportDialog';

/** Inline bug-report entry for NEXUS (shell stays a server component). */
export default function NexusTesterBugReportRow() {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[#243244]/50 pb-2">
      <TesterBugReportTrigger
        label="Report issue"
        className="rounded-md px-2 py-1 text-[11px] font-medium text-amber-200/90 transition hover:bg-[#151d2c]/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/45"
      />
    </div>
  );
}
