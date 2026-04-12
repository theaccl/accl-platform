'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AppShellNav } from '@/components/AppShellNav';
import { fetchModeratorQueueList, type ModeratorQueueListItem } from '@/lib/moderatorDashboardApi';
import {
  MODERATOR_QUEUE_PAGE_SIZE,
  buildQueueQuery,
  canGoToNextPage,
  canGoToPreviousPage,
  type PaginationState,
  type QueueListFilters,
} from '@/lib/moderatorDashboardModel';

const initialFilters: QueueListFilters = {
  queueStatus: '',
  suspicionTier: '',
  recommendedAction: '',
  userId: '',
};

export function ModeratorQueueDashboard() {
  const [items, setItems] = useState<ModeratorQueueListItem[]>([]);
  const [filters, setFilters] = useState<QueueListFilters>(initialFilters);
  const [pagination, setPagination] = useState<PaginationState>({
    total: 0,
    limit: MODERATOR_QUEUE_PAGE_SIZE,
    offset: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = buildQueueQuery(filters, pagination);
      const payload = await fetchModeratorQueueList(query);
      setItems(payload.items);
      setPagination(payload.pagination);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.offset, pagination.limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const onApplyFilters = () => {
    setPagination((prev) => ({ ...prev, offset: 0 }));
  };

  return (
    <main data-testid="moderator-queue-root" style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <h1 style={{ marginTop: 0 }}>Moderator Queue</h1>
      <AppShellNav omitProfile />
      <p style={{ color: '#9fb0c5', marginTop: 0 }}>
        Review queue records and apply moderation status actions only.
      </p>

      <section style={{ border: '1px solid #243244', borderRadius: 10, padding: 12, background: '#111a27' }}>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <select
            data-testid="moderator-filter-status"
            value={filters.queueStatus}
            onChange={(e) => setFilters((prev) => ({ ...prev, queueStatus: e.target.value as never }))}
          >
            <option value="">All statuses</option>
            <option value="OPEN">OPEN</option>
            <option value="IN_REVIEW">IN_REVIEW</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="DISMISSED">DISMISSED</option>
          </select>
          <select
            data-testid="moderator-filter-tier"
            value={filters.suspicionTier}
            onChange={(e) => setFilters((prev) => ({ ...prev, suspicionTier: e.target.value as never }))}
          >
            <option value="">All tiers</option>
            <option value="SOFT_LOCK_RECOMMENDED">SOFT_LOCK_RECOMMENDED</option>
            <option value="ESCALATE_REVIEW">ESCALATE_REVIEW</option>
          </select>
          <select
            data-testid="moderator-filter-recommendation"
            value={filters.recommendedAction}
            onChange={(e) => setFilters((prev) => ({ ...prev, recommendedAction: e.target.value as never }))}
          >
            <option value="">All recommendations</option>
            <option value="NO_ACTION">NO_ACTION</option>
            <option value="MONITOR">MONITOR</option>
            <option value="FLAG_ACCOUNT">FLAG_ACCOUNT</option>
            <option value="RESTRICT_ANALYSIS_ACCESS">RESTRICT_ANALYSIS_ACCESS</option>
            <option value="SEND_TO_MODERATOR_QUEUE">SEND_TO_MODERATOR_QUEUE</option>
          </select>
          <input
            data-testid="moderator-filter-user"
            type="text"
            value={filters.userId}
            onChange={(e) => setFilters((prev) => ({ ...prev, userId: e.target.value }))}
            placeholder="Filter by user id"
          />
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button type="button" data-testid="moderator-filter-apply" onClick={onApplyFilters}>
            Apply filters
          </button>
          <button
            type="button"
            data-testid="moderator-filter-reset"
            onClick={() => {
              setFilters(initialFilters);
              setPagination((prev) => ({ ...prev, offset: 0 }));
            }}
          >
            Reset
          </button>
        </div>
      </section>

      {error ? (
        <p role="alert" style={{ color: '#fecaca' }}>
          {error}
        </p>
      ) : null}

      {loading ? <p>Loading queue…</p> : null}

      {!loading ? (
        <section data-testid="moderator-queue-list" style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          {items.length === 0 ? (
            <p style={{ color: '#cbd5e1' }}>No queue records match current filters.</p>
          ) : (
            items.map((item) => (
              <article
                key={item.id}
                data-testid={`moderator-queue-row-${item.id}`}
                style={{ border: '1px solid #243244', borderRadius: 10, padding: 12, background: '#111a27' }}
              >
                <p style={{ margin: 0, color: '#f8fafc', fontWeight: 700 }}>
                  Queue #{item.id.slice(0, 8)} · {item.queue_status}
                </p>
                <p style={{ margin: '6px 0 0 0', color: '#cbd5e1', fontSize: 13 }}>
                  Tier: {item.suspicion_tier} · Score: {item.suspicion_score} · Recommendation: {item.recommended_action}
                </p>
                <p style={{ margin: '6px 0 0 0', color: '#9fb0c5', fontSize: 12 }}>
                  User: {item.user_id} · Game: {item.game_id ?? '—'} · Created: {new Date(item.created_at).toLocaleString()}
                </p>
                <p style={{ margin: '8px 0 0 0' }}>
                  <Link href={`/moderator/queue/${item.id}`} style={{ color: '#93c5fd' }}>
                    Open review detail
                  </Link>
                </p>
              </article>
            ))
          )}
        </section>
      ) : null}

      <section style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          data-testid="moderator-page-prev"
          disabled={!canGoToPreviousPage(pagination)}
          onClick={() =>
            setPagination((prev) => ({
              ...prev,
              offset: Math.max(0, prev.offset - prev.limit),
            }))
          }
        >
          Previous
        </button>
        <button
          type="button"
          data-testid="moderator-page-next"
          disabled={!canGoToNextPage(pagination)}
          onClick={() =>
            setPagination((prev) => ({
              ...prev,
              offset: prev.offset + prev.limit,
            }))
          }
        >
          Next
        </button>
        <span style={{ color: '#cbd5e1', fontSize: 13 }}>
          Showing {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)} of{' '}
          {pagination.total}
        </span>
      </section>
    </main>
  );
}
