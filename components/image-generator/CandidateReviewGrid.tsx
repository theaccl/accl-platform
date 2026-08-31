"use client";

import Image from "next/image";
import { Check, LockKeyhole, ShieldAlert, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useState } from "react";

import type { CaptureProtectionDecision } from "@/lib/imageGenerator/captureProtection";
import { WebCaptureProtectionAdapter } from "@/lib/imageGenerator/webCaptureProtectionAdapter";

export type ReviewCandidate = {
  id: string;
  ordinal: number;
  status: "review" | "approved" | "rejected" | "expired" | "deleted";
  url: string;
};

type CandidateReviewGridProps = {
  candidates: ReviewCandidate[];
  approvingId: string | null;
  approvedId: string | null;
  onAccept: (candidateId: string) => void;
  canRefine?: boolean;
  refinementLabel?: string;
  selectedRefinementCandidateId?: string | null;
  onRefine?: (candidateId: string) => void;
};

const NO_CAPTURE_DECISION: CaptureProtectionDecision = {
  coverCandidate: false,
  blockPointerInput: false,
  hardBlockExpected: false,
  reason: "none",
};

export function CandidateReviewGrid({
  candidates,
  approvingId,
  approvedId,
  onAccept,
  canRefine = false,
  refinementLabel = "Guide refinement",
  selectedRefinementCandidateId = null,
  onRefine,
}: CandidateReviewGridProps) {
  const [captureDecision, setCaptureDecision] = useState(NO_CAPTURE_DECISION);

  useEffect(() => {
    const adapter = new WebCaptureProtectionAdapter({ onDecision: setCaptureDecision });
    adapter.enable();
    return () => adapter.disable();
  }, []);

  return (
    <section className="mt-8 border-t border-[var(--accl-border-subtle)] pt-8" aria-labelledby="private-candidates-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--accl-accent-gold)]"><LockKeyhole className="h-4 w-4" aria-hidden /> Private review</p>
          <h2 id="private-candidates-title" className="mt-2 font-display text-3xl font-bold text-white">Choose your winning image</h2>
          <p className="mt-1 text-sm text-[var(--accl-text-muted)]">Accept one candidate. The remaining options will be rejected automatically.</p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45">{candidates.length} private candidates · 24-hour window</span>
      </div>

      <div className="relative mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {candidates.map((candidate) => {
          const accepted = approvedId === candidate.id || candidate.status === "approved";
          const inactive = approvedId != null && !accepted;
          return (
            <article key={candidate.id} className={`group overflow-hidden rounded-2xl border bg-black/25 transition ${accepted ? "border-emerald-400/60 shadow-[0_0_35px_rgba(52,211,153,0.16)]" : "border-white/10 hover:border-[var(--accl-accent-gold)]"} ${inactive ? "opacity-45" : ""}`}>
              <div className="relative aspect-square overflow-hidden bg-[var(--accl-bg-card)]">
                <Image src={candidate.url} alt={`Generated candidate ${candidate.ordinal}`} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" unoptimized className="object-cover transition duration-500 group-hover:scale-[1.02]" />
                <span className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/65 font-mono text-xs text-white">0{candidate.ordinal}</span>
                {accepted ? <div className="absolute inset-0 grid place-items-center bg-emerald-950/25"><span className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-950"><Check className="h-4 w-4" aria-hidden /> Accepted</span></div> : null}
              </div>
              <div className="p-3">
                <button type="button" disabled={approvingId != null || approvedId != null} onClick={() => onAccept(candidate.id)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[rgba(212,160,23,0.35)] bg-[rgba(212,160,23,0.1)] text-xs font-bold uppercase tracking-[0.08em] text-[var(--accl-accent-gold)] transition hover:bg-[var(--accl-accent-gold)] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accl-focus-ring)] disabled:pointer-events-none disabled:opacity-40"><Sparkles className="h-4 w-4" aria-hidden />{approvingId === candidate.id ? "Accepting…" : accepted ? "Accepted" : "Accept candidate"}</button>
                {canRefine && onRefine ? (
                  <button type="button" disabled={approvingId != null || approvedId != null} onClick={() => onRefine(candidate.id)} className={`mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border text-xs font-bold uppercase tracking-[0.08em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accl-focus-ring)] disabled:pointer-events-none disabled:opacity-40 ${selectedRefinementCandidateId === candidate.id ? "border-violet-300/60 bg-violet-400/20 text-violet-100" : "border-violet-400/25 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"}`}><WandSparkles className="h-4 w-4" aria-hidden />{selectedRefinementCandidateId === candidate.id ? "Direction selected" : refinementLabel}</button>
                ) : null}
              </div>
            </article>
          );
        })}

        {captureDecision.coverCandidate ? (
          <div className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-[#07080c] p-6 text-center" aria-live="assertive">
            <div><ShieldAlert className="mx-auto h-9 w-9 text-[var(--accl-accent-gold)]" aria-hidden /><p className="mt-3 font-display text-xl font-bold text-white">Private candidates covered</p><p className="mt-1 text-xs text-white/45">Capture protection detected a screenshot-related action.</p></div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
