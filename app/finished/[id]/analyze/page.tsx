"use client";
import NavigationBar from "@/components/NavigationBar";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function FinishedGameAnalyzePage() {
  const params = useParams<{ id: string }>();
  const [insight, setInsight] = useState("You lost control after move 17 and dropped material.");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const gameId = String(params?.id ?? "").trim();
      if (!gameId) return;
      const { data } = await supabase
        .from("finished_game_analysis_artifacts")
        .select("payload")
        .eq("game_id", gameId)
        .eq("artifact_type", "engine_structured")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const payload = (data as { payload?: { engine?: { tacticalTags?: string[] } } } | null)?.payload;
      const firstTag = String(payload?.engine?.tacticalTags?.[0] ?? "").trim();
      if (firstTag) {
        setInsight(`Detected tactical focus: ${firstTag}.`);
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
        <h1 className="text-3xl font-bold">ANALYZE GAME</h1>

        <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
          <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-6 min-h-[240px] flex items-center justify-center text-gray-500">
            Analysis Board Placeholder
          </div>

          <div className="bg-[#0D1117] border border-gray-700 rounded-xl p-4">
            <p className="text-sm text-gray-400 mb-2">Mentor Insight</p>
            <p className="text-gray-200">{insight}</p>
          </div>

          <div className="flex flex-col gap-3">
            <button className="w-full py-4 bg-[#21262d] rounded-xl text-lg font-semibold hover:bg-[#2b3138] transition">
              SHOW BEST MOVE
            </button>

            <button className="w-full py-4 bg-[#21262d] rounded-xl text-lg font-semibold hover:bg-[#2b3138] transition">
              SHOW IDEA
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
