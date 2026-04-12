import type { NexusData, NexusSocialLayer } from "@/lib/nexus/getNexusData";
import PlayerIdentityCard from "@/components/nexus/PlayerIdentityCard";
import { pairKey } from "@/lib/social/rivalryDetection";

function firstInt(s: string): number | null {
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function rivalBetween(
  social: NexusSocialLayer | undefined,
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!social || !a || !b) return false;
  return social.head_to_head[pairKey(a, b)]?.is_rival ?? false;
}

function leadersRivalSubtitle(leaders: NexusData["leaders"], social: NexusSocialLayer | undefined, k12: boolean): string | null {
  if (!social) return null;
  const a = leaders.number_one.user_id;
  const b = leaders.top_earner.user_id;
  const c = leaders.streak_leader.user_id;
  if (rivalBetween(social, a, b) || rivalBetween(social, a, c) || rivalBetween(social, b, c)) {
    return k12 ? "Some leaders share a frequent-opponent history." : "Some leaders share a tracked rivalry history.";
  }
  return null;
}

export default function SystemLeaders({
  leaders,
  k12 = false,
  social,
}: {
  leaders: NexusData["leaders"];
  k12?: boolean;
  social?: NexusSocialLayer;
}) {
  const streakApprox = firstInt(leaders.streak_leader.value);
  const a = leaders.number_one.user_id;
  const b = leaders.top_earner.user_id;
  const c = leaders.streak_leader.user_id;
  const sub = leadersRivalSubtitle(leaders, social, k12);
  return (
    <div className="space-y-2">
      {sub ? <p className="text-[10px] text-gray-500 px-0.5">{sub}</p> : null}
      <div className="grid md:grid-cols-[1.2fr_1fr_1fr] gap-3">
        <PlayerIdentityCard
          label={leaders.number_one.username}
          tier={leaders.number_one.tier ?? leaders.number_one.label}
          achievement={leaders.number_one.value}
          icon="🥇"
          emphasis="top"
          k12={k12}
          showVault={false}
          standingRank={1}
          rivalryBadge={Boolean(
            social && a && ((b && rivalBetween(social, a, b)) || (c && rivalBetween(social, a, c))),
          )}
          presenceHint={a ? social?.presence[a] : undefined}
        />
        <PlayerIdentityCard
          label={leaders.top_earner.username}
          tier={leaders.top_earner.tier ?? leaders.top_earner.label}
          achievement={leaders.top_earner.value}
          icon="💰"
          emphasis="high"
          k12={k12}
          showVault={false}
          standingRank={6}
          rivalryBadge={Boolean(
            social && b && ((a && rivalBetween(social, a, b)) || (c && rivalBetween(social, b, c))),
          )}
          presenceHint={b ? social?.presence[b] : undefined}
        />
        <PlayerIdentityCard
          label={leaders.streak_leader.username}
          tier={leaders.streak_leader.tier ?? leaders.streak_leader.label}
          achievement={leaders.streak_leader.value}
          icon="🔥"
          emphasis="high"
          k12={k12}
          showVault={false}
          standingRank={12}
          streak={typeof streakApprox === "number" ? streakApprox : null}
          rivalryBadge={Boolean(
            social && c && ((a && rivalBetween(social, a, c)) || (b && rivalBetween(social, b, c))),
          )}
          presenceHint={c ? social?.presence[c] : undefined}
        />
      </div>
    </div>
  );
}

