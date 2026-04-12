export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export function tooManyRequests(retryAfterSec: number): Response {
  return jsonResponse({ error: "Too many requests", retry_after: retryAfterSec }, 429, {
    "Retry-After": String(retryAfterSec),
  });
}
