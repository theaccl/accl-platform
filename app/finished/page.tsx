import NavigationBar from "@/components/NavigationBar";

export default function FinishedPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />

      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
        <h1 className="text-3xl font-bold">FINISHED GAMES</h1>

        <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
          <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-4">
            <p className="font-semibold">vs Player123</p>
            <p className="text-sm text-gray-400 mt-1">Win • Rapid • Rated</p>
          </div>

          <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-4">
            <p className="font-semibold">vs Cardi Bot</p>
            <p className="text-sm text-gray-400 mt-1">Loss • Blitz • Bot Game</p>
          </div>

          <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-4">
            <p className="font-semibold">vs Tournament Opponent</p>
            <p className="text-sm text-gray-400 mt-1">Win • Live • Tournament</p>
          </div>
        </div>
      </div>
    </div>
  );
}
