import NavigationBar from "@/components/NavigationBar";

export default function TournamentVaultPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />

      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
        <h1 className="text-3xl font-bold">TOURNAMENT VAULT</h1>

        <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
          <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-4">
            <p className="font-semibold">TC0125 Champion Trophy</p>
            <p className="text-sm text-gray-400 mt-1">
              Awarded for winning Tournament of Champions section TC0125.
            </p>
          </div>

          <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-4">
            <p className="font-semibold">Golden Ticket</p>
            <p className="text-sm text-gray-400 mt-1">Awarded through redemption advancement.</p>
          </div>

          <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-4">
            <p className="font-semibold">Redemption Badge</p>
            <p className="text-sm text-gray-400 mt-1">Tracked tournament comeback achievement.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
