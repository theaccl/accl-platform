import Link from "next/link";
import { nexusTransition } from "@/components/nexus/NexusHeader";
import type { NexusQuickNavItem } from "@/lib/nexus/types";

export default function NexusQuickNav({ items }: { items: NexusQuickNavItem[] }) {
  return (
    <nav
      className="-mx-0.5 flex flex-wrap gap-1 border-b border-[#243244]/50 pb-2.5 pt-0.5"
      aria-label="NEXUS quick links"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 ${nexusTransition} hover:bg-[#151d2c]/80 hover:text-gray-300 hover:underline hover:decoration-gray-500/60 hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117] active:opacity-90 motion-reduce:active:opacity-100`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
