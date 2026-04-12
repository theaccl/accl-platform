"use client";

type HighlightMeta = {
  game_id: string | null;
  event_type: "final" | "upset" | "record" | "recap";
  timestamp: string;
  tags: string[];
};

type Props = {
  title: string;
  subtitle: string;
  leftLabel: string;
  rightLabel: string;
  resultLabel: string;
  keyStat: string;
  timestamp: string;
  linkUrl?: string;
  summaryText?: string;
  k12?: boolean;
  highlightMeta?: HighlightMeta;
  /** Phase 26 — optional analytics hook (non-blocking). */
  onCopyLink?: () => void;
};

function downloadSvg(filename: string, svg: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function cardSvg(props: Props) {
  const accent = props.k12 ? "#67e8f9" : "#f87171";
  const bg = props.k12 ? "#0f1b2a" : "#0f1420";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect x="0" y="0" width="1200" height="630" fill="${bg}" />
  <rect x="30" y="30" width="1140" height="570" rx="24" fill="#111827" stroke="${accent}" stroke-width="2" />
  <text x="70" y="110" fill="#e5e7eb" font-size="44" font-family="Arial" font-weight="700">${props.title}</text>
  <text x="70" y="155" fill="#9ca3af" font-size="24" font-family="Arial">${props.subtitle}</text>
  <text x="70" y="245" fill="#f3f4f6" font-size="34" font-family="Arial">${props.leftLabel} vs ${props.rightLabel}</text>
  <text x="70" y="305" fill="${accent}" font-size="30" font-family="Arial">${props.resultLabel}</text>
  <text x="70" y="360" fill="#d1d5db" font-size="24" font-family="Arial">${props.keyStat}</text>
  <text x="70" y="420" fill="#9ca3af" font-size="20" font-family="Arial">${new Date(props.timestamp).toUTCString()}</text>
  <text x="70" y="500" fill="#9ca3af" font-size="18" font-family="Arial">ACCL Nexus Share Card</text>
  </svg>`;
}

export default function ShareCard(props: Props) {
  const tone = props.k12 ? "border-cyan-500/40 bg-[#0f1b2a]" : "border-red-500/40 bg-[#0f1420]";
  const summary =
    props.summaryText ??
    `${props.title} — ${props.leftLabel} vs ${props.rightLabel}. ${props.resultLabel}. ${props.keyStat}. ${new Date(props.timestamp).toUTCString()}`;

  const onCopyLink = async () => {
    if (!props.linkUrl) return;
    await navigator.clipboard.writeText(props.linkUrl);
    props.onCopyLink?.();
  };
  const onCopySummary = async () => {
    const payload = props.highlightMeta ? `${summary}\n\nmeta:${JSON.stringify(props.highlightMeta)}` : summary;
    await navigator.clipboard.writeText(payload);
  };
  const onDownload = () => {
    downloadSvg("accl-share-card.svg", cardSvg(props));
  };

  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <p className="text-sm text-white font-semibold">{props.title}</p>
      <p className="text-xs text-gray-400">{props.subtitle}</p>
      <p className="text-sm text-gray-200 mt-2">
        {props.leftLabel} vs {props.rightLabel}
      </p>
      <p className={`text-xs mt-1 ${props.k12 ? "text-cyan-200" : "text-red-300"}`}>{props.resultLabel}</p>
      <p className="text-xs text-gray-300">{props.keyStat}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={onCopyLink} className="px-3 py-1.5 rounded-lg bg-[#1f2937] text-xs text-white">
          Copy Link
        </button>
        <button onClick={onDownload} className="px-3 py-1.5 rounded-lg bg-[#1f2937] text-xs text-white">
          Download Image
        </button>
        <button onClick={onCopySummary} className="px-3 py-1.5 rounded-lg bg-[#1f2937] text-xs text-white">
          Copy Summary Text
        </button>
      </div>
    </div>
  );
}
