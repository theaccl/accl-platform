'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LandscapeTickerCategoryId } from '@/lib/profile/landscapeTickerCategories';
import {
  cssSupportsOffsetPath,
  landscapeTickerRevealTimerKey,
} from '@/lib/profile/landscapeTickerMotion';
import {
  landscapeTickerPathFromPoints,
  landscapeTickerRatingDomain,
  landscapeTickerTimeDomain,
  type LandscapeTickerPlotGeometry,
} from '@/lib/profile/landscapeTickerPath';
import {
  LANDSCAPE_TICKER_HERO_MS,
  LANDSCAPE_TICKER_QUIET_MS,
} from '@/lib/profile/landscapeTickerSession';
import { finishedGameHref, finishedGameTrainHref } from '@/lib/profileRatingFinishedLinks';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import {
  chartPointMarkerForPoint,
  chartPointMarkerStyle,
} from '@/lib/ratingTickerChartMarkers';
import styles from '@/components/profile/ratings/landscapeRatingTicker.module.css';

export type LandscapeTickerChartSeries = {
  id: LandscapeTickerCategoryId;
  label: string;
  color: string;
  points: RatingHistoryPoint[];
  phase: 'hidden' | 'queued' | 'hero' | 'quiet' | 'instant' | 'settled';
  revealSerial: number | null;
  /** 0 = back-most; higher paints later / front-most. -1 = not yet introduced. */
  dominanceRank?: number;
};

type Props = {
  series: LandscapeTickerChartSeries[];
  canLinkFinishedGames: boolean;
  reducedMotion: boolean;
  onRevealComplete: (categoryId: LandscapeTickerCategoryId, serial: number) => void;
};

const PAD = 32;
const SPARK_DELAYS_MS = [90, 180, 270, 360] as const;

type ActivePick = {
  seriesId: LandscapeTickerCategoryId;
  label: string;
  color: string;
  point: RatingHistoryPoint;
};

type NavPoint = ActivePick & { markerId: string };

export function LandscapeRatingTickerChart({
  series,
  canLinkFinishedGames,
  reducedMotion,
  onRevealComplete,
}: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const lastSize = useRef({ width: 0, height: 0 });
  const [size, setSize] = useState({ width: 720, height: 280 });
  const [active, setActive] = useState<ActivePick | null>(null);
  const [offsetPathOk, setOffsetPathOk] = useState(false);

  useEffect(() => {
    setOffsetPathOk(cssSupportsOffsetPath());
  }, []);

  const visibleSeries = useMemo(() => {
    const visible = series.filter((s) => s.phase !== 'hidden' && s.phase !== 'queued');
    const ranked = visible.slice().sort((a, b) => (a.dominanceRank ?? 0) - (b.dominanceRank ?? 0));
    const activeIdx = ranked.findIndex(
      (s) => s.phase === 'hero' || s.phase === 'quiet' || s.phase === 'instant',
    );
    if (activeIdx >= 0 && activeIdx !== ranked.length - 1) {
      const [active] = ranked.splice(activeIdx, 1);
      ranked.push(active);
    }
    return ranked;
  }, [series]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(240, Math.round(entry.contentRect.width));
      const height = Math.max(140, Math.round(entry.contentRect.height));
      const prev = lastSize.current;
      if (prev.width === width && prev.height === height) return;
      lastSize.current = { width, height };
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geometry = useMemo((): LandscapeTickerPlotGeometry | null => {
    const pointSets = visibleSeries.map((s) => s.points);
    const time = landscapeTickerTimeDomain(pointSets);
    const rating = landscapeTickerRatingDomain(pointSets);
    if (!time || !rating) return null;
    return {
      width: size.width,
      height: size.height,
      pad: PAD,
      minT: time.minT,
      maxT: time.maxT,
      minR: rating.minR,
      maxR: rating.maxR,
    };
  }, [visibleSeries, size.height, size.width]);

  const plotted = useMemo(() => {
    if (!geometry) return [];
    return visibleSeries.map((s) => {
      const path = landscapeTickerPathFromPoints(s.points, geometry);
      return { series: s, path };
    });
  }, [geometry, visibleSeries]);

  const navPoints = useMemo((): NavPoint[] => {
    const out: NavPoint[] = [];
    for (const row of [...plotted].reverse()) {
      if (!row.path) continue;
      for (const pt of row.path.plotted) {
        out.push({
          seriesId: row.series.id,
          label: row.series.label,
          color: row.series.color,
          point: pt.point,
          markerId: `landscape-ticker-marker-${row.series.id}-${pt.point.id}`,
        });
      }
    }
    return out;
  }, [plotted]);

  const activeReveal = visibleSeries.find(
    (s) => s.phase === 'hero' || s.phase === 'quiet' || s.phase === 'instant',
  );
  const revealSerial = activeReveal?.revealSerial ?? null;
  const revealId = activeReveal?.id;
  const revealPhase = activeReveal?.phase;
  const revealTimerKey = landscapeTickerRevealTimerKey(revealSerial, revealPhase);
  const heroPulseSerial =
    !reducedMotion && revealPhase === 'hero' && revealSerial != null ? revealSerial : null;

  useEffect(() => {
    if (!revealTimerKey || revealSerial == null || !revealId || !revealPhase) return;
    if (revealPhase === 'instant' || reducedMotion) {
      onRevealComplete(revealId, revealSerial);
      return;
    }
    const ms = revealPhase === 'hero' ? LANDSCAPE_TICKER_HERO_MS : LANDSCAPE_TICKER_QUIET_MS;
    const timer = window.setTimeout(() => onRevealComplete(revealId, revealSerial), ms);
    return () => window.clearTimeout(timer);
  }, [revealTimerKey, revealSerial, revealId, revealPhase, reducedMotion, onRevealComplete]);

  useEffect(() => {
    if (heroPulseSerial == null) return;
    const target = frameRef.current;
    target?.dispatchEvent(
      new CustomEvent('landscape-ticker-hero-pulse', {
        bubbles: true,
        detail: { serial: heroPulseSerial, categoryId: activeReveal?.id ?? null },
      }),
    );
  }, [heroPulseSerial, activeReveal?.id]);

  const lineCount = plotted.filter((row) => row.path && row.path.plotted.length > 0).length;
  const dramatic = !reducedMotion;
  const chartLabel = active
    ? `${active.label} rating ${active.point.ratingAfter}. Arrow keys move between points.`
    : 'Landscape rating ticker plot. Arrow keys move between points.';

  function moveActive(delta: number) {
    if (navPoints.length === 0) return;
    const current = navPoints.findIndex(
      (n) => n.point.id === active?.point.id && n.seriesId === active?.seriesId,
    );
    const from = current < 0 ? (delta > 0 ? -1 : 0) : current;
    const next = navPoints[(from + delta + navPoints.length) % navPoints.length];
    setActive({
      seriesId: next.seriesId,
      label: next.label,
      color: next.color,
      point: next.point,
    });
  }

  return (
    <div className={`${styles.chartWrap} space-y-2`}>
      <div
        ref={frameRef}
        className={`${styles.frame} relative w-full`}
        data-testid="landscape-ticker-chart"
        data-line-count={lineCount}
        data-active-reveal={activeReveal?.id ?? 'none'}
        data-reveal-timer-key={revealTimerKey ?? 'none'}
        data-hero-pulse-serial={heroPulseSerial ?? 'none'}
        data-offset-path={offsetPathOk ? 'true' : 'false'}
        data-empty-open={visibleSeries.length === 0 ? 'true' : 'false'}
        data-dominance-order={visibleSeries.map((s) => s.id).join(' ') || 'none'}
        data-dominant-category={visibleSeries[visibleSeries.length - 1]?.id ?? 'none'}
      >
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          className={`${styles.svgRoot} h-full w-full rounded-lg border border-[#2f3f54] bg-[#0b121c]`}
          role="group"
          aria-label={chartLabel}
          preserveAspectRatio="none"
          tabIndex={0}
          data-testid="landscape-ticker-chart-focus"
          aria-activedescendant={
            active
              ? `landscape-ticker-marker-${active.seriesId}-${active.point.id}`
              : undefined
          }
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault();
              moveActive(1);
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault();
              moveActive(-1);
            } else if (event.key === 'Home') {
              event.preventDefault();
              if (navPoints[0]) {
                const first = navPoints[0];
                setActive({
                  seriesId: first.seriesId,
                  label: first.label,
                  color: first.color,
                  point: first.point,
                });
              }
            } else if (event.key === 'End') {
              event.preventDefault();
              const last = navPoints[navPoints.length - 1];
              if (last) {
                setActive({
                  seriesId: last.seriesId,
                  label: last.label,
                  color: last.color,
                  point: last.point,
                });
              }
            }
          }}
        >
          <rect
            key={heroPulseSerial != null ? `hero-pulse-${heroPulseSerial}` : 'perimeter-idle'}
            x="1.5"
            y="1.5"
            width={Math.max(0, size.width - 3)}
            height={Math.max(0, size.height - 3)}
            rx="8"
            className={heroPulseSerial != null ? styles.perimeter : undefined}
            data-ticker-anim={heroPulseSerial != null ? 'perimeter' : undefined}
            stroke={heroPulseSerial != null ? activeReveal?.color : '#2f3f54'}
            strokeWidth="1.5"
            fill="none"
            data-testid="landscape-ticker-perimeter"
            data-hero-pulse-serial={heroPulseSerial ?? 'none'}
            data-pulse-active={heroPulseSerial != null ? 'true' : 'false'}
          />

          {geometry ? (
            <>
              <text
                x={8}
                y={PAD + 2}
                fill="#9ca3af"
                fontSize="11"
                className="tabular-nums"
                data-testid="landscape-ticker-scale-max"
              >
                {Math.round(geometry.maxR)}
              </text>
              <text
                x={8}
                y={size.height - 14}
                fill="#9ca3af"
                fontSize="11"
                className="tabular-nums"
                data-testid="landscape-ticker-scale-min"
              >
                {Math.round(geometry.minR)}
              </text>
            </>
          ) : null}
        </svg>

        <div className={styles.seriesStack} data-testid="landscape-ticker-series-stack">
          {plotted.map((row, paintIndex) => {
            if (!row.path) return null;
            const { series: s, path } = row;
            const hero = s.phase === 'hero' && dramatic && path.plotted.length > 1;
            const quiet = s.phase === 'quiet' && dramatic && path.plotted.length > 1;
            const heroMotion = hero && offsetPathOk;
            const glowClass = hero
              ? styles.heroGlow
              : quiet
                ? styles.quietGlow
                : styles.settledGlow;
            const coreClass = hero
              ? styles.heroCore
              : quiet
                ? styles.quietCore
                : styles.settledCore;
            const last = path.plotted[path.plotted.length - 1];
            const frontMost = plotted[plotted.length - 1]?.series.id === s.id;
            const strokeLayerKey = `${s.id}-${s.phase}-${s.revealSerial ?? 'settled'}`;
            const pickNearest = (clientX: number, clientY: number, svgEl: SVGSVGElement | null) => {
              if (!svgEl) return;
              const rect = svgEl.getBoundingClientRect();
              const x = ((clientX - rect.left) / rect.width) * size.width;
              const y = ((clientY - rect.top) / rect.height) * size.height;
              let best = path.plotted[0];
              let bestDist = Number.POSITIVE_INFINITY;
              for (const pt of path.plotted) {
                const dist = (pt.x - x) ** 2 + (pt.y - y) ** 2;
                if (dist < bestDist) {
                  bestDist = dist;
                  best = pt;
                }
              }
              if (!best) return;
              setActive({
                seriesId: s.id,
                label: s.label,
                color: s.color,
                point: best.point,
              });
            };
            return (
              <svg
                key={s.id}
                viewBox={`0 0 ${size.width} ${size.height}`}
                preserveAspectRatio="none"
                className={styles.seriesSvg}
                style={{ zIndex: paintIndex + 1 }}
                overflow="visible"
                aria-hidden="true"
                data-testid={`landscape-ticker-path-${s.id}`}
                data-reveal-phase={s.phase}
                data-reveal-serial={s.revealSerial ?? 'none'}
                data-dominance-rank={s.dominanceRank ?? paintIndex}
                data-paint-index={paintIndex}
                data-dominant={frontMost ? 'true' : 'false'}
              >
                <path
                  key={`glow-${strokeLayerKey}`}
                  d={path.d}
                  pathLength={1}
                  className={glowClass}
                  pointerEvents="none"
                  data-ticker-anim={hero ? 'hero-glow' : quiet ? 'quiet-glow' : 'settled-glow'}
                  stroke={s.color}
                  strokeWidth={hero || quiet ? 7 : 5}
                  opacity={0.28}
                />
                <path
                  key={`core-${strokeLayerKey}`}
                  d={path.d}
                  pathLength={1}
                  className={coreClass}
                  pointerEvents="none"
                  data-ticker-anim={hero ? 'hero-core' : quiet ? 'quiet-core' : 'settled-core'}
                  stroke={s.color}
                  strokeWidth={2.25}
                  opacity={0.95}
                />
                <path
                  d={path.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                  pointerEvents="stroke"
                  data-testid={`landscape-ticker-hit-${s.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    pickNearest(
                      event.clientX,
                      event.clientY,
                      event.currentTarget.ownerSVGElement,
                    );
                  }}
                />
                {heroMotion ? (
                  <>
                    <circle
                      r="5"
                      fill="#fff"
                      stroke={s.color}
                      strokeWidth="2"
                      pointerEvents="none"
                      className={styles.heroHead}
                      style={{ offsetPath: `path('${path.d}')` }}
                      data-testid={`landscape-ticker-head-${s.id}`}
                    />
                    {SPARK_DELAYS_MS.map((delay, i) => (
                      <circle
                        key={delay}
                        r={i % 2 === 0 ? 1.6 : 1.2}
                        fill={s.color}
                        opacity={0}
                        pointerEvents="none"
                        className={styles.spark}
                        style={{
                          offsetPath: `path('${path.d}')`,
                          animationDelay: `${delay}ms`,
                        }}
                        data-testid={`landscape-ticker-spark-${s.id}-${i}`}
                      />
                    ))}
                  </>
                ) : null}
                {hero && last ? (
                  <circle
                    cx={last.x}
                    cy={last.y}
                    r="11"
                    fill={s.color}
                    opacity={0}
                    pointerEvents="none"
                    className={
                      path.plotted.length === 1 ? styles.singleBloom : styles.bloom
                    }
                    data-testid={`landscape-ticker-bloom-${s.id}`}
                  />
                ) : null}
                {path.plotted.map((pt) => {
                  const style = chartPointMarkerStyle(
                    pt.point,
                    active?.point.id === pt.point.id && active.seriesId === s.id,
                  );
                  const r =
                    active?.point.id === pt.point.id && active.seriesId === s.id ? 6 : 4;
                  return (
                    <circle
                      key={`${s.id}:${pt.point.id}`}
                      id={`landscape-ticker-marker-${s.id}-${pt.point.id}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={r}
                      fill={style.fill}
                      stroke={style.stroke}
                      strokeWidth="1"
                      className="cursor-pointer"
                      pointerEvents="auto"
                      data-marker-kind={style.kind}
                      data-testid={`landscape-ticker-marker-${s.id}-${pt.point.id}`}
                      role="img"
                      tabIndex={-1}
                      focusable="false"
                      aria-label={`${s.label} rating ${pt.point.ratingAfter}`}
                      onClick={() =>
                        setActive({
                          seriesId: s.id,
                          label: s.label,
                          color: s.color,
                          point: pt.point,
                        })
                      }
                    />
                  );
                })}
              </svg>
            );
          })}
        </div>

        {visibleSeries.length === 0 ? (
          <p
            className="pointer-events-none absolute inset-0 m-0 flex items-center justify-center px-4 text-center text-sm text-gray-400"
            data-testid="landscape-ticker-empty-plot"
          >
            Select a category to reveal its rating path.
          </p>
        ) : null}

        {visibleSeries.length > 0 && lineCount === 0 ? (
          <p
            className="pointer-events-none absolute inset-0 m-0 flex items-center justify-center px-4 text-center text-sm text-gray-400"
            data-testid="landscape-ticker-zero-event-plot"
          >
            No rating movement in this lane for the selected categories.
          </p>
        ) : null}
      </div>

      {active ? (
        <div
          data-testid="landscape-ticker-point-detail"
          data-marker-kind={chartPointMarkerForPoint(active.point)}
          className={`${styles.pointDetail} rounded-lg border border-[#2f3f54] bg-[#0f1723] px-3 py-2 text-sm text-gray-200`}
        >
          <p className="m-0 flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: active.color }}
            />
            <span className="font-medium">{active.label}</span>
          </p>
          <p className="m-0 mt-1 tabular-nums">
            {active.point.ratingBefore} {'\u2192'} {active.point.ratingAfter}{' '}
            <span
              className={active.point.ratingDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}
            >
              ({active.point.ratingDelta >= 0 ? '+' : ''}
              {active.point.ratingDelta})
            </span>
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {new Date(active.point.occurredAt).toLocaleString()} {'\u00B7'} {active.point.result}
          </p>
          {canLinkFinishedGames && active.point.gameId ? (
            <p className="mt-2 mb-0 flex flex-wrap gap-x-3 gap-y-1">
              <Link
                href={finishedGameHref(active.point.gameId)}
                data-testid="landscape-ticker-finished-link"
                className="font-semibold text-sky-300"
              >
                Finished game
              </Link>
              <Link
                href={finishedGameTrainHref(active.point.gameId)}
                data-testid="landscape-ticker-train-link"
                className="font-semibold text-sky-300"
              >
                Trainer review
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
