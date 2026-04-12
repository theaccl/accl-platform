import NavigationBar from "@/components/NavigationBar";
import Link from "next/link";

export default function FinishedGameDetailPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />

      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
        <h1 className="text-3xl font-bold">FINISHED GAME</h1>

        <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
          <div>
            <p className="font-semibold text-lg">vs Player123</p>
            <p className="text-sm text-gray-400 mt-1">Win • Rapid • Rated</p>
          </div>

          <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-6 min-h-[240px] flex items-center justify-center text-gray-500">
            Board Replay Placeholder
          </div>

          <div className="flex flex-col gap-3">
            <Link
              href="/finished/1/analyze"
              className="w-full py-4 bg-[#21262d] rounded-xl text-lg font-semibold hover:bg-[#2b3138] transition text-center"
            >
              ANALYZE GAME
            </Link>

            <Link
              href="/finished/1/train"
              className="w-full py-4 bg-[#21262d] rounded-xl text-lg font-semibold hover:bg-[#2b3138] transition text-center"
            >
              TRAIN FROM THIS GAME
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
