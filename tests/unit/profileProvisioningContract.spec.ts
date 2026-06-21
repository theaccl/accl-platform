import { expect, test } from '@playwright/test';

import { minimalProfileInsertRow } from '../../lib/profileProvisioningContract';

test.describe('profileProvisioningContract', () => {
  test('minimalProfileInsertRow returns exactly id and username null', () => {
    const uid = '550e8400-e29b-41d4-a716-446655440000';
    const row = minimalProfileInsertRow(uid);
    expect(row).toEqual({ id: uid, username: null });
    expect(Object.keys(row).sort()).toEqual(['id', 'username']);
  });
});
