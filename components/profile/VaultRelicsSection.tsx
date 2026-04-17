import { filterPublicVaultRelics } from '@/lib/vaultRelicsPublicFilter';

export type VaultRelicRow = {
  id: string;
  title: string;
  category: 'free' | 'tournament';
  date_won: string | null;
  source_game_id: string | null;
  source_tournament_id: string | null;
  pace: 'live' | 'daily' | 'correspondence' | null;
  description: string | null;
};

type Props = {
  relics: VaultRelicRow[];
};

/**
 * Curated vault relics only — generic finished-game win logs are filtered out.
 */
export function VaultRelicsSection({ relics }: Props) {
  const curated = filterPublicVaultRelics(relics);

  return (
    <section className="rounded-xl border border-[#243244] bg-[#111a27] p-4" data-testid="profile-vault-relics">
      <h2 className="mt-0 text-base font-semibold">Vault / Relics</h2>
      <p className="mt-1 text-xs text-slate-500">
        Milestones, tournaments, and rare progression — not routine match history.
      </p>

      {curated.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-700 px-4 py-5 text-slate-300">
          No relics unlocked yet.
        </div>
      ) : (
        <div className="mt-4 grid gap-2">
          {curated.map((r) => (
            <article key={r.id} className="rounded-lg border border-[#2f3f54] bg-[#0f1723] p-3">
              <p className="m-0 font-bold text-slate-100">{r.title}</p>
              <p className="mt-1 text-sm text-gray-300">
                {r.category} · {r.pace ?? 'pace unspecified'} ·{' '}
                {r.date_won ? new Date(r.date_won).toLocaleString() : 'date pending'}
              </p>
              {r.description ? <p className="mt-1 text-xs text-gray-500">{r.description}</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
