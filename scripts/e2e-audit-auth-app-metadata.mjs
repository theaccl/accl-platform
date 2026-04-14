/**
 * Runtime-only: audit and optionally fix Supabase Auth app_metadata for E2E accounts.
 * Mirrors role detection from lib/moderatorAuth.ts (roles, accl_roles, role, accl_role).
 *
 * Usage:
 *   node scripts/e2e-audit-auth-app-metadata.mjs           # audit only
 *   node scripts/e2e-audit-auth-app-metadata.mjs --fix     # apply fixes
 *
 * Requires: E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_ROLE_KEY, and E2E_*_EMAIL vars.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';

function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  const lines = readFileSync('.env.local', 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

function parseRoleList(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

/** Same sources as extractModeratorAccessRoles in lib/moderatorAuth.ts */
function detectedModeratorRoles(appMetadata) {
  const meta = appMetadata && typeof appMetadata === 'object' ? appMetadata : {};
  const normalized = [
    ...parseRoleList(meta.roles),
    ...parseRoleList(meta.accl_roles),
    ...parseRoleList(meta.role),
    ...parseRoleList(meta.accl_role),
  ];
  const out = new Set();
  for (const role of normalized) {
    if (role === 'moderator' || role === 'admin') out.add(role);
  }
  return out;
}

function hasModeratorOrAdmin(appMetadata) {
  const s = detectedModeratorRoles(appMetadata);
  return s.has('moderator') || s.has('admin');
}

/** Strip moderator/admin from all four keys; preserve other values. */
function stripModeratorAdminFromAppMetadata(raw) {
  const meta = raw && typeof raw === 'object' ? { ...raw } : {};

  function stripArray(arr) {
    if (!Array.isArray(arr)) return arr;
    return arr.filter((x) => {
      const t = String(x).trim().toLowerCase();
      return t !== 'moderator' && t !== 'admin';
    });
  }

  function stripString(s) {
    if (typeof s !== 'string') return s;
    const parts = s
      .split(',')
      .map((p) => p.trim())
      .filter((p) => {
        const t = p.toLowerCase();
        return t !== 'moderator' && t !== 'admin';
      });
    return parts.length ? parts.join(',') : undefined;
  }

  for (const key of ['roles', 'accl_roles']) {
    if (!(key in meta)) continue;
    const v = meta[key];
    if (Array.isArray(v)) {
      meta[key] = stripArray(v);
      if (meta[key].length === 0) delete meta[key];
    } else if (typeof v === 'string') {
      const s = stripString(v);
      if (s === undefined || s === '') delete meta[key];
      else meta[key] = s;
    }
  }
  for (const key of ['role', 'accl_role']) {
    if (!(key in meta)) continue;
    const v = meta[key];
    if (Array.isArray(v)) {
      meta[key] = stripArray(v);
      if (meta[key].length === 0) delete meta[key];
    } else if (typeof v === 'string') {
      const s = stripString(v);
      if (s === undefined || s === '') delete meta[key];
      else meta[key] = s;
    }
  }
  return meta;
}

function mergeModeratorRole(existingMeta) {
  const base = existingMeta && typeof existingMeta === 'object' ? { ...existingMeta } : {};
  const current = parseRoleList(base.roles);
  const has = current.includes('moderator') || current.includes('admin');
  if (has) return base;
  base.roles = [...new Set([...current, 'moderator'])];
  return base;
}

async function findUserByEmail(admin, email) {
  const want = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;
  while (page <= 50) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? '').toLowerCase() === want);
    if (match) return match;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const FIX = process.argv.includes('--fix');
let updateFailures = 0;

async function main() {
  const url = process.env.E2E_SUPABASE_URL?.trim();
  const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    fail('Set E2E_SUPABASE_URL and E2E_SUPABASE_SERVICE_ROLE_KEY (e.g. from .env.local).');
  }

  const accounts = [
    { env: 'E2E_USER_EMAIL', role: 'normal', expectNoMod: true },
    { env: 'E2E_USER_B_EMAIL', role: 'normal', expectNoMod: true },
    { env: 'E2E_MODERATOR_EMAIL', role: 'moderator', expectNoMod: false },
    { env: 'E2E_NON_MODERATOR_EMAIL', role: 'non_moderator', expectNoMod: true },
  ];

  const emails = [];
  for (const a of accounts) {
    const e = process.env[a.env]?.trim();
    if (!e) fail(`Missing ${a.env}`);
    emails.push(e);
  }

  const dup = emails.filter((e, i) => emails.indexOf(e) !== i);
  if (dup.length) {
    console.warn('WARN: duplicate emails across E2E vars — audit may be ambiguous:', [...new Set(dup)]);
  }

  const service = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = service.auth.admin;

  console.log(FIX ? 'MODE: --fix (will update users)\n' : 'MODE: audit only (no writes)\n');

  const results = [];

  for (const spec of accounts) {
    const email = process.env[spec.env].trim();
    const user = await findUserByEmail(admin, email);
    if (!user) {
      results.push({
        env: spec.env,
        email,
        userId: null,
        raw_app_meta_data: null,
        detectedModeratorRoles: [],
        valid: false,
        reason: 'user not found',
      });
      console.error(`FAIL: no user for ${spec.env}=${email}`);
      continue;
    }

    const meta = (user.app_metadata ?? {}) || {};
    const detected = [...detectedModeratorRoles(meta)];

    let valid = false;
    let reason = '';
    if (spec.role === 'moderator') {
      valid = hasModeratorOrAdmin(meta);
      reason = valid ? 'ok' : 'missing moderator/admin in app_metadata';
    } else if (spec.role === 'non_moderator' || spec.expectNoMod) {
      valid = !hasModeratorOrAdmin(meta);
      reason = valid ? 'ok' : 'must not have moderator/admin';
    }

    results.push({
      env: spec.env,
      email,
      userId: user.id,
      raw_app_meta_data: meta,
      detectedModeratorRoles: detected,
      valid,
      reason,
    });

    const status = valid ? 'VALID' : 'INVALID';
    console.log(`[${status}] ${spec.env} ${email}`);
    console.log(`  userId: ${user.id}`);
    console.log(`  detected moderator/admin roles: ${detected.length ? detected.join(', ') : '(none)'}`);
    console.log(`  app_metadata: ${JSON.stringify(meta)}`);
    if (!valid) console.log(`  reason: ${reason}`);

    if (FIX) {
      if (spec.role === 'moderator' && !valid) {
        const merged = mergeModeratorRole(meta);
        const { data, error } = await admin.updateUserById(user.id, { app_metadata: merged });
        if (error) {
          updateFailures += 1;
          console.error(`FAIL: updateUserById moderator: ${error.message}`);
        } else {
          console.log(`  FIX OK: merged app_metadata → ${JSON.stringify(data.user?.app_metadata ?? {})}`);
        }
      } else if (spec.role === 'non_moderator' && hasModeratorOrAdmin(meta)) {
        const stripped = stripModeratorAdminFromAppMetadata(meta);
        const { data, error } = await admin.updateUserById(user.id, { app_metadata: stripped });
        if (error) {
          updateFailures += 1;
          console.error(`FAIL: updateUserById non-moderator strip: ${error.message}`);
        } else {
          console.log(`  FIX OK: stripped app_metadata → ${JSON.stringify(data.user?.app_metadata ?? {})}`);
        }
      } else if (spec.role === 'normal' && hasModeratorOrAdmin(meta)) {
        const stripped = stripModeratorAdminFromAppMetadata(meta);
        const { data, error } = await admin.updateUserById(user.id, { app_metadata: stripped });
        if (error) {
          updateFailures += 1;
          console.error(`FAIL: updateUserById normal strip: ${error.message}`);
        } else {
          console.log(`  FIX OK: stripped app_metadata → ${JSON.stringify(data.user?.app_metadata ?? {})}`);
        }
      } else if (!valid && spec.role === 'normal') {
        console.log('  (no auto-fix: normal user without mod roles — nothing to do)');
      } else {
        console.log('  (no change needed)');
      }
    }
    console.log('');
  }

  const invalid = results.filter((r) => !r.valid);
  if (invalid.length && !FIX) {
    console.log('Run with --fix to apply moderator merge and strip non-moderator/normal accounts.');
    process.exit(1);
  }
  if (invalid.length && FIX) {
    const stillBad = [];
    for (const r of results) {
      if (!r.userId) {
        stillBad.push(r);
        continue;
      }
      const u = await findUserByEmail(admin, r.email);
      const meta = u?.app_metadata ?? {};
      let ok = true;
      if (r.env === 'E2E_MODERATOR_EMAIL') ok = hasModeratorOrAdmin(meta);
      else ok = !hasModeratorOrAdmin(meta);
      if (!ok) stillBad.push({ ...r, after: meta });
    }
    if (stillBad.length) {
      console.error('FAIL: some accounts still invalid after fix:', stillBad);
      process.exit(1);
    }
  }

  console.log('--- Verification (re-fetch) ---');
  let anyBad = false;
  for (const spec of accounts) {
    const email = process.env[spec.env].trim();
    const user = await findUserByEmail(admin, email);
    if (!user) {
      console.log(`${email}: MISSING`);
      anyBad = true;
      continue;
    }
    const meta = user.app_metadata ?? {};
    const det = [...detectedModeratorRoles(meta)];
    let ok = false;
    if (spec.role === 'moderator') ok = hasModeratorOrAdmin(meta);
    else ok = !hasModeratorOrAdmin(meta);
    if (!ok) anyBad = true;
    console.log(`${email} → roles detected: [${det.join(', ') || 'none'}] → ${ok ? 'OK' : 'BAD'}`);
  }
  if (anyBad) {
    console.error('FAIL: one or more accounts failed verification');
    process.exit(1);
  }

  console.log('\n--- SQL verification (run in Supabase SQL editor, postgres role) ---');
  const inList = emails.map((e) => `'${e.replace(/'/g, "''")}'`).join(', ');
  console.log(`select id, email, raw_app_meta_data from auth.users where email in (${inList});`);

  if (updateFailures > 0) {
    console.error(`FAIL: ${updateFailures} update(s) failed`);
    process.exit(1);
  }

  console.log('\nPASS: e2e auth app_metadata audit complete');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
