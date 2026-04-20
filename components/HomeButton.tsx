"use client";

import { useRouter } from "next/navigation";

type Props = {
  label: string;
  route: string;
  /** Non-interactive; shows disabled styling and optional “coming soon” copy. */
  comingSoon?: boolean;
};

export default function HomeButton({ label, route, comingSoon }: Props) {
  const router = useRouter();
  const disabled = Boolean(comingSoon);

  return (
    <button
      type="button"
      disabled={disabled}
      title={comingSoon ? "Coming soon" : undefined}
      onClick={() => {
        if (disabled) return;
        router.push(route);
      }}
      className={`min-h-[48px] w-64 touch-manipulation rounded-xl py-4 text-lg font-semibold transition ${
        disabled
          ? "cursor-not-allowed border border-dashed border-gray-600 bg-[#0d1117] text-gray-500 opacity-90"
          : "bg-[#161b22] text-white hover:bg-[#21262d]"
      }`}
    >
      {comingSoon ? `${label} (coming soon)` : label}
    </button>
  );
}
