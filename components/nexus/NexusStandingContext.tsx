import NexusDataStateLabel from "@/components/nexus/NexusDataStateLabel";
import { nexusModuleHeadingClass } from "@/components/nexus/NexusHeader";
import NexusRecoveryHint, {
  HUB_MSG_STANDING_OUT_OF_RANGE,
  HUB_MSG_STANDING_SIGNED_OUT,
} from "@/components/nexus/NexusRecoveryHint";
import NexusStandingReady from "@/components/nexus/NexusStandingReady";
import type { NexusStandingContextState } from "@/lib/nexus/types";

export default function NexusStandingContext({ state }: { state: NexusStandingContextState }) {
  if (state.state === "ready") {
    return (
      <NexusStandingReady
        message={state.message}
        hint={state.hint}
        emphasis={state.emphasis}
        rank={state.rank}
        tier={state.tier}
        streak={state.streak}
        rating={state.rating}
        earned={state.earned}
        gamesPlayed={state.gamesPlayed}
      />
    );
  }

  const recoveryMessage =
    state.message === HUB_MSG_STANDING_SIGNED_OUT
      ? "Sign in to view your standing and activity."
      : state.message === HUB_MSG_STANDING_OUT_OF_RANGE
        ? "Play games to enter the standings."
        : null;

  return (
    <section
      className="rounded-2xl border border-[#2a3442] bg-[#111723] p-4 shadow-md shadow-black/15"
      aria-label="Standing context"
    >
      <h2 className={nexusModuleHeadingClass}>Your standing</h2>
      <div className="flex min-h-[5.5rem] flex-col items-center justify-center rounded-lg border border-dashed border-[#2a3442]/70 bg-[#0a0e14]/50 px-4 py-8 text-center">
        <NexusDataStateLabel state="placeholder">Standing data not available.</NexusDataStateLabel>
        <p className="max-w-sm text-sm leading-relaxed text-gray-400">{state.message}</p>
        {recoveryMessage ? (
          <div className="max-w-sm text-center">
            <NexusRecoveryHint message={recoveryMessage} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
