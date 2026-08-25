'use client';

import { useCallback, useMemo, useState } from 'react';
import { ExpandedRatingTickerDrawer } from '@/components/profile/ratings/ExpandedRatingTickerDrawer';
import styles from '@/components/profile/ratings/landscapeRatingTicker.module.css';
import type { RatingLane } from '@/lib/ratingHistoryMetrics';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import { LANDSCAPE_TICKER_CROSSING_HISTORY } from './landscapeTickerCrossingFixture';

type HarnessOptions = {
  open?: boolean;
  empty?: boolean;
  crossing?: boolean;
};

function readOptions(): HarnessOptions {
  const fromWindow =
    typeof window !== 'undefined'
      ? (window as Window & { __HARNESS_OPTIONS?: HarnessOptions }).__HARNESS_OPTIONS
      : undefined;
  return fromWindow ?? {};
}

function point(
  partial: Partial<RatingHistoryPoint> & { id: string; ratingTrackId: string },
): RatingHistoryPoint {
  return {
    playerId: 'u1',
    ecosystem: 'free',
    eventType: 'game',
    result: 'win',
    ratingBefore: 1500,
    ratingAfter: 1510,
    ratingDelta: 10,
    occurredAt: '2026-08-18T12:00:00Z',
    ...partial,
  };
}

function buildHistory(): Record<string, RatingHistoryPoint[]> {
  return {
    accl: [
      point({ id: 'accl-1', ratingTrackId: 'accl', ratingBefore: 1600, ratingAfter: 1612, ratingDelta: 12, occurredAt: '2026-08-12T12:00:00Z', gameId: 'g-accl-1' }),
      point({ id: 'accl-2', ratingTrackId: 'accl', ratingBefore: 1612, ratingAfter: 1604, ratingDelta: -8, occurredAt: '2026-08-16T12:00:00Z', gameId: 'g-accl-2' }),
    ],
    tournament: [
      point({ id: 't-1', ratingTrackId: 'tournament', ratingBefore: 1550, ratingAfter: 1570, ratingDelta: 20, occurredAt: '2026-08-10T12:00:00Z', gameId: 'g-t-1' }),
      point({ id: 't-2', ratingTrackId: 'tournament', ratingBefore: 1570, ratingAfter: 1562, ratingDelta: -8, occurredAt: '2026-08-17T12:00:00Z', gameId: 'g-t-2' }),
    ],
    free_bullet: [
      point({ id: 'bu-1', ratingTrackId: 'free_bullet', ratingBefore: 1420, ratingAfter: 1433, ratingDelta: 13, occurredAt: '2026-08-14T12:00:00Z', gameId: 'g-bu-1' }),
      point({ id: 'bu-2', ratingTrackId: 'free_bullet', ratingBefore: 1433, ratingAfter: 1440, ratingDelta: 7, occurredAt: '2026-08-19T12:00:00Z', gameId: 'g-bu-2' }),
    ],
    free_blitz: [
      point({ id: 'bz-1', ratingTrackId: 'free_blitz', ratingBefore: 1510, ratingAfter: 1522, ratingDelta: 12, occurredAt: '2026-08-11T12:00:00Z', gameId: 'g-bz-1' }),
      point({ id: 'bz-2', ratingTrackId: 'free_blitz', ratingBefore: 1522, ratingAfter: 1511, ratingDelta: -11, occurredAt: '2026-08-18T12:00:00Z', gameId: 'g-bz-2' }),
      point({ id: 'bz-3', ratingTrackId: 'free_blitz', ratingBefore: 1511, ratingAfter: 1528, ratingDelta: 17, occurredAt: '2026-08-20T12:00:00Z', gameId: 'g-bz-3' }),
    ],
    free_rapid: [
      point({ id: 'r-1', ratingTrackId: 'free_rapid', ratingBefore: 1488, ratingAfter: 1499, ratingDelta: 11, occurredAt: '2026-08-13T12:00:00Z', gameId: 'g-r-1' }),
      point({ id: 'r-2', ratingTrackId: 'free_rapid', ratingBefore: 1499, ratingAfter: 1506, ratingDelta: 7, occurredAt: '2026-08-19T15:00:00Z', gameId: 'g-r-2' }),
    ],
    free_day: [
      point({ id: 'd-1', ratingTrackId: 'free_day', ratingBefore: 1500, ratingAfter: 1508, ratingDelta: 8, occurredAt: '2026-08-01T12:00:00Z', gameId: 'g-d-1' }),
      point({ id: 'd-2', ratingTrackId: 'free_day', ratingBefore: 1508, ratingAfter: 1494, ratingDelta: -14, occurredAt: '2026-08-15T12:00:00Z', gameId: 'g-d-2' }),
    ],
  };
}

export function LandscapeTickerHarness() {
  const initial = readOptions();
  const [open, setOpen] = useState(initial.open !== false);
  const [empty, setEmpty] = useState(Boolean(initial.empty));
  const [crossing, setCrossing] = useState(Boolean(initial.crossing));
  const [lane, setLane] = useState<RatingLane>('overall');
  const [tick, setTick] = useState(0);
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const closeDrawer = useCallback(() => setOpen(false), []);

  if (typeof window !== 'undefined') {
    (window as Window & {
      __tickerHarness?: {
        rerender: () => void;
        newHistoryIdentity: () => void;
        setEmpty: (value: boolean) => void;
        setCrossing: (value: boolean) => void;
        openDrawer: () => void;
      };
    }).__tickerHarness = {
      rerender: () => setTick((n) => n + 1),
      newHistoryIdentity: () => setHistoryEpoch((n) => n + 1),
      setEmpty: (value: boolean) => setEmpty(value),
      setCrossing: (value: boolean) => setCrossing(value),
      openDrawer: () => setOpen(true),
    };
  }

  const historyByTrack = useMemo(() => {
    void historyEpoch;
    if (empty) return {};
    if (crossing) return LANDSCAPE_TICKER_CROSSING_HISTORY;
    return buildHistory();
  }, [empty, crossing, historyEpoch]);

  const points = historyByTrack.free_blitz ?? [];

  return (
    <div
      data-testid="landscape-ticker-harness"
      data-tick={tick}
      data-history-epoch={historyEpoch}
      data-fixture={empty ? 'empty' : crossing ? 'crossing' : 'default'}
    >
      <div style={open ? { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' } : undefined}>
      <button
        type="button"
        id="harness-expand"
        className={styles.expandMobile}
        data-testid="rating-ticker-expand-mobile"
        onClick={() => setOpen(true)}
      >
        Expand
      </button>
      <button type="button" data-testid="harness-rerender" onClick={() => setTick((n) => n + 1)}>
        Rerender parent
      </button>
      <button
        type="button"
        data-testid="harness-new-history-identity"
        onClick={() => setHistoryEpoch((n) => n + 1)}
      >
        New history identity
      </button>
      <button type="button" data-testid="harness-toggle-empty" onClick={() => setEmpty((v) => !v)}>
        Toggle empty
      </button>
      <p data-testid="harness-tick">{tick}</p>
      </div>
      <ExpandedRatingTickerDrawer
        open={open}
        onClose={closeDrawer}
        trackLabel="Blitz"
        currentRating={1528}
        points={points}
        lane={lane}
        onLaneChange={setLane}
        canLinkFinishedGames
        historyByTrack={historyByTrack}
      />
    </div>
  );
}
