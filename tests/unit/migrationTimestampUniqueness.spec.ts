import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

const FROZEN_DUPLICATE_GROUPS: Record<string, readonly string[]> = {
  '20260425120000': [
    '20260425120000_editable_profile_identity.sql',
    '20260425120000_expand_match_requests_live_time_control_check.sql',
  ],
  '20260519120000': [
    '20260519120000_realtime_tester_chat_dm.sql',
    '20260519120000_tester_bug_reports_game_context.sql',
  ],
  '20260530140000': [
    '20260530140000_apply_move_transactional_move_log.sql',
    '20260530140000_supabase_security_advisor_remaining_red.sql',
  ],
};

function groupMigrationsByVersionPrefix(): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const name of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))) {
    const version = name.slice(0, 14);
    const list = groups.get(version) ?? [];
    list.push(name);
    groups.set(version, list);
  }

  for (const [version, files] of groups) {
    files.sort();
    groups.set(version, files);
  }

  return groups;
}

test.describe('migrationTimestampUniqueness (static)', () => {
  test('allows only the three frozen legacy duplicate-version groups', () => {
    const groups = groupMigrationsByVersionPrefix();
    const collisions: string[] = [];

    for (const [version, files] of groups) {
      if (files.length <= 1) {
        continue;
      }

      const allowed = FROZEN_DUPLICATE_GROUPS[version];
      const allowedSorted = allowed ? [...allowed].sort() : null;

      if (!allowedSorted || files.length !== allowedSorted.length) {
        collisions.push(
          `${version}: expected ${allowedSorted?.length ?? 0} file(s), found ${files.length}\n  ${files.join('\n  ')}`,
        );
        continue;
      }

      for (let i = 0; i < files.length; i += 1) {
        if (files[i] !== allowedSorted[i]) {
          collisions.push(
            `${version}: allowlisted filename mismatch\n  expected: ${allowedSorted.join(', ')}\n  found:    ${files.join(', ')}`,
          );
          break;
        }
      }
    }

    const frozenVersions = Object.keys(FROZEN_DUPLICATE_GROUPS).sort();
    for (const version of frozenVersions) {
      const files = groups.get(version);
      if (!files || files.length !== 2) {
        collisions.push(
          `${version}: frozen collision group is incomplete or missing\n  found: ${files?.join(', ') ?? '(none)'}`,
        );
      }
    }

    if (collisions.length > 0) {
      throw new Error(`Migration version collisions detected:\n${collisions.join('\n\n')}`);
    }

    const duplicateCount = [...groups.values()].filter((files) => files.length > 1).length;
    expect(duplicateCount).toBe(3);
  });
});
