"use client";

import Link from "next/link";
import { Check, Clock3, Crown, ImageIcon, LockKeyhole, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import PromptInput3 from "@/components/prompt-input-3";
import { supabase } from "@/lib/supabaseClient";

type AccessState = "loading" | "signed_out" | "free" | "pro" | "error";

type GenerationResponse = {
  generation?: { id?: string; status?: string };
  error?: string;
};

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `image-generator-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ImageGeneratorCreateScreen() {
  const [prompt, setPrompt] = useState("");
  const [access, setAccess] = useState<AccessState>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);

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

  const createCandidates = async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || access !== "pro" || busy) return;

    setBusy(true);
    setMessage(null);
    setGenerationId(null);
    try {
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data.session?.access_token?.trim();
      if (!token) {
        setAccess("signed_out");
        setMessage("Your session ended. Sign in again to create images.");
        return;
      }

      const response = await fetch("/api/image-generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": newIdempotencyKey(),
        },
        body: JSON.stringify({ prompt: cleanPrompt, candidate_count: 4 }),
      });
      const payload = (await response.json()) as GenerationResponse;
      if (!response.ok) {
        if (response.status === 403) setAccess("free");
        setMessage(payload.error ?? "ACCL could not start this generation. Please try again.");
        return;
      }

      setGenerationId(payload.generation?.id ?? "queued");
      setMessage("Your four private candidates are queued. The review presentation is the next screen in this build.");
    } catch {
      setMessage("ACCL could not reach the generator. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const formDisabled = access !== "pro" || generationId !== null;

  return (
    <div className="relative isolate overflow-hidden rounded-[var(--accl-radius-2xl)] border border-[var(--accl-border-muted)] bg-[radial-gradient(circle_at_18%_0%,rgba(212,160,23,0.12),transparent_34%),linear-gradient(160deg,var(--accl-bg-elevated),var(--accl-bg-base)_66%)] shadow-[var(--accl-shadow-panel)]">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />

      <div className="grid gap-10 px-5 py-8 sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:px-10 lg:py-12">
        <section aria-labelledby="image-generator-title">
          <div className="mb-7 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(212,160,23,0.36)] bg-[rgba(212,160,23,0.1)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accl-accent-gold)]">
              <Crown className="h-3.5 w-3.5" aria-hidden />
              ACCL Pro
            </span>
            <span className="text-xs text-[var(--accl-text-muted)]">Private candidate studio</span>
          </div>

          <h1 id="image-generator-title" className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Create your chess identity
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--accl-text-muted)] sm:text-lg">
            Describe the look you want. ACCL creates four private candidates so you can choose one before anything reaches your profile.
          </p>

          <div className="mt-8">
            <PromptInput3
              value={prompt}
              onValueChange={(value) => {
                setPrompt(value);
                setGenerationId(null);
                setMessage(null);
              }}
              onSubmit={() => void createCandidates()}
              busy={busy}
              disabled={formDisabled}
            />
          </div>

          <div className="mt-5 min-h-14" aria-live="polite">
            {access === "loading" && <p className="text-sm text-[var(--accl-text-muted)]">Checking Pro access…</p>}
            {access === "signed_out" && (
              <p className="text-sm text-[var(--accl-text-secondary)]">
                <Link href="/login?next=/image-generator" className="font-semibold text-[var(--accl-accent-gold)] underline underline-offset-4">
                  Sign in
                </Link>{" "}
                to use the Image Generator.
              </p>
            )}
            {access === "free" && (
              <div className="flex flex-wrap items-center gap-3 rounded-[var(--accl-radius-lg)] border border-[rgba(239,68,68,0.3)] bg-[rgba(127,29,29,0.14)] px-4 py-3 text-sm text-red-100">
                <LockKeyhole className="h-4 w-4 shrink-0" aria-hidden />
                <span>Image generation requires an active ACCL Pro membership.</span>
                <Link href="/account" className="ml-auto font-semibold underline underline-offset-4">View membership</Link>
              </div>
            )}
            {access === "error" && (
              <button type="button" onClick={() => void loadAccess()} className="text-sm font-semibold text-[var(--accl-accent-gold)] underline underline-offset-4">
                Could not verify Pro access. Try again.
              </button>
            )}
            {message && (
              <div className={`flex items-start gap-2 rounded-[var(--accl-radius-lg)] border px-4 py-3 text-sm ${generationId ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-100" : "border-red-500/30 bg-red-950/20 text-red-100"}`}>
                {generationId ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : null}
                <span>{message}</span>
              </div>
            )}
          </div>
        </section>

        <aside className="self-start rounded-[var(--accl-radius-xl)] border border-[var(--accl-border-muted)] bg-[rgba(7,8,12,0.54)] p-5" aria-label="How image generation works">
          <p className="font-display text-lg font-semibold uppercase tracking-[0.08em] text-white">Before you create</p>
          <ul className="mt-5 space-y-5">
            <li className="flex gap-3">
              <ImageIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accl-accent-gold)]" aria-hidden />
              <div><p className="text-sm font-semibold text-white">Four candidates</p><p className="mt-1 text-xs leading-relaxed text-[var(--accl-text-muted)]">One request gives you up to four private options.</p></div>
            </li>
            <li className="flex gap-3">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accl-accent-gold)]" aria-hidden />
              <div><p className="text-sm font-semibold text-white">24-hour review</p><p className="mt-1 text-xs leading-relaxed text-[var(--accl-text-muted)]">Choose your winner while the private review window is open.</p></div>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accl-accent-gold)]" aria-hidden />
              <div><p className="text-sm font-semibold text-white">Nothing publishes automatically</p><p className="mt-1 text-xs leading-relaxed text-[var(--accl-text-muted)]">Only the candidate you approve can become an icon or background.</p></div>
            </li>
          </ul>
          <p className="mt-6 border-t border-[var(--accl-border-subtle)] pt-4 text-[11px] leading-relaxed text-[var(--accl-text-faint)]">
            Prompts and generated candidates are checked against ACCL safety rules before review.
          </p>
        </aside>
      </div>
    </div>
  );
}
