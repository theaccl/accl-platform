"use client";
import NavigationBar from "@/components/NavigationBar";
import HomeButton from "@/components/HomeButton";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function TrainerPage() {
  const [mentorInsight, setMentorInsight] = useState("Building your pattern profile from finished games.");
  const [recentPositions, setRecentPositions] = useState<Array<{ theme: string; created_at: string }>>([]);

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
        setRecentPositions((positions as Array<{ theme: string; created_at: string }>) ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0D1117] text-white flex flex-col">
      <NavigationBar />

      <div className="max-w-3xl mx-auto w-full flex flex-1 flex-col px-6 py-8 gap-6">
        <div className="bg-[#161b22] rounded-2xl p-5">
          <p className="text-sm text-gray-400 mb-2">Mentor Insight</p>
          <p className="text-lg font-semibold">{mentorInsight}</p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <HomeButton label="TRAINER LAB (POSITIONS)" route="/trainer/lab" />
          <HomeButton label="TRAIN MY PATTERNS" route="/trainer/patterns" />
          <HomeButton label="PLAY COMPUTER" route="/trainer/computer" />
          <HomeButton label="REVIEW MY GAMES" route="/trainer/review" />
          <HomeButton label="SKILLS" route="/trainer/skills" />
        </div>

        <div className="bg-[#161b22] rounded-2xl p-5">
          <p className="text-sm text-gray-400 mb-3">Recent Games</p>
          <div className="flex flex-col gap-2 text-sm text-gray-300">
            {recentPositions.length === 0 ? (
              <p>No approved trainer positions yet. Finish games to generate them.</p>
            ) : (
              recentPositions.map((p, i) => (
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
