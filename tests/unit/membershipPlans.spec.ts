import { expect, test } from '@playwright/test';
import { membershipPlanForPrices } from '../../lib/payments/membershipPlans';
test('subscription membership comes only from one unambiguous configured price', () => {
  const env={STRIPE_STANDARD_PRICE_ID:'price_standard',STRIPE_PLUS_PRICE_ID:'price_plus',STRIPE_PRO_PRICE_ID:'price_pro'};
  expect(membershipPlanForPrices(['price_standard'],env)).toBe('standard');
  expect(membershipPlanForPrices(['price_plus'],env)).toBe('plus');
  expect(membershipPlanForPrices(['price_pro'],env)).toBe('pro');
  expect(membershipPlanForPrices(['price_unknown'],env)).toBeNull();
  expect(membershipPlanForPrices(['price_pro','price_plus'],env)).toBeNull();
  expect(membershipPlanForPrices(['price_pro'],{...env,STRIPE_PLUS_PRICE_ID:'price_pro'})).toBeNull();
  expect(membershipPlanForPrices(['price_standard'],{})).toBeNull();
});
