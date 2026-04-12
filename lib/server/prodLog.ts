/**
 * Production API audit logging — structured, no tokens, no full UUIDs in message payloads.
 * Enable in dev with ACCL_API_AUDIT_LOG=1.
 */

export function shouldAuditApiLog(): boolean {
  return process.env.NODE_ENV === "production" || process.env.ACCL_API_AUDIT_LOG === "1";
}

/** First 8 chars + ellipsis — not reversible to full id from logs alone. */
export function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export function auditApiLog(event: string, fields: Record<string, string | number | boolean | null | undefined>): void {
  if (!shouldAuditApiLog()) return;
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), event, ...fields });
    console.info(`[accl-api] ${line}`);
  } catch {
    console.info(`[accl-api] ${event}`);
  }
}

const SLOW_MS_DEFAULT = 1200;

function slowRequestThresholdMs(): number {
  const raw = process.env.ACCL_SLOW_REQUEST_MS?.trim();
  const n = raw ? parseInt(raw, 10) : SLOW_MS_DEFAULT;
  return Number.isFinite(n) && n >= 200 ? n : SLOW_MS_DEFAULT;
}

/** Logs when a route or job exceeds threshold (production or ACCL_API_AUDIT_LOG). */
export function logSlowRequest(route: string, ms: number, extra?: Record<string, string | number | boolean | null>): void {
  if (!shouldAuditApiLog()) return;
  if (ms < slowRequestThresholdMs()) return;
  auditApiLog('slow_request', { route, ms, ...extra });
}

export function isRetryableDbError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    /timeout|timed out|econnreset|econnrefused|connection.*(reset|refused|closed)|503|502|504|unavailable|deadlock|too many connections/.test(
      m
    )
  );
}
