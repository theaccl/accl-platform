import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20260707160000_successful_performance_helper_privilege_hardening.sql';
const MIGRATION_VERSION = '20260707160000';
const FOUNDATION = '20260705120000_successful_performance_read_foundation.sql';
const FOUNDATION_SHA256 =
  '67975aefc5f3db0968a022729c68212d8e3e9025efc4fc61bc7069ea5e00e0af';
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

const EXPECTED_FUNCTION_TARGETS = [
  'public.successful_performance_strict_control(text, text)',
  'public.successful_performance_mode_from_control(text)',
  'public.successful_performance_player_outcome(text, uuid, uuid, uuid)',
] as const;

const EXPECTED_ROLES = ['public', 'anon', 'authenticated'] as const;

const FORBIDDEN_ROLES = [
  'service_role',
  'postgres',
  'authenticator',
  'dashboard_user',
] as const;

function readMigration(): string {
  return readFileSync(join(MIGRATIONS_DIR, MIGRATION), 'utf8');
}

function readFoundation(): string {
  return readFileSync(join(MIGRATIONS_DIR, FOUNDATION), 'utf8');
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n\r]*/g, '');
}

function normalizeSignature(signature: string): string {
  return signature.replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseRevokeExecuteOnFunctionStatements(sql: string): Array<{
  signature: string;
  roles: string[];
}> {
  const matches = [
    ...sql.matchAll(
      /revoke\s+execute\s+on\s+function\s+([\s\S]*?)\s+from\s+([^;]+);/gi,
    ),
  ];
  return matches.map((match) => ({
    signature: normalizeSignature(match[1]),
    roles: match[2]
      .split(',')
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean),
  }));
}

function splitExecutableStatements(executableSql: string): string[] {
  return executableSql
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean);
}

test.describe('successfulPerformancePrivilegeHardeningMigration (static)', () => {
  test('migration file exists and sorts after SP read foundation', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files).toContain(MIGRATION);
    expect(MIGRATION > FOUNDATION).toBe(true);
  });

  test('no duplicate migration basename', () => {
    const names = readdirSync(MIGRATIONS_DIR).filter((n) =>
      n.includes('successful_performance_helper_privilege_hardening'),
    );
    expect(names).toEqual([MIGRATION]);
  });

  test('exactly one migration file uses version 20260707160000', () => {
    const versionMatches = readdirSync(MIGRATIONS_DIR).filter((name) =>
      name.startsWith(`${MIGRATION_VERSION}_`),
    );
    expect(versionMatches).toEqual([MIGRATION]);
  });

  test('foundation migration SHA-256 hash lock', () => {
    const actual = sha256Hex(readFoundation());
    expect(actual).toBe(FOUNDATION_SHA256);
  });

  test('wraps privilege changes in explicit transaction (begin/commit)', () => {
    const sql = readMigration();
    expect(sql).toMatch(/\nbegin;\s*\n/i);
    expect(sql.trimEnd().toLowerCase()).toMatch(/commit;\s*$/);
  });

  test('revokes EXECUTE on strict_control helper from public, anon, and authenticated', () => {
    const sql = readMigration();
    expect(sql).toContain(
      'revoke execute on function\n  public.successful_performance_strict_control(text, text)\nfrom public, anon, authenticated;',
    );
  });

  test('revokes EXECUTE on mode_from_control helper from public, anon, and authenticated', () => {
    const sql = readMigration();
    expect(sql).toContain(
      'revoke execute on function\n  public.successful_performance_mode_from_control(text)\nfrom public, anon, authenticated;',
    );
  });

  test('revokes EXECUTE on player_outcome helper from public, anon, and authenticated', () => {
    const sql = readMigration();
    expect(sql).toContain(
      'revoke execute on function\n  public.successful_performance_player_outcome(text, uuid, uuid, uuid)\nfrom public, anon, authenticated;',
    );
  });

  test('exact function target set: three helpers only, no main RPC', () => {
    const sql = readMigration();
    const revokes = parseRevokeExecuteOnFunctionStatements(sql);
    const signatures = revokes.map((entry) => entry.signature).sort();

    expect(revokes).toHaveLength(3);
    expect(signatures).toEqual(
      [...EXPECTED_FUNCTION_TARGETS].map((signature) => normalizeSignature(signature)).sort(),
    );
    expect(sql).not.toMatch(/get_own_successful_performance/i);
  });

  test('exact role set per revoke: public, anon, authenticated only', () => {
    const sql = readMigration();
    const revokes = parseRevokeExecuteOnFunctionStatements(sql);

    expect(revokes).toHaveLength(3);
    for (const revoke of revokes) {
      expect([...revoke.roles].sort()).toEqual([...EXPECTED_ROLES].sort());
      for (const forbiddenRole of FORBIDDEN_ROLES) {
        expect(revoke.roles).not.toContain(forbiddenRole);
      }
    }
  });

  test('does not alter main RPC privileges or helper function bodies', () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/get_own_successful_performance/i);
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(sql).not.toMatch(/grant\s+execute/i);
    expect(sql).not.toMatch(/drop\s+function/i);
    expect(sql).not.toMatch(/alter\s+function/i);
  });

  test('privilege-only scope: no DDL on indexes, tables, or other objects', () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/create\s+index/i);
    expect(sql).not.toMatch(/alter\s+table/i);
    expect(sql).not.toMatch(/drop\s+index/i);
  });

  test('prohibited executable SQL guard after comment strip', () => {
    const executable = stripSqlComments(readMigration());
    const statements = splitExecutableStatements(executable);

    expect(statements).toHaveLength(5);
    expect(statements[0]).toBe('begin');
    expect(statements[4]).toBe('commit');
    for (let i = 1; i <= 3; i += 1) {
      expect(statements[i]).toMatch(/^revoke execute on function /);
    }

    const prohibitedPatterns = [
      /\bgrant\b/i,
      /\bcreate\b/i,
      /\balter\b/i,
      /\bdrop\b/i,
      /\binsert\b/i,
      /\bupdate\b/i,
      /\bdelete\b/i,
      /\bmerge\b/i,
      /\btruncate\b/i,
      /\bcopy\b/i,
      /\bcall\b/i,
      /\bdo\b/i,
      /\bschema_migrations\b/i,
    ];
    for (const pattern of prohibitedPatterns) {
      expect(executable).not.toMatch(pattern);
    }

    const dynamicExecute = executable.match(/\bexecute\b/gi) ?? [];
    const revokeExecute = executable.match(/revoke\s+execute\s+on\s+function/gi) ?? [];
    expect(dynamicExecute.length).toBe(revokeExecute.length);
  });

  test('secret and production project-reference guard', () => {
    const sql = readMigration();
    const forbiddenPatterns = [
      /nlptviibefbzisyqswuv/i,
      /SUPABASE_ACCESS_TOKEN/i,
      /SUPABASE_SERVICE_ROLE_KEY/i,
      /SERVICE_ROLE_KEY/i,
      /DATABASE_URL/i,
      /PASSWORD\s*=/i,
      /\bsbp_[A-Za-z0-9]{10,}/,
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
      /https?:\/\/[^/\s]+:[^@\s]+@/i,
    ];
    for (const pattern of forbiddenPatterns) {
      expect(sql).not.toMatch(pattern);
    }
  });
});
