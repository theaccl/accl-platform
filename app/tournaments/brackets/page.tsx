import NavigationBar from "@/components/NavigationBar";

export default function TournamentBracketsPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-6">BRACKETS</h1>

        <div className="bg-[#161b22] rounded-2xl p-5">
          <p className="text-gray-400">Bracket view placeholder.</p>
        </div>
      </div>
    </div>
  );
}
