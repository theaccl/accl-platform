import { expect, test } from '@playwright/test';
import { canonicalLiveTimeControlForInsert } from '../../lib/gameTimeControl';

test.describe('canonicalLiveTimeControlForInsert', () => {
  test('maps unicode lookalikes to ASCII tokens allowed by DB CHECK', () => {
    expect(canonicalLiveTimeControlForInsert('live', '5\uFF0B5')).toBe('5+5');
    expect(canonicalLiveTimeControlForInsert('live', '5\uFE625')).toBe('5+5');
    expect(canonicalLiveTimeControlForInsert('live', ' 3\u00a0+\u00a02 ')).toBe('3+2');
  });
});
