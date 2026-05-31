export type IncomingMatchRequestKind = 'rematch' | 'challenge' | 'other';

export function incomingMatchRequestKind(requestType: string): IncomingMatchRequestKind {
  if (requestType === 'rematch') return 'rematch';
  if (requestType === 'challenge') return 'challenge';
  return 'other';
}

export function incomingMatchRequestPromptTitle(kind: IncomingMatchRequestKind): string {
  if (kind === 'rematch') return 'REMATCH REQUEST';
  if (kind === 'challenge') return 'CHALLENGE REQUEST';
  return 'MATCH REQUEST';
}

export function incomingMatchRequestPromptBody(
  kind: IncomingMatchRequestKind,
  senderLabel: string,
): string {
  const who = senderLabel.trim() || 'Opponent';
  if (kind === 'rematch') return `${who} wants a rematch.`;
  if (kind === 'challenge') return `${who} sent you a direct challenge.`;
  return `${who} sent you a match request.`;
}

export function outgoingDeclinedFeedbackMessage(requestType: string): string {
  if (requestType === 'rematch') return 'Rematch declined';
  if (requestType === 'challenge') return 'Challenge declined';
  return 'Match request declined';
}
