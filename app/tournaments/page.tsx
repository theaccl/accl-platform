import NavigationBar from "@/components/NavigationBar";
import HomeButton from "@/components/HomeButton";

export default function TournamentsPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white flex flex-col">
      <NavigationBar />

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        <h1 className="text-3xl font-bold mb-4">TOURNAMENTS</h1>

        <HomeButton label="JOIN TOURNAMENT" route="/tournaments/join" />
        <HomeButton label="BRACKETS" route="/tournaments/brackets" />
        <HomeButton label="ACTIVE TOURNAMENTS" route="/tournaments/active" />
        <HomeButton label="REDEMPTION" route="/tournaments/redemption" />
        <HomeButton label="ENTRY CART" route="/tournaments/cart" />
      </div>
    </div>
  );
}
