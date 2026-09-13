import type { EngineTransport } from '@/lib/chess/engine/types';

export type PhysicalWorkerIo = {
  send(command: string): void;
  subscribe(handlers: {
    onLine: (line: string) => void;
    onError?: (error: unknown) => void;
  }): () => void;
};

/**
 * A lease-local transport. Closing it only detaches lease handlers. Physical
 * worker release/reset remains exclusively owned by EngineWorkerPool.
 */
export function createLeaseTransport(io: PhysicalWorkerIo): EngineTransport {
  let closed = false;
  let unsubscribe: (() => void) | null = null;

  return {
    send(command) {
      if (closed) throw new Error('engine_lease_closed');
      io.send(command);
    },
    subscribe(handlers) {
      if (closed || unsubscribe) throw new Error('engine_lease_subscription_invalid');
      unsubscribe = io.subscribe({
        onLine: (line) => {
          if (!closed) handlers.onLine(line);
        },
        onError: (error) => {
          if (!closed) handlers.onError?.(error);
        },
      });
      let detached = false;
      return () => {
        if (detached) return;
        detached = true;
        unsubscribe?.();
        unsubscribe = null;
      };
    },
    close() {
      if (closed) return;
      closed = true;
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
