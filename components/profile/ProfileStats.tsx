type Props = {
  gamesPlayed: number;
  currentStreak: number;
  highestStreak: number;
};

export function ProfileStats({ gamesPlayed, currentStreak, highestStreak }: Props) {
  return (
    <section className="space-y-3" aria-labelledby="profile-stats-heading">
      <h2 id="profile-stats-heading" className="text-sm font-semibold text-white">
        Stats
      </h2>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#2a3442] bg-[#0f1420]/80 px-3 py-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Games</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-gray-100">{gamesPlayed}</p>
        </div>
        <div className="rounded-xl border border-[#2a3442] bg-[#0f1420]/80 px-3 py-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Streak</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-gray-100">{currentStreak}</p>
        </div>
        <div className="rounded-xl border border-[#2a3442] bg-[#0f1420]/80 px-3 py-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Best</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-gray-100">{highestStreak}</p>
        </div>
      </div>
    </section>
  );
}
