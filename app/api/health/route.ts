import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * ACCL health stack — **liveness / app alive**
 *
 * Meaning: the Next.js app process responds. No database or Supabase calls.
 * Use for load balancers and k8s probes. Release gate: HTTP 200.
 *
 * See also: `/api/health/system` (service-role + core tables), `/api/health/db` (chat migration tables).
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "accl-platform",
      ts: new Date().toISOString(),
    },
    { status: 200 }
  );
}
