"use client";
import NavigationBar from "@/components/NavigationBar";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function FinishedGameAnalyzePage() {
  const params = useParams<{ id: string }>();
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const gameId = String(params?.id ?? "").trim();
    setInsight(null);
    setLoading(true);

    if (!gameId) {
      setLoading(false);
      return;
    }

    void (async () => {
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
      } else {
        setInsight(null);
      }
      setLoading(false);
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

        <p className="text-sm text-amber-200/90">
          Analysis engine not connected yet — saved server analysis will appear here when available.
        </p>

        <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
          <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-6 min-h-[240px] flex flex-col items-center justify-center gap-2 text-gray-500">
            <span>Analysis board</span>
            <span className="text-xs text-gray-600">Placeholder — engine not wired</span>
          </div>

          <div className="bg-[#0D1117] border border-gray-700 rounded-xl p-4">
            <p className="text-sm text-gray-400 mb-2">Mentor Insight</p>
            {loading ? (
              <p className="text-gray-500">Loading…</p>
            ) : (
              <p className="text-gray-200">
                {insight ??
                  "No saved analysis for this game yet. The analysis engine is not connected — results will appear here when the pipeline is live."}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              disabled
              title="Coming soon"
              className="w-full cursor-not-allowed rounded-xl bg-[#161b22] py-4 text-lg font-semibold text-gray-500 opacity-80"
            >
              SHOW BEST MOVE (coming soon)
            </button>

            <button
              type="button"
              disabled
              title="Coming soon"
              className="w-full cursor-not-allowed rounded-xl bg-[#161b22] py-4 text-lg font-semibold text-gray-500 opacity-80"
            >
              SHOW IDEA (coming soon)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
