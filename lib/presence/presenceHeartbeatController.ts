import type { SupabaseClient } from '@supabase/supabase-js';

import {
  PRESENCE_HEARTBEAT_API_PATH,
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  PRESENCE_HEARTBEAT_RETRY_MAX_MS,
  PRESENCE_INTERACTION_DEBOUNCE_MS,
  type PresenceHeartbeatRequest,
  type PresenceVisibility,
} from '@/lib/presence/heartbeatContract';
import { postAuthenticatedJson } from '@/lib/postAuthenticatedJson';

export type PresenceHeartbeatSendResult =
  | { ok: true; serverTime: string }
  | { ok: false; status: number };

export type PresenceHeartbeatSender = (
  payload: PresenceHeartbeatRequest,
) => Promise<PresenceHeartbeatSendResult>;

export function createPresenceHeartbeatSender(
  supabase: SupabaseClient,
): PresenceHeartbeatSender {
  return async (payload) => {
    const res = await postAuthenticatedJson(supabase, PRESENCE_HEARTBEAT_API_PATH, payload);
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    try {
      const body = (await res.json()) as { ok?: boolean; serverTime?: string };
      if (body.ok && typeof body.serverTime === 'string') {
        return { ok: true, serverTime: body.serverTime };
      }
      return { ok: false, status: res.status };
    } catch {
      return { ok: false, status: res.status };
    }
  };
}

export type PresenceHeartbeatControllerOptions = {
  tabPresenceId: string;
  send: PresenceHeartbeatSender;
  getVisibility: () => PresenceVisibility;
  setIntervalFn?: (handler: () => void, timeout: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
  setTimeoutFn?: (handler: () => void, timeout: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
};

export type PresenceHeartbeatController = {
  start: () => void;
  stop: () => void;
  onRouteChange: () => void;
  onVisibilityChange: () => void;
  onMeaningfulInteraction: () => void;
  onPromptEvent: () => void;
  onOnline: () => void;
  getInteractionPending: () => boolean;
};

type SendHeartbeatOptions = {
  allowRetry?: boolean;
};

export function createPresenceHeartbeatController(
  options: PresenceHeartbeatControllerOptions,
): PresenceHeartbeatController {
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn =
    options.clearIntervalFn ??
    ((handle: unknown) => {
      clearInterval(handle as ReturnType<typeof setInterval>);
    });
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn =
    options.clearTimeoutFn ??
    ((handle: unknown) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    });

  let started = false;
  let intervalId: unknown = null;
  let interactionDebounceId: unknown = null;
  let retryTimeoutId: unknown = null;
  let inFlight = false;
  let interactionPending = false;
  let interactionEpoch = 0;
  let retryDelayMs = PRESENCE_HEARTBEAT_INTERVAL_MS;

  const clearIntervalSafe = () => {
    if (intervalId != null) {
      clearIntervalFn(intervalId);
      intervalId = null;
    }
  };

  const clearRetry = () => {
    if (retryTimeoutId != null) {
      clearTimeoutFn(retryTimeoutId);
      retryTimeoutId = null;
    }
  };

  const mayRetry = (allowRetry: boolean | undefined): boolean => {
    if (allowRetry === false) return false;
    return options.getVisibility() === 'visible';
  };

  const scheduleRetry = () => {
    if (!mayRetry(true)) return;
    clearRetry();
    retryTimeoutId = setTimeoutFn(() => {
      retryTimeoutId = null;
      void sendHeartbeat(false);
    }, retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, PRESENCE_HEARTBEAT_RETRY_MAX_MS);
  };

  const resetRetryDelay = () => {
    retryDelayMs = PRESENCE_HEARTBEAT_INTERVAL_MS;
    clearRetry();
  };

  const sendHeartbeat = async (
    fromInteraction: boolean,
    sendOpts: SendHeartbeatOptions = {},
  ) => {
    if (inFlight) return;
    inFlight = true;
    const capturedEpoch = interactionEpoch;
    const interaction = fromInteraction || interactionPending;
    const payload: PresenceHeartbeatRequest = {
      tabPresenceId: options.tabPresenceId,
      visibility: options.getVisibility(),
      interaction,
    };

    let needsInteractionFollowUp = false;

    try {
      const result = await options.send(payload);
      if (result.ok) {
        if (interaction && capturedEpoch === interactionEpoch) {
          interactionPending = false;
        } else if (interactionPending) {
          needsInteractionFollowUp = true;
        }
        resetRetryDelay();
      } else if (mayRetry(sendOpts.allowRetry)) {
        scheduleRetry();
      }
    } catch {
      if (mayRetry(sendOpts.allowRetry)) {
        scheduleRetry();
      }
    } finally {
      inFlight = false;
      if (needsInteractionFollowUp) {
        void sendHeartbeat(false);
      }
    }
  };

  const restartVisibleInterval = () => {
    clearIntervalSafe();
    if (options.getVisibility() !== 'visible') return;
    intervalId = setIntervalFn(() => {
      void sendHeartbeat(false);
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);
  };

  const onVisibilityChange = () => {
    const visibility = options.getVisibility();
    if (visibility === 'hidden') {
      clearIntervalSafe();
      clearRetry();
      void sendHeartbeat(false, { allowRetry: false });
      return;
    }
    void sendHeartbeat(false);
    restartVisibleInterval();
  };

  const onMeaningfulInteraction = () => {
    interactionPending = true;
    interactionEpoch += 1;
    if (interactionDebounceId != null) {
      clearTimeoutFn(interactionDebounceId);
    }
    interactionDebounceId = setTimeoutFn(() => {
      interactionDebounceId = null;
      void sendHeartbeat(true);
    }, PRESENCE_INTERACTION_DEBOUNCE_MS);
  };

  const onPromptEvent = () => {
    if (options.getVisibility() === 'visible') {
      void sendHeartbeat(false);
      restartVisibleInterval();
    }
  };

  const onOnline = () => {
    onPromptEvent();
  };

  return {
    start() {
      if (started) return;
      started = true;
      void sendHeartbeat(false);
      restartVisibleInterval();
    },
    stop() {
      started = false;
      clearIntervalSafe();
      clearRetry();
      if (interactionDebounceId != null) {
        clearTimeoutFn(interactionDebounceId);
        interactionDebounceId = null;
      }
    },
    onRouteChange: onPromptEvent,
    onVisibilityChange,
    onMeaningfulInteraction,
    onPromptEvent,
    onOnline,
    getInteractionPending() {
      return interactionPending;
    },
  };
}

export const PRESENCE_MEANINGFUL_INTERACTION_EVENTS = [
  'pointerdown',
  'keydown',
  'touchstart',
] as const;

export const PRESENCE_HEARTBEAT_PROMPT_EVENTS = ['focus', 'pageshow'] as const;
