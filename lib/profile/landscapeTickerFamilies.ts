/**
 * Expanded ticker family pager (Free / Battlefield / KPTV).
 * Free is the only family with an implemented rating ticker in this overlay.
 * Battlefield and KPTV have no authoritative ticker series here — do not invent them.
 */

export type LandscapeTickerFamilyId = 'free' | 'battlefield' | 'kptv';

export type LandscapeTickerFamilyDef = {
  id: LandscapeTickerFamilyId;
  label: string;
  /** Accessible control name; keep KPTV exact. */
  tickerName: string;
  testId: string;
  panelTestId: string;
  implemented: boolean;
  unavailableDetail: string | null;
};

export const LANDSCAPE_TICKER_FAMILIES: readonly LandscapeTickerFamilyDef[] = [
  {
    id: 'free',
    label: 'Free',
    tickerName: 'Free ticker',
    testId: 'landscape-ticker-family-free',
    panelTestId: 'landscape-ticker-family-panel-free',
    implemented: true,
    unavailableDetail: null,
  },
  {
    id: 'battlefield',
    label: 'Battlefield',
    tickerName: 'Battlefield ticker',
    testId: 'landscape-ticker-family-battlefield',
    panelTestId: 'landscape-ticker-family-panel-battlefield',
    implemented: false,
    unavailableDetail:
      'Battlefield ticker history is not available in this overlay yet. Free Play tournament ratings stay on the Free ticker.',
  },
  {
    id: 'kptv',
    label: 'KPTV',
    tickerName: 'KPTV ticker',
    testId: 'landscape-ticker-family-kptv',
    panelTestId: 'landscape-ticker-family-panel-kptv',
    implemented: false,
    unavailableDetail: 'KPTV ticker history is not available in this overlay yet.',
  },
] as const;

export const LANDSCAPE_TICKER_DEFAULT_FAMILY: LandscapeTickerFamilyId = 'free';

export function landscapeTickerFamilyById(
  id: LandscapeTickerFamilyId,
): LandscapeTickerFamilyDef {
  const found = LANDSCAPE_TICKER_FAMILIES.find((family) => family.id === id);
  if (!found) {
    throw new Error(`Unknown landscape ticker family: ${id}`);
  }
  return found;
}

export function landscapeTickerFamilyIndex(id: LandscapeTickerFamilyId): number {
  return LANDSCAPE_TICKER_FAMILIES.findIndex((family) => family.id === id);
}

export function adjacentLandscapeTickerFamily(
  id: LandscapeTickerFamilyId,
  delta: number,
): LandscapeTickerFamilyId {
  const current = landscapeTickerFamilyIndex(id);
  const next =
    (current + delta + LANDSCAPE_TICKER_FAMILIES.length) % LANDSCAPE_TICKER_FAMILIES.length;
  return LANDSCAPE_TICKER_FAMILIES[next].id;
}
