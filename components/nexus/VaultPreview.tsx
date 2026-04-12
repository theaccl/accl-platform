import Link from "next/link";

type VaultPreviewItem = {
  id: string;
  label: string;
  value: string;
};

export default function VaultPreview({
  items,
  k12 = false,
  compact = false,
  allowNav = true,
}: {
  items: VaultPreviewItem[];
  k12?: boolean;
  compact?: boolean;
  allowNav?: boolean;
}) {
  const body = (
    <div className={`rounded-lg border px-2 py-1.5 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
      <p className="text-[11px] text-gray-400 mb-1">Vault Preview</p>
      <div className={`${compact ? "grid grid-cols-2 gap-1" : "space-y-1"}`}>
        {items.slice(0, compact ? 2 : 4).map((item, i) => (
          <p
            key={item.id}
            className={`text-[11px] text-gray-200 ${!compact && i >= 2 ? "hidden sm:block" : ""}`}
          >
            {item.label}: <span className={k12 ? "text-cyan-200" : "text-red-300"}>{item.value}</span>
          </p>
        ))}
      </div>
    </div>
  );

  if (!allowNav) return body;
  return (
    <Link href="/vault" className="block transition hover:opacity-95 active:scale-[0.995]">
      {body}
    </Link>
  );
}
