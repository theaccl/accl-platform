import NavigationBar from "@/components/NavigationBar";

export default function TournamentCartPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-6">ENTRY CART</h1>

        <div className="bg-[#161b22] rounded-2xl p-5 flex flex-col gap-4">
          <div className="rounded-xl bg-[#0D1117] border border-gray-700 p-4">
            <p className="font-semibold">No tournament entries in cart yet.</p>
            <p className="text-sm text-gray-400 mt-1">
              Tournament selections will appear here before checkout.
            </p>
          </div>

          <button className="w-full py-4 bg-[#21262d] rounded-xl text-lg font-semibold hover:bg-[#2b3138] transition">
            CHECKOUT
          </button>
        </div>
      </div>
    </div>
  );
}
