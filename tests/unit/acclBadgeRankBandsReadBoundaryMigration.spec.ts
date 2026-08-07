import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const MIGRATION_SUFFIX = '_accl_badge_rank_bands_read_boundary.sql';
const SORT_AFTER = '20260804155321_chess_knowledge_layer_foundation_reconciliation.sql';
const TABLE = 'public.accl_badge_rank_bands';
const POLICY = 'accl_badge_rank_bands_public_read';

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql'));
}

function findTargetMigrations(): string[] {
  return listMigrationFiles().filter((name) => name.endsWith(MIGRATION_SUFFIX));
}

function readMigration(): string {
  const matches = findTargetMigrations();
  expect(matches).toHaveLength(1);
  return readFileSync(join(MIGRATIONS_DIR, matches[0]), 'utf8');
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n\r]*/g, '');
}

test.describe('acclBadgeRankBandsReadBoundaryMigration (static)', () => {
  test('exactly one migration ends with _accl_badge_rank_bands_read_boundary.sql', () => {
    expect(findTargetMigrations()).toHaveLength(1);
  });

  test('sorts after chess knowledge layer foundation reconciliation', () => {
    const [migration] = findTargetMigrations();
    expect(migration > SORT_AFTER).toBe(true);
  });

  test('begins with begin and ends with commit', () => {
    const sql = readMigration();
    expect(sql.trimStart().toLowerCase()).toMatch(/^begin\s*;/);
    expect(sql.trimEnd().toLowerCase()).toMatch(/commit\s*;\s*$/);
  });

  test('enables RLS on public.accl_badge_rank_bands', () => {
    const sql = readMigration();
    expect(sql).toContain(
      `alter table ${TABLE} enable row level security;`,
    );
  });

  test('revokes ALL separately from PUBLIC, anon, authenticated, and service_role', () => {
    const sql = readMigration();
    for (const role of ['public', 'anon', 'authenticated', 'service_role'] as const) {
      expect(sql).toContain(`revoke all on table ${TABLE} from ${role};`);
    }
  });

  test('grants only SELECT to anon, authenticated, and service_role', () => {
    const sql = readMigration();
    for (const role of ['anon', 'authenticated', 'service_role'] as const) {
      expect(sql).toContain(`grant select on table ${TABLE} to ${role};`);
    }

    const executable = stripSqlComments(sql);
    const grantStatements = [
      ...executable.matchAll(/grant\s+([\s\S]*?)\s+on\s+table\s+public\.accl_badge_rank_bands\s+to\s+([^;]+);/gi),
    ];
    expect(grantStatements).toHaveLength(3);
    for (const match of grantStatements) {
      expect(match[1].replace(/\s+/g, ' ').trim().toLowerCase()).toBe('select');
    }

    expect(executable).not.toMatch(
      /grant\s+(insert|update|delete|truncate|references|trigger|maintain|all)\b/i,
    );
    expect(executable).not.toMatch(
      /grant\s+[^;]*\b(insert|update|delete|truncate|references|trigger|maintain|all)\b[^;]*\bon\s+table\s+public\.accl_badge_rank_bands/i,
    );
  });

  test('creates exactly one SELECT-only public-read policy for anon and authenticated using true', () => {
    const sql = readMigration();
    const executable = stripSqlComments(sql);
    const createPolicies = [
      ...executable.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+public\.accl_badge_rank_bands([\s\S]*?);/gi),
    ];
    expect(createPolicies).toHaveLength(1);
    expect(createPolicies[0][1]).toBe(POLICY);

    const policyBody = createPolicies[0][2].replace(/\s+/g, ' ').trim().toLowerCase();
    expect(policyBody).toContain('for select');
    expect(policyBody).toMatch(/\bto\s+anon\s*,\s*authenticated\b/);
    expect(policyBody).toContain('using (true)');
    expect(policyBody).not.toMatch(/\bfor\s+(insert|update|delete|all)\b/);
  });

  test('does not mutate row data and does not create functions or SECURITY DEFINER objects', () => {
    const executable = stripSqlComments(readMigration());
    expect(executable).not.toMatch(/\binsert\s+into\b/i);
    expect(executable).not.toMatch(/\bupdate\s+public\./i);
    expect(executable).not.toMatch(/\bdelete\s+from\b/i);
    expect(executable).not.toMatch(/\btruncate\b/i);
    expect(executable).not.toMatch(/\bcreate\s+(or\s+replace\s+)?function\b/i);
    expect(executable).not.toMatch(/\bsecurity\s+definer\b/i);
  });
});
