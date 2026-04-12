"use client";

import { useDevelopmentProfile } from "@/hooks/useDevelopmentProfile";
import SkillProfileCardView from "@/components/trainer/SkillProfileCardView";

/** Fetches development profile (single hook). Use SkillProfileCardView when data is already loaded. */
export default function SkillProfileCard({
  k12 = false,
  compact = false,
}: {
  k12?: boolean;
  compact?: boolean;
}) {
  const state = useDevelopmentProfile(k12);
  return <SkillProfileCardView k12={k12} compact={compact} state={state} />;
}
