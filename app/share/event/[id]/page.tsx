import type { Metadata } from "next";
import { getPublicNexusData } from "@/lib/nexus/getPublicNexusData";
import { NEXUS_LOGIN_ENTRY_HREF } from "@/lib/nexus/nexusRouteHelpers";
import ShareView from "@/components/public/ShareView";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ eco?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "ACCL — Competitive chess tournaments",
    description: "Major ACCL event — watch live play or join the league.",
    openGraph: {
      title: "ACCL — Competitive chess tournaments",
      description: "Structured ACCL event window.",
      type: "website",
      url: `/share/event/${id}`,
    },
  };
}

export default async function ShareEventPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const eco = sp?.eco === "k12" ? "k12" : "adult";
  const data = await getPublicNexusData(eco);
  const ev = data.global_events.find((e) => e.event_id === id) ?? null;
  const k12 = eco === "k12";
  const watch =
    data.live_games.find((g) => g.global_event_id === id)?.id ??
    data.live_games[0]?.id ??
    null;
  const watchHref = watch
    ? k12
      ? `/game/${watch}?spectate=1&eco=k12`
      : `/game/${watch}?spectate=1`
    : NEXUS_LOGIN_ENTRY_HREF;

  if (ev) {
    return (
      <ShareView
        eyebrow={ev.is_championship ? "Championship window" : "Major event"}
        title={k12 ? ev.title_k12 : ev.title}
        summary={`${ev.event_type.replace(/_/g, " ")} · ${ev.lifecycle_state} · ${ev.stage}`}
        statsLine={`Ecosystem: ${ev.ecosystem_scope}`}
        watchHref={watchHref}
        joinHref="/login?intent=signup&next=/nexus"
        k12={k12}
      />
    );
  }

  return (
    <ShareView
      eyebrow="Event"
      title="ACCL event"
      summary="This event id is not on the current public snapshot — check Nexus for the live schedule."
      watchHref={NEXUS_LOGIN_ENTRY_HREF}
      joinHref="/login?intent=signup&next=/nexus"
      k12={k12}
    />
  );
}
