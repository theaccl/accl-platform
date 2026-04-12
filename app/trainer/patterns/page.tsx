"use client";
import NavigationBar from "@/components/NavigationBar";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function TrainerPatternsPage() {
  const [focus, setFocus] = useState("Fork Awareness");
  const [summary, setSummary] = useState(
    "This session will use repeated mistakes from your past completed games."
  );

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
      const nextFocus = String(row?.suggested_themes?.[0] ?? "").trim();
      if (!cancelled && nextFocus) {
        setFocus(nextFocus);
      }
      const firstTag = String(row?.pattern_tags?.[0] ?? "").trim();
      if (!cancelled && firstTag) {
        setSummary(`Generated from approved finished-game analysis tags: ${firstTag}.`);
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
        <h1 className="text-3xl font-bold">TRAIN MY PATTERNS</h1>

        <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
          <p className="text-sm text-gray-400">Current Focus</p>
          <p className="text-lg font-semibold">{focus}</p>
          <p className="text-sm text-gray-300">{summary}</p>

          <button className="w-full py-4 bg-[#21262d] rounded-xl text-lg font-semibold hover:bg-[#2b3138] transition">
            START SESSION
          </button>
        </div>

        <div className="bg-[#161b22] rounded-2xl p-5">
          <p className="text-sm text-gray-400 mb-2">Pattern Replay Preview</p>
          <p className="text-gray-300">
            Similar mistakes from your own games will be turned into training positions.
          </p>
        </div>
      </div>
    </div>
  );
}
