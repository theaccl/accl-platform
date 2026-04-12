import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Liveness — no DB; safe for load balancers and k8s probes. */
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
