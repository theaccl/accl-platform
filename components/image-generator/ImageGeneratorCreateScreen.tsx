"use client";

import Link from "next/link";
import { Check, Clock3, Crown, ImageIcon, LockKeyhole, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CandidateReviewGrid, type ReviewCandidate } from "@/components/image-generator/CandidateReviewGrid";
import PromptInput3 from "@/components/prompt-input-3";
import { REFERENCE_IMAGE_MAX_BYTES } from "@/lib/imageGenerator/domain";
import { supabase } from "@/lib/supabaseClient";

type AccessState = "loading" | "signed_out" | "free" | "pro" | "error";

type GenerationResponse = {
  generation?: { id?: string; status?: string };
  error?: string;
};

type GenerationStatusResponse = {
  generation?: { id: string; status: string };
  candidates?: Array<Pick<ReviewCandidate, "id" | "ordinal" | "status">>;
  error?: string;
};

const REFERENCE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `image-generator-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function CandidateBuildUp() {
  return (
    <section className="mt-8 border-t border-[var(--accl-border-subtle)] pt-8" aria-live="polite">
      <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--accl-accent-gold)]">The atelier is creating</p>
      <h2 className="mt-2 font-display text-3xl font-bold text-white">Preparing four private candidates</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((ordinal) => (
          <div key={ordinal} className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(212,160,23,0.06),rgba(124,58,237,0.08),rgba(7,8,12,0.8))]">
            <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.12),transparent_32%)]" />
            <span className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/30 font-mono text-xs text-white/45">0{ordinal}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ImageGeneratorCreateScreen() {
  const [prompt, setPrompt] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessState>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvedId, setApprovedId] = useState<string | null>(null);

  useEffect(() => {
    if (!referenceFile) {
      setReferencePreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(referenceFile);
    setReferencePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [referenceFile]);

  const loadAccess = useCallback(async () => {
    setAccess("loading");
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult.data.session?.access_token?.trim();
    if (!token) {
      setAccess("signed_out");
      return;
    }
    try {
      const response = await fetch("/api/image-generations/entitlements", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (response.status === 401) {
        setAccess("signed_out");
        return;
      }
      if (!response.ok) throw new Error("entitlement_lookup_failed");
      const entitlements = (await response.json()) as { image_generator?: boolean };
      setAccess(entitlements.image_generator ? "pro" : "free");
    } catch {
      setAccess("error");
    }
  }, []);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  useEffect(() => {
    if (!generationId || candidates.length > 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data.session?.access_token?.trim();
      if (!token || cancelled) return;
      try {
        const response = await fetch(`/api/image-generations/${generationId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = (await response.json()) as GenerationStatusResponse;
        if (!response.ok) throw new Error(payload.error ?? "generation_status_failed");
        const status = payload.generation?.status ?? "queued";
        setGenerationStatus(status);

        if (status === "review" && payload.candidates?.length) {
          const signedCandidates = await Promise.all(
            payload.candidates.map(async (candidate) => {
              const accessResponse = await fetch(`/api/image-generations/${generationId}/candidates/${candidate.id}/access`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
              });
              const accessPayload = (await accessResponse.json()) as { url?: string };
              if (!accessResponse.ok || !accessPayload.url) throw new Error("candidate_access_failed");
              return { ...candidate, url: accessPayload.url } as ReviewCandidate;
            })
          );
          if (!cancelled) {
            setCandidates(signedCandidates);
            setMessage("Your private candidates are ready. Choose the one you want to keep.");
          }
          return;
        }
        if (["failed", "cancelled", "expired"].includes(status)) {
          setMessage(status === "expired" ? "This private review window expired." : "This generation could not be completed. Please try again.");
          return;
        }
        timer = setTimeout(() => void poll(), 3000);
      } catch {
        if (!cancelled) timer = setTimeout(() => void poll(), 5000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [candidates.length, generationId]);

  const selectReference = (file: File) => {
    setReferenceError(null);
    if (!REFERENCE_MIME_TYPES.has(file.type)) {
      setReferenceError("Choose a PNG, JPEG, or WebP image.");
      setReferenceFile(null);
      return;
    }
    if (file.size > REFERENCE_IMAGE_MAX_BYTES) {
      setReferenceError("The reference image must be 4 MB or smaller.");
      setReferenceFile(null);
      return;
    }
    setReferenceFile(file);
    setMessage(null);
  };

  const createCandidates = async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || access !== "pro" || busy) return;
    setBusy(true);
    setMessage(null);
    setGenerationId(null);
    setGenerationStatus(null);
    setCandidates([]);
    setApprovedId(null);
    try {
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data.session?.access_token?.trim();
      if (!token) {
        setAccess("signed_out");
        setMessage("Your session ended. Sign in again to create images.");
        return;
      }

      let referenceId: string | null = null;
      if (referenceFile) {
        const formData = new FormData();
        formData.set("reference", referenceFile);
        const uploadResponse = await fetch("/api/image-generations/references", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const uploadPayload = (await uploadResponse.json()) as { reference?: { id?: string }; error?: string };
        if (!uploadResponse.ok || !uploadPayload.reference?.id) {
          setMessage(uploadPayload.error ?? "ACCL could not prepare that reference image. Please try another image.");
          return;
        }
        referenceId = uploadPayload.reference.id;
      }

      const response = await fetch("/api/image-generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": newIdempotencyKey(),
        },
        body: JSON.stringify({ prompt: cleanPrompt, candidate_count: 4, reference_id: referenceId }),
      });
      const payload = (await response.json()) as GenerationResponse;
      if (!response.ok) {
        if (response.status === 403) setAccess("free");
        setMessage(payload.error ?? "ACCL could not start this generation. Please try again.");
        return;
      }

      const id = payload.generation?.id;
      if (!id) throw new Error("missing_generation_id");
      setGenerationId(id);
      setGenerationStatus(payload.generation?.status ?? "queued");
      setMessage("Your reference and description are secured. The atelier is preparing four private candidates.");
    } catch {
      setMessage("ACCL could not reach the generator. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const acceptCandidate = async (candidateId: string) => {
    if (!generationId || approvingId || approvedId) return;
    setApprovingId(candidateId);
    try {
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data.session?.access_token?.trim();
      if (!token) {
        setAccess("signed_out");
        setMessage("Your session ended. Sign in again to accept a candidate.");
        return;
      }
      const response = await fetch(`/api/image-generations/${generationId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateId }),
      });
      if (!response.ok) throw new Error("candidate_approval_failed");
      setApprovedId(candidateId);
      setCandidates((current) => current.map((candidate) => ({ ...candidate, status: candidate.id === candidateId ? "approved" : "rejected" })));
      setMessage("Candidate accepted. Next, you can prepare it for a profile icon or background.");
    } catch {
      setMessage("ACCL could not accept that candidate. Please try again.");
    } finally {
      setApprovingId(null);
    }
  };

  const formDisabled = access !== "pro" || generationId !== null;
  const generationInProgress = generationId != null && candidates.length === 0 && !["failed", "cancelled", "expired"].includes(generationStatus ?? "");

  return (
    <div className="relative isolate overflow-hidden rounded-[var(--accl-radius-2xl)] border border-[var(--accl-border-muted)] bg-[radial-gradient(circle_at_18%_0%,rgba(212,160,23,0.12),transparent_34%),linear-gradient(160deg,var(--accl-bg-elevated),var(--accl-bg-base)_66%)] shadow-[var(--accl-shadow-panel)]">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
      <div className="px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section aria-labelledby="image-generator-title">
            <div className="mb-7 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(212,160,23,0.36)] bg-[rgba(212,160,23,0.1)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accl-accent-gold)]"><Crown className="h-3.5 w-3.5" aria-hidden /> ACCL Pro</span>
              <span className="text-xs text-[var(--accl-text-muted)]">Sovereign Atelier · private candidate studio</span>
            </div>
            <h1 id="image-generator-title" className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">Create your chess identity</h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--accl-text-muted)] sm:text-lg">Add a reference image, describe how you want ACCL to reinterpret it, or use both. Four private candidates will appear here for your approval.</p>
            <div className="mt-8">
              <PromptInput3
                value={prompt}
                onValueChange={(value) => { setPrompt(value); setMessage(null); }}
                onSubmit={() => void createCandidates()}
                busy={busy}
                disabled={formDisabled}
                referencePreviewUrl={referencePreviewUrl}
                referenceName={referenceFile?.name ?? null}
                referenceError={referenceError}
                onReferenceSelect={selectReference}
                onReferenceRemove={() => { setReferenceFile(null); setReferenceError(null); }}
              />
            </div>
            <div className="mt-5 min-h-14" aria-live="polite">
              {access === "loading" && <p className="text-sm text-[var(--accl-text-muted)]">Checking Pro access…</p>}
              {access === "signed_out" && <p className="text-sm text-[var(--accl-text-secondary)]"><Link href="/login?next=/image-generator" className="font-semibold text-[var(--accl-accent-gold)] underline underline-offset-4">Sign in</Link>{" "}to use the Image Generator.</p>}
              {access === "free" && <div className="flex flex-wrap items-center gap-3 rounded-[var(--accl-radius-lg)] border border-[rgba(239,68,68,0.3)] bg-[rgba(127,29,29,0.14)] px-4 py-3 text-sm text-red-100"><LockKeyhole className="h-4 w-4 shrink-0" aria-hidden /><span>Image generation requires an active ACCL Pro membership.</span><Link href="/account" className="ml-auto font-semibold underline underline-offset-4">View membership</Link></div>}
              {access === "error" && <button type="button" onClick={() => void loadAccess()} className="text-sm font-semibold text-[var(--accl-accent-gold)] underline underline-offset-4">Could not verify Pro access. Try again.</button>}
              {message && <div className={`flex items-start gap-2 rounded-[var(--accl-radius-lg)] border px-4 py-3 text-sm ${generationId ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-100" : "border-red-500/30 bg-red-950/20 text-red-100"}`}>{generationId ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : null}<span>{message}</span></div>}
            </div>
          </section>

          <aside className="self-start rounded-[var(--accl-radius-xl)] border border-[var(--accl-border-muted)] bg-[rgba(7,8,12,0.54)] p-5" aria-label="How image generation works">
            <p className="font-display text-lg font-semibold uppercase tracking-[0.08em] text-white">Your commission</p>
            <ul className="mt-5 space-y-5">
              <li className="flex gap-3"><ImageIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accl-accent-gold)]" aria-hidden /><div><p className="text-sm font-semibold text-white">Reference + direction</p><p className="mt-1 text-xs leading-relaxed text-[var(--accl-text-muted)]">Your image guides the composition. Your description steers the result.</p></div></li>
              <li className="flex gap-3"><Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accl-accent-gold)]" aria-hidden /><div><p className="text-sm font-semibold text-white">Four private candidates</p><p className="mt-1 text-xs leading-relaxed text-[var(--accl-text-muted)]">Review your options for up to 24 hours.</p></div></li>
              <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accl-accent-gold)]" aria-hidden /><div><p className="text-sm font-semibold text-white">Nothing publishes automatically</p><p className="mt-1 text-xs leading-relaxed text-[var(--accl-text-muted)]">Only the candidate you accept can move toward profile placement.</p></div></li>
            </ul>
            <p className="mt-6 border-t border-[var(--accl-border-subtle)] pt-4 text-[11px] leading-relaxed text-[var(--accl-text-faint)]">Reference images are sanitized, stored privately, used for this request only, and removed after generation.</p>
          </aside>
        </div>

        {generationInProgress ? <CandidateBuildUp /> : null}
        {candidates.length > 0 ? <CandidateReviewGrid candidates={candidates} approvingId={approvingId} approvedId={approvedId} onAccept={(id) => void acceptCandidate(id)} /> : null}
      </div>
    </div>
  );
}
