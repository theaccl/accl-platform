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
  // Incremented on every stop() so an in-flight request can detect that the
  // controller it belongs to has been torn down and must not schedule any
  // follow-up work (Codex P2 #2).
  let controllerGeneration = 0;
  // Set when a hidden advisory heartbeat could not be sent because a request
  // was already in flight; the latest hidden state is delivered once the
  // in-flight request settles (Codex P2 #1).
  let pendingHiddenSend = false;

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
    if (!started) return;
    if (inFlight) return;
    inFlight = true;
    const generation = controllerGeneration;
    const capturedEpoch = interactionEpoch;
    const interaction = fromInteraction || interactionPending;
    const payload: PresenceHeartbeatRequest = {
      tabPresenceId: options.tabPresenceId,
      visibility: options.getVisibility(),
      interaction,
    };

    // True only while this request still belongs to a live controller. Once
    // stop() runs (or a fresh start()/stop() cycle bumps the generation), no
    // retry or follow-up scheduling is allowed from this in-flight request.
    const isCurrent = () => started && generation === controllerGeneration;

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
      } else if (isCurrent() && mayRetry(sendOpts.allowRetry)) {
        scheduleRetry();
      }
    } catch {
      if (isCurrent() && mayRetry(sendOpts.allowRetry)) {
        scheduleRetry();
      }
    } finally {
      inFlight = false;
      if (isCurrent() && needsInteractionFollowUp) {
        void sendHeartbeat(false);
      } else if (isCurrent() && pendingHiddenSend) {
        // A hidden transition arrived while this request was in flight. Deliver
        // the latest hidden state exactly once (no retry), and only if the tab
        // is still hidden so we never send stale hidden state after a return to
        // visible.
        pendingHiddenSend = false;
        if (options.getVisibility() === 'hidden') {
          void sendHeartbeat(false, { allowRetry: false });
        }
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
      if (inFlight) {
        // Cannot send now; remember to deliver the hidden advisory heartbeat
        // once the in-flight request settles (Codex P2 #1).
        pendingHiddenSend = true;
        return;
      }
      void sendHeartbeat(false, { allowRetry: false });
      return;
    }
    // Returning to visible cancels any queued hidden send so stale hidden state
    // is never delivered.
    pendingHiddenSend = false;
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
      // Invalidate any in-flight request so its settle handler cannot schedule
      // a retry or follow-up after teardown (Codex P2 #2).
      controllerGeneration += 1;
      pendingHiddenSend = false;
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
