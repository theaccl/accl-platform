/**
 * Exclude generic finished-game win logs from public Vault / Relics UI.
 * Those belong in History / Trainer — not as curated collectibles.
 */

export type VaultRelicPublicRow = {
  title: string;
  description: string | null;
};

export function isGenericFinishedGameWinRelic(r: VaultRelicPublicRow): boolean {
  const title = r.title.trim().toLowerCase();
  const desc = (r.description ?? '').trim().toLowerCase();

  if (title === 'game winner') {
    return true;
  }

  if (desc.includes('awarded for winning a finished game')) {
    return true;
  }

  return false;
}

export function filterPublicVaultRelics<T extends VaultRelicPublicRow>(relics: T[]): T[] {
  return relics.filter((r) => !isGenericFinishedGameWinRelic(r));
}
