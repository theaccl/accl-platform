import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertBioWordCount,
  countWords,
  PROFILE_BIO_MAX_WORDS,
  PROFILE_BIO_WORD_ERROR_MESSAGE,
} from '@/lib/profile';

const MIGRATION = '20260621140000_profile_optional_bio_and_public_flag_snapshot.sql';

function readMigration(): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
}

function readEditProfileForm(): string {
  return readFileSync(join(process.cwd(), 'components/profile/EditProfileForm.tsx'), 'utf8');
}

test.describe('profileOptionalBioContract', () => {
  test('countWords and assertBioWordCount accept optional bio doctrine', () => {
    expect(countWords(null)).toBe(0);
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords('hello')).toBe(1);
    expect(countWords(Array.from({ length: 25 }, () => 'word').join(' '))).toBe(25);
    expect(countWords(Array.from({ length: 100 }, () => 'word').join(' '))).toBe(100);
    expect(countWords(Array.from({ length: 250 }, () => 'word').join(' '))).toBe(250);

    expect(() => assertBioWordCount(null)).not.toThrow();
    expect(() => assertBioWordCount('')).not.toThrow();
    expect(() => assertBioWordCount('one')).not.toThrow();
    expect(() => assertBioWordCount(Array.from({ length: 250 }, () => 'word').join(' '))).not.toThrow();

    const words251 = Array.from({ length: 251 }, () => 'word').join(' ');
    expect(() => assertBioWordCount(words251)).toThrow(PROFILE_BIO_WORD_ERROR_MESSAGE);
    expect(PROFILE_BIO_WORD_ERROR_MESSAGE).toBe('Bio must be 250 words or fewer.');
    expect(PROFILE_BIO_MAX_WORDS).toBe(250);
  });

  test('RPC migration enforces optional 250-word maximum only', () => {
    const sql = readMigration();
    expect(MIGRATION.startsWith('20260621140000')).toBe(true);
    expect(sql).toMatch(/\nbegin;\s*\n/i);
    expect(sql.trimEnd().toLowerCase()).toMatch(/commit;\s*$/);
    expect(sql).toContain('create or replace function public.update_own_profile_identity');
    expect(sql).toContain('returns void');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = pg_catalog, public, pg_temp');
    expect(sql).toContain('bio exceeds maximum length');
    expect(sql).toContain("raise exception 'Bio must be 250 words or fewer'");
    expect(sql).not.toContain('v_word_count < 150');
    expect(sql).not.toContain('Bio must be 150–250 words');
    expect(sql).toContain("v_avatar_path not like (v_uid::text || '/%')");
    expect(sql).toContain("v_flag !~ '^[A-Z]{2}$'");
    expect(sql).toContain('perform public.update_own_profile_identity(p_bio, p_avatar_path, v_existing_flag)');
    expect(sql).toContain(
      'revoke all on function public.update_own_profile_identity(text, text, text) from service_role',
    );
    expect(sql).toContain(
      'grant execute on function public.update_own_profile_identity(text, text, text) to authenticated',
    );
  });

  test('EditProfileForm counter and save gate use optional bio doctrine', () => {
    const src = readEditProfileForm();
    expect(src).toContain('Optional bio ·');
    expect(src).toContain('/ {PROFILE_BIO_MAX_WORDS} words');
    expect(src).toContain('Suggested length: 25–100 words');
    expect(src).toContain('edit-profile-bio-remaining');
    expect(src).toContain('Remove {bioWordsOver} words to save');
    expect(src).toContain('disabled={isSaving || bioOverLimit}');
    expect(src).not.toContain('Bio must be 150–250 words when provided');
    expect(src).toContain('Bio must be 150–250 words');
    expect(src).toContain('Bio must be 250 words or fewer');
  });
});
