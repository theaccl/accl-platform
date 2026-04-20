import NavigationBar from "@/components/NavigationBar";
import HomeButton from "@/components/HomeButton";

export default function VaultPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white flex flex-col">
      <NavigationBar />

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        <h1 className="text-3xl font-bold mb-4">VAULT</h1>

        <HomeButton label="FREE VAULT" route="/vault/free" comingSoon />
        <HomeButton label="TOURNAMENT VAULT" route="/vault/tournament" comingSoon />
      </div>
    </div>
  );
}
