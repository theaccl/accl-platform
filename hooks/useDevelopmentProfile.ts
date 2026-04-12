"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  mergeLocalTrainerRollup,
  type DevelopmentInsight,
  type ImprovementSuggestion,
  type PlayerSkillSummary,
} from "@/lib/trainer/skillAggregation";
import { loadTrainerRollup } from "@/lib/trainer/skillClientStore";

export type DevelopmentProfileState = {
  loading: boolean;
  summary: PlayerSkillSummary | null;
  insights: DevelopmentInsight[];
  suggestions: ImprovementSuggestion[];
};

export function useDevelopmentProfile(k12: boolean): DevelopmentProfileState {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<PlayerSkillSummary | null>(null);
  const [insights, setInsights] = useState<DevelopmentInsight[]>([]);
  const [suggestions, setSuggestions] = useState<ImprovementSuggestion[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const uid = sessionData.session?.user?.id;
      if (!token || !uid) {
        if (!cancelled) setLoading(false);
        return;
      }
      const res = await fetch("/api/player/development-profile", {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(k12 ? { "x-accl-ecosystem": "k12" } : {}),
        },
      });
      if (!res.ok) {
        if (!cancelled) {
          setSummary(null);
          setLoading(false);
        }
        return;
      }
      if (cancelled) return;
      const payload = (await res.json()) as {
        player_skill_summary?: PlayerSkillSummary;
        insights?: DevelopmentInsight[];
        suggestions?: ImprovementSuggestion[];
      };
      const base = payload.player_skill_summary;
      if (!base?.skill_category_scores?.length) {
        if (!cancelled) {
          setSummary(null);
          setInsights(payload.insights ?? []);
          setSuggestions(payload.suggestions ?? []);
          setLoading(false);
        }
        return;
      }
      const local = loadTrainerRollup(uid);
      const merged = mergeLocalTrainerRollup(base, local);
      if (!cancelled) {
        setSummary(merged);
        setInsights(payload.insights ?? []);
        setSuggestions(payload.suggestions ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [k12]);

  return { loading, summary, insights, suggestions };
}
