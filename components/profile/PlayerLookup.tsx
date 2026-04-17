import Link from 'next/link';

/**
 * Self-only action: jump to the global player lookup surface (separate from Nexus live stack).
 */
export function PlayerLookup() {
  return (
    <div className="rounded-xl border border-[#2f3f54] bg-[#0f1723] p-4">
      <p className="text-sm text-gray-300">Look up another player by username to view their public card.</p>
      <Link
        href="/players"
        className="mt-3 inline-flex rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-600"
      >
        Open player lookup
      </Link>
    </div>
  );
}
