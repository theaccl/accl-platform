import { createServiceRoleClient } from "@/lib/supabaseServiceRoleClient";
import { resolveAuthenticatedUserId } from "@/lib/requestAuth";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/clientIp";
import { tooManyRequests } from "@/lib/server/httpJson";
import type { NexusEcosystem } from "@/lib/nexus/getNexusData";

export const runtime = "nodejs";

const LIST_CAP = 24;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function peerId(row: { player_low: string; player_high: string }, uid: string): string {
  return row.player_low === uid ? row.player_high : row.player_low;
}

export async function GET(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const limited = checkRateLimit(`social-connections:get:${ip}`, 120, 60_000);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const url = new URL(request.url);
  const ecoRaw = (url.searchParams.get("ecosystem") ?? "adult").toLowerCase();
  const ecosystem: NexusEcosystem = ecoRaw === "k12" ? "k12" : "adult";

  const supabase = createServiceRoleClient();
  const { data: rows, error } = await supabase
    .from("player_connections")
    .select("id,player_low,player_high,requested_by,status,created_at")
    .eq("ecosystem_scope", ecosystem)
    .or(`player_low.eq.${userId},player_high.eq.${userId}`)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) return json({ error: error.message }, 503);

  const accepted: Array<{ id: string; peer_id: string; username: string | null }> = [];
  const pending_in: Array<{ id: string; from_id: string; username: string | null }> = [];
  const pending_out: Array<{ id: string; to_id: string; username: string | null }> = [];

  const peerIds = new Set<string>();
  for (const r of rows ?? []) {
    const st = String(r.status ?? "");
    const row = r as { player_low: string; player_high: string; requested_by: string };
    if (st === "accepted") {
      peerIds.add(peerId(row, userId));
    } else if (st === "pending") {
      const other = peerId(row, userId);
      if (row.requested_by === userId) peerIds.add(other);
      else peerIds.add(row.requested_by);
    }
  }
  const ids = [...peerIds].slice(0, 60);
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id,username").in("id", ids);
    for (const p of profiles ?? []) {
      const u = String(p.username ?? "").trim();
      if (u) names.set(String(p.id), u);
    }
  }

  for (const r of rows ?? []) {
    const st = String(r.status ?? "");
    const row = r as { id: string; player_low: string; player_high: string; requested_by: string; status: string };
    if (st === "accepted" && accepted.length < LIST_CAP) {
      const pid = peerId(row, userId);
      accepted.push({ id: row.id, peer_id: pid, username: names.get(pid) ?? null });
    } else if (st === "pending" && row.requested_by !== userId && pending_in.length < LIST_CAP) {
      const from = row.requested_by;
      pending_in.push({ id: row.id, from_id: from, username: names.get(from) ?? null });
    } else if (st === "pending" && row.requested_by === userId && pending_out.length < LIST_CAP) {
      const to = peerId(row, userId);
      pending_out.push({ id: row.id, to_id: to, username: names.get(to) ?? null });
    }
  }

  return json({ ok: true, ecosystem, accepted, pending_in, pending_out });
}

export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const limited = checkRateLimit(`social-connections:post:${ip}`, 40, 60_000);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  let body: { to_username?: unknown; ecosystem?: unknown };
  try {
    body = (await request.json()) as { to_username?: unknown; ecosystem?: unknown };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const rawName = typeof body.to_username === "string" ? body.to_username.trim() : "";
  const ecoRaw = typeof body.ecosystem === "string" ? body.ecosystem.toLowerCase() : "adult";
  const ecosystem: NexusEcosystem = ecoRaw === "k12" ? "k12" : "adult";

  if (rawName.length < 2 || rawName.length > 48) {
    return json({ error: "Invalid username" }, 400);
  }

  const supabase = createServiceRoleClient();
  const { data: target, error: findErr } = await supabase
    .from("profiles")
    .select("id,username")
    .eq("username", rawName)
    .maybeSingle();

  if (findErr) return json({ error: findErr.message }, 503);
  if (!target?.id) return json({ error: "Player not found" }, 404);

  const targetId = String(target.id);
  if (targetId === userId) return json({ error: "Cannot connect to yourself" }, 400);

  const [low, high] = userId < targetId ? [userId, targetId] : [targetId, userId];

  const { data: existing } = await supabase
    .from("player_connections")
    .select("id,status,requested_by")
    .eq("player_low", low)
    .eq("player_high", high)
    .eq("ecosystem_scope", ecosystem)
    .maybeSingle();

  if (existing?.status === "accepted") {
    return json({ ok: true, status: "already_connected", id: existing.id });
  }
  if (existing?.status === "pending") {
    const ex = existing as { id: string; requested_by: string };
    if (ex.requested_by === userId) {
      return json({ ok: true, status: "already_sent", id: ex.id });
    }
    return json({ ok: true, status: "awaiting_your_response", id: ex.id });
  }

  if (existing?.status === "declined") {
    const { error: upErr } = await supabase
      .from("player_connections")
      .update({
        status: "pending",
        requested_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (upErr) return json({ error: upErr.message }, 503);
    return json({ ok: true, status: "requested", id: existing.id });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("player_connections")
    .insert({
      player_low: low,
      player_high: high,
      ecosystem_scope: ecosystem,
      requested_by: userId,
      status: "pending",
    })
    .select("id")
    .single();

  if (insErr) return json({ error: insErr.message }, 503);
  return json({ ok: true, status: "requested", id: inserted?.id });
}

export async function PATCH(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const limited = checkRateLimit(`social-connections:patch:${ip}`, 60, 60_000);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  let body: { id?: unknown; action?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; action?: unknown };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const action = typeof body.action === "string" ? body.action.toLowerCase() : "";
  if (!id || (action !== "accept" && action !== "decline")) {
    return json({ error: "Invalid payload" }, 400);
  }

  const supabase = createServiceRoleClient();
  const { data: row, error: fetchErr } = await supabase
    .from("player_connections")
    .select("id,player_low,player_high,requested_by,status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return json({ error: fetchErr.message }, 503);
  if (!row) return json({ error: "Not found" }, 404);

  const r = row as { player_low: string; player_high: string; requested_by: string; status: string };
  const inPair = r.player_low === userId || r.player_high === userId;
  if (!inPair) return json({ error: "Forbidden" }, 403);
  if (r.status !== "pending") return json({ error: "Not pending" }, 400);

  if (action === "accept") {
    if (r.requested_by === userId) return json({ error: "Cannot accept own request" }, 400);
    const { error: upErr } = await supabase
      .from("player_connections")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (upErr) return json({ error: upErr.message }, 503);
    return json({ ok: true, status: "accepted" });
  }

  const { error: decErr } = await supabase
    .from("player_connections")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (decErr) return json({ error: decErr.message }, 503);
  return json({ ok: true, status: "declined" });
}
