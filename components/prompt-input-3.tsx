"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { ImagePlus, LockKeyhole, Sparkles, X } from "lucide-react";

import { GENERATOR_STYLES, MAX_PROMPT_WORDS, promptWordCount, type GeneratorStyle } from "@/lib/imageGenerator/promptOptions";

const MAX_COMPOSER_HEIGHT = 220;

type PromptInput3Props = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  disabled?: boolean;
  maxLength?: number;
  referencePreviewUrl?: string | null;
  referenceName?: string | null;
  referenceError?: string | null;
  onReferenceSelect?: (file: File) => void;
  onReferenceRemove?: () => void;
  candidateCount?: number;
  style: GeneratorStyle;
  onStyleChange: (style: GeneratorStyle) => void;
  unlimited?: boolean;
  lockInputs?: boolean;
};

export default function PromptInput3({
  value,
  onValueChange,
  onSubmit,
  busy = false,
  disabled = false,
  maxLength = 2000,
  referencePreviewUrl = null,
  referenceName = null,
  referenceError = null,
  onReferenceSelect,
  onReferenceRemove,
  candidateCount = 4,
  style,
  onStyleChange,
  unlimited = false,
  lockInputs = false,
}: PromptInput3Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;

    const resize = () => {
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
    };

    resize();
    const frame = requestAnimationFrame(resize);
    element.ownerDocument.fonts?.ready.then(resize).catch(() => {});
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const words = promptWordCount(value);
  const canCreate = words <= MAX_PROMPT_WORDS && !busy && !disabled;

  return (
    <div className="w-full">
      <div className="rounded-[var(--rb-r-2xl)] border border-[var(--accl-border-strong)] bg-[linear-gradient(145deg,var(--accl-bg-card),var(--accl-bg-elevated))] shadow-[var(--accl-shadow-card)] transition-[border-color,box-shadow] duration-200 focus-within:border-[var(--accl-accent-gold)] focus-within:shadow-[0_0_0_1px_rgba(212,160,23,0.18),var(--accl-shadow-card)]">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={disabled || busy || lockInputs}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onReferenceSelect?.(file);
            event.target.value = "";
          }}
        />
        <div className="border-b border-[var(--accl-border-subtle)] p-3">
          {referencePreviewUrl ? (
            <div className="flex items-center gap-3 rounded-xl border border-[rgba(212,160,23,0.3)] bg-[rgba(212,160,23,0.07)] p-2.5">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/30">
                <Image src={referencePreviewUrl} alt="Selected private reference" fill sizes="64px" unoptimized className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{referenceName ?? "Reference image"}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--accl-text-muted)]"><LockKeyhole className="h-3 w-3 text-[var(--accl-accent-gold)]" aria-hidden /> Private · used to guide this generation only</p>
              </div>
              <button type="button" onClick={onReferenceRemove} disabled={disabled || busy || lockInputs} aria-label="Remove reference image" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-white/50 transition hover:border-red-400/40 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accl-focus-ring)] disabled:opacity-40"><X className="h-4 w-4" aria-hidden /></button>
            </div>
          ) : (
            <button
              type="button"
              disabled={disabled || busy || lockInputs}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-[var(--accl-border-strong)] bg-black/10 px-4 py-3 text-left transition hover:border-[var(--accl-accent-gold)] hover:bg-[rgba(212,160,23,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accl-focus-ring)] disabled:pointer-events-none disabled:opacity-40"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgba(212,160,23,0.1)] text-[var(--accl-accent-gold)]"><ImagePlus className="h-5 w-5" aria-hidden /></span>
              <span><strong className="block text-sm text-white">Add reference image</strong><span className="mt-0.5 block text-[11px] text-[var(--accl-text-muted)]">Optional · PNG, JPEG, or WebP · up to 4 MB</span></span>
            </button>
          )}
          {referenceError ? <p className="mt-2 px-1 text-xs text-red-300" role="alert">{referenceError}</p> : null}
        </div>
        <label htmlFor="image-generator-prompt" className="sr-only">
          Describe the profile image you want ACCL to generate
        </label>
        <textarea
          id="image-generator-prompt"
          ref={textareaRef}
          rows={3}
          value={value}
          maxLength={maxLength}
          disabled={disabled || busy || lockInputs}
          onChange={(event) => onValueChange(event.target.value)}
          aria-describedby="generator-prompt-help"
          aria-invalid={words > MAX_PROMPT_WORDS}
          placeholder="Optional: describe your chess identity or let ACCL choose…"
          className="block max-h-[220px] min-h-[132px] w-full resize-none bg-transparent px-5 py-5 text-base leading-relaxed text-[var(--accl-text-primary)] outline-none placeholder:text-[var(--accl-text-faint)] disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--accl-border-subtle)] px-4 py-3">
          <span className="font-mono text-[11px] tabular-nums text-[var(--accl-text-faint)]">
            {words} / {MAX_PROMPT_WORDS} words
          </span>
          <span className="hidden text-xs text-[var(--accl-text-faint)] sm:inline">
            Optional prompt · Free
          </span>
          <button
            type="button"
            disabled={!canCreate}
            onClick={onSubmit}
            className="ml-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--rb-r-md)] bg-[var(--accl-accent-gold)] px-5 text-sm font-bold text-black transition-[transform,filter,opacity] duration-150 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accl-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--accl-bg-card)] disabled:pointer-events-none disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            {busy ? "Generating…" : unlimited ? "Generate · Unlimited" : "Generate · 1 Generation Token"}
          </button>
        </div>
      </div>

      <p id="generator-prompt-help" className={`mt-2 text-xs ${words > MAX_PROMPT_WORDS ? 'text-red-300' : 'text-white/50'}`} role={words > MAX_PROMPT_WORDS ? 'alert' : undefined}>
        {words > MAX_PROMPT_WORDS ? 'Shorten your prompt to 50 words before generating.' : `${candidateCount} private candidate${candidateCount === 1 ? '' : 's'}. Only Generate starts a commission.`}
      </p>
      <fieldset className="mt-5" disabled={disabled || busy || lockInputs}>
        <legend className="mb-2 text-xs font-semibold text-white/70">Style effects · No extra token cost</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(GENERATOR_STYLES) as [GeneratorStyle, { label: string; prompt: string }][]).map(([key, option]) => (
            <label key={key} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs ${style === key ? 'border-amber-200/60 bg-amber-200/10 text-amber-100' : 'border-white/15 text-white/65'}`}>
              <input type="radio" name="generator-style" value={key} checked={style === key} onChange={() => onStyleChange(key)} className="accent-amber-200" />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
