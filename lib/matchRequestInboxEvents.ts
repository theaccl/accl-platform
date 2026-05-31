/** Notify global inbox surfaces (banner count, prompt) after accept / decline / cancel. */
export const MATCH_REQUEST_INBOX_CHANGED_EVENT = 'accl-match-requests-inbox-changed';

export function notifyMatchRequestInboxChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MATCH_REQUEST_INBOX_CHANGED_EVENT));
}
