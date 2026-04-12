import Link from "next/link";

type Props = {
  title: string;
  eyebrow: string;
  summary: string;
  statsLine?: string;
  watchHref: string;
  joinHref: string;
  k12?: boolean;
};

export default function ShareView({ title, eyebrow, summary, statsLine, watchHref, joinHref, k12 = false }: Props) {
  const accent = k12 ? "border-cyan-500/40 bg-[#0f1b2a]" : "border-red-500/40 bg-[#0f1420]";
  const ctaPrimary = k12
    ? "border-cyan-500/50 bg-cyan-950/40 text-cyan-100"
    : "border-red-500/50 bg-red-950/35 text-red-100";
  const ctaSecondary = "border-slate-600 bg-slate-900/60 text-slate-100";

  return (
    <div className={`min-h-screen text-white ${k12 ? "bg-[#0b1524]" : "bg-[#0D1117]"}`}>
      <div className="max-w-lg mx-auto px-4 py-10 space-y-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500">ACCL</p>
        <div className={`rounded-2xl border p-5 sm:p-6 ${accent}`}>
          <p className="text-xs text-gray-400">{eyebrow}</p>
          <h1 className="text-xl sm:text-2xl font-semibold mt-1 leading-snug">{title}</h1>
          <p className="text-sm text-gray-300 mt-3 leading-relaxed">{summary}</p>
          {statsLine ? <p className="text-xs text-gray-500 mt-3">{statsLine}</p> : null}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href={watchHref}
            className={`flex-1 text-center rounded-xl border px-4 py-3.5 text-sm font-semibold min-h-[48px] flex items-center justify-center ${ctaPrimary}`}
          >
            Watch live
          </Link>
          <Link
            href={joinHref}
            className={`flex-1 text-center rounded-xl border px-4 py-3.5 text-sm font-semibold min-h-[48px] flex items-center justify-center ${ctaSecondary}`}
          >
            Join ACCL
          </Link>
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Public summary only — identities follow school-safe masking on the K–12 track. No chat or interaction on this
          page.
        </p>
      </div>
    </div>
  );
}
