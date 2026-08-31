import NavigationBar from "@/components/NavigationBar";
import HomeButton from "@/components/HomeButton";
import { GenerationTokenCard } from "@/components/image-generator/GenerationTokenCard";

export default function VaultPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white flex flex-col">
      <NavigationBar />

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-5 px-6 py-10">
        <h1 className="text-3xl font-bold mb-4">VAULT</h1>

        <GenerationTokenCard />

        <div className="flex flex-col items-center gap-5 pt-3">
          <HomeButton label="FREE VAULT" route="/vault/free" comingSoon />
          <HomeButton label="TOURNAMENT VAULT" route="/vault/tournament" comingSoon />
        </div>
      </div>
    </div>
  );
}
