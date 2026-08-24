/**
 * Pure activation-order dominance for interactive multi-category rating charts.
 * Back-most first, front-most last. Z-order / pointer emphasis only.
 * Compact comparison uses this helper directly. The expanded landscape
 * session reducer stays on its accepted reveal/queue implementation.
 */

export function initialDominanceOrder<T extends string>(
  selectedInRegistryOrder: readonly T[],
): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const id of selectedInRegistryOrder) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function removeIdFromOrder<T extends string>(order: readonly T[], id: T): T[] {
  return order.filter((item) => item !== id);
}

export function moveIdToFront<T extends string>(order: readonly T[], id: T): T[] {
  return [...removeIdFromOrder(order, id), id];
}

export function applyActivationToggle<T extends string>(
  order: readonly T[],
  id: T,
  selectedAfterToggle: boolean,
): T[] {
  return selectedAfterToggle ? moveIdToFront(order, id) : removeIdFromOrder(order, id);
}

export function frontMostId<T extends string>(order: readonly T[]): T | null {
  return order.length > 0 ? order[order.length - 1]! : null;
}

export function sortItemsByDominance<T>(
  items: readonly T[],
  dominanceOrder: readonly string[],
  idOf: (item: T) => string,
): T[] {
  return [...items].sort((a, b) => {
    const ia = dominanceOrder.indexOf(idOf(a));
    const ib = dominanceOrder.indexOf(idOf(b));
    const ra = ia < 0 ? -1 : ia;
    const rb = ib < 0 ? -1 : ib;
    return ra - rb;
  });
}
