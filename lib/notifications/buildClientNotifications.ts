import { finishedGameResultBannerText } from "@/lib/finishedGame";
import { publicDisplayNameFromProfileUsername } from "@/lib/profileIdentity";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ClientNotificationCategory = "challenge" | "game" | "tournament" | "system";

export type ClientNotificationItem = {
  id: string;
  category: ClientNotificationCategory;
  title: string;
  body: string;
  href: string;
  at: string;
};

const ECOSYSTEM = "adult" as const;

/**
 * Aggregates user-relevant rows the browser can already read via Supabase (RLS).
 * Not exhaustive vs server-only feeds — expands when notification APIs exist.
 */
export async function buildClientNotifications(
  supabase: SupabaseClient,
  userId: string
): Promise<ClientNotificationItem[]> {
  const items: ClientNotificationItem[] = [];

  const [incomingReq, finishedGames, entriesRes, announcementsRes] = await Promise.all([
    supabase
      .from("match_requests")
      .select("id, from_user_id, created_at, request_type, tempo, live_time_control, visibility")
      .eq("to_user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("games")
      .select("id, result, end_reason, finished_at, created_at, white_player_id, black_player_id, status")
      .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
      .eq("status", "finished")
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(20),
    supabase.from("tournament_entries").select("tournament_id").eq("user_id", userId).limit(80),
    supabase
      .from("nexus_announcements")
      .select("id, title, body, created_at, pinned")
      .eq("ecosystem_scope", ECOSYSTEM)
      .eq("is_active", true)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const fromIds = [...new Set((incomingReq.data ?? []).map((r) => String(r.from_user_id ?? "").trim()).filter(Boolean))];
  const names: Record<string, string> = {};
  if (fromIds.length > 0) {
    const { data: profs } = await supabase.from("profiles").select("id, username").in("id", fromIds);
    for (const p of profs ?? []) {
      const row = p as { id: string; username: string | null };
      names[row.id] = publicDisplayNameFromProfileUsername(row.username, row.id);
    }
  }

  for (const r of incomingReq.data ?? []) {
    const id = String(r.id ?? "").trim();
    if (!id) continue;
    const from = String(r.from_user_id ?? "").trim();
    const label = from ? names[from] ?? "Another player" : "Another player";
    const created = String(r.created_at ?? new Date().toISOString());
    items.push({
      id: `challenge-${id}`,
      category: "challenge",
      title: "Direct challenge",
      body: `${label} sent a match request${r.visibility === "open" ? " (open listing)" : ""}.`,
      href: "/requests",
      at: created,
    });
  }

  for (const g of finishedGames.data ?? []) {
    const gid = String(g.id ?? "").trim();
    if (!gid) continue;
    const finishedAt = String(
      g.finished_at ?? (g as { created_at?: string }).created_at ?? new Date().toISOString()
    );
    const banner = finishedGameResultBannerText({
      status: "finished",
      result: g.result ?? null,
      end_reason: g.end_reason ?? null,
      white_player_id: String(g.white_player_id ?? ""),
      black_player_id: g.black_player_id != null ? String(g.black_player_id) : null,
    });
    items.push({
      id: `game-${gid}`,
      category: "game",
      title: "Game result",
      body: banner,
      href: `/finished/${gid}`,
      at: finishedAt,
    });
  }

  const entryRows = (entriesRes.data ?? []) as { tournament_id?: string }[];
  const tids = [...new Set(entryRows.map((e) => String(e.tournament_id ?? "").trim()).filter(Boolean))];
  if (tids.length > 0) {
    const { data: tours } = await supabase
      .from("tournaments")
      .select("id, name, status, updated_at")
      .in("id", tids)
      .order("updated_at", { ascending: false })
      .limit(12);
    for (const t of tours ?? []) {
      const tid = String(t.id ?? "").trim();
      if (!tid) continue;
      const name = String(t.name ?? "Tournament").trim() || "Tournament";
      const st = String(t.status ?? "—").trim();
      const updated = String(t.updated_at ?? new Date().toISOString());
      items.push({
        id: `tournament-${tid}`,
        category: "tournament",
        title: "Tournament update",
        body: `${name} — ${st.replace(/_/g, " ")}`,
        href: `/tournaments/${tid}`,
        at: updated,
      });
    }
  }

  for (const n of announcementsRes.data ?? []) {
    const nid = String(n.id ?? "").trim();
    if (!nid) continue;
    const title = String(n.title ?? "Announcement").trim();
    const body = String((n as { body?: string }).body ?? "").trim();
    const excerpt = body.length > 120 ? `${body.slice(0, 117)}…` : body;
    const created = String(n.created_at ?? new Date().toISOString());
    items.push({
      id: `system-${nid}`,
      category: "system",
      title: title || "System",
      body: excerpt || "Open Nexus for hub context.",
      href: "/nexus",
      at: created,
    });
  }

  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const seen = new Set<string>();
  return items.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
}
