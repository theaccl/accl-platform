export type PaidMembershipPlan = 'standard' | 'plus' | 'pro';
export function membershipPlanForPrices(priceIds: readonly string[], environment: Record<string,string|undefined> = process.env): PaidMembershipPlan | null {
  const entries = (['standard','plus','pro'] as const).map(plan => ({plan, id: environment[`STRIPE_${plan.toUpperCase()}_PRICE_ID`]?.trim()}));
  const configured = entries.filter(entry => entry.id?.startsWith('price_'));
  if (new Set(configured.map(entry => entry.id)).size !== configured.length) return null;
  const matches = configured.filter(entry => priceIds.includes(entry.id!));
  return matches.length === 1 ? matches[0].plan : null;
}
