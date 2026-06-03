import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20260621140000_profile_optional_bio_and_public_flag_snapshot.sql';

function readMigration(): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
}

test.describe('publicProfileFlagSnapshotMigration (static)', () => {
  test('migration updates get_public_profile_snapshot with flag field', () => {
    const sql = readMigration();
    expect(sql).toContain('create or replace function public.get_public_profile_snapshot');
    expect(sql).toContain(
      "'flag', nullif(trim(coalesce(p.flag, '')), '')",
    );
    expect(sql).toMatch(/intentionally exposes profile\.flag/i);
    expect(sql).toContain("'finished_games_count'");
    expect(sql).toContain("'vault_relics'");
    expect(sql).toContain("'prestige_frame'");
    expect(sql).toContain("'p1'");
    expect(sql).toContain("'trophies'");
  });

  test('public profile page passes flag through formatFlagDisplay', () => {
    const pageSrc = readFileSync(join(process.cwd(), 'app/profile/[id]/page.tsx'), 'utf8');
    const headerSrc = readFileSync(join(process.cwd(), 'components/profile/ProfileHeader.tsx'), 'utf8');
    expect(pageSrc).toContain("formatFlagDisplay(payload.profile.flag)");
    expect(headerSrc).toContain('data-testid="profile-flag-pill"');
    expect(headerSrc).toContain('{flagDisplay ??');
  });
});
