import Link from "next/link";
import NavigationBar from "@/components/NavigationBar";
import { getSupabaseUserFromCookies } from "@/lib/auth/getSupabaseUserFromCookies";
import { NEXUS_LOGIN_ENTRY_HREF } from "@/lib/nexus/nexusRouteHelpers";

const secondaryBullets = [
  "Live games and standings",
  "Structured tournament brackets",
  "Progression, records, and vaults",
] as const;

export default async function HomePage() {
  const user = await getSupabaseUserFromCookies();
  const enterNexusHref = user ? "/nexus" : NEXUS_LOGIN_ENTRY_HREF;

  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col text-white">
      <NavigationBar />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-xl mx-auto space-y-10">
          <section className="rounded-2xl border border-[#2a3442] bg-gradient-to-br from-[#111723] to-[#1a2231] px-6 py-10 sm:px-10 sm:py-12 text-center shadow-lg shadow-black/20">
            <p className="text-[11px] uppercase tracking-[0.25em] text-gray-500 mb-3">ACCL</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-snug">
              American Correspondence Chess League
            </h1>
            <p className="mt-4 text-gray-400 text-sm sm:text-base leading-relaxed max-w-md mx-auto">
              Structured play. Real progression. Live command center.
            </p>
          </section>

          <nav
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            aria-label="Primary entry"
          >
            <div className="flex flex-col gap-1">
              <Link
                href={enterNexusHref}
                className="inline-flex items-center justify-center rounded-xl border border-red-500/45 bg-red-900/25 px-4 py-3.5 text-sm font-semibold text-red-100 shadow-sm transition hover:bg-red-900/40 hover:border-red-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117]"
              >
                Enter Nexus
              </Link>
              {!user ? (
                <p className="text-center text-[11px] text-gray-500 sm:text-left">Account required</p>
              ) : null}
            </div>
            <Link
              href="/free"
              className="inline-flex items-center justify-center rounded-xl border border-[#2a3442] bg-[#151d2c] px-4 py-3.5 text-sm font-medium text-gray-100 transition hover:border-red-500/35 hover:bg-[#1a2435] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117]"
            >
              Play Free
            </Link>
            <Link
              href="/tournaments"
              className="inline-flex items-center justify-center rounded-xl border border-[#2a3442] bg-[#151d2c] px-4 py-3.5 text-sm font-medium text-gray-100 transition hover:border-red-500/35 hover:bg-[#1a2435] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117] sm:col-span-2 max-w-md sm:max-w-none mx-auto w-full"
            >
              Tournaments
            </Link>
          </nav>

          <section className="border-t border-[#243244] pt-8">
            <ul className="space-y-2.5 text-sm text-gray-500 max-w-md mx-auto">
              {secondaryBullets.map((line) => (
                <li key={line} className="flex gap-3 items-start text-left">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500/70" aria-hidden />
                  <span className="text-gray-400 leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
