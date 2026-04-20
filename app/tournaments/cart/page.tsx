import NavigationBar from "@/components/NavigationBar";

export default function TournamentCartPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-6 text-3xl font-bold">ENTRY CART</h1>

        <div className="flex flex-col gap-4 rounded-2xl bg-[#161b22] p-5">
          <div className="rounded-xl border border-gray-700 bg-[#0D1117] p-4">
            <p className="font-semibold">No tournament entries in cart yet.</p>
            <p className="mt-1 text-sm text-gray-400">
              Tournament selections will appear here before checkout.
            </p>
          </div>

          <p className="text-sm text-amber-200/90">Checkout is not available yet — button disabled until payments are connected.</p>

          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-xl bg-[#1e242e] py-4 text-lg font-semibold text-gray-500 opacity-70"
          >
            Checkout (coming soon)
          </button>
        </div>
      </div>
    </div>
  );
}
