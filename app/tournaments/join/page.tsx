import NavigationBar from "@/components/NavigationBar";

export default function TournamentJoinPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-6 text-3xl font-bold">JOIN TOURNAMENT</h1>

        <div className="flex flex-col gap-4 rounded-2xl bg-[#161b22] p-5">
          <div>
            <p className="mb-2 text-sm text-gray-400">Available Tournament</p>
            <div className="rounded-xl border border-gray-700 bg-[#0D1117] p-4">
              <p className="font-semibold">Tournament of Champions</p>
              <p className="mt-1 text-sm text-gray-400">8-player bracket • Entry fee placeholder</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm text-gray-400">Format</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg bg-[#1a1f28] px-4 py-2 text-gray-500 opacity-60"
              >
                Live
              </button>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg bg-[#1a1f28] px-4 py-2 text-gray-500 opacity-60"
              >
                Daily
              </button>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg bg-[#1a1f28] px-4 py-2 text-gray-500 opacity-60"
              >
                Correspondence
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm text-gray-400">Entry Type</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg bg-[#1a1f28] px-4 py-2 text-gray-500 opacity-60"
              >
                Standard Entry
              </button>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg bg-[#1a1f28] px-4 py-2 text-gray-500 opacity-60"
              >
                Redemption Entry
              </button>
            </div>
          </div>

          <p className="text-sm text-amber-200/90">
            Tournament entry flows are not wired yet — controls are disabled until checkout is connected.
          </p>

          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-xl bg-[#1e242e] py-4 text-lg font-semibold text-gray-500 opacity-70"
          >
            Add to cart (coming soon)
          </button>
        </div>
      </div>
    </div>
  );
}
