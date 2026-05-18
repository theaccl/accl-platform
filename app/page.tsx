import Link from "next/link";
import NavigationBar from "@/components/NavigationBar";
import { LeagueCard } from "@/components/ui/LeagueCard";
import { StatusLight } from "@/components/ui/StatusLight";
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
    <div className="min-h-screen bg-[var(--accl-bg-base)] flex flex-col text-[var(--accl-text-primary)]">
      <NavigationBar />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-xl mx-auto space-y-10">
          <LeagueCard padding="lg" className="text-center">
            <p className="text-[length:var(--accl-text-xs)] uppercase tracking-[var(--accl-tracking-caps)] text-[var(--accl-text-faint)] mb-3">
              ACCL
            </p>
            <h1 className="font-display text-[length:var(--accl-text-display)] font-bold text-white tracking-tight leading-[var(--accl-leading-tight)]">
              American Correspondence Chess League
            </h1>
            <p className="mt-4 text-[var(--accl-text-muted)] text-sm sm:text-base leading-[var(--accl-leading-normal)] max-w-md mx-auto">
              Structured play. Real progression. Live command center.
            </p>
          </LeagueCard>

          <nav
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            aria-label="Primary entry"
          >
            <div className="flex flex-col gap-1 sm:col-span-2">
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
            {user ? (
              <Link
                href="/trainer"
                className="inline-flex items-center justify-center rounded-xl border border-[#2a3442] bg-[#151d2c] px-4 py-3.5 text-sm font-medium text-gray-100 transition hover:border-red-500/35 hover:bg-[#1a2435] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117] sm:col-span-2 max-w-md sm:max-w-none mx-auto w-full"
              >
                Trainer
              </Link>
            ) : null}
          </nav>

          <section className="border-t border-[var(--accl-border-muted)] pt-8">
            <ul className="space-y-2.5 text-sm text-[var(--accl-text-muted)] max-w-md mx-auto">
              {secondaryBullets.map((line) => (
                <li key={line} className="flex gap-3 items-start text-left">
                  <StatusLight tone="danger" size="sm" className="mt-1.5 opacity-80" aria-hidden />
                  <span className="text-[var(--accl-text-secondary)] leading-[var(--accl-leading-normal)]">{line}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
