'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { publicIssueReport } from '@/lib/imageGenerator/issueReviewPolicy';

type Report = ReturnType<typeof publicIssueReport>;
const fieldClass = 'mt-2 w-full rounded-lg border border-white/20 bg-[#15121b] p-3 text-sm text-white';

export function GeneratorIssueReport({ generationId, onReplacement }: { generationId: string; onReplacement?: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('technical_failure');
  const [method, setMethod] = useState('manual');
  const [details, setDetails] = useState('');

  async function requestReport(submit: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in to report this commission.');
      const response = await fetch(`/api/image-generations/${generationId}/issues`, {
        method: submit ? 'POST' : 'GET', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(submit ? { body: JSON.stringify({ category, details, review_method: method }) } : {}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load the report.');
      setReport(body.report);
      setLoaded(true);
      if (body.report?.status === 'approved' && body.report.replacement_amount > 0) void onReplacement?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the report. Check its status or retry safely.');
    } finally { setBusy(false); }
  }

  return <section className="mt-6 rounded-2xl border border-white/15 p-5">
    <button type="button" aria-expanded={open} aria-controls="generator-issue-form" className="min-h-11 text-sm underline"
      onClick={() => { setOpen(!open); if (!open && !loaded) void requestReport(false); }}>Report a generator issue</button>
    {open ? <div id="generator-issue-form" className="mt-3">
      <p className="text-sm text-white/70">Tokens are used when processing begins. Reporting an issue does not return a token immediately. If review confirms a legitimate generator issue, the spent token is replaced once.</p>
      <p className="mt-2 text-sm text-white/70">Your report allows authorized reviewers to inspect this commission privately. AI review may send the prompt and candidate images to ACCL’s configured review provider. Uncertain AI reviews go to a person.</p>
      {error ? <p role="alert" className="mt-3 text-amber-200">{error}</p> : null}
      {report ? <div className="mt-4" role="status">
        <p>{report.status === 'approved' ? (report.replacement_amount > 0 ? 'Issue confirmed — 1 token replaced.' : 'Issue confirmed — no additional token was due (already returned or no token charged).')
          : report.status === 'rejected' ? 'Review complete — no replacement approved.'
          : report.status === 'pending_manual' ? 'Waiting for manual review.' : 'AI review is in progress.'}</p>
        {report.resolution_note ? <p className="mt-2 text-sm text-white/70">{report.resolution_note}</p> : null}
      </div> : loaded ? <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void requestReport(true); }}>
        <div className="text-sm"><label htmlFor="generator-issue-category">Issue type</label><select id="generator-issue-category" className={fieldClass} value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="technical_failure">Technical failure</option><option value="unusable_result">Unusable result</option>
          <option value="prompt_mismatch">Result missed my direction</option><option value="other">Other generator issue</option>
        </select></div>
        <label className="block text-sm">What went wrong?<textarea required minLength={10} maxLength={2000} rows={4} className={fieldClass}
          value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Describe the problem and which candidates are affected." /></label>
        <div className="text-sm"><label htmlFor="generator-issue-method">Review method</label><select id="generator-issue-method" className={fieldClass} value={method} onChange={(event) => setMethod(event.target.value)}>
          <option value="manual">Manual review</option><option value="ai">AI review, with manual fallback</option>
        </select></div>
        <button disabled={busy || details.trim().length < 10} className="min-h-11 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-black disabled:opacity-50">
          {busy ? 'Submitting for review…' : 'Submit issue report'}</button>
      </form> : null}
      <button type="button" disabled={busy} onClick={() => void requestReport(false)} className="mt-3 min-h-11 text-sm underline disabled:opacity-50">{busy ? 'Checking review…' : 'Refresh report status'}</button>
    </div> : null}
  </section>;
}
