'use client';

import {
  adjacentLandscapeTickerFamily,
  LANDSCAPE_TICKER_FAMILIES,
  type LandscapeTickerFamilyId,
} from '@/lib/profile/landscapeTickerFamilies';
import styles from '@/components/profile/ratings/landscapeRatingTicker.module.css';

type Props = {
  family: LandscapeTickerFamilyId;
  onFamilyChange: (id: LandscapeTickerFamilyId) => void;
};

export function LandscapeTickerFamilyPager({ family, onFamilyChange }: Props) {
  return (
    <div
      className={styles.familyPager}
      role="tablist"
      aria-label="Ticker families"
      data-testid="landscape-ticker-family-pager"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const next = adjacentLandscapeTickerFamily(
          family,
          event.key === 'ArrowRight' ? 1 : -1,
        );
        onFamilyChange(next);
        const list = event.currentTarget;
        window.requestAnimationFrame(() => {
          list.querySelector<HTMLElement>(`[data-family="${next}"]`)?.focus();
        });
      }}
    >
      {LANDSCAPE_TICKER_FAMILIES.map((item) => {
        const selected = item.id === family;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${item.testId}-tab`}
            aria-label={item.tickerName}
            aria-selected={selected}
            aria-controls={item.panelTestId}
            tabIndex={selected ? 0 : -1}
            data-testid={item.testId}
            data-family={item.id}
            data-selected={selected ? 'true' : 'false'}
            className={styles.familyDotButton}
            onClick={() => onFamilyChange(item.id)}
          >
            <span
              className={styles.familyDot}
              data-active={selected ? 'true' : 'false'}
              aria-hidden="true"
            />
            <span className="sr-only">{selected ? 'current' : ''}</span>
          </button>
        );
      })}
    </div>
  );
}
