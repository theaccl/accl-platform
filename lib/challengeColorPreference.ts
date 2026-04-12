export type ChallengeColorPreference = 'white' | 'black' | 'random';

export function resolveChallengeSeatIds(
  pref: ChallengeColorPreference,
  challengerId: string,
  opponentId: string
): { whiteId: string; blackId: string } {
  if (pref === 'black') return { whiteId: opponentId, blackId: challengerId };
  if (pref === 'random') {
    return Math.random() < 0.5
      ? { whiteId: challengerId, blackId: opponentId }
      : { whiteId: opponentId, blackId: challengerId };
  }
  return { whiteId: challengerId, blackId: opponentId };
}

