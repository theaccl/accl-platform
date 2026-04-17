"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { updateLocalRollupFromTrainer } from "@/lib/trainer/skillAggregation";
import { loadTrainerRollup, saveTrainerRollup } from "@/lib/trainer/skillClientStore";

export type TrainerPanelProps = {
  /** Current board FEN to analyze */
  fen: string;
  /** When set, server enforces participant + finished-game rules */
  gameId?: string | null;
  /** Allow editing FEN (sandbox / lab). Off when embedded on game page stepping replay. */
  allowFenEdit?: boolean;
  /** K–12: shorter copy, no dollar or harsh competitive language */
  k12?: boolean;
  className?: string;
};

type AnalyzeResponse = {
  ok?: boolean;
  availability?: string;
  error?: string;
  code?: string;
  summary?: string;
  evaluation?: {
    bestMove: string | null;
    centipawn: number | null;
    alternatives: Array<{ rank: number; move: string; centipawn: number | null; classification: string }>;
    spreadClassification: string;
  };
};

export default function TrainerPanel({
  fen: initialFen,
  gameId = null,
  allowFenEdit = true,
  k12 = false,
  className = "",
}: TrainerPanelProps) {
  const [fen, setFen] = useState(initialFen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setFen(initialFen);
  }, [initialFen]);

  const analyze = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/trainer/analyze-position", {
        method: "POST",
        signal: ac.signal,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ fen: fen.trim(), gameId }),
      });
      const payload = (await res.json().catch(() => ({}))) as AnalyzeResponse & {
        retry_after_sec?: number;
      };
      const success = res.ok && payload.ok !== false && (payload.ok === true || Boolean(payload.evaluation));
      if (!success) {
        if (payload.code === "RATE_LIMIT" && payload.retry_after_sec != null) {
          setError(`Too many analysis requests. Try again in about ${payload.retry_after_sec}s.`);
          return;
        }
        if (payload.code === "INTERNAL") {
          setError("Analysis hit an unexpected error. Try again in a moment.");
          return;
        }
        if (payload.availability === "blocked") {
          setError(payload.error ?? "This analysis is not allowed for this position or account.");
          return;
        }
        const hint =
          payload.code === "ENGINE_ERROR" ||
          payload.code === "SUPABASE_CONFIG" ||
          payload.availability === "unavailable"
            ? " Trainer engine is not available on this host (common on some serverless deployments)."
            : "";
        const base =
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : "Analysis could not complete.";
        setError(base + hint);
        return;
      }
      setResult(payload);
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (uid && payload.evaluation) {
        const prev = loadTrainerRollup(uid);
        const next = updateLocalRollupFromTrainer(prev, uid, payload);
        saveTrainerRollup(next);
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }, [fen, gameId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const ev = result?.evaluation;

  return (
    <div className={`rounded-xl border border-[#2a3442] bg-[#111723] p-4 text-white ${className}`}>
      <h3 className="text-base font-semibold mb-1">
        {k12 ? "Practice insights" : "Trainer"}
      </h3>
      <p className="text-xs text-gray-400 mb-3 leading-relaxed">
        {k12
          ? "Learn from positions after games — short, safe suggestions only."
          : "Post-game and practice only. No hints during live or tournament play."}
      </p>

      {allowFenEdit ? (
        <label className="block mb-2">
          <span className="text-xs text-gray-500">FEN</span>
          <textarea
            value={fen}
            onChange={(e) => setFen(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg bg-[#0f1420] border border-[#273246] px-2 py-1.5 text-xs text-gray-100 font-mono"
          />
        </label>
      ) : (
        <p className="text-[11px] text-gray-500 mb-2 font-mono truncate" title={fen}>
          Position: {fen.slice(0, 56)}
          {fen.length > 56 ? "…" : ""}
        </p>
      )}

      <button
        type="button"
        onClick={() => void analyze()}
        disabled={loading || !fen.trim()}
        className="min-h-[44px] px-4 rounded-lg bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-sm font-medium w-full sm:w-auto"
      >
        {loading ? "Analyzing…" : "Analyze position"}
      </button>

      {error ? (
        <p className="mt-3 text-sm text-amber-200/90" role="alert">
          {error}
        </p>
      ) : null}

      {ev ? (
        <div className="mt-4 space-y-3 text-sm">
          <p className="text-gray-300 leading-relaxed">{result?.summary}</p>
          <div className="rounded-lg bg-[#0f1420] border border-[#273246] p-3">
            <p className="text-xs text-gray-500 mb-1">Best line</p>
            <p className="text-white">
              {ev.bestMove ? (
                <>
                  <span className="text-emerald-300">{ev.bestMove}</span>
                  {ev.centipawn != null ? (
                    <span className="text-gray-400">
                      {" "}
                      · {ev.centipawn >= 0 ? "+" : ""}
                      {ev.centipawn} cp
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-gray-500"> — </span>
              )}
            </p>
            <p className="text-[11px] text-gray-500 mt-2">
              Line quality (best vs alternatives):{" "}
              <span className="text-gray-300">{ev.spreadClassification}</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Alternatives (limited)</p>
            <ul className="space-y-1.5">
              {ev.alternatives.map((a) => (
                <li
                  key={`${a.rank}-${a.move}`}
                  className="flex justify-between gap-2 text-xs text-gray-200 border-b border-[#1f2937] pb-1"
                >
                  <span>
                    #{a.rank} <span className="font-mono text-cyan-200/90">{a.move}</span>
                  </span>
                  <span className="text-gray-400 shrink-0">
                    {a.centipawn != null ? `${a.centipawn >= 0 ? "+" : ""}${a.centipawn} cp` : "—"} ·{" "}
                    {a.classification}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] text-gray-500 mt-3">
            {k12 ? "Your pattern" : "Your pattern"}: lines cluster as{" "}
            <span className="text-gray-300">{ev.spreadClassification}</span> — updates your skill rollup
            (post-game only).
          </p>
          <p className="mt-2">
            <Link
              href="/trainer/skills"
              className={k12 ? "text-cyan-200/90 underline text-xs" : "text-red-200/90 underline text-xs"}
            >
              View skill profile
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
