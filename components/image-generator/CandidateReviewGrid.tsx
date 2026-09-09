"use client";

import Image from "next/image";
import { Check, LockKeyhole, ShieldAlert, Sparkles, WandSparkles, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { CaptureProtectionDecision } from "@/lib/imageGenerator/captureProtection";
import { candidatePresentationPhase } from "@/lib/imageGenerator/presentationState";
import { WebCaptureProtectionAdapter } from "@/lib/imageGenerator/webCaptureProtectionAdapter";
import BlurHighlight from "@/components/blur-highlight";
import Flicker from "@/components/flicker";

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
  keepLimit?: number;
  selectedCandidateIds?: readonly string[];
  canRefine?: boolean;
  refinementLabel?: string;
  selectedRefinementCandidateId?: string | null;
  onRefine?: (candidateId: string) => void;
  firstPresentationCandidateIds?: readonly string[];
  richMotionEnabled?: boolean;
};

const NO_CAPTURE_DECISION: CaptureProtectionDecision = {
  coverCandidate: false,
  blockPointerInput: false,
  hardBlockExpected: false,
  reason: "none",
};
const NO_FIRST_PRESENTATION_IDS: readonly string[] = [];

export function CandidateReviewGrid({
  candidates,
  approvingId,
  approvedId,
  onAccept,
  keepLimit = 1,
  selectedCandidateIds = NO_FIRST_PRESENTATION_IDS,
  canRefine = false,
  refinementLabel = "Guide refinement",
  selectedRefinementCandidateId = null,
  onRefine,
  firstPresentationCandidateIds = NO_FIRST_PRESENTATION_IDS,
  richMotionEnabled = false,
}: CandidateReviewGridProps) {
  const [captureDecision, setCaptureDecision] = useState(NO_CAPTURE_DECISION);
  const reviewElement = useRef<HTMLElement>(null);
  const prefersReducedMotion = useReducedMotion() === true;
  const motionAllowed = !prefersReducedMotion;
  const firstPresentationIds = useMemo(
    () => new Set(firstPresentationCandidateIds),
    [firstPresentationCandidateIds]
  );
  const holdingActive = approvedId == null && candidates.some((candidate) => candidate.status === "review");

  useLayoutEffect(() => {
    if (approvedId == null) return;
    // Finish already-running reveals even when their end target has not changed.
    // Keep image nodes mounted: their short-lived private URLs may have expired.
    for (const animation of reviewElement.current?.getAnimations({ subtree: true }) ?? []) {
      if (animation.effect?.getComputedTiming().endTime === Infinity) animation.cancel();
      else animation.finish();
    }
  }, [approvedId]);

  useEffect(() => {
    const adapter = new WebCaptureProtectionAdapter({ onDecision: setCaptureDecision });
    adapter.enable();
    return () => adapter.disable();
  }, []);

  return (
    <section ref={reviewElement} className="relative isolate mt-8 overflow-hidden rounded-3xl border border-[var(--accl-border-subtle)] bg-black/10 px-4 py-8 sm:px-6" aria-labelledby="private-candidates-title">
      {holdingActive && richMotionEnabled && motionAllowed ? <Flicker className="-z-10 opacity-20" spacing={38} particleSize={1} colorPalette={["#d4a017", "#7c3aed"]} glowColor="#d4a017" overlay={0.84} overlayColor="#08070b" rate={0.18} flickerChance={0.16} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--accl-accent-gold)]"><LockKeyhole className="h-4 w-4" aria-hidden /> Private review</p>
          <h2 id="private-candidates-title" className="mt-2 font-display text-3xl font-bold text-white"><BlurHighlight highlightedBits={["winning image"]} highlightColor="rgba(212,160,23,0.24)" blurAmount={prefersReducedMotion ? 0 : 8} inactiveOpacity={prefersReducedMotion ? 1 : 0.3} blurDuration={prefersReducedMotion ? 0.01 : 0.72} highlightDuration={prefersReducedMotion ? 0.01 : 0.9} viewportOptions={{ once: true, amount: 0.35 }}>Choose your winning image</BlurHighlight></h2>
          <p className="mt-1 text-sm text-[var(--accl-text-muted)]">{keepLimit > 1 ? `Choose up to ${keepLimit} candidates, then confirm your selections. Unselected options will be rejected.` : "Accept one candidate. The remaining options will be rejected automatically."}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45">{candidates.length} private candidates · 24-hour window</span>
      </div>

      <div className="relative mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {candidates.map((candidate) => {
          const selected = selectedCandidateIds.includes(candidate.id);
          const accepted = approvedId === candidate.id || candidate.status === "approved";
          const inactive = approvedId != null && !accepted;
          const phase = candidatePresentationPhase({
            status: candidate.status,
            accepted,
            firstPresentation: firstPresentationIds.has(candidate.id),
            motionAllowed,
          });
          const presenting = phase === "reveal";
          const holding = phase === "reveal" || phase === "holding";
          const rejected = phase === "rejected_still";
          return (
            <motion.article
              key={candidate.id}
              data-presentation-phase={phase}
              initial={presenting ? (richMotionEnabled ? { opacity: 0, y: 18, scale: 0.96, filter: "blur(12px)" } : { opacity: 0 }) : false}
              animate={{ opacity: inactive ? 0.45 : 1, y: 0, scale: 1, filter: "blur(0px)" }}
              transition={presenting ? { duration: richMotionEnabled ? 0.72 : 0.32, delay: Math.min(candidate.ordinal - 1, 5) * 0.1, ease: [0.22, 1, 0.36, 1] } : { duration: approvedId == null && motionAllowed ? 0.2 : 0 }}
              className={`group overflow-hidden rounded-2xl border bg-black/25 ${accepted ? "border-emerald-400/60 shadow-[0_0_35px_rgba(52,211,153,0.16)]" : approvedId == null ? "border-white/10 hover:border-[var(--accl-accent-gold)]" : "border-white/10"}`}
            >
              <div className="relative aspect-square overflow-hidden bg-[var(--accl-bg-card)]">
                <Image src={candidate.url} alt={`Generated candidate ${candidate.ordinal}`} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" unoptimized className={`object-cover ${approvedId == null && motionAllowed ? "transition duration-500 group-hover:scale-[1.02]" : ""}`} />
                {holding ? <motion.div className="pointer-events-none absolute inset-1 rounded-[0.8rem] border border-[rgba(212,160,23,0.68)] shadow-[inset_0_0_24px_rgba(212,160,23,0.12)]" aria-hidden animate={{ opacity: [0.18, 0.48, 0.18] }} transition={{ duration: 3.2, repeat: Number.POSITIVE_INFINITY, delay: (candidate.ordinal % 4) * 0.24, ease: "easeInOut" }} /> : null}
                <span className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/65 font-mono text-xs text-white">0{candidate.ordinal}</span>
                {accepted ? <div className="absolute inset-0 grid place-items-center bg-emerald-950/25"><span className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-950"><Check className="h-4 w-4" aria-hidden /> Accepted</span></div> : null}
                {rejected ? <div className="absolute inset-0 grid place-items-center bg-black/55"><span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-xs font-black uppercase tracking-wider text-white/70"><X className="h-4 w-4" aria-hidden /> Rejected</span></div> : null}
              </div>
              <div className="p-3">
                <button type="button" aria-pressed={keepLimit > 1 ? selected : undefined} disabled={approvingId != null || approvedId != null || candidate.status !== "review" || (keepLimit > 1 && !selected && selectedCandidateIds.length >= keepLimit)} onClick={() => onAccept(candidate.id)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[rgba(212,160,23,0.35)] bg-[rgba(212,160,23,0.1)] text-xs font-bold uppercase tracking-[0.08em] text-[var(--accl-accent-gold)] transition hover:bg-[var(--accl-accent-gold)] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accl-focus-ring)] disabled:pointer-events-none disabled:opacity-40"><Sparkles className="h-4 w-4" aria-hidden />{approvingId === candidate.id ? "Accepting…" : accepted ? "Accepted" : rejected ? "Rejected" : keepLimit > 1 ? selected ? "Selected to keep" : "Keep candidate" : "Accept candidate"}</button>
                {canRefine && onRefine ? (
                  <button type="button" disabled={approvingId != null || approvedId != null} onClick={() => onRefine(candidate.id)} className={`mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border text-xs font-bold uppercase tracking-[0.08em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accl-focus-ring)] disabled:pointer-events-none disabled:opacity-40 ${selectedRefinementCandidateId === candidate.id ? "border-violet-300/60 bg-violet-400/20 text-violet-100" : "border-violet-400/25 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"}`}><WandSparkles className="h-4 w-4" aria-hidden />{selectedRefinementCandidateId === candidate.id ? "Direction selected" : refinementLabel}</button>
                ) : null}
              </div>
            </motion.article>
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
