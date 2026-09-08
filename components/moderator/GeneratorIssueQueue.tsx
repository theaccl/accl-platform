'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { publicIssueReport } from '@/lib/imageGenerator/issueReviewPolicy';

type Report = ReturnType<typeof publicIssueReport>;
type Evidence = { report: Report; generation: { prompt: string; status: string; reference_id: string | null; reference_id_2: string | null; parent_saved_creation_id: string | null };
  ai_assessment?: { assessment?: { explanation?: string }; reason?: string } | null;
  refinements: Array<{ guidance: string; status: string }>;
  images: Array<{ id: string; ordinal: number; status: string; url: string | null }> };

async function reviewRequest(path: string, body?: unknown) {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('Sign in with your moderator account.');
  const response = await fetch(`/api/moderator/generator-issues${path}`, { cache: 'no-store',
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Review request failed.');
  return result;
}

export function GeneratorIssueQueue() {
  const [reports, setReports] = useState<Report[]>([]);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    try { setReports((await reviewRequest('')).reports); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load reports.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function open(id: string) {
    setBusy(true); setEvidence(null); setNote(''); setMessage(null);
    try { setEvidence(await reviewRequest(`/${id}`)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load evidence.'); }
    finally { setBusy(false); }
  }
  async function decide(decision: 'approved' | 'rejected') {
    if (!evidence || busy) return;
    setBusy(true);
    try {
      const result = await reviewRequest(`/${evidence.report.id}`, { decision, note });
      setEvidence(null);
      setMessage(result.report.status === 'approved' ? `Review saved. ${result.report.replacement_amount} token replaced.` : 'Review saved. No replacement approved.');
      setReports((items) => items.filter((item) => item.id !== result.report.id));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save decision.'); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-5xl space-y-5 p-6">
    <h1 className="text-2xl font-semibold">Generator issue reviews</h1>
    <p className="text-sm">Review the reported problem and available evidence. Approve legitimate generator issues; a previously returned token cannot be replaced again.</p>
    <button disabled={busy} onClick={() => void load()} className="min-h-11 underline">Refresh queue</button>
    {message ? <p role="status">{message}</p> : null}
    {!reports.length && !busy ? <p>No pending reports.</p> : null}
    <ul className="space-y-2">{reports.map((report) => <li key={report.id}>
      <button disabled={busy} onClick={() => void open(report.id)} className="w-full rounded-lg border border-white/20 p-3 text-left">
        {report.category.replaceAll('_', ' ')} · {report.status.replaceAll('_', ' ')} · {new Date(report.created_at).toLocaleString()}<br />
        <span className="text-sm">{report.details.slice(0, 180)}</span>
      </button>
    </li>)}</ul>
    {reports.length === 50 ? <p>Showing the 50 oldest pending reports. Resolve reports and refresh to continue.</p> : null}
    {evidence ? <section className="space-y-4 rounded-xl border border-white/20 p-4" aria-label="Report evidence">
      <h2 className="text-xl font-semibold">Reported issue</h2><p className="whitespace-pre-wrap">{evidence.report.details}</p>
      {evidence.ai_assessment ? <p className="text-sm">AI review notes (advisory): {evidence.ai_assessment.assessment?.explanation ?? evidence.report.resolution_note ?? 'Manual review needed.'}</p> : null}
      <h3 className="font-semibold">Original direction</h3><p className="whitespace-pre-wrap">{evidence.generation.prompt}</p>
      <p>Commission status: {evidence.generation.status}</p>
      {evidence.generation.reference_id || evidence.generation.reference_id_2 || evidence.generation.parent_saved_creation_id
        ? <p className="text-amber-200">This commission used additional reference or saved-creation context. It is not included here. Obtain sufficient evidence before deciding.</p> : null}
      {evidence.refinements.map((item, index) => <p key={index}>Guided refinement ({item.status}): {item.guidance}</p>)}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{evidence.images.map((item) => <figure key={item.id}>
        {/* Short-lived private evidence must not enter an image optimizer cache. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {item.url ? <img src={item.url} alt={`Private candidate ${item.ordinal}`} referrerPolicy="no-referrer" className="aspect-square w-full object-contain" /> : <p>Original unavailable</p>}
        <figcaption>Candidate {item.ordinal} · {item.status}</figcaption>
      </figure>)}</div>
      <button disabled={busy} onClick={() => void open(evidence.report.id)} className="min-h-11 underline">Refresh private evidence</button>
      <label className="block">Decision reason (visible to the player)<textarea value={note} onChange={(event) => setNote(event.target.value)} minLength={10} maxLength={1000}
        className="mt-2 block w-full rounded-lg border border-white/20 bg-black/20 p-3" rows={3} /></label>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy || note.trim().length < 10} onClick={() => void decide('approved')} className="min-h-11 rounded-lg bg-amber-300 px-4 text-black disabled:opacity-40">Approve issue and replace eligible token</button>
        <button disabled={busy || note.trim().length < 10} onClick={() => void decide('rejected')} className="min-h-11 rounded-lg border border-white/30 px-4 disabled:opacity-40">Decline replacement</button>
      </div>
    </section> : null}
  </div>;
}
