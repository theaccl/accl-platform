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
  landscapeTickerRatingTicks,
  toLandscapeTickerXMs,
  toLandscapeTickerY,
  type LandscapeTickerPlotGeometry,
} from '@/lib/profile/landscapeTickerPath';
import { ticksForLaneWindow, type RatingLaneWindow } from '@/lib/profile/ratingTickerCalendar';
import { formatOccurredAtInZone } from '@/lib/profile/ratingTickerTimeZone';
import { RATING_LANE_EMPTY, RATING_TICKER_NO_HISTORY } from '@/components/profile/ratings/ratingTickerEmptyStates';
import type { RatingLane } from '@/lib/ratingHistoryMetrics';
import {
  LANDSCAPE_TICKER_CASING_STROKE,
  landscapeTickerEmphasis,
  landscapeTickerStrokeStyle,
} from '@/lib/profile/landscapeTickerHierarchy';
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
  /** Last real ratingAfter before the lane window; not a marker. */
  carryInRating?: number | null;
  phase: 'hidden' | 'queued' | 'hero' | 'quiet' | 'instant' | 'settled';
  revealSerial: number | null;
  /** 0 = back-most; higher paints later / front-most. -1 = not yet introduced. */
  dominanceRank?: number;
};

type Props = {
  series: LandscapeTickerChartSeries[];
  lane: RatingLane;
  timeZone: string;
  nowMs: number;
  window: RatingLaneWindow | null;
  canLinkFinishedGames: boolean;
  reducedMotion: boolean;
  onRevealComplete: (categoryId: LandscapeTickerCategoryId, serial: number) => void;
};

const PAD = 28;
const TOP_AXIS_BAND = 34;
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
  lane,
  timeZone,
  nowMs,
  window: laneWindow,
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

  const topAxisBand = size.height < 160 ? 28 : TOP_AXIS_BAND;
  const pad = size.height < 160 ? 20 : PAD;

  const geometry = useMemo((): LandscapeTickerPlotGeometry | null => {
    if (!laneWindow) return null;
    const pointSets = visibleSeries.map((s) => s.points);
    const extras = visibleSeries
      .map((s) => s.carryInRating)
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    const rating = landscapeTickerRatingDomain(pointSets, extras) ?? { minR: 980, maxR: 1020 };
    return {
      width: size.width,
      height: size.height,
      pad,
      axisBand: 0,
      topAxisBand,
      minT: laneWindow.startMs,
      maxT: laneWindow.endMs,
      minR: rating.minR,
      maxR: rating.maxR,
    };
  }, [visibleSeries, size.height, size.width, laneWindow, pad, topAxisBand]);

  const hasRatingScale = useMemo(() => {
    const extras = visibleSeries
      .map((s) => s.carryInRating)
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    return landscapeTickerRatingDomain(visibleSeries.map((s) => s.points), extras) != null;
  }, [visibleSeries]);

  const ratingTicks = useMemo(
    () => (geometry && hasRatingScale ? landscapeTickerRatingTicks(geometry.minR, geometry.maxR) : []),
    [geometry, hasRatingScale],
  );

  const plotted = useMemo(() => {
    if (!geometry) return [];
    return visibleSeries.map((s) => {
      const path = landscapeTickerPathFromPoints(s.points, geometry, {
        carryInRating: s.carryInRating,
      });
      return { series: s, path };
    });
  }, [geometry, visibleSeries]);

  const drawable = useMemo(
    () =>
      plotted.filter(
        (row): row is (typeof plotted)[number] & { path: NonNullable<(typeof plotted)[number]['path']> } =>
          row.path != null,
      ),
    [plotted],
  );
  const marked = useMemo(
    () => drawable.filter((row) => row.path.plotted.length > 0),
    [drawable],
  );
  const drawableDominantId = drawable[drawable.length - 1]?.series.id ?? null;
  const dominantCarryInOnly = Boolean(
    drawable.length > 0 && drawable[drawable.length - 1].path.plotted.length === 0,
  );

  const navPoints = useMemo((): NavPoint[] => {
    const out: NavPoint[] = [];
    for (const row of [...marked].reverse()) {
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
  }, [marked]);

  const activeReveal = visibleSeries.find(
    (s) => s.phase === 'hero' || s.phase === 'quiet' || s.phase === 'instant',
  );
  const drawableReveal = drawable.find(
    (row) =>
      row.series.phase === 'hero' || row.series.phase === 'quiet' || row.series.phase === 'instant',
  );
  const revealSerial = activeReveal?.revealSerial ?? null;
  const revealId = activeReveal?.id;
  const revealPhase = activeReveal?.phase;
  const revealTimerKey = landscapeTickerRevealTimerKey(revealSerial, revealPhase);
  const revealIsDrawable = Boolean(drawableReveal && drawableReveal.series.id === revealId);
  const heroPulseSerial =
    !reducedMotion && revealPhase === 'hero' && revealIsDrawable && revealSerial != null
      ? revealSerial
      : null;

  useEffect(() => {
    if (!revealTimerKey || revealSerial == null || !revealId || !revealPhase) return;
    if (revealPhase === 'instant' || reducedMotion || !revealIsDrawable) {
      onRevealComplete(revealId, revealSerial);
      return;
    }
    const ms = revealPhase === 'hero' ? LANDSCAPE_TICKER_HERO_MS : LANDSCAPE_TICKER_QUIET_MS;
    const timer = window.setTimeout(() => onRevealComplete(revealId, revealSerial), ms);
    return () => window.clearTimeout(timer);
  }, [
    revealTimerKey,
    revealSerial,
    revealId,
    revealPhase,
    reducedMotion,
    revealIsDrawable,
    onRevealComplete,
  ]);

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

  const lineCount = drawable.length;
  const dramatic = !reducedMotion;
  const ticks = useMemo(() => {
    if (!laneWindow || !geometry) return [];
    return ticksForLaneWindow(laneWindow, geometry.width - geometry.pad * 2);
  }, [laneWindow, geometry]);
  const seriesCount = visibleSeries.length;
  const chartLabel = active
    ? `${active.label} rating ${active.point.ratingAfter} at ${formatOccurredAtInZone(active.point.occurredAt, timeZone)}. Arrow keys move between rating events.`
    : laneWindow
      ? `Landscape rating ticker, ${lane} lane, ${timeZone}, ${laneWindow.caption}, ${seriesCount} visible ${seriesCount === 1 ? 'series' : 'series'}. Arrow keys move between rating events.`
      : `Landscape rating ticker, ${lane} lane, ${timeZone}. ${RATING_TICKER_NO_HISTORY}`;

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
        data-dominance-order={drawable.map((row) => row.series.id).join(' ') || 'none'}
        data-dominant-category={drawableDominantId ?? 'none'}
        data-painted-count={drawable.length}
        data-drawable-count={drawable.length}
        data-marked-count={marked.length}
        data-dominant-carry-in={dominantCarryInOnly ? 'true' : 'false'}
        data-lane={lane}
        data-time-zone={timeZone}
        data-now-ms={String(nowMs)}
        data-window-start={laneWindow ? String(laneWindow.startMs) : 'none'}
        data-window-end={laneWindow ? String(laneWindow.endMs) : 'none'}
        data-time-caption={laneWindow?.caption ?? RATING_TICKER_NO_HISTORY}
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

          {geometry && hasRatingScale ? (
            <g data-testid="landscape-ticker-y-axis" aria-hidden="true">
              <text x={5} y={11} fill="#94a3b8" fontSize="9" fontWeight="600">
                ELO
              </text>
              {ratingTicks.map((rating, index) => {
                const y = toLandscapeTickerY(rating, geometry);
                return (
                  <g key={rating}>
                    <line
                      x1={pad}
                      x2={size.width - pad}
                      y1={y}
                      y2={y}
                      stroke="#1e293b"
                      strokeWidth="1"
                      opacity={index === 0 || index === ratingTicks.length - 1 ? 0.5 : 0.35}
                    />
                    <text
                      x={5}
                      y={y + 3}
                      fill="#9ca3af"
                      fontSize="9"
                      className="tabular-nums"
                      data-testid={
                        index === 0
                          ? 'landscape-ticker-scale-max'
                          : index === ratingTicks.length - 1
                            ? 'landscape-ticker-scale-min'
                            : 'landscape-ticker-scale-tick'
                      }
                    >
                      {rating}
                    </text>
                  </g>
                );
              })}
            </g>
          ) : null}

          {geometry && laneWindow ? (
            <g data-testid="landscape-ticker-x-axis" aria-hidden="true">
              {ticks.map((tick) => {
                const x = toLandscapeTickerXMs(tick.t, geometry);
                const y1 = geometry.topAxisBand ?? pad;
                const y2 = size.height - pad - (geometry.axisBand ?? 0);
                const emphasizedWeekBoundary = lane === 'month' && tick.priority === 'primary';
                return (
                  <g key={`${tick.priority}-${tick.t}`}>
                    {tick.priority !== 'endpoint' ? (
                      <line
                        x1={x}
                        x2={x}
                        y1={y1}
                        y2={y2}
                        stroke={emphasizedWeekBoundary ? '#475569' : '#1e293b'}
                        strokeWidth={emphasizedWeekBoundary ? 1.75 : 1}
                        opacity={emphasizedWeekBoundary ? 0.85 : tick.priority === 'secondary' ? 0.35 : 0.5}
                        data-time-boundary={emphasizedWeekBoundary ? 'iso-week' : tick.priority}
                      />
                    ) : null}
                    <text
                      x={x}
                      y={27}
                      fill="#9ca3af"
                      fontSize="9"
                      textAnchor="middle"
                      className="tabular-nums"
                      data-testid={`landscape-ticker-x-tick-${tick.priority}`}
                      data-tick-priority={tick.priority}
                    >
                      {tick.label}
                    </text>
                  </g>
                );
              })}
            </g>
          ) : null}

          {laneWindow ? (
            <text
              x={size.width / 2}
              y={11}
              fill="#94a3b8"
              fontSize="10"
              textAnchor="middle"
              data-testid="landscape-ticker-time-caption"
            >
              {laneWindow.caption}
            </text>
          ) : (
            <text
              x={size.width / 2}
              y={size.height / 2}
              fill="#9ca3af"
              fontSize="12"
              textAnchor="middle"
              data-testid="landscape-ticker-time-caption"
            >
              {RATING_TICKER_NO_HISTORY}
            </text>
          )}
          <desc data-testid="landscape-ticker-axis-description">
            {laneWindow
              ? `Time axis, ${lane} lane, timezone ${timeZone}, ${laneWindow.caption}. Keyboard navigation visits real rating events only. Inactive held periods are not focus stops.`
              : `Time axis, ${lane} lane, timezone ${timeZone}. ${RATING_TICKER_NO_HISTORY}`}
          </desc>
        </svg>

        <div className={styles.seriesStack} data-testid="landscape-ticker-series-stack">
          {drawable.map((row, paintIndex) => {
            const { series: s, path } = row;
            const pathDrawable = path.d.includes(' L ');
            const hero = s.phase === 'hero' && dramatic && pathDrawable;
            const quiet = s.phase === 'quiet' && dramatic && pathDrawable;
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
            const frontMost = drawableDominantId === s.id;
            const carryInOnly = path.plotted.length === 0;
            const emphasis = landscapeTickerEmphasis({
              phase: s.phase,
              frontMost,
              revealActive: Boolean(drawableReveal),
              reducedMotion,
            });
            const stroke = landscapeTickerStrokeStyle(emphasis);
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
                data-carry-in-only={carryInOnly ? 'true' : 'false'}
                data-emphasis={emphasis}
                data-recessed={emphasis === 'recessed' ? 'true' : 'false'}
                data-core-width={stroke.core}
                data-casing-width={stroke.casing}
              >
                <path
                  key={`glow-${strokeLayerKey}`}
                  d={path.d}
                  pathLength={1}
                  className={glowClass}
                  pointerEvents="none"
                  data-ticker-anim={hero ? 'hero-glow' : quiet ? 'quiet-glow' : 'settled-glow'}
                  stroke={s.color}
                  strokeWidth={stroke.glow}
                  opacity={stroke.glowOpacity}
                />
                {stroke.casing > 0 ? (
                  <path
                    key={`casing-${strokeLayerKey}`}
                    d={path.d}
                    pathLength={1}
                    fill="none"
                    className={coreClass}
                    pointerEvents="none"
                    data-testid={`landscape-ticker-casing-${s.id}`}
                    data-ticker-anim={hero ? 'hero-casing' : quiet ? 'quiet-casing' : 'settled-casing'}
                    stroke={LANDSCAPE_TICKER_CASING_STROKE}
                    strokeWidth={stroke.casing}
                    opacity={stroke.casingOpacity}
                  />
                ) : null}
                <path
                  key={`core-${strokeLayerKey}`}
                  d={path.d}
                  pathLength={1}
                  className={coreClass}
                  pointerEvents="none"
                  data-testid={`landscape-ticker-core-${s.id}`}
                  data-ticker-anim={hero ? 'hero-core' : quiet ? 'quiet-core' : 'settled-core'}
                  stroke={s.color}
                  strokeWidth={stroke.core}
                  opacity={stroke.coreOpacity}
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
                    data-bloom-kind="hero"
                  />
                ) : null}
                {quiet && last ? (
                  <circle
                    cx={last.x}
                    cy={last.y}
                    r="7"
                    fill={s.color}
                    opacity={0}
                    pointerEvents="none"
                    className={styles.quietBloom}
                    data-testid={`landscape-ticker-quiet-bloom-${s.id}`}
                    data-bloom-kind="quiet"
                  />
                ) : null}
                {path.plotted.map((pt) => {
                  const style = chartPointMarkerStyle(
                    pt.point,
                    active?.point.id === pt.point.id && active.seriesId === s.id,
                  );
                  const selectedPoint =
                    active?.point.id === pt.point.id && active.seriesId === s.id;
                  const r = selectedPoint ? 6 : frontMost ? 4.5 : 3.75;
                  const fill = style.kind === 'none' ? s.color : style.fill;
                  const markerStroke =
                    frontMost || style.kind === 'none' ? s.color : style.stroke;
                  return (
                    <g key={`${s.id}:${pt.point.id}`}>
                      {frontMost ? (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={r + 2.25}
                          fill="none"
                          stroke={s.color}
                          strokeWidth="1.6"
                          opacity="0.55"
                          pointerEvents="none"
                          data-testid={`landscape-ticker-marker-halo-${s.id}-${pt.point.id}`}
                        />
                      ) : null}
                      <circle
                        id={`landscape-ticker-marker-${s.id}-${pt.point.id}`}
                        cx={pt.x}
                        cy={pt.y}
                        r={r}
                        fill={fill}
                        stroke={markerStroke}
                        strokeWidth={frontMost ? 1.6 : 1}
                        className="cursor-pointer"
                        pointerEvents="auto"
                        data-marker-kind={style.kind}
                        data-testid={`landscape-ticker-marker-${s.id}-${pt.point.id}`}
                        role="img"
                        tabIndex={-1}
                        focusable="false"
                        aria-label={`${s.label} rating ${pt.point.ratingAfter} at ${formatOccurredAtInZone(pt.point.occurredAt, timeZone)}`}
                        onClick={() =>
                          setActive({
                            seriesId: s.id,
                            label: s.label,
                            color: s.color,
                            point: pt.point,
                          })
                        }
                      />
                    </g>
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

        {visibleSeries.length > 0 && drawable.length === 0 && laneWindow ? (
          <p
            className="pointer-events-none absolute inset-x-0 top-8 m-0 px-4 text-center text-sm text-gray-400"
            data-testid="landscape-ticker-zero-event-plot"
          >
            {RATING_LANE_EMPTY}
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
            <span data-testid="landscape-ticker-point-time">
              {formatOccurredAtInZone(active.point.occurredAt, timeZone)}
            </span>
            {' \u00B7 '}
            {active.point.result}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500" data-testid="landscape-ticker-point-iso">
            {active.point.occurredAt}
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
