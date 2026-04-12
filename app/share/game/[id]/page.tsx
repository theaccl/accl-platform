import type { Metadata } from "next";
import { getPublicNexusData } from "@/lib/nexus/getPublicNexusData";
import ShareView from "@/components/public/ShareView";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ eco?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "ACCL — Watch live chess matches",
    description: "Spectate a live ACCL chess match or join free play.",
    openGraph: {
      title: "ACCL — Watch live chess matches",
      description: "Spectate live chess on ACCL.",
      type: "website",
      url: `/share/game/${id}`,
    },
  };
}

export default async function ShareGamePage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const eco = sp?.eco === "k12" ? "k12" : "adult";
  const data = await getPublicNexusData(eco);
  const live = data.live_games.find((g) => g.id === id);
  const k12 = eco === "k12";
  const spectatePath = k12 ? `/game/${id}?spectate=1&eco=k12` : `/game/${id}?spectate=1`;

  if (live) {
    return (
      <ShareView
        eyebrow="Live match"
        title={`${live.white_label} vs ${live.black_label}`}
        summary={`${live.time_control} · ${live.tournament_name ?? "Live board"} · ${String(live.status)}`}
        statsLine={
          [
            live.global_event_chip,
            live.is_championship_match ? "Championship board" : null,
            typeof live.move_count === "number" ? `Moves: ${live.move_count}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        watchHref={spectatePath}
        joinHref="/login?intent=signup&next=/free/play"
        k12={k12}
      />
    );
  }

  return (
    <ShareView
      eyebrow="Match"
      title="ACCL chess match"
      summary="This board may not be on the live adult snapshot, or it finished. You can still open the public game link — finished games replay in read-only mode when available."
      watchHref={spectatePath}
      joinHref="/login?intent=signup&next=/free/play"
      k12={k12}
    />
  );
}
