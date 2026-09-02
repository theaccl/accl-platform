import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260902150716_image_generation_durable_idempotent_replays.sql'
  ),
  'utf8'
);

function functionBody(name: string, nextName?: string): string {
  const start = migration.indexOf(`create or replace function public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = nextName
    ? migration.indexOf(`create or replace function public.${nextName}`, start + 1)
    : migration.indexOf('revoke all on function', start + 1);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

test('opening commission replay wins before mutable tier and reference checks', () => {
  const sql = functionBody(
    'create_image_generation_request_with_references',
    'create_image_generation_refinement'
  );
  const replay = sql.indexOf('if found then');
  expect(replay).toBeGreaterThanOrEqual(0);
  expect(replay).toBeLessThan(sql.indexOf('effective_image_generator_tier'));
  expect(replay).toBeLessThan(sql.indexOf('foreach v_reference_id'));
  expect(sql.indexOf('if v_reference_count > 2 then')).toBeLessThan(replay);
  expect(sql).toContain("v_existing.prompt <> trim(p_prompt)");
  expect(sql).not.toContain('v_existing.candidate_count <> p_candidate_count');
  expect(sql).toContain('v_existing.reference_id is distinct from v_reference_1');
  expect(sql).toContain('v_existing.reference_id_2 is distinct from v_reference_2');
  expect(sql).toContain('v_existing.parent_saved_creation_id is not null');
  expect(sql).toContain("return to_jsonb(v_existing) - 'failure_detail'");
});

test('guided refinement replay survives review and candidate state changes', () => {
  const sql = functionBody(
    'create_image_generation_refinement',
    'create_saved_creation_evolution'
  );
  const replay = sql.indexOf('if found then');
  expect(replay).toBeGreaterThanOrEqual(0);
  expect(replay).toBeLessThan(sql.indexOf("v_request.status <> 'review'"));
  expect(replay).toBeLessThan(sql.indexOf("and owner_id = p_owner_id and status = 'review'"));
  expect(sql).toContain('v_existing.request_id <> p_request_id');
  expect(sql).toContain('v_existing.source_candidate_id <> p_source_candidate_id');
  expect(sql).toContain('v_existing.guidance <> trim(p_guidance)');
});

test('saved-creation evolution replay survives tier loss without accepting a changed payload', () => {
  const sql = functionBody('create_saved_creation_evolution');
  const replay = sql.indexOf('if found then');
  expect(replay).toBeGreaterThanOrEqual(0);
  expect(replay).toBeLessThan(sql.indexOf('effective_image_generator_tier'));
  expect(replay).toBeLessThan(sql.indexOf("status = 'active'"));
  expect(sql.indexOf('if cardinality(p_reference_ids) > 2 then')).toBeLessThan(replay);
  expect(sql).toContain(
    'v_existing.parent_saved_creation_id is distinct from p_saved_creation_id'
  );
  expect(sql).toContain("v_existing.prompt <> trim(p_prompt)");
  expect(sql).toContain('v_existing.candidate_count <> 5');
  expect(sql).toContain('v_existing.reference_id is distinct from v_reference_1');
  expect(sql).toContain('v_existing.reference_id_2 is distinct from v_reference_2');
});

test('durable replay functions remain service-only', () => {
  expect(migration.match(/revoke all on function/g)).toHaveLength(3);
  expect(migration.match(/from public, anon, authenticated/g)).toHaveLength(3);
  expect(migration.match(/to service_role;/g)).toHaveLength(3);
});
