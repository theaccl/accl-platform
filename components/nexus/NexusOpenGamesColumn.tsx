import { nexusPrestigeCard } from "@/components/nexus/nexusShellTheme";
import { nexusModuleHeadingClass } from "@/components/nexus/NexusHeader";

/**
 * Placeholder until liveGames is threaded in a follow-up — UI shell only.
 */
export default function NexusOpenGamesColumn() {
  return (
    <section
      className={`${nexusPrestigeCard} flex min-h-[168px] flex-col p-4 sm:min-h-[180px] sm:p-5`}
      aria-label="Open games"
      data-testid="nexus-open-games-placeholder"
    >
      <h2 className={nexusModuleHeadingClass}>Open games</h2>
      <p className="mt-3 text-sm leading-relaxed text-gray-500">
        Live open games will list here when wired to a data source. For open seats, chat, and matchmaking, use{" "}
        <span className="font-medium text-gray-400">Play Free</span> in the top bar.
      </p>
    </section>
  );
}
