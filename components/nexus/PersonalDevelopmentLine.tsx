"use client";

import Link from "next/link";
import { useDevelopmentProfile } from "@/hooks/useDevelopmentProfile";

export default function PersonalDevelopmentLine({ k12 = false }: { k12?: boolean }) {
  const { loading, summary, insights, suggestions } = useDevelopmentProfile(k12);

  if (loading || !summary) return null;

  const weak = summary.skill_category_scores.find((s) => s.id === summary.primary_weakness);
  const hint = suggestions[0]?.text ?? insights[0]?.text ?? summary.sample_label;

  return (
    <div className="mt-2 rounded-lg border border-[#1e3a5f] bg-[#0d1520] p-2">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">Development</p>
      <p className="text-xs text-gray-300 leading-relaxed">
        {k12
          ? `Try improving ${weak?.label.toLowerCase() ?? "skills"} — ${hint}`
          : `Focus · ${weak?.label ?? "development"} — ${hint}`}
      </p>
      <p className="mt-1">
        <Link
          href="/trainer/skills"
          className={k12 ? "text-cyan-200/90 underline text-[11px]" : "text-red-200/90 underline text-[11px]"}
        >
          Skill profile
        </Link>
      </p>
    </div>
  );
}
