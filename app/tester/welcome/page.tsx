import Link from 'next/link';
import { redirect } from 'next/navigation';
import NavigationBar from '@/components/NavigationBar';
import { TesterBugReportTrigger } from '@/components/TesterBugReportDialog';
import { getSupabaseUserFromCookies } from '@/lib/auth/getSupabaseUserFromCookies';

export const dynamic = 'force-dynamic';

export default async function TesterWelcomePage() {
  const user = await getSupabaseUserFromCookies();
  if (!user?.id) {
    redirect('/login?next=%2Ftester%2Fwelcome');
  }

  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col text-white">
      <NavigationBar />
      <main data-testid="lobby-ready" className="mx-auto w-full max-w-xl flex-1 px-4 py-10 sm:py-14">
        <section className="rounded-2xl border border-[#2a3442] bg-gradient-to-br from-[#111723] to-[#1a2231] p-6 sm:p-8 shadow-lg shadow-black/20">
          <p className="text-[11px] uppercase tracking-[0.25em] text-gray-500">ACCL test</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Tester welcome</h1>
          <p className="mt-4 text-sm leading-relaxed text-gray-300">
            You are in the ACCL test environment.
          </p>
          <p className="mt-3 text-xs text-amber-200/90">
            Please do not share access, screenshots, or details outside the tester group unless staff say otherwise.
          </p>

          <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-gray-500">What to try</h2>
          <ul className="mt-3 space-y-2 text-sm text-gray-300">
            <li className="flex gap-2">
              <span className="text-red-400" aria-hidden>
                ·
              </span>
              Play free games (no tournament entry required)
            </li>
            <li className="flex gap-2">
              <span className="text-red-400" aria-hidden>
                ·
              </span>
              Open NEXUS — live command center
            </li>
            <li className="flex gap-2">
              <span className="text-red-400" aria-hidden>
                ·
              </span>
              Spectate games and use spectator chat where available
            </li>
            <li className="flex gap-2">
              <span className="text-red-400" aria-hidden>
                ·
              </span>
              Lobby chat and direct messages (DMs)
            </li>
          </ul>

          <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-gray-500">Where to go</h2>
          <nav className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap" aria-label="Tester destinations">
            <Link
              href="/nexus"
              className="inline-flex flex-1 min-w-[140px] items-center justify-center rounded-xl border border-red-500/45 bg-red-900/25 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-900/40"
            >
              Enter NEXUS
            </Link>
            <Link
              href="/free"
              className="inline-flex flex-1 min-w-[140px] items-center justify-center rounded-xl border border-[#2a3442] bg-[#151d2c] px-4 py-3 text-sm font-medium text-gray-100 transition hover:border-red-500/35"
            >
              Play Free
            </Link>
            <Link
              href="/tester/lobby-chat"
              className="inline-flex flex-1 min-w-[140px] items-center justify-center rounded-xl border border-[#2a3442] bg-[#151d2c] px-4 py-3 text-sm font-medium text-gray-100 transition hover:border-red-500/35"
            >
              Lobby Chat
            </Link>
            <Link
              href="/tester/messages"
              className="inline-flex flex-1 min-w-[140px] items-center justify-center rounded-xl border border-[#2a3442] bg-[#151d2c] px-4 py-3 text-sm font-medium text-gray-100 transition hover:border-red-500/35"
            >
              Messages
            </Link>
          </nav>

          <p className="mt-6 rounded-lg border border-[#2a3442] bg-[#0f1420]/80 px-3 py-2 text-xs text-gray-400 leading-relaxed">
            Known limitations: some features are incomplete or may change. If something breaks, use Report issue
            below — include what you clicked and what you expected.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#243244] pt-6">
            <TesterBugReportTrigger label="Report issue" className="rounded-lg border border-amber-500/35 bg-amber-950/20 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-950/35" />
            <Link href="/modes" className="text-sm text-gray-500 hover:text-gray-300 hover:underline">
              Switch mode (modes hub)
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
