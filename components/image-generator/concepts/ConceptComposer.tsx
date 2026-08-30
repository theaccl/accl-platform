"use client";

import { ArrowUp, Sparkles } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";

type ConceptComposerProps = {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  accent: string;
  accentSoft: string;
  placeholder: string;
  buttonLabel?: string;
  compact?: boolean;
};

const MAX_HEIGHT = 196;

export function ConceptComposer({
  id,
  value,
  onValueChange,
  onSubmit,
  accent,
  accentSoft,
  placeholder,
  buttonLabel = "Create 4 candidates",
  compact = false,
}: ConceptComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const canSubmit = value.trim().length > 0;
  const styles = {
    "--concept-accent": accent,
    "--concept-accent-soft": accentSoft,
  } as CSSProperties;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (canSubmit) onSubmit();
  };

  return (
    <div
      style={styles}
      className="overflow-hidden rounded-2xl border border-[color:var(--concept-accent-soft)] bg-[rgba(4,6,11,0.82)] shadow-[0_22px_60px_rgba(0,0,0,0.32)] transition-[border-color,box-shadow] focus-within:border-[var(--concept-accent)] focus-within:shadow-[0_0_0_1px_var(--concept-accent-soft),0_22px_60px_rgba(0,0,0,0.4)]"
    >
      <label htmlFor={id} className="sr-only">
        Describe the profile image you want ACCL to generate
      </label>
      <textarea
        id={id}
        ref={textareaRef}
        rows={compact ? 2 : 3}
        value={value}
        maxLength={2000}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`block max-h-[196px] w-full resize-none bg-transparent px-5 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/30 ${compact ? "min-h-24 py-4" : "min-h-32 py-5"}`}
      />
      <div className="flex flex-wrap items-center gap-3 border-t border-white/8 px-4 py-3">
        <span className="font-mono text-[10px] tabular-nums text-white/35">
          {value.length.toLocaleString()} / 2,000
        </span>
        <span className="hidden text-[11px] text-white/35 @md:inline">Enter to create · Shift + Enter for a new line</span>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--concept-accent)] px-4 text-xs font-black uppercase tracking-[0.08em] text-black transition hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-35"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          <span>{buttonLabel}</span>
          <ArrowUp className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
