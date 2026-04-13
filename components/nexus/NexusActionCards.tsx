import NexusLinkWrapper from "@/components/nexus/NexusLinkWrapper";
import NexusRecoveryHint from "@/components/nexus/NexusRecoveryHint";
import NexusTrustHint, { trustMessageForTopActionCard } from "@/components/nexus/NexusTrustHint";
import { nexusInteractiveLift, nexusModuleHeadingClass, nexusTransition } from "@/components/nexus/NexusHeader";
import { isValidHubHandoffHref } from "@/lib/nexus/nexusRouteHelpers";
import type { NexusActionCard } from "@/lib/nexus/types";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111723]";

/** Short contextual hints for native tooltip */
const CARD_HINT: Partial<Record<string, string>> = {
  login: "Sign in for personalized standings and saves",
  "continue-game": "Resume your current match — opens game view",
  "tournament-status": "Review a tournament you are entered in — opens tournament page",
  "finished-priority": "Browse recently finished games",
  finished: "Review finished games and analysis",
  profile: "Profile, stats, and account",
  free: "Start a new game — rated or casual outside bracket pressure",
  tournaments: "Browse available tournaments and structured events",
};

/** Display titles — handoff clarity without changing mapping / card ids */
const TITLE_OVERRIDE: Partial<Record<string, string>> = {
  "continue-game": "Resume game",
  "tournament-status": "View tournament",
  "finished-priority": "Review finished games",
  finished: "Review finished games",
};

export default function NexusActionCards({ cards }: { cards: NexusActionCard[] }) {
  const safe = cards.filter((c) => Boolean(c.href) && isValidHubHandoffHref(c.href));
  const ordered = [...safe].sort((a, b) => {
    if (b.urgency !== a.urgency) return b.urgency - a.urgency;
    return a.priority - b.priority;
  });

  return (
    <section
      className={`flex h-full min-h-[11rem] flex-col rounded-2xl border border-[#2a3442] bg-[#111723] p-4 shadow-lg shadow-black/25 ring-1 ring-inset ring-red-500/10 ${nexusTransition}`}
      aria-label="Next actions"
    >
      <h2 className={nexusModuleHeadingClass}>Next actions</h2>
      {ordered.length === 0 ? (
        <NexusRecoveryHint message="Use the quick links for free play, tournaments, and profile." />
      ) : null}
      <div className="grid flex-1 grid-cols-1 content-start gap-2.5 sm:grid-cols-2 sm:gap-3">
        {ordered.map((c, i) => {
          const isTop = i === 0;
          const primary = c.emphasis === "primary";
          const topPrimary = isTop && primary;
          const hint = CARD_HINT[c.id];
          const titleText = TITLE_OVERRIDE[c.id] ?? c.title;
          const valid = Boolean(c.href && isValidHubHandoffHref(c.href));
          const topTrust = isTop ? trustMessageForTopActionCard(c.id) : null;
          return (
            <NexusLinkWrapper
              key={c.id}
              href={c.href}
              isValid={valid}
              title={hint ?? undefined}
              className={`block rounded-xl border px-3.5 py-2.5 text-left ${valid ? `cursor-pointer ${nexusInteractiveLift} ${focusRing}` : "cursor-default opacity-90"} ${
                primary
                  ? `border-red-500/45 bg-red-950/30 text-red-50 hover:border-red-400/60 hover:bg-red-950/50 ${
                      topPrimary ? "shadow-md shadow-red-950/20 ring-1 ring-inset ring-white/10 hover:ring-white/15" : ""
                    }`
                  : "border-[#2a3442] bg-[#151d2c] text-gray-200 hover:border-red-500/40 hover:bg-[#1a2231]"
              } ${isTop && !topPrimary ? "shadow-md shadow-black/30 ring-1 ring-inset ring-white/5" : ""}`}
            >
              <span className={`block ${isTop ? "text-[15px] font-semibold" : "font-semibold"}`}>{titleText}</span>
              {topTrust ? <NexusTrustHint message={topTrust} /> : null}
              <span className="mt-1 block text-[11px] leading-snug text-gray-500">{c.description}</span>
            </NexusLinkWrapper>
          );
        })}
      </div>
    </section>
  );
}
