import { expect, test } from '@playwright/test';
import {
  normalizeAcclUsername,
  profileRowNeedsUsername,
  validateAcclUsername,
} from '../../lib/usernameRules';

test.describe('usernameRules', () => {
  test('normalize lowercases and trims', () => {
    expect(normalizeAcclUsername('  Alice_01  ')).toBe('alice_01');
  });

  test('validate accepts canonical usernames', () => {
    const v = validateAcclUsername('good_name_1');
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.username).toBe('good_name_1');
  });

  test('validate rejects invalid patterns', () => {
    expect(validateAcclUsername('ab').ok).toBe(false);
    expect(validateAcclUsername('1no').ok).toBe(false);
    expect(validateAcclUsername('no-dashes').ok).toBe(false);
    expect(validateAcclUsername('admin').ok).toBe(false);
  });

  test('profileRowNeedsUsername', () => {
    expect(profileRowNeedsUsername(null)).toBe(true);
    expect(profileRowNeedsUsername('')).toBe(true);
    expect(profileRowNeedsUsername('   ')).toBe(true);
    expect(profileRowNeedsUsername('x')).toBe(false);
  });
});
