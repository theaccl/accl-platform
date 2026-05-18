/**
 * One-off / operator: create a pending free adult tournament for T1 join-flow smoke tests.
 * Matches app/api/internal/tournaments/create route insert shape (no bootstrap, no entrants).
 *
 * Usage (repo root): node scripts/create-t1-join-smoke-tournament.mjs
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Uses any existing profiles.id as created_by.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) {
  const lines = readFileSync(".env.local", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

async function main() {
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (load .env.local).");
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: prof, error: pErr } = await supabase.from("profiles").select("id").limit(1).maybeSingle();
  if (pErr || !prof?.id) {
    console.error("Could not read any profile for created_by:", pErr?.message ?? "no row");
    process.exitCode = 1;
    return;
  }

  const { data: row, error: insErr } = await supabase
    .from("tournaments")
    .insert({
      name: "T1 Join Smoke Test",
      status: "pending",
      format: "single_elimination",
      tempo: "live",
      live_time_control: null,
      rated: true,
      created_by: prof.id,
      ecosystem_scope: "adult",
      entry_fee_cents: null,
      prize_pool_cents: null,
    })
    .select("id, name, status, ecosystem_scope, format, tempo, rated, entry_fee_cents, prize_pool_cents")
    .single();

  if (insErr || !row?.id) {
    console.error("Insert failed:", insErr?.message ?? "no id");
    process.exitCode = 1;
    return;
  }

  const { data: dirRow, error: dErr } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", row.id)
    .eq("ecosystem_scope", "adult")
    .eq("status", "pending")
    .maybeSingle();

  const inPendingAdultDirectory = Boolean(!dErr && dirRow?.id);

  console.log(JSON.stringify(
    {
      tournamentId: row.id,
      row,
      createdByProfileId: prof.id,
      urls: {
        join: "/tournaments/join",
        detail: `/tournaments/${row.id}`,
      },
      directoryQueryPendingAdult: inPendingAdultDirectory,
    },
    null,
    2,
  ));
}

main();
