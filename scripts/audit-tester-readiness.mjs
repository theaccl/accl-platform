#!/usr/bin/env node
/**
 * CLI: audit tester cohort readiness (service role). No emails printed.
 * Usage:
 *   node scripts/audit-tester-readiness.mjs
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or E2E_* variants)
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.E2E_SUPABASE_URL?.trim();
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function evaluate(row) {
  const issues = [];
  const u = row.username?.trim() || null;
  if (!u) issues.push('missing_username');
  if (u?.includes('@')) issues.push('email_shaped_username');
  if (!row.accl_tester) issues.push('tester_flag_false');
  const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;
  if (u && !USERNAME_RE.test(u)) issues.push('invalid_username_pattern');
  const cohort_ready = issues.length === 0 && !!u && row.accl_tester === true;
  return { profile_id: row.id, username: u, accl_tester: row.accl_tester, cohort_ready, issues };
}

const { data, error } = await supabase.from('profiles').select('id,username,accl_tester').eq('accl_tester', true);

if (error) {
  console.error('Query failed:', error.message);
  process.exit(1);
}

const rows = data ?? [];
let ready = 0;
for (const r of rows) {
  const e = evaluate(r);
  if (e.cohort_ready) ready += 1;
  console.log(JSON.stringify(e));
}
console.error(`summary: total_flagged=${rows.length} cohort_ready=${ready} needs_attention=${rows.length - ready}`);
