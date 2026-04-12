'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  applyModeratorEnforcementOverride,
  applyModeratorQueueAction,
  fetchModeratorEnforcementOverrideHistory,
  fetchModeratorEnforcementState,
  type ModeratorEnforcementOverrideHistoryRow,
  type ModeratorEnforcementStateResponse,
  fetchModeratorQueueDetail,
  type ModeratorQueueDetailResponse,
} from '@/lib/moderatorDashboardApi';
import { isResolutionNoteRequired } from '@/lib/moderatorDashboardModel';

type Props = { queueId: string };

function renderReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return ['No suspicion reasons recorded'];
  return value.map((entry) => JSON.stringify(entry));
}

export function ModeratorQueueDetail({ queueId }: Props) {
  const [detail, setDetail] = useState<ModeratorQueueDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState<'MARK_IN_REVIEW' | 'MARK_RESOLVED' | 'MARK_DISMISSED'>('MARK_IN_REVIEW');
  const [moderatorNote, setModeratorNote] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [enforcement, setEnforcement] = useState<ModeratorEnforcementStateResponse | null>(null);
  const [overrideHistory, setOverrideHistory] = useState<ModeratorEnforcementOverrideHistoryRow[]>([]);
  const [enforcementLoading, setEnforcementLoading] = useState(true);
  const [enforcementError, setEnforcementError] = useState('');
  const [overrideAction, setOverrideAction] = useState<
    'CLEAR_RESTRICTION' | 'TEMPORARY_UNLOCK' | 'KEEP_LOCKED_PENDING_REVIEW'
  >('CLEAR_RESTRICTION');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideExpiresAt, setOverrideExpiresAt] = useState('');
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideStatus, setOverrideStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const payload = await fetchModeratorQueueDetail(queueId);
        if (cancelled) return;
        setDetail(payload);
        setModeratorNote(payload.queue.moderator_note ?? '');
        setResolutionNote(payload.queue.resolution_note ?? '');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load queue detail');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queueId]);

  useEffect(() => {
    if (!detail?.queue.user_id) return;
    let cancelled = false;
    void (async () => {
      setEnforcementLoading(true);
      setEnforcementError('');
      try {
        const [statePayload, historyPayload] = await Promise.all([
          fetchModeratorEnforcementState(detail.queue.user_id),
          fetchModeratorEnforcementOverrideHistory(detail.queue.user_id),
        ]);
        if (cancelled) return;
        setEnforcement(statePayload);
        setOverrideHistory(historyPayload.items);
      } catch (e) {
        if (cancelled) return;
        setEnforcementError(e instanceof Error ? e.message : 'Failed to load enforcement state');
      } finally {
        if (!cancelled) setEnforcementLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detail?.queue.user_id]);

  const submitAction = async () => {
    if (!detail) return;
    if (isResolutionNoteRequired(action) && !resolutionNote.trim()) {
      setError('Resolution note is required for resolved or dismissed actions.');
      return;
    }
    setActionBusy(true);
    setError('');
    try {
      const updated = await applyModeratorQueueAction({
        queueId: detail.queue.id,
        action,
        note: moderatorNote,
        resolution_note: resolutionNote,
      });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              queue: {
                ...prev.queue,
                queue_status: updated.queue.queue_status,
                assigned_to: updated.queue.assigned_to,
                moderator_note: updated.queue.moderator_note,
                resolution_note: updated.queue.resolution_note,
                updated_at: updated.queue.updated_at,
              },
            }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionBusy(false);
    }
  };

  const submitEnforcementOverride = async () => {
    if (!detail) return;
    if (!overrideReason.trim()) {
      setEnforcementError('Override reason is required.');
      return;
    }
    if (overrideAction === 'TEMPORARY_UNLOCK' && !overrideExpiresAt.trim()) {
      setEnforcementError('Expiration is required for TEMPORARY_UNLOCK.');
      return;
    }
    setOverrideBusy(true);
    setOverrideStatus('');
    setEnforcementError('');
    try {
      const expiresAtIso =
        overrideAction === 'TEMPORARY_UNLOCK' && overrideExpiresAt
          ? new Date(overrideExpiresAt).toISOString()
          : null;
      await applyModeratorEnforcementOverride({
        user_id: detail.queue.user_id,
        action: overrideAction,
        reason: overrideReason.trim(),
        expires_at: expiresAtIso,
      });
      const [statePayload, historyPayload] = await Promise.all([
        fetchModeratorEnforcementState(detail.queue.user_id),
        fetchModeratorEnforcementOverrideHistory(detail.queue.user_id),
      ]);
      setEnforcement(statePayload);
      setOverrideHistory(historyPayload.items);
      setOverrideStatus('Enforcement override applied.');
    } catch (e) {
      setEnforcementError(e instanceof Error ? e.message : 'Enforcement override failed');
    } finally {
      setOverrideBusy(false);
    }
  };

  if (loading) {
    return (
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
        <p>Loading moderator detail…</p>
      </main>
    );
  }

  if (!detail) {
    return (
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
        <p role="alert">{error || 'Queue detail unavailable.'}</p>
        <p>
          <Link href="/moderator" style={{ color: '#93c5fd' }}>
            Back to queue
          </Link>
        </p>
      </main>
    );
  }

  const reasons = renderReasons(detail.review_context.suspicion_reasons);

  return (
    <main data-testid="moderator-detail-root" style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px 40px' }}>
      <h1 style={{ marginTop: 0 }}>Queue Review Detail</h1>
      <p style={{ marginTop: 0 }}>
        <Link href="/moderator" style={{ color: '#93c5fd' }}>
          ← Back to queue
        </Link>
      </p>
      {error ? (
        <p role="alert" style={{ color: '#fecaca' }}>
          {error}
        </p>
      ) : null}

      <section style={{ border: '1px solid #243244', borderRadius: 10, padding: 12, background: '#111a27' }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Queue Summary</h2>
        <p style={{ margin: '6px 0 0 0', color: '#cbd5e1' }}>
          Queue: {detail.queue.id} · Status: {detail.queue.queue_status}
        </p>
        <p style={{ margin: '6px 0 0 0', color: '#cbd5e1' }}>
          User: {detail.queue.user_id} · Game: {detail.queue.game_id ?? '—'} · Anti-cheat event:{' '}
          {detail.queue.anti_cheat_event_id ?? '—'}
        </p>
        <p style={{ margin: '6px 0 0 0', color: '#cbd5e1' }}>
          Tier: {detail.queue.suspicion_tier} · Score: {detail.queue.suspicion_score} · Recommendation:{' '}
          {detail.review_context.recommendation}
        </p>
        <p style={{ margin: '6px 0 0 0', color: '#9fb0c5', fontSize: 12 }}>
          Overlap verdict context: {detail.review_context.overlap_verdict}
        </p>
      </section>

      <section style={{ border: '1px solid #243244', borderRadius: 10, padding: 12, background: '#111a27', marginTop: 12 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Suspicion Reasons</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {reasons.map((entry, idx) => (
            <li key={`${idx}-${entry}`} style={{ color: '#cbd5e1', fontSize: 13, marginBottom: 6 }}>
              {entry}
            </li>
          ))}
        </ul>
      </section>

      <section style={{ border: '1px solid #243244', borderRadius: 10, padding: 12, background: '#111a27', marginTop: 12 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Linked Anti-Cheat Event Summary</h2>
        {detail.review_context.linked_anti_cheat_events.length === 0 ? (
          <p style={{ margin: 0, color: '#cbd5e1' }}>No linked events found.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {detail.review_context.linked_anti_cheat_events.map((event) => (
              <article key={event.id} style={{ border: '1px solid #2f3f54', borderRadius: 8, padding: 8 }}>
                <p style={{ margin: 0, color: '#e2e8f0', fontSize: 13 }}>
                  {event.id} · {new Date(event.created_at).toLocaleString()}
                </p>
                <p style={{ margin: '4px 0 0 0', color: '#9fb0c5', fontSize: 12 }}>
                  Tier {event.suspicion_tier} · Score {event.suspicion_score} · Overlap {event.overlap_verdict}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={{ border: '1px solid #243244', borderRadius: 10, padding: 12, background: '#111a27', marginTop: 12 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Moderator Action</h2>
        <select value={action} onChange={(e) => setAction(e.target.value as never)} data-testid="moderator-action-select">
          <option value="MARK_IN_REVIEW">MARK_IN_REVIEW</option>
          <option value="MARK_RESOLVED">MARK_RESOLVED</option>
          <option value="MARK_DISMISSED">MARK_DISMISSED</option>
        </select>
        <textarea
          data-testid="moderator-note-input"
          value={moderatorNote}
          onChange={(e) => setModeratorNote(e.target.value)}
          placeholder="Moderator note (used for in-review action)"
          rows={3}
          style={{ width: '100%', marginTop: 8 }}
        />
        <textarea
          data-testid="moderator-resolution-note-input"
          value={resolutionNote}
          onChange={(e) => setResolutionNote(e.target.value)}
          placeholder="Resolution note (required for resolved/dismissed)"
          rows={3}
          style={{ width: '100%', marginTop: 8 }}
        />
        <button type="button" data-testid="moderator-action-submit" onClick={() => void submitAction()} disabled={actionBusy}>
          {actionBusy ? 'Applying…' : 'Apply action'}
        </button>
        <p style={{ margin: '8px 0 0 0', color: '#9fb0c5', fontSize: 12 }}>
          Current state: {detail.queue.queue_status} · Assigned to: {detail.queue.assigned_to ?? 'unassigned'}
        </p>
      </section>

      <section
        data-testid="moderator-enforcement-section"
        style={{ border: '1px solid #243244', borderRadius: 10, padding: 12, background: '#111a27', marginTop: 12 }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Enforcement Controls</h2>
        {enforcementLoading ? <p style={{ margin: 0, color: '#cbd5e1' }}>Loading enforcement state…</p> : null}
        {enforcementError ? (
          <p role="alert" data-testid="moderator-enforcement-error" style={{ color: '#fecaca' }}>
            {enforcementError}
          </p>
        ) : null}
        {overrideStatus ? (
          <p role="status" data-testid="moderator-enforcement-success" style={{ color: '#86efac' }}>
            {overrideStatus}
          </p>
        ) : null}
        {enforcement ? (
          <div data-testid="moderator-enforcement-state" style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.5 }}>
            <p style={{ margin: '6px 0 0 0' }}>Baseline: {enforcement.baseline_state}</p>
            <p style={{ margin: '6px 0 0 0' }}>Effective: {enforcement.effective_state}</p>
            <p style={{ margin: '6px 0 0 0' }}>Source: {enforcement.source}</p>
            <p style={{ margin: '6px 0 0 0' }}>Source suspicion tier: {enforcement.source_suspicion_tier ?? '—'}</p>
            <p style={{ margin: '6px 0 0 0' }}>Source recommended action: {enforcement.source_recommended_action ?? '—'}</p>
            <p style={{ margin: '6px 0 0 0' }}>Override action: {enforcement.override_action ?? '—'}</p>
            <p style={{ margin: '6px 0 0 0' }}>Override reason: {enforcement.override_reason ?? '—'}</p>
            <p style={{ margin: '6px 0 0 0' }}>Override expiration: {enforcement.override_expires_at ?? '—'}</p>
            <p style={{ margin: '6px 0 0 0' }}>Created at: {enforcement.created_at ?? '—'}</p>
            <p style={{ margin: '6px 0 0 0' }}>Updated at: {enforcement.updated_at ?? '—'}</p>
          </div>
        ) : null}
        <div style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Apply Override</h3>
          <select
            value={overrideAction}
            onChange={(e) => setOverrideAction(e.target.value as typeof overrideAction)}
            data-testid="moderator-enforcement-action-select"
          >
            <option value="CLEAR_RESTRICTION">CLEAR_RESTRICTION</option>
            <option value="TEMPORARY_UNLOCK">TEMPORARY_UNLOCK</option>
            <option value="KEEP_LOCKED_PENDING_REVIEW">KEEP_LOCKED_PENDING_REVIEW</option>
          </select>
          <textarea
            data-testid="moderator-enforcement-reason-input"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Reason (required)"
            rows={3}
            style={{ width: '100%', marginTop: 8 }}
          />
          <input
            data-testid="moderator-enforcement-expires-input"
            type="datetime-local"
            value={overrideExpiresAt}
            onChange={(e) => setOverrideExpiresAt(e.target.value)}
            style={{ width: '100%', marginTop: 8 }}
          />
          <button
            type="button"
            data-testid="moderator-enforcement-submit"
            onClick={() => void submitEnforcementOverride()}
            disabled={overrideBusy}
          >
            {overrideBusy ? 'Applying…' : 'Apply enforcement override'}
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Recent Override History</h3>
          {overrideHistory.length === 0 ? (
            <p style={{ margin: 0, color: '#cbd5e1' }}>No override history recorded.</p>
          ) : (
            <ul data-testid="moderator-enforcement-history" style={{ margin: 0, paddingLeft: 18 }}>
              {overrideHistory.map((row, idx) => (
                <li key={`${row.created_at}-${idx}`} style={{ color: '#cbd5e1', fontSize: 13, marginBottom: 6 }}>
                  {row.created_at} · {row.action} · by {row.acted_by} · reason: {row.reason ?? '—'} · expires:{' '}
                  {row.expires_at ?? '—'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
