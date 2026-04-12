"use client";

import NavigationBar from "@/components/NavigationBar";
import TrainerPanel from "@/components/trainer/TrainerPanel";
import { START_FEN } from "@/lib/startFen";

export default function TrainerLabPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <div className="max-w-xl mx-auto px-4 py-8 space-y-4">
        <h1 className="text-2xl font-bold">Trainer lab</h1>
        <p className="text-sm text-gray-400 leading-relaxed">
          Paste a FEN or use the default start position. Analysis runs on the server with bounded depth — for
          learning in free / post-game contexts only, never during live tournament play.
        </p>
        <TrainerPanel fen={START_FEN} allowFenEdit gameId={null} />
      </div>
    </div>
  );
}
