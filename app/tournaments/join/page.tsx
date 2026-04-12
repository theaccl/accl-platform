import NavigationBar from "@/components/NavigationBar";

export default function TournamentJoinPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-6">JOIN TOURNAMENT</h1>

        <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
          <div>
            <p className="text-sm text-gray-400 mb-2">Available Tournament</p>
            <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-4">
              <p className="font-semibold">Tournament of Champions</p>
              <p className="text-sm text-gray-400 mt-1">8-player bracket • Entry fee placeholder</p>
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-2">Format</p>
            <div className="flex flex-wrap gap-2">
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">Live</button>
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">Daily</button>
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">Correspondence</button>
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-2">Entry Type</p>
            <div className="flex flex-wrap gap-2">
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">Standard Entry</button>
              <button className="px-4 py-2 rounded-lg bg-[#21262d]">Redemption Entry</button>
            </div>
          </div>

          <button className="w-full py-4 bg-[#21262d] rounded-xl text-lg font-semibold hover:bg-[#2b3138] transition">
            ADD TO CART
          </button>
        </div>
      </div>
    </div>
  );
}
