"use client";
import NavigationBar from "@/components/NavigationBar";
import SkillProfileCard from "@/components/trainer/SkillProfileCard";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function TrainerSkillsPage() {
  const [skills, setSkills] = useState<string[]>(["Tactics", "Openings", "Endgames", "Calculation"]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || cancelled) return;
      const { data } = await supabase
        .from("player_pattern_profiles")
        .select("pattern_tags,suggested_themes")
        .eq("user_id", uid)
        .maybeSingle();
      const row = data as { pattern_tags?: unknown[]; suggested_themes?: unknown[] } | null;
      const next = [
        ...new Set(
          [...(row?.suggested_themes ?? []), ...(row?.pattern_tags ?? [])]
            .map((x) => String(x ?? "").trim())
            .filter((x) => x.length > 0)
        ),
      ].slice(0, 8);
      if (!cancelled && next.length > 0) {
        setSkills(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />

      <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">
        <h1 className="text-3xl font-bold">SKILLS</h1>
        <p className="text-sm text-gray-400 leading-relaxed">
          Structured profile from finished-game patterns and Trainer sessions — never from live games.
        </p>

        <SkillProfileCard k12={false} />

        <div className="bg-[#161b22] rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-3">Themes from your games</p>
          <div className="flex flex-wrap gap-3">
            {skills.map((skill) => (
              <span key={skill} className="px-4 py-3 rounded-xl bg-[#21262d] text-sm">
                {skill}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
