/**
 * Exactitud de inventario por valor: 1 − Σ|contado − sistema| × costo ÷ Σ sistema × costo.
 * Una diferencia de 2 etiquetas de $120 pesa mucho menos que 1 kg de karité de $60.000.
 */
export function countAccuracyByValue(lines: { systemQty: number; countedQty: number; unitCost: number }[]): number | null {
  const base = lines.reduce((s, l) => s + Math.max(l.systemQty, l.countedQty) * l.unitCost, 0);
  if (base <= 0) return null;
  const diff = lines.reduce((s, l) => s + Math.abs(l.countedQty - l.systemQty) * l.unitCost, 0);
  return Math.max(0, (1 - diff / base) * 100);
}

/** Variación del costo real contra el costo de la fórmula para lo realmente producido. */
export function productionVariance(orders: { plannedQty: number; producedQty: number; theoreticalCost: number; actualCost: number }[]) {
  const actual = orders.reduce((s, o) => s + o.actualCost, 0);
  const expected = orders.reduce((s, o) => s + (o.plannedQty > 0 ? (o.theoreticalCost / o.plannedQty) * o.producedQty : 0), 0);
  return { actual, expected, variance: actual - expected, variancePct: expected > 0 ? ((actual - expected) / expected) * 100 : 0 };
}
