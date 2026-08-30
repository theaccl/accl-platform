"use client";

import {
  Aperture,
  Check,
  CircleDot,
  Clock3,
  Crown,
  Crosshair,
  Diamond,
  Eye,
  Gem,
  ImageIcon,
  LockKeyhole,
  Radio,
  Shield,
  Swords,
  WandSparkles,
  Zap,
} from "lucide-react";

import { ConceptComposer } from "@/components/image-generator/concepts/ConceptComposer";

export type ConceptProps = {
  prompt: string;
  onPromptChange: (value: string) => void;
  onReviewCreate: () => void;
};

const STARTERS = ["Royal knight", "Electric king", "Obsidian rook", "Crimson queen"] as const;

function StarterButtons({ onChoose, accentClass = "text-[#d4a017]" }: { onChoose: (value: string) => void; accentClass?: string }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Prompt starters">
      {STARTERS.map((starter) => (
        <button
          key={starter}
          type="button"
          onClick={() => onChoose(`${starter} chess crest, dramatic tournament lighting, premium profile artwork`)}
          className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[11px] font-semibold text-white/55 transition hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <span className={accentClass}>＋</span> {starter}
        </button>
      ))}
    </div>
  );
}

export function SovereignAtelier({ prompt, onPromptChange, onReviewCreate }: ConceptProps) {
  return (
    <div className="relative isolate overflow-hidden rounded-[28px] border border-[#d4a017]/25 bg-[#0a0d13] shadow-2xl">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_0%,rgba(212,160,23,0.18),transparent_35%),linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:auto,42px_42px,42px_42px]" />
      <div className="grid gap-10 p-6 @sm:p-10 @lg:grid-cols-[minmax(0,1fr)_17rem]">
        <section>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-[#d4a017]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d4a017]/35 bg-[#d4a017]/10 px-3 py-1.5"><Crown className="h-3.5 w-3.5" aria-hidden /> ACCL Pro</span>
            <span className="text-white/40">Sovereign Atelier</span>
          </div>
          <h2 className="mt-7 max-w-2xl font-display text-4xl font-bold tracking-tight text-white @sm:text-6xl">Create your chess identity</h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/55">Commission four private works. Choose the one worthy of your crest.</p>
          <div className="mt-8">
            <ConceptComposer id="sovereign-prompt" value={prompt} onValueChange={onPromptChange} onSubmit={onReviewCreate} accent="#d4a017" accentSoft="rgba(212,160,23,0.3)" placeholder="Describe your colors, symbols, atmosphere, and style…" />
          </div>
          <div className="mt-4"><StarterButtons onChoose={onPromptChange} /></div>
        </section>
        <aside className="self-start rounded-2xl border border-white/10 bg-black/25 p-5">
          <p className="font-display text-lg font-semibold uppercase tracking-[0.1em] text-white">The commission</p>
          <div className="mt-5 space-y-5">
            {[[ImageIcon, "Four private candidates"], [Clock3, "24-hour selection window"], [Shield, "Nothing publishes automatically"]].map(([Icon, label]) => (
              <div key={label as string} className="flex items-center gap-3 text-sm font-semibold text-white/80">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#d4a017]/10 text-[#d4a017]"><Icon className="h-4 w-4" aria-hidden /></span>
                <span>{label as string}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function ArenaForge({ prompt, onPromptChange, onReviewCreate }: ConceptProps) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-red-500/25 bg-[#09090b] shadow-2xl">
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,transparent,#ef4444_30%,#f59e0b_70%,transparent)]" />
      <div className="absolute right-[-8rem] top-[-8rem] h-80 w-80 rounded-full border-[48px] border-red-500/5" />
      <div className="grid min-h-[590px] @lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="border-b border-white/8 bg-black/25 p-5 @lg:border-b-0 @lg:border-r">
          <div className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-[0.16em] text-red-400"><Crosshair className="h-4 w-4" aria-hidden /> Arena Forge</div>
          <ol className="mt-7 grid gap-2 @sm:grid-cols-4 @lg:grid-cols-1">
            {["Brief", "Generate", "Review", "Deploy"].map((step, index) => (
              <li key={step} className={`flex items-center gap-3 rounded-lg px-3 py-3 font-mono text-[11px] uppercase tracking-[0.12em] ${index === 0 ? "bg-red-500/12 text-red-300" : "text-white/35"}`}>
                <span className={`grid h-6 w-6 place-items-center rounded-full border ${index === 0 ? "border-red-400" : "border-white/15"}`}>0{index + 1}</span>{step}
              </li>
            ))}
          </ol>
          <div className="mt-6 border-t border-white/8 pt-5 font-mono text-[10px] leading-5 text-white/30">SECURE SESSION<br />4 OUTPUT SLOTS<br />PRIVATE REVIEW</div>
        </aside>
        <section className="relative p-6 @sm:p-10 @lg:p-12">
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400"><CircleDot className="h-3.5 w-3.5" aria-hidden /> Studio online</span>
            <span className="rounded border border-red-500/30 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-red-300">Pro clearance</span>
          </div>
          <h2 className="mt-12 font-display text-5xl font-black uppercase leading-[0.92] tracking-tight text-white @sm:text-7xl">Forge your<br /><span className="text-red-500">battle mark</span></h2>
          <p className="mt-5 max-w-xl font-mono text-xs leading-6 text-white/45">Transmit an art direction. ACCL returns four secured candidates for tactical review.</p>
          <div className="mt-9 max-w-3xl">
            <ConceptComposer id="arena-prompt" value={prompt} onValueChange={onPromptChange} onSubmit={onReviewCreate} accent="#ef4444" accentSoft="rgba(239,68,68,0.32)" placeholder="ENTER VISUAL DIRECTIVE…" buttonLabel="Initiate forge" compact />
          </div>
          <div className="mt-4 max-w-3xl"><StarterButtons onChoose={onPromptChange} accentClass="text-red-400" /></div>
        </section>
      </div>
    </div>
  );
}

export function CrestCeremony({ prompt, onPromptChange, onReviewCreate }: ConceptProps) {
  return (
    <div className="relative isolate overflow-hidden rounded-[28px] border border-violet-400/20 bg-[#0d0915] px-6 py-12 text-center shadow-2xl @sm:px-10 @sm:py-16">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_20%,rgba(139,92,246,0.24),transparent_32%),radial-gradient(circle_at_50%_100%,rgba(212,160,23,0.1),transparent_35%)]" />
      <div className="mx-auto grid h-28 w-28 place-items-center rounded-full border border-violet-300/25 bg-[radial-gradient(circle,rgba(139,92,246,0.22),rgba(4,2,8,0.8)_68%)] shadow-[0_0_70px_rgba(139,92,246,0.25)]">
        <div className="grid h-20 w-20 place-items-center rounded-full border border-[#d4a017]/35"><Gem className="h-9 w-9 text-[#d4a017]" aria-hidden /></div>
      </div>
      <div className="mt-7 flex items-center justify-center gap-3 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-200/65"><span className="h-px w-10 bg-violet-300/25" /> The Crest Ceremony <span className="h-px w-10 bg-violet-300/25" /></div>
      <h2 className="mx-auto mt-5 max-w-3xl font-display text-4xl font-bold text-white @sm:text-6xl">Give your legacy a face.</h2>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-violet-100/50">A guided, ceremonial creation experience for the identity other players will remember.</p>
      <div className="mx-auto mt-9 max-w-3xl text-left">
        <ConceptComposer id="ceremony-prompt" value={prompt} onValueChange={onPromptChange} onSubmit={onReviewCreate} accent="#c4b5fd" accentSoft="rgba(196,181,253,0.28)" placeholder="Imagine the crest, aura, colors, and symbols that represent you…" />
      </div>
      <div className="mx-auto mt-4 flex max-w-3xl justify-center"><StarterButtons onChoose={onPromptChange} accentClass="text-violet-300" /></div>
      <div className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-4 text-[10px] uppercase tracking-[0.14em] text-white/35">
        <span>Private creation</span><Diamond className="h-3 w-3 text-[#d4a017]" aria-hidden /><span>Four visions</span><Diamond className="h-3 w-3 text-[#d4a017]" aria-hidden /><span>Your final choice</span>
      </div>
    </div>
  );
}

export function MidnightVault({ prompt, onPromptChange, onReviewCreate }: ConceptProps) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-cyan-300/15 bg-[#060b10] shadow-2xl">
      <div className="absolute inset-y-0 left-0 w-px bg-[linear-gradient(transparent,#67e8f9,transparent)] opacity-60" />
      <div className="p-6 @sm:p-10 @lg:p-14">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-6">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/5 text-cyan-200"><LockKeyhole className="h-5 w-5" aria-hidden /></span><div><p className="text-sm font-semibold text-white">Midnight Vault</p><p className="text-[10px] uppercase tracking-[0.16em] text-cyan-100/35">Private identity lab</p></div></div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-white/35"><Check className="h-3.5 w-3.5 text-cyan-300" aria-hidden /> Encrypted candidates</div>
        </header>
        <div className="grid gap-10 py-12 @lg:grid-cols-[minmax(0,1fr)_16rem] @lg:items-end">
          <section>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">Identity protocol / 01</p>
            <h2 className="mt-5 max-w-3xl font-display text-5xl font-medium tracking-[-0.03em] text-white @sm:text-7xl">Quiet interface.<br /><span className="text-white/35">Powerful result.</span></h2>
          </section>
          <p className="text-sm leading-6 text-white/40">Describe the identity. The system handles the complexity and returns four private choices.</p>
        </div>
        <ConceptComposer id="vault-prompt" value={prompt} onValueChange={onPromptChange} onSubmit={onReviewCreate} accent="#67e8f9" accentSoft="rgba(103,232,249,0.25)" placeholder="What should your profile identity feel like?" buttonLabel="Open creation" />
        <div className="mt-4"><StarterButtons onChoose={onPromptChange} accentClass="text-cyan-300" /></div>
        <div className="mt-9 grid gap-3 border-t border-white/8 pt-6 text-xs text-white/35 @sm:grid-cols-3">
          <span className="flex items-center gap-2"><Eye className="h-4 w-4 text-cyan-300/70" aria-hidden /> Visible only to you</span>
          <span className="flex items-center gap-2"><Aperture className="h-4 w-4 text-cyan-300/70" aria-hidden /> Four still candidates</span>
          <span className="flex items-center gap-2"><Shield className="h-4 w-4 text-cyan-300/70" aria-hidden /> Moderated before review</span>
        </div>
      </div>
    </div>
  );
}

export function BroadcastReveal({ prompt, onPromptChange, onReviewCreate }: ConceptProps) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-amber-300/20 bg-[#0b0b0c] shadow-2xl">
      <div className="flex items-center justify-between gap-4 border-b border-white/8 bg-black/30 px-5 py-3 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
        <span className="inline-flex items-center gap-2 text-amber-300"><Radio className="h-3.5 w-3.5" aria-hidden /> ACCL Identity Network</span>
        <span>Presentation feed 01</span>
      </div>
      <div className="grid @lg:grid-cols-[minmax(0,1.08fr)_minmax(19rem,0.92fr)]">
        <section className="p-6 @sm:p-10 @lg:p-12">
          <div className="inline-flex items-center gap-2 rounded bg-amber-400 px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-widest text-black"><Zap className="h-3 w-3" aria-hidden /> Player premiere</div>
          <h2 className="mt-7 font-display text-5xl font-black uppercase leading-[0.9] tracking-[-0.025em] text-white @sm:text-7xl">Make the<br />entrance <span className="text-amber-400">yours.</span></h2>
          <p className="mt-5 max-w-lg text-sm leading-6 text-white/45">Build the identity reveal every generated image receives before you approve and place it.</p>
          <div className="mt-8">
            <ConceptComposer id="broadcast-prompt" value={prompt} onValueChange={onPromptChange} onSubmit={onReviewCreate} accent="#fbbf24" accentSoft="rgba(251,191,36,0.28)" placeholder="Describe your headline look…" buttonLabel="Start premiere" compact />
          </div>
          <div className="mt-4"><StarterButtons onChoose={onPromptChange} accentClass="text-amber-300" /></div>
        </section>
        <aside className="relative isolate min-h-[430px] overflow-hidden border-t border-white/8 bg-[radial-gradient(circle_at_50%_42%,rgba(245,158,11,0.23),transparent_30%),linear-gradient(145deg,#17120a,#08090c_65%)] p-8 @lg:border-l @lg:border-t-0">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(115deg,transparent_42%,rgba(255,255,255,0.04)_43%,transparent_44%)] bg-[size:32px_32px]" />
          <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-white/45"><span>Candidate stage</span><span className="text-amber-300">Preview system</span></div>
          <div className="mx-auto mt-10 grid aspect-square max-w-[270px] place-items-center rounded-[34px] border border-amber-300/30 bg-black/35 shadow-[0_0_80px_rgba(245,158,11,0.17)]">
            <div className="relative grid h-40 w-40 place-items-center rounded-full border border-amber-300/20 bg-[radial-gradient(circle,rgba(245,158,11,0.17),transparent_67%)]">
              <Swords className="h-20 w-20 text-amber-300" strokeWidth={1.25} aria-hidden />
              <span className="absolute -bottom-6 font-display text-xl font-black uppercase tracking-[0.18em] text-white">Your mark</span>
            </div>
          </div>
          <div className="mt-8 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.12em] text-white/35"><WandSparkles className="h-4 w-4 text-amber-300" aria-hidden /> Build-up · Reveal · Hold · Accept</div>
        </aside>
      </div>
    </div>
  );
}

export const CONCEPTS = [
  { id: "sovereign", short: "01", name: "Sovereign Atelier", description: "Premium · ceremonial · established", component: SovereignAtelier },
  { id: "arena", short: "02", name: "Arena Forge", description: "Competitive · tactical · intense", component: ArenaForge },
  { id: "ceremony", short: "03", name: "Crest Ceremony", description: "Emotional · centered · memorable", component: CrestCeremony },
  { id: "vault", short: "04", name: "Midnight Vault", description: "Minimal · private · modern", component: MidnightVault },
  { id: "broadcast", short: "05", name: "Broadcast Reveal", description: "Bold · theatrical · player-facing", component: BroadcastReveal },
] as const;
