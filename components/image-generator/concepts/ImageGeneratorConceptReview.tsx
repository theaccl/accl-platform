"use client";

import { ChevronLeft, ChevronRight, Eye, Monitor, Smartphone } from "lucide-react";
import { useState } from "react";

import { CONCEPTS } from "@/components/image-generator/concepts/ImageGeneratorConcepts";

type PreviewWidth = "desktop" | "mobile";

export function ImageGeneratorConceptReview() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("desktop");
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const active = CONCEPTS[activeIndex];
  const ActiveConcept = active.component;

  const selectConcept = (index: number) => {
    setActiveIndex(index);
    setNotice(null);
  };

  const moveConcept = (direction: -1 | 1) => {
    const next = (activeIndex + direction + CONCEPTS.length) % CONCEPTS.length;
    selectConcept(next);
  };

  return (
    <div>
      <header className="mb-7 rounded-2xl border border-[var(--accl-border-muted)] bg-[var(--accl-bg-elevated)] p-4 shadow-[var(--accl-shadow-card)] sm:p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--accl-accent-gold)]"><Eye className="h-4 w-4" aria-hidden /> Presentation review room</div>
            <h1 className="mt-2 font-display text-3xl font-bold text-white">Five Image Generator systems</h1>
            <p className="mt-1 text-sm text-[var(--accl-text-muted)]">Interactive concepts only—Create buttons cannot start a real generation here.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-[var(--accl-border-muted)] bg-black/20 p-1" aria-label="Preview width">
              <button type="button" aria-pressed={previewWidth === "desktop"} onClick={() => setPreviewWidth("desktop")} className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition ${previewWidth === "desktop" ? "bg-white/10 text-white" : "text-white/45 hover:text-white"}`}><Monitor className="h-4 w-4" aria-hidden /> Desktop</button>
              <button type="button" aria-pressed={previewWidth === "mobile"} onClick={() => setPreviewWidth("mobile")} className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition ${previewWidth === "mobile" ? "bg-white/10 text-white" : "text-white/45 hover:text-white"}`}><Smartphone className="h-4 w-4" aria-hidden /> Mobile</button>
            </div>
            <button type="button" onClick={() => moveConcept(-1)} aria-label="Previous system" className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--accl-border-muted)] text-white/60 transition hover:border-[var(--accl-accent-gold)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accl-focus-ring)]"><ChevronLeft className="h-5 w-5" aria-hidden /></button>
            <button type="button" onClick={() => moveConcept(1)} aria-label="Next system" className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--accl-border-muted)] text-white/60 transition hover:border-[var(--accl-accent-gold)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accl-focus-ring)]"><ChevronRight className="h-5 w-5" aria-hidden /></button>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5" role="tablist" aria-label="Image Generator presentation systems">
          {CONCEPTS.map((concept, index) => (
            <button
              key={concept.id}
              type="button"
              role="tab"
              aria-selected={activeIndex === index}
              onClick={() => selectConcept(index)}
              className={`rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accl-focus-ring)] ${activeIndex === index ? "border-[var(--accl-accent-gold)] bg-[rgba(212,160,23,0.09)]" : "border-[var(--accl-border-subtle)] bg-black/15 hover:border-[var(--accl-border-strong)]"}`}
            >
              <span className={`font-mono text-[10px] ${activeIndex === index ? "text-[var(--accl-accent-gold)]" : "text-white/30"}`}>{concept.short}</span>
              <span className="mt-1 block text-xs font-bold text-white">{concept.name}</span>
              <span className="mt-1 block text-[10px] text-white/35">{concept.description}</span>
            </button>
          ))}
        </div>
      </header>

      <div className={`@container mx-auto transition-[max-width] duration-300 ${previewWidth === "mobile" ? "max-w-[430px]" : "max-w-none"}`} role="tabpanel" aria-label={active.name}>
        <ActiveConcept
          prompt={prompt}
          onPromptChange={(value) => {
            setPrompt(value);
            setNotice(null);
          }}
          onReviewCreate={() => setNotice(`${active.name} is in review mode. No generation was started.`)}
        />
      </div>

      <div className="mt-5 flex min-h-12 flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--accl-border-subtle)] bg-[var(--accl-bg-elevated)] px-4 py-3 text-xs text-[var(--accl-text-muted)]" aria-live="polite">
        <span><strong className="text-white">Reviewing:</strong> {active.name} · {active.description}</span>
        {notice ? <span className="font-semibold text-[var(--accl-accent-gold)]">{notice}</span> : <span>Type a prompt, choose a starter, and test the layout.</span>}
      </div>
    </div>
  );
}
