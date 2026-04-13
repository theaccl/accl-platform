/** Neutral loading — no NEXUS/command-center branding before auth (middleware + page gate run first). */
export default function NexusLoading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center bg-[#0D1117] px-4 text-gray-400">
      <p className="text-sm tracking-wide">Loading…</p>
    </div>
  );
}
