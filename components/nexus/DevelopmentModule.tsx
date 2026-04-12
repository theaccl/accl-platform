"use client";

import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import SkillProfileCardView from "@/components/trainer/SkillProfileCardView";
import { useDevelopmentProfile } from "@/hooks/useDevelopmentProfile";

export default function DevelopmentModule({ k12 = false }: { k12?: boolean }) {
  const profile = useDevelopmentProfile(k12);
  const { loading, insights, summary } = profile;
  const top = insights[0]?.text ?? summary?.sample_label ?? "Development signals from your finished games.";

  const collapsed = (
    <div className="space-y-2">
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <p className="text-sm text-gray-300 leading-relaxed line-clamp-3">{top}</p>
      )}
    </div>
  );

  const expanded = (
    <div className="space-y-4">
      <SkillProfileCardView k12={k12} state={profile} />
    </div>
  );

  return (
    <ExpandablePanel
      title="Development"
      subtitle="Post-game learning loop"
      statusText={k12 ? "K–12" : "coach"}
      collapsed={collapsed}
      expanded={expanded}
      k12={k12}
    />
  );
}
