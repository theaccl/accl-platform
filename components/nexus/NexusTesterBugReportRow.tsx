'use client';

import { TesterBugReportTrigger } from '@/components/TesterBugReportDialog';

/** Inline bug-report entry for NEXUS (shell stays a server component). */
export default function NexusTesterBugReportRow() {
  return (
    <div className="flex flex-col items-end gap-1 border-b border-[#243244]/50 pb-2">
      <p className="text-[10px] text-gray-500">Feedback is observational only — it does not change games.</p>
      <TesterBugReportTrigger
        label="Report issue"
        className="rounded-md px-2 py-1 text-[11px] font-medium text-amber-200/90 transition hover:bg-[#151d2c]/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/45"
      />
    </div>
  );
}
