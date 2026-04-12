"use client";

import type { DevelopmentProfileState } from "@/hooks/useDevelopmentProfile";
import type { SkillCategoryScore } from "@/lib/trainer/skillAggregation";

function trendArrow(t: SkillCategoryScore["trend"]): string {
  if (t === "improving") return "↑";
  if (t === "declining") return "↓";
  return "→";
}

function trendColor(t: SkillCategoryScore["trend"], k12: boolean): string {
  if (t === "improving") return k12 ? "text-cyan-200" : "text-emerald-300";
  if (t === "declining") return k12 ? "text-amber-200/90" : "text-rose-300/90";
  return "text-gray-400";
}

export default function SkillProfileCardView({
  k12 = false,
  compact = false,
  state,
}: {
  k12?: boolean;
  compact?: boolean;
  state: DevelopmentProfileState;
}) {
  const { loading, summary, insights, suggestions } = state;

  if (loading) {
    return (
      <div
        className={`rounded-xl border ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"} p-4`}
      >
        <p className="text-xs text-gray-500">Loading skill profile…</p>
      </div>
    );
  }

  if (!summary?.skill_category_scores?.length) {
    return (
      <div
        className={`rounded-xl border ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"} p-4`}
      >
        <p className="text-sm text-gray-400">Finish games and use the Trainer to build your profile.</p>
      </div>
    );
  }

  const strong = summary.skill_category_scores.find((s) => s.id === summary.primary_strength);
  const weak = summary.skill_category_scores.find((s) => s.id === summary.primary_weakness);

  return (
    <div
      className={`rounded-xl border ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"} p-4 text-white`}
    >
      <p className="text-xs text-gray-500 mb-1">Skill profile</p>
      <p className="text-[11px] text-gray-500 mb-3">{summary.sample_label}</p>

      {!compact && (
        <div className="space-y-2 mb-4">
          {summary.skill_category_scores.map((row) => (
            <div key={row.id} className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400 w-[40%] min-w-0 truncate">{row.label}</span>
              <div className="flex-1 h-2 rounded-full bg-[#1a2332] overflow-hidden">
                <div
                  className={`h-full rounded-full ${k12 ? "bg-cyan-600/80" : "bg-red-700/80"}`}
                  style={{ width: `${row.score}%` }}
                />
              </div>
              <span className="text-xs text-gray-300 w-8 text-right">{row.score}</span>
              <span className={`text-xs w-4 ${trendColor(row.trend, k12)}`}>{trendArrow(row.trend)}</span>
            </div>
          ))}
        </div>
      )}

      {strong && weak ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mb-3">
          <div className={`rounded-lg border ${k12 ? "border-cyan-500/30" : "border-emerald-500/30"} p-2`}>
            <p className="text-gray-500 mb-0.5">Top strength</p>
            <p className="text-gray-100">{strong.label}</p>
          </div>
          <div className={`rounded-lg border ${k12 ? "border-amber-500/25" : "border-rose-500/25"} p-2`}>
            <p className="text-gray-500 mb-0.5">Primary focus</p>
            <p className="text-gray-100">{weak.label}</p>
          </div>
        </div>
      ) : null}

      {insights.length > 0 ? (
        <div className="mb-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Insights</p>
          <ul className="space-y-1 text-xs text-gray-300 leading-relaxed">
            {insights.map((i) => (
              <li key={i.id}>• {i.text}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {suggestions.length > 0 && !compact ? (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Suggestions</p>
          <ul className="space-y-1 text-xs text-gray-400 leading-relaxed">
            {suggestions.map((s) => (
              <li key={s.id}>• {s.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
