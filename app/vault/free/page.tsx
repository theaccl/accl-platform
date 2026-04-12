import NavigationBar from "@/components/NavigationBar";

export default function FreeVaultPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />

      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
        <h1 className="text-3xl font-bold">FREE VAULT</h1>

        <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
          <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-4">
            <p className="font-semibold">Cardi Bot Victory Badge</p>
            <p className="text-sm text-gray-400 mt-1">Earned for defeating Cardi Bot.</p>
          </div>

          <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-4">
            <p className="font-semibold">10 Game Win Streak</p>
            <p className="text-sm text-gray-400 mt-1">Free play milestone reward.</p>
          </div>

          <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-4">
            <p className="font-semibold">Fork Master Badge</p>
            <p className="text-sm text-gray-400 mt-1">Training / tactical mastery reward.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
