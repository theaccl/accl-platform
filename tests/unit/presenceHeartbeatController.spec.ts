import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  PRESENCE_HEARTBEAT_RETRY_MAX_MS,
  PRESENCE_INTERACTION_DEBOUNCE_MS,
} from '@/lib/presence/heartbeatContract';
import {
  createPresenceHeartbeatController,
  PRESENCE_HEARTBEAT_PROMPT_EVENTS,
  PRESENCE_MEANINGFUL_INTERACTION_EVENTS,
} from '@/lib/presence/presenceHeartbeatController';

const TAB_ID = '770e8400-e29b-41d4-a716-446655440002';

type SentPayload = {
  tabPresenceId: string;
  visibility: 'visible' | 'hidden';
  interaction: boolean;
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeController(opts: {
  visibility: () => 'visible' | 'hidden';
  sendResults: Array<{ ok: true; serverTime: string } | { ok: false; status: number }>;
}) {
  const sent: SentPayload[] = [];
  let sendIndex = 0;
  const timers: Array<{ fn: () => void; at: number; id: number }> = [];
  let nowMs = 0;
  let nextTimerId = 1;
  const intervals: Array<{ fn: () => void; ms: number; id: number }> = [];

  const flushTimers = (upTo: number) => {
    const due = timers.filter((t) => t.at <= upTo).sort((a, b) => a.at - b.at);
    for (const t of due) t.fn();
    for (let i = timers.length - 1; i >= 0; i -= 1) {
      if (timers[i].at <= upTo) timers.splice(i, 1);
    }
  };

  const controller = createPresenceHeartbeatController({
    tabPresenceId: TAB_ID,
    getVisibility: opts.visibility,
    setTimeoutFn: (fn: () => void, delay?: number) => {
      const id = nextTimerId++;
      timers.push({ fn, at: nowMs + (delay ?? 0), id });
      return id;
    },
    clearTimeoutFn: (id: unknown) => {
      const idx = timers.findIndex((t) => t.id === id);
      if (idx >= 0) timers.splice(idx, 1);
    },
    setIntervalFn: (fn: () => void, ms?: number) => {
      const id = nextTimerId++;
      intervals.push({ fn, ms: ms ?? PRESENCE_HEARTBEAT_INTERVAL_MS, id });
      return id;
    },
    clearIntervalFn: (id) => {
      const idx = intervals.findIndex((t) => t.id === id);
      if (idx >= 0) intervals.splice(idx, 1);
    },
    send: async (payload) => {
      sent.push(payload);
      const result = opts.sendResults[sendIndex] ?? { ok: false, status: 503 };
      sendIndex += 1;
      return result;
    },
  });

  return {
    controller,
    sent,
    async drain() {
      flushTimers(nowMs);
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    advance(ms: number) {
      nowMs += ms;
      flushTimers(nowMs);
    },
    fireInterval() {
      for (const interval of intervals) interval.fn();
    },
    intervals,
  };
}

test.describe('presenceHeartbeatController', () => {
  test('visible interval is 30 seconds and hidden state stops periodic sends', async () => {
    let visibility: 'visible' | 'hidden' = 'visible';
    const harness = makeController({
      visibility: () => visibility,
      sendResults: [{ ok: true, serverTime: 't0' }, { ok: true, serverTime: 't1' }],
    });

    harness.controller.start();
    await harness.drain();
    expect(harness.sent).toHaveLength(1);
    expect(harness.intervals[0]?.ms).toBe(PRESENCE_HEARTBEAT_INTERVAL_MS);

    visibility = 'hidden';
    harness.controller.onVisibilityChange();
    await harness.drain();
    expect(harness.intervals).toHaveLength(0);
    expect(harness.sent.at(-1)?.visibility).toBe('hidden');
  });

  test('visibility return sends promptly and restarts interval', async () => {
    let visibility: 'visible' | 'hidden' = 'hidden';
    const harness = makeController({
      visibility: () => visibility,
      sendResults: [
        { ok: true, serverTime: 't0' },
        { ok: true, serverTime: 't1' },
      ],
    });
    harness.controller.start();
    await harness.drain();
    const afterHidden = harness.sent.length;

    visibility = 'visible';
    harness.controller.onVisibilityChange();
    await harness.drain();
    expect(harness.sent.length).toBeGreaterThan(afterHidden);
    expect(harness.intervals.length).toBe(1);
  });

  test('focus/pageshow/navigation prompt events can trigger sends when visible', async () => {
    const harness = makeController({
      visibility: () => 'visible',
      sendResults: [
        { ok: true, serverTime: 't0' },
        { ok: true, serverTime: 't1' },
        { ok: true, serverTime: 't2' },
        { ok: true, serverTime: 't3' },
      ],
    });
    harness.controller.start();
    await harness.drain();
    const base = harness.sent.length;
    harness.controller.onPromptEvent();
    await harness.drain();
    harness.controller.onRouteChange();
    await harness.drain();
    expect(harness.sent.length).toBeGreaterThanOrEqual(base + 2);
  });

  test('meaningful interaction is debounced and mousemove is not used', () => {
    const hook = readFileSync(join(process.cwd(), 'hooks/usePresenceHeartbeat.ts'), 'utf8');
    const controllerSrc = readFileSync(
      join(process.cwd(), 'lib/presence/presenceHeartbeatController.ts'),
      'utf8',
    );
    expect(hook).toContain('PRESENCE_MEANINGFUL_INTERACTION_EVENTS');
    for (const ev of PRESENCE_MEANINGFUL_INTERACTION_EVENTS) {
      expect(controllerSrc).toContain(`'${ev}'`);
    }
    expect(hook).not.toContain('mousemove');
    expect(PRESENCE_INTERACTION_DEBOUNCE_MS).toBeGreaterThan(0);
  });

  test('interaction remains pending after failed request and clears on success', async () => {
    const harness = makeController({
      visibility: () => 'visible',
      sendResults: [
        { ok: true, serverTime: 't0' },
        { ok: false, status: 503 },
        { ok: true, serverTime: 't1' },
      ],
    });
    harness.controller.start();
    await harness.drain();
    harness.controller.onMeaningfulInteraction();
    harness.advance(PRESENCE_INTERACTION_DEBOUNCE_MS);
    await harness.drain();
    expect(harness.controller.getInteractionPending()).toBe(true);
    expect(harness.sent.some((p) => p.interaction)).toBe(true);

    harness.controller.onMeaningfulInteraction();
    harness.advance(PRESENCE_INTERACTION_DEBOUNCE_MS);
    await harness.drain();
    expect(harness.controller.getInteractionPending()).toBe(false);
  });

  test('M-1: newer interaction during in-flight delivery remains pending and is sent next', async () => {
    const gate1 = deferred<{ ok: true; serverTime: string }>();
    const gate2 = deferred<{ ok: true; serverTime: string }>();
    const sent: SentPayload[] = [];
    let interactionSends = 0;

    const controller = createPresenceHeartbeatController({
      tabPresenceId: TAB_ID,
      getVisibility: () => 'visible',
      setTimeoutFn: (fn, delay) => setTimeout(fn, delay ?? 0),
      send: async (payload) => {
        sent.push(payload);
        if (payload.interaction) {
          interactionSends += 1;
          if (interactionSends === 1) return gate1.promise;
          if (interactionSends === 2) return gate2.promise;
        }
        return { ok: true, serverTime: 'ok' };
      },
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    controller.onMeaningfulInteraction();
    await new Promise((resolve) => setTimeout(resolve, PRESENCE_INTERACTION_DEBOUNCE_MS + 5));
    expect(interactionSends).toBe(1);

    controller.onMeaningfulInteraction();
    await new Promise((resolve) => setTimeout(resolve, PRESENCE_INTERACTION_DEBOUNCE_MS + 5));
    expect(interactionSends).toBe(1);

    gate1.resolve({ ok: true, serverTime: 'first' });
    await gate1.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(controller.getInteractionPending()).toBe(true);
    expect(interactionSends).toBe(2);
    expect(sent.at(-1)?.interaction).toBe(true);

    gate2.resolve({ ok: true, serverTime: 'second' });
    await gate2.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(controller.getInteractionPending()).toBe(false);
  });

  test('M-2: failed hidden advisory heartbeat does not retry while hidden', async () => {
    let visibility: 'visible' | 'hidden' = 'visible';
    const harness = makeController({
      visibility: () => visibility,
      sendResults: [
        { ok: true, serverTime: 'visible-start' },
        { ok: false, status: 503 },
      ],
    });

    harness.controller.start();
    await harness.drain();
    expect(harness.sent).toHaveLength(1);

    visibility = 'hidden';
    harness.controller.onVisibilityChange();
    await harness.drain();
    expect(harness.sent).toHaveLength(2);
    expect(harness.sent.at(-1)?.visibility).toBe('hidden');

    harness.advance(PRESENCE_HEARTBEAT_INTERVAL_MS);
    await harness.drain();
    harness.advance(PRESENCE_HEARTBEAT_RETRY_MAX_MS);
    await harness.drain();
    expect(harness.sent).toHaveLength(2);

    visibility = 'visible';
    harness.controller.onVisibilityChange();
    await harness.drain();
    expect(harness.sent.length).toBeGreaterThan(2);
    expect(harness.sent.at(-1)?.visibility).toBe('visible');
  });

  test('overlapping requests are prevented', async () => {
    const gate = deferred<{ ok: true; serverTime: string }>();
    const sent: SentPayload[] = [];
    let inFlightObserved = false;

    const controller = createPresenceHeartbeatController({
      tabPresenceId: TAB_ID,
      getVisibility: () => 'visible',
      send: async (payload) => {
        sent.push(payload);
        if (sent.length === 1) {
          void controller.onPromptEvent();
        }
        if (sent.length > 1) inFlightObserved = true;
        return gate.promise;
      },
    });

    controller.start();
    expect(sent).toHaveLength(1);
    expect(inFlightObserved).toBe(false);
    gate.resolve({ ok: true, serverTime: 'done' });
    await gate.promise;
  });

  test('listeners and timers are cleaned up on stop', () => {
    const hook = readFileSync(join(process.cwd(), 'hooks/usePresenceHeartbeat.ts'), 'utf8');
    expect(hook).toContain('removeEventListener');
    expect(hook).toContain('controller.stop()');
    for (const ev of [...PRESENCE_HEARTBEAT_PROMPT_EVENTS, 'visibilitychange', 'online']) {
      expect(hook).toContain(ev);
    }
  });

  test('provider mounts globally without render loop patterns', () => {
    const providers = readFileSync(join(process.cwd(), 'components/AppProviders.tsx'), 'utf8');
    expect(providers).toContain('PresenceHeartbeatProvider');
    const provider = readFileSync(
      join(process.cwd(), 'components/presence/PresenceHeartbeatProvider.tsx'),
      'utf8',
    );
    expect(provider).toContain('usePresenceHeartbeat');
    expect(provider).not.toMatch(/setState\([^)]*heartbeat/i);
  });

  test('Codex P2 #1: hidden transition during in-flight send delivers one hidden heartbeat afterward', async () => {
    let visibility: 'visible' | 'hidden' = 'visible';
    const gate1 = deferred<{ ok: true; serverTime: string }>();
    const sent: SentPayload[] = [];
    const timeouts: Array<{ fn: () => void; delay: number }> = [];
    let sendCount = 0;

    const controller = createPresenceHeartbeatController({
      tabPresenceId: TAB_ID,
      getVisibility: () => visibility,
      setTimeoutFn: (fn, delay) => {
        timeouts.push({ fn, delay: delay ?? 0 });
        return timeouts.length;
      },
      clearTimeoutFn: () => {},
      setIntervalFn: () => 1,
      clearIntervalFn: () => {},
      send: async (payload) => {
        sent.push(payload);
        sendCount += 1;
        if (sendCount === 1) return gate1.promise;
        return { ok: true, serverTime: 'ok' };
      },
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.visibility).toBe('visible');

    // Visibility flips to hidden while the first request is still in flight.
    visibility = 'hidden';
    controller.onVisibilityChange();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The hidden send is queued (inFlight), so it is not lost nor sent yet.
    expect(sent).toHaveLength(1);

    // In-flight request completes; the queued hidden heartbeat is delivered once.
    gate1.resolve({ ok: true, serverTime: 'first' });
    await gate1.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toHaveLength(2);
    expect(sent.at(-1)?.visibility).toBe('hidden');

    // No hidden retry loop: firing any scheduled timers produces no new sends.
    for (const t of timeouts.splice(0)) t.fn();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toHaveLength(2);
  });

  test('Codex P2 #1: return to visible before queued hidden send suppresses stale hidden state', async () => {
    let visibility: 'visible' | 'hidden' = 'visible';
    const gate1 = deferred<{ ok: true; serverTime: string }>();
    const sent: SentPayload[] = [];
    let sendCount = 0;

    const controller = createPresenceHeartbeatController({
      tabPresenceId: TAB_ID,
      getVisibility: () => visibility,
      setTimeoutFn: (fn, delay) => setTimeout(fn, delay ?? 0),
      setIntervalFn: () => 1,
      clearIntervalFn: () => {},
      send: async (payload) => {
        sent.push(payload);
        sendCount += 1;
        if (sendCount === 1) return gate1.promise;
        return { ok: true, serverTime: 'ok' };
      },
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toHaveLength(1);

    // Hidden while in flight → hidden send is queued.
    visibility = 'hidden';
    controller.onVisibilityChange();
    // Back to visible before the in-flight request settles → queue is cancelled.
    visibility = 'visible';
    controller.onVisibilityChange();

    gate1.resolve({ ok: true, serverTime: 'first' });
    await gate1.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Stale hidden state is never delivered.
    expect(sent.some((p) => p.visibility === 'hidden')).toBe(false);
  });

  test('Codex P2 #2: stop during in-flight failure schedules no retry or follow-up', async () => {
    const gate1 = deferred<{ ok: false; status: number }>();
    const sent: SentPayload[] = [];
    const timeouts: Array<{ fn: () => void; delay: number }> = [];
    let sendCount = 0;

    const controller = createPresenceHeartbeatController({
      tabPresenceId: TAB_ID,
      getVisibility: () => 'visible',
      setTimeoutFn: (fn, delay) => {
        timeouts.push({ fn, delay: delay ?? 0 });
        return timeouts.length;
      },
      clearTimeoutFn: () => {},
      setIntervalFn: () => 1,
      clearIntervalFn: () => {},
      send: async (payload) => {
        sent.push(payload);
        sendCount += 1;
        if (sendCount === 1) return gate1.promise;
        return { ok: false, status: 503 };
      },
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toHaveLength(1);

    // Stop while the request is in flight.
    controller.stop();

    // The in-flight request now fails, after stop() already cleared timers.
    gate1.resolve({ ok: false, status: 503 });
    await gate1.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // No retry timer scheduled and no follow-up heartbeat sent.
    expect(timeouts).toHaveLength(0);
    expect(sent).toHaveLength(1);

    // Advancing beyond any retry window produces no further sends.
    for (const t of timeouts.splice(0)) t.fn();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toHaveLength(1);
  });
});
