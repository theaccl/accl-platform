"use client";
import NavigationBar from "@/components/NavigationBar";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function FinishedGameTrainPage() {
  const params = useParams<{ id: string }>();
  const [detectedPattern, setDetectedPattern] = useState("Fork Awareness");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const gameId = String(params?.id ?? "").trim();
      if (!gameId) return;
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || cancelled) return;
      const { data } = await supabase
        .from("trainer_generated_positions")
        .select("theme")
        .eq("user_id", uid)
        .eq("source_game_id", gameId)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        const theme = String((data as { theme?: string } | null)?.theme ?? "").trim();
        if (theme) setDetectedPattern(theme);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params?.id]);

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />

      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
        <h1 className="text-3xl font-bold">TRAIN FROM THIS GAME</h1>

        <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
          <p className="text-sm text-gray-400">Detected Pattern</p>
          <p className="text-lg font-semibold">{detectedPattern}</p>

          <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-6 min-h-[240px] flex items-center justify-center text-gray-500">
            Training Position Placeholder
          </div>

          <button className="w-full py-4 bg-[#21262d] rounded-xl text-lg font-semibold hover:bg-[#2b3138] transition">
            START TRAINING SESSION
          </button>
        </div>
      </div>
    </div>
  );
}
