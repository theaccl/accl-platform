import NexusLinkWrapper from "@/components/nexus/NexusLinkWrapper";
import NexusRecoveryHint from "@/components/nexus/NexusRecoveryHint";
import NexusTrustHint, { trustMessageForTopActionCard } from "@/components/nexus/NexusTrustHint";
import { nexusInteractiveLift, nexusModuleHeadingClass, nexusTransition } from "@/components/nexus/NexusHeader";
import { isValidHubHandoffHref } from "@/lib/nexus/nexusRouteHelpers";
import type { NexusActionCard } from "@/lib/nexus/types";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111723]";

const primaryActionSurface =
  "border-red-500/55 bg-gradient-to-b from-red-950/50 to-red-950/75 text-red-50 shadow-lg shadow-red-950/35 ring-1 ring-inset ring-red-400/25 hover:border-red-400/65 hover:from-red-900/55 hover:to-red-950/90 hover:shadow-red-950/45 active:from-red-950/60 active:to-red-950/80 motion-safe:active:scale-[0.995] motion-safe:transition-transform motion-safe:duration-150 motion-reduce:active:scale-100";

const secondaryActionSurface =
  "border-white/[0.09] bg-[#131c2c] text-gray-200 shadow-sm shadow-black/20 ring-1 ring-inset ring-white/[0.04] hover:border-red-500/30 hover:bg-[#1a2438] hover:shadow-md hover:shadow-black/25 hover:ring-white/[0.06] active:bg-[#121a28] motion-safe:active:scale-[0.995] motion-safe:transition-[transform,background-color,border-color,box-shadow] motion-safe:duration-150 motion-reduce:active:scale-100";

/** Short contextual hints for native tooltip */
const CARD_HINT: Partial<Record<string, string>> = {
  login: "Sign in for personalized standings and saves",
  "current-games": "Opens /free/active — every active or waiting seat for your account",
};

/** Display titles — optional overrides when mapping titles need a shorter banner label */
const TITLE_OVERRIDE: Partial<Record<string, string>> = {};

export default function NexusActionCards({ cards }: { cards: NexusActionCard[] }) {
  const safe = cards.filter((c) => Boolean(c.href) && isValidHubHandoffHref(c.href));
  const ordered = [...safe].sort((a, b) => {
    if (b.urgency !== a.urgency) return b.urgency - a.urgency;
    return a.priority - b.priority;
  });

  return (
    <section
      className={`flex h-full min-h-[11rem] flex-col gap-4 rounded-2xl border border-[#2a3442] bg-[#111723] p-4 sm:p-5 shadow-lg shadow-black/25 ring-1 ring-inset ring-red-500/10 ${nexusTransition}`}
      aria-label="Next actions"
    >
      <h2 className={`${nexusModuleHeadingClass} mb-0`}>Next actions</h2>
      {ordered.length === 0 ? (
        <NexusRecoveryHint message="Use the top bar to sign in, then return here for Resume game and other handoffs." />
      ) : null}
      <div className="grid flex-1 grid-cols-1 content-start gap-3 sm:grid-cols-2 sm:gap-3.5">
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
              className={`group block min-h-[3rem] rounded-xl border px-4 py-3 text-left ${valid ? `cursor-pointer ${nexusInteractiveLift} ${focusRing}` : "cursor-default opacity-90"} ${
                primary ? primaryActionSurface : secondaryActionSurface
              } ${topPrimary ? "sm:min-h-[3.25rem]" : ""} ${isTop && !topPrimary ? "shadow-md shadow-black/30" : ""}`}
            >
              <span
                className={`block tracking-tight ${isTop ? "text-[15px] font-semibold text-white" : "font-semibold text-gray-100"}`}
              >
                {titleText}
              </span>
              {topTrust ? <NexusTrustHint message={topTrust} /> : null}
              <span
                className={`mt-1.5 block text-[11px] leading-snug ${primary ? "text-red-200/75 group-hover:text-red-100/90" : "text-gray-500 group-hover:text-gray-400"}`}
              >
                {c.description}
              </span>
            </NexusLinkWrapper>
          );
        })}
      </div>
    </section>
  );
}
