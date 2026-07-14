export type PresenceVisibility = 'visible' | 'hidden';

export type PresenceHeartbeatRequest = {
  tabPresenceId: string;
  visibility: PresenceVisibility;
  interaction: boolean;
};

export type PresenceHeartbeatSuccess = {
  ok: true;
  serverTime: string;
};

export type PresenceHeartbeatError = {
  ok?: false;
  error: string;
  retry_after_sec?: number;
};

export const PRESENCE_HEARTBEAT_API_PATH = '/api/presence/heartbeat';

/** Visible-tab periodic heartbeat interval. */
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 30_000;

/** Debounce window for meaningful interaction signals before sending. */
export const PRESENCE_INTERACTION_DEBOUNCE_MS = 2_000;

/** Initial backoff after a failed heartbeat; doubles up to this cap. */
export const PRESENCE_HEARTBEAT_RETRY_MAX_MS = 60_000;

export const PRESENCE_VISIBILITY_VALUES: readonly PresenceVisibility[] = ['visible', 'hidden'];
