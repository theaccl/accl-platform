"use client";

import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabaseClient";

type PlayerInsight = {
  id: string;
  output_type: "insight" | "recommendation" | "warning";
  title: string;
  summary: string;
  confidence: number;
  generated_at: string;
  quality_score: number;
  display_priority: number;
};

type InsightsPayload = {
  items?: PlayerInsight[];
  error?: string;
};

function badgeClass(type: PlayerInsight["output_type"]): string {
  if (type === "warning") return "bg-yellow-900/40 text-yellow-300 border border-yellow-700";
  if (type === "recommendation") return "bg-blue-900/40 text-blue-300 border border-blue-700";
  return "bg-green-900/40 text-green-300 border border-green-700";
}

export default function PlayerNexusInsightsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PlayerInsight[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
        return;
      }
      const res = await fetch("/api/player/nexus-insights", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = (await res.json()) as InsightsPayload;
      if (cancelled) return;
      if (!res.ok) {
        setError(payload.error ?? "Failed to load insights");
        setItems([]);
        setLoading(false);
        return;
      }
      setItems(payload.items ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    return {
      warning: items.filter((i) => i.output_type === "warning"),
      recommendation: items.filter((i) => i.output_type === "recommendation"),
      insight: items.filter((i) => i.output_type === "insight"),
    };
  }, [items]);

  return (
    <div className="bg-[#161b22] rounded-2xl p-5">
      <h2 className="text-lg font-semibold mb-3">Insights</h2>
      <p className="text-xs text-gray-400 mb-3">Advisory only. No game-state mutation actions.</p>
      {loading && <p className="text-sm text-gray-300">Loading insights...</p>}
      {!loading && error && <p className="text-sm text-red-400">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-gray-400">No active insights available.</p>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="space-y-4">
          {(["warning", "recommendation", "insight"] as const).map((type) => {
            const group = grouped[type];
            if (group.length === 0) return null;
            return (
              <section key={type}>
                <h3 className="text-sm uppercase tracking-wide text-gray-400 mb-2">{type}</h3>
                <div className="space-y-2">
                  {group.map((row) => (
                    <article key={row.id} className="rounded-lg border border-[#30363d] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{row.title}</p>
                        <span className={`px-2 py-0.5 rounded text-xs ${badgeClass(row.output_type)}`}>{row.output_type}</span>
                      </div>
                      <p className="text-sm text-gray-300 mt-1">{row.summary}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        Confidence {(row.confidence * 100).toFixed(0)}% - Generated{" "}
                        {new Date(row.generated_at).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Priority {row.display_priority} - Quality {(row.quality_score * 100).toFixed(0)}%
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

