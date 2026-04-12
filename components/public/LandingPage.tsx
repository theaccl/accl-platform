"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavigationBar from "@/components/NavigationBar";
import type { PublicNexusData } from "@/lib/nexus/getPublicNexusData";
import { trackGrowthEvent } from "@/lib/public/funnelTracking";
import { getStoredReferral, setStoredEntrySource } from "@/lib/public/referralTracking";

export default function LandingPage() {
  const [data, setData] = useState<PublicNexusData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setStoredEntrySource("landing");
    trackGrowthEvent({
      event_type: "landing_view",
      entry_source: "landing",
      referral_id: getStoredReferral(),
      ecosystem: "adult",
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/nexus/public?ecosystem=adult", { cache: "no-store" });
        const json = (await res.json()) as { ok?: boolean; data?: PublicNexusData };
        if (!res.ok || !json.data) throw new Error("Snapshot unavailable");
        if (!cancelled) {
          setData(json.data);
          setErr(null);
        }
      } catch {
        if (!cancelled) {
          setData(null);
          setErr("Live snapshot temporarily unavailable — try again shortly.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const topLive = data?.live_games?.slice(0, 4) ?? [];
  const spotlightEvent =
    data?.global_events?.find((e) => e.is_championship) ?? data?.global_events?.[0] ?? null;
  const headline = data?.narrative?.headline;

  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col text-white">
      <NavigationBar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-10 sm:py-14 space-y-12">
        <section className="text-center space-y-4">
          <p className="text-[11px] uppercase tracking-[0.25em] text-gray-500">ACCL</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Play. Compete. Rise.</h1>
          <p className="text-gray-400 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
            Competitive chess with integrity-first events — watch live games instantly, then step in when you are ready.
          </p>
          {data ? (
            <div className="space-y-1 text-sm text-gray-300">
              <p>
                <span className="text-red-300 font-semibold">{data.engagement.live_games}</span> live games ·{" "}
                <span className="text-amber-200/90 font-semibold">{data.engagement.active_tournaments}</span> active
                events · <span className="text-gray-200 font-semibold">{data.engagement.ranked_players}</span> ranked
                players
              </p>
              <p className="text-xs text-gray-500">
                Games with activity today: <span className="text-gray-300">{data.engagement.games_today}</span>{" "}
                (derived from real match records)
              </p>
            </div>
          ) : err ? (
            <p className="text-sm text-amber-200/90">{err}</p>
          ) : (
            <p className="text-sm text-gray-500">Loading live snapshot…</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-200">Live now</h2>
          {topLive.length === 0 ? (
            <p className="text-sm text-gray-500">No adult-track live boards at the moment — open Nexus for the full feed.</p>
          ) : (
            <ul className="space-y-2">
              {topLive.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/game/${g.id}?spectate=1`}
                    className="block rounded-xl border border-[#2a3442] bg-[#0f1420] px-4 py-3 text-sm hover:border-red-500/50 transition"
                  >
                    <span className="text-gray-100">
                      {g.white_label} <span className="text-gray-500">vs</span> {g.black_label}
                    </span>
                    <span className="block text-xs text-gray-500 mt-1">
                      {g.time_control} · spectate (read-only)
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/nexus?public=1" className="inline-block text-sm text-sky-300 font-medium">
            Open public Nexus →
          </Link>
        </section>

        <section className="rounded-2xl border border-amber-500/35 bg-[#1a120e] p-5 sm:p-6 space-y-2">
          <h2 className="text-lg font-semibold text-amber-50">Current event</h2>
          {spotlightEvent ? (
            <>
              <p className="text-sm text-amber-200/90">{spotlightEvent.is_championship ? "Championship context" : "Major event"}</p>
              <p className="text-xl font-semibold leading-snug">{spotlightEvent.title}</p>
              {spotlightEvent.sponsor_label && spotlightEvent.ecosystem_scope === "adult" ? (
                <p className="text-[11px] text-gray-500 mt-1">
                  {spotlightEvent.sponsor_tag ? `${spotlightEvent.sponsor_tag} · ` : null}
                  {spotlightEvent.sponsor_label}
                </p>
              ) : null}
              <p className="text-xs text-gray-400 capitalize">Stage: {spotlightEvent.lifecycle_state}</p>
            </>
          ) : headline ? (
            <>
              <p className="text-sm text-gray-400">Season narrative</p>
              <p className="text-lg font-medium text-white">{headline.headline}</p>
              {headline.subline ? <p className="text-sm text-gray-400">{headline.subline}</p> : null}
            </>
          ) : (
            <p className="text-sm text-gray-500">Events will appear here as the season progresses.</p>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">How it works</h2>
          <ol className="grid sm:grid-cols-3 gap-4 text-sm">
            <li className="rounded-xl border border-[#2a3442] bg-[#0f1420] p-4">
              <p className="text-red-300 font-semibold mb-1">1 · Play</p>
              <p className="text-gray-400">Enter free play or structured events — same integrity rules for everyone.</p>
            </li>
            <li className="rounded-xl border border-[#2a3442] bg-[#0f1420] p-4">
              <p className="text-red-300 font-semibold mb-1">2 · Compete</p>
              <p className="text-gray-400">Rated games and tournaments feed real standings — no manufactured hype.</p>
            </li>
            <li className="rounded-xl border border-[#2a3442] bg-[#0f1420] p-4">
              <p className="text-red-300 font-semibold mb-1">3 · Advance</p>
              <p className="text-gray-400">Progress through brackets and season arcs visible in Nexus.</p>
            </li>
          </ol>
        </section>

        <section className="rounded-2xl border border-red-500/40 bg-[#20141a] p-6 text-center space-y-4">
          <h2 className="text-xl font-semibold">Join ACCL</h2>
          <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
            Create an account for free play and the full Nexus dashboard — use <strong className="text-gray-200">Sign Up</strong>{" "}
            or <strong className="text-gray-200">Log In</strong> in the top navigation bar.
          </p>
        </section>

        {data && data.activity_feed_public.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-200">Pulse</h2>
            <ul className="space-y-2 text-sm text-gray-400 border border-[#2a3442] rounded-xl p-4 bg-[#0f1420] max-h-56 overflow-y-auto">
              {data.activity_feed_public.slice(0, 8).map((a) => (
                <li key={a.id} className="leading-snug">
                  <span className="text-gray-300">{a.message}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="text-center text-[11px] text-gray-600 pt-6">
          <Link href="/free" className="text-gray-500 hover:text-gray-400">
            Classic lobby shortcuts
          </Link>
        </footer>
      </main>
    </div>
  );
}
