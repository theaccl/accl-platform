export type TesterBugReportErrorCode =
  | 'unauthorized'
  | 'rate_limited'
  | 'message_invalid'
  | 'category_invalid'
  | 'save_failed'
  | 'invalid_json'
  | 'game_id_invalid';

/** Stable client-facing copy for tester bug-report API codes (no raw server errors). */
export function testerBugReportClientMessage(code: string | null | undefined): string {
  switch (code) {
    case 'unauthorized':
      return 'Sign in again, then retry.';
    case 'rate_limited':
      return 'Too many reports. Wait a minute before submitting another.';
    case 'message_invalid':
      return 'Describe what happened (up to 8000 characters).';
    case 'category_invalid':
      return 'Pick a report type from the list.';
    case 'game_id_invalid':
      return 'Game link looks invalid. Remove it or open the game page and try again.';
    case 'save_failed':
      return 'Could not save your report. Try again in a moment.';
    case 'invalid_json':
      return 'Could not send report. Try again.';
    default:
      return 'Could not send report. Try again.';
  }
}
