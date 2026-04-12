import Link from "next/link";
import NavigationBar from "@/components/NavigationBar";

export default function FreePlayMatchPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <div className="max-w-2xl mx-auto px-6 py-8">
        <p className="text-sm text-gray-400 mb-4">
          <Link href="/trainer/lab" className="text-red-300 underline hover:text-red-200">
            Open Trainer lab
          </Link>{" "}
          — post-game style analysis for practice positions (not during live games).
        </p>
        <h1 className="text-3xl font-bold mb-6">PLAY</h1>

        <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
          <div>
            <p className="text-sm text-gray-400 mb-2">Mode</p>
            <div className="flex flex-wrap gap-2">
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">Bullet</button>
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">Blitz</button>
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">Rapid</button>
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">Daily</button>
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-2">Time Control</p>
            <div className="flex flex-wrap gap-2">
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">1m</button>
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">3m</button>
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">5m</button>
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">10m</button>
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-2">Rated</p>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">Rated</button>
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">Unrated</button>
            </div>
          </div>

          <button className="w-full py-4 bg-[#21262d] rounded-xl text-lg font-semibold hover:bg-[#2b3138] transition">
            FIND MATCH
          </button>
        </div>
      </div>
    </div>
  );
}
