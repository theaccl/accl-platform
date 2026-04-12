"use client";
import NavigationBar from "@/components/NavigationBar";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type FinishedRow = {
  id: string;
  created_at: string;
  result: string | null;
  tempo: string | null;
  rated: boolean | null;
};

export default function TrainerReviewPage() {
  const [rows, setRows] = useState<FinishedRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || cancelled) return;
      const { data } = await supabase
        .from("games")
        .select("id,created_at,result,tempo,rated")
        .eq("status", "finished")
        .or(`white_player_id.eq.${uid},black_player_id.eq.${uid}`)
        .order("created_at", { ascending: false })
        .limit(3);
      if (!cancelled) setRows((data as FinishedRow[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />

      <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">
        <h1 className="text-3xl font-bold">REVIEW MY GAMES</h1>

        <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
          {rows.length === 0 ? (
            <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-4">
              <p className="font-semibold">No finished games available yet.</p>
              <p className="text-sm text-gray-400 mt-1">Complete games to unlock review and analysis actions.</p>
            </div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="rounded-xl bg-[#0D1117] border border-gray-700 p-4">
                <p className="font-semibold">Game {r.id.slice(0, 8)}…</p>
                <p className="text-sm text-gray-400 mt-1">
                  {r.result ?? "result pending"} • {r.tempo ?? "tempo"} • {r.rated ? "Rated" : "Unrated"}
                </p>
              </div>
            ))
          )}

          <div className="flex flex-col gap-3">
            <Link
              href={rows[0] ? `/finished/${rows[0].id}/analyze` : "/finished"}
              className="w-full py-4 bg-[#21262d] rounded-xl text-lg font-semibold hover:bg-[#2b3138] transition text-center"
            >
              ANALYZE GAME
            </Link>

            <Link
              href={rows[0] ? `/finished/${rows[0].id}/train` : "/trainer/patterns"}
              className="w-full py-4 bg-[#21262d] rounded-xl text-lg font-semibold hover:bg-[#2b3138] transition text-center"
            >
              TRAIN FROM MISTAKES
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
