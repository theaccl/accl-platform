import NexusShell from "@/components/nexus/NexusShell";
import type { NexusEcosystem } from "@/lib/nexus/getNexusData";

export default async function NexusPage({
  searchParams,
}: {
  searchParams: Promise<{ ecosystem?: string; public?: string }>;
}) {
  const sp = await searchParams;
  const ecosystem: NexusEcosystem = String(sp?.ecosystem ?? "").toLowerCase() === "k12" ? "k12" : "adult";
  const publicMode = String(sp?.public ?? "").toLowerCase() === "1" || String(sp?.public ?? "").toLowerCase() === "true";
  return <NexusShell initialEcosystem={ecosystem} publicMode={publicMode} />;
}

