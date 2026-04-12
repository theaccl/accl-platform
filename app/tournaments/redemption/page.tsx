import NavigationBar from "@/components/NavigationBar";

export default function TournamentRedemptionPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-6">REDEMPTION</h1>

        <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
          <p className="text-gray-300">Redemption system placeholder.</p>
          <p className="text-sm text-gray-400">
            Track redemption badges, free-entry progress, and fallback paths into the main tournament.
          </p>
        </div>
      </div>
    </div>
  );
}
