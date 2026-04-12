import NavigationBar from "@/components/NavigationBar";
import HomeButton from "@/components/HomeButton";

export default function FreePage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white flex flex-col">
      <NavigationBar />

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        <h1 className="text-3xl font-bold mb-4">FREE PLAY</h1>

        <HomeButton label="PLAY" route="/free/play" />
        <HomeButton label="CREATE GAME" route="/free/create" />
        <HomeButton label="PLAY COMPUTER" route="/free/computer" />
        <HomeButton label="ACTIVE GAMES" route="/free/active" />
        <HomeButton label="DIRECT CHALLENGES" route="/free/challenges" />
      </div>
    </div>
  );
}

