/**
 * Phase 29 — in-process async queue (no Redis). Best-effort retries; logs failures.
 */
import { auditApiLog, shortId } from '@/lib/server/prodLog';

type Job = {
  id: string;
  fn: () => Promise<void>;
  attempts: number;
  maxAttempts: number;
  label: string;
};

const queue: Job[] = [];
let draining = false;

function genId(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function enqueueTask(
  label: string,
  fn: () => Promise<void>,
  opts?: { maxAttempts?: number }
): void {
  const id = genId();
  const maxAttempts = opts?.maxAttempts ?? 3;
  queue.push({ id, fn, attempts: 0, maxAttempts, label });
  auditApiLog('queue_enqueue', { label, id: shortId(id), depth: queue.length });
  if (queue.length > 80) {
    auditApiLog('queue_backpressure', { label, depth: queue.length });
  }
  void drain();
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      try {
        await job.fn();
        auditApiLog('queue_done', { label: job.label, id: shortId(job.id) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'error';
        job.attempts += 1;
        auditApiLog('queue_task_error', {
          label: job.label,
          id: shortId(job.id),
          attempt: job.attempts,
          detail: msg.slice(0, 200),
        });
        if (job.attempts < job.maxAttempts) {
          queue.push(job);
        }
      }
    }
  } finally {
    draining = false;
  }
}

export function getQueueDepth(): number {
  return queue.length;
}
