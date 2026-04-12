import NavigationBar from "@/components/NavigationBar";
import ProfileLogOutButton from "@/components/profile/ProfileLogOutButton";
import PlayerNexusInsightsPanel from "@/components/PlayerNexusInsightsPanel";
import Link from "next/link";

export default function ProfilePage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />

      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-8">
        <div className="flex justify-end">
          <ProfileLogOutButton />
        </div>

        {/* Top Identity Section */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-28 h-28 rounded-full border-4 border-gray-600 flex items-center justify-center text-4xl bg-[#161b22]">
            👤
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-bold">Username</h1>
            <p className="text-sm text-gray-400">Default Border / Zero Status</p>
          </div>
        </div>

        {/* Player Info */}
        <div className="bg-[#161b22] rounded-2xl p-5">
          <h2 className="text-lg font-semibold mb-3">Player Info</h2>
          <div className="flex flex-col gap-2 text-sm text-gray-300">
            <p>Bio: Add your bio here</p>
            <p>Games Played: 0</p>
            <p>Wins: 0</p>
            <p>Losses: 0</p>
            <p>Win %: 0%</p>
          </div>
        </div>

        <PlayerNexusInsightsPanel />

        {/* Main Actions */}
        <div className="flex flex-col gap-4">
          <Link
            href="/vault"
            className="w-full py-4 bg-[#161b22] rounded-xl text-lg font-semibold hover:bg-[#21262d] transition text-center"
          >
            ENTER VAULT
          </Link>

          <button className="w-full py-4 bg-[#161b22] rounded-xl text-lg font-semibold hover:bg-[#21262d] transition">
            VIEW FINISHED GAMES
          </button>

          <button className="w-full py-4 bg-[#161b22] rounded-xl text-lg font-semibold hover:bg-[#21262d] transition">
            GO TO TRAINER
          </button>
        </div>

        {/* K-12 Entry */}
        <div className="pt-4 border-t border-gray-800">
          <button className="text-sm text-gray-400 hover:text-white transition">
            Guardian / Student Setup
          </button>
        </div>
      </div>
    </div>
  );
}
