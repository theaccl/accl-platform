import NavigationBar from "@/components/NavigationBar";
import HomeButton from "@/components/HomeButton";
import { UtcClock } from "@/components/UtcClock";

export default function TournamentsPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white flex flex-col">
      <NavigationBar />

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        <div className="flex w-full max-w-lg flex-col items-center gap-2">
          <h1 className="text-3xl font-bold mb-1">TOURNAMENTS</h1>
          <UtcClock className="text-center text-[11px] tabular-nums text-sky-300/90" />
        </div>

        <HomeButton label="JOIN TOURNAMENT" route="/tournaments/join" />
        <HomeButton label="BRACKETS" route="/tournaments/brackets" />
        <HomeButton label="ACTIVE TOURNAMENTS" route="/tournaments/active" />
        <HomeButton label="REDEMPTION" route="/tournaments/redemption" />
        <HomeButton label="ENTRY CART" route="/tournaments/cart" />
      </div>
    </div>
  );
}
