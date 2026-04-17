"use client";

import NavigationBar from "@/components/NavigationBar";
import HomeButton from "@/components/HomeButton";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function TrainerPage() {
  const [mentorInsight, setMentorInsight] = useState("Building your pattern profile from finished games.");
  const [recentThemes, setRecentThemes] = useState<Array<{ theme: string; created_at: string }>>([]);
  const [latestFinishedId, setLatestFinishedId] = useState<string | null>(null);
  const [finishedCount, setFinishedCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || cancelled) return;

      const { data: profile } = await supabase
        .from("player_pattern_profiles")
        .select("suggested_themes")
        .eq("user_id", uid)
        .maybeSingle();
      const firstTheme = Array.isArray((profile as { suggested_themes?: unknown[] } | null)?.suggested_themes)
        ? String((profile as { suggested_themes?: unknown[] }).suggested_themes?.[0] ?? "").trim()
        : "";
      if (!cancelled && firstTheme) {
        setMentorInsight(`Current priority: ${firstTheme}`);
      }

      const { data: positions } = await supabase
        .from("trainer_generated_positions")
        .select("theme,created_at")
        .eq("user_id", uid)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(3);
      if (!cancelled) {
        setRecentThemes((positions as Array<{ theme: string; created_at: string }>) ?? []);
      }

      const { data: latest } = await supabase
        .from("games")
        .select("id")
        .eq("status", "finished")
        .or(`white_player_id.eq.${uid},black_player_id.eq.${uid}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && latest && typeof (latest as { id?: string }).id === "string") {
        setLatestFinishedId((latest as { id: string }).id);
      }

      const { count } = await supabase
        .from("games")
        .select("id", { count: "exact", head: true })
        .eq("status", "finished")
        .or(`white_player_id.eq.${uid},black_player_id.eq.${uid}`);
      if (!cancelled && typeof count === "number") {
        setFinishedCount(count);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0D1117] text-white flex flex-col">
      <NavigationBar />

      <div className="max-w-3xl mx-auto w-full flex flex-1 flex-col px-6 py-8 gap-8" data-testid="trainer-home-page">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Trainer</h1>
          <p className="text-sm text-gray-400 leading-relaxed">
            Your home for <span className="text-gray-200">completed-game review</span>: open a finished record, replay
            moves, then run engine analysis or mistake drills. Practice lab tools stay available below when you want
            positions outside a specific game.
          </p>
        </div>

        <section className="rounded-2xl border border-emerald-900/40 bg-gradient-to-b from-[#0f1a14] to-[#111823] p-5 flex flex-col gap-4" aria-labelledby="trainer-review-heading">
          <div>
            <h2 id="trainer-review-heading" className="text-lg font-semibold text-emerald-100/95">
              Review completed games
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Every finished game has a read-only page with replay, then links to{" "}
              <span className="text-gray-300">Analyze game</span> and <span className="text-gray-300">Train from mistakes</span>{" "}
              for that board.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/trainer/review"
              className="flex-1 rounded-xl bg-[#238636] py-3.5 text-center text-base font-semibold text-white transition hover:bg-[#2ea043]"
              data-testid="trainer-hub-review-cta"
            >
              Review my games
            </Link>
            {latestFinishedId ? (
              <Link
                href={`/finished/${latestFinishedId}`}
                className="flex-1 rounded-xl border border-gray-600 bg-[#161b22] py-3.5 text-center text-base font-semibold text-white transition hover:bg-[#21262d]"
                data-testid="trainer-hub-latest-finished"
              >
                Open latest finish
              </Link>
            ) : null}
          </div>
          {finishedCount != null && finishedCount > 0 ? (
            <p className="text-xs text-gray-500">
              {finishedCount} finished {finishedCount === 1 ? "game" : "games"} on record for your account.
            </p>
          ) : finishedCount === 0 ? (
            <p className="text-xs text-gray-500">Finish a rated or unrated game to populate your review list.</p>
          ) : null}
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="trainer-practice-heading">
          <h2 id="trainer-practice-heading" className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Practice &amp; lab
          </h2>
          <p className="text-xs text-gray-500 -mt-1">
            Sandbox positions, pattern sets, and computer practice — separate from per-game review.
          </p>
          <div className="flex flex-col items-center gap-3">
            <HomeButton label="TRAINER LAB (POSITIONS)" route="/trainer/lab" />
            <HomeButton label="TRAIN MY PATTERNS" route="/trainer/patterns" />
            <HomeButton label="PLAY COMPUTER" route="/trainer/computer" />
            <HomeButton label="SKILLS" route="/trainer/skills" />
          </div>
        </section>

        <div className="bg-[#161b22] rounded-2xl p-5 border border-gray-800">
          <p className="text-sm text-gray-400 mb-2">Mentor insight</p>
          <p className="text-lg font-semibold text-gray-100">{mentorInsight}</p>
        </div>

        <div className="bg-[#161b22] rounded-2xl p-5 border border-gray-800">
          <p className="text-sm text-gray-400 mb-1">Recent trainer themes</p>
          <p className="text-xs text-gray-500 mb-3">
            Positions generated from your games (not the game list itself).{" "}
            <Link href="/trainer/review" className="text-cyan-200/90 underline hover:text-cyan-100">
              Open game review
            </Link>{" "}
            for full history.
          </p>
          <div className="flex flex-col gap-2 text-sm text-gray-300">
            {recentThemes.length === 0 ? (
              <p>No approved trainer positions yet. Finish games to generate themes here.</p>
            ) : (
              recentThemes.map((p, i) => (
                <p key={`${p.theme}-${i}`}>
                  {p.theme} • {new Date(p.created_at).toLocaleDateString()}
                </p>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
