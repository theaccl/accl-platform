import NavigationBar from "@/components/NavigationBar";

export default function FreeCreateGamePage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-6">CREATE GAME</h1>

        <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
          <div>
            <label className="text-sm text-gray-400 block mb-2">Opponent Username</label>
            <input
              type="text"
              placeholder="Enter username"
              className="w-full rounded-xl bg-[#0D1117] border border-gray-700 px-4 py-3 text-white outline-none"
            />
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-2">Time Control</p>
            <div className="flex flex-wrap gap-2">
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">3m</button>
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">5m</button>
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">10m</button>
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">Daily</button>
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
            SEND CHALLENGE
          </button>
        </div>
      </div>
    </div>
  );
}
