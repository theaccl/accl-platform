import { formatGameTimeControlLabel } from './gameTimeControl';
import { gameRatedBannerSuffix } from './gameRated';
import { normalizeGameTempo } from './gameTempo';

type Input = {
  sourceType?: string | null;
  requestType?: string | null;
  tempo?: string | null;
  liveTimeControl?: string | null;
};

export function gameDisplaySourceLabel({
  sourceType,
  requestType,
}: Pick<Input, 'sourceType' | 'requestType'>): string | null {
  if (requestType === 'rematch') return 'Rematch';
  if (requestType === 'challenge') return 'Challenge';
  if (sourceType === 'random_match') return 'Random Match';
  if (sourceType === 'open_listing') return 'Open listing';
  if (sourceType === 'rematch_request') return 'Rematch';
  if (sourceType === 'challenge') return 'Challenge';
  if (sourceType === 'tournament_bracket') return 'Tournament';
  return null;
}

export function gameDisplayTempoLabel({
  tempo,
  liveTimeControl,
}: Pick<Input, 'tempo' | 'liveTimeControl'>): string {
  return formatGameTimeControlLabel(tempo, liveTimeControl);
}

export function gameDisplayLabel(input: Input): string {
  const src = gameDisplaySourceLabel(input);
  const t = gameDisplayTempoLabel(input);
  return src ? `${src} - ${t}` : t;
}

export function gameModeBannerLabel(input: {
  sourceType?: string | null;
  tempo?: string | null;
  liveTimeControl?: string | null;
  rated?: boolean | null;
}) {
  const left =
    input.sourceType === 'random_match'
      ? 'RANDOM MATCH'
      : input.sourceType === 'open_listing'
      ? 'OPEN LISTING'
      : input.sourceType === 'challenge'
      ? 'DIRECT CHALLENGE'
      : input.sourceType === 'rematch_request'
      ? 'REMATCH'
      : input.sourceType === 'tournament_bracket'
      ? 'TOURNAMENT'
      : 'GAME';
  const tempoWord =
    normalizeGameTempo(input.tempo) === 'daily'
      ? 'DAILY'
      : normalizeGameTempo(input.tempo) === 'correspondence'
      ? 'CORRESPONDENCE'
      : 'LIVE';
  const tc = String(input.liveTimeControl ?? '').trim().toUpperCase();
  return `${left} – ${tc ? `${tempoWord} ${tc}` : tempoWord}${gameRatedBannerSuffix(input.rated)}`;
}

