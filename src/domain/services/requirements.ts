import { round4 } from "@/shared/numbers";

export interface RecipeLine {
  productId: string;
  quantity: number; // por rendimiento
}

/** RF-9.2: cantidad de cada insumo = cantidad en la fórmula × (cantidad a producir ÷ rendimiento). */
export function requirements(lines: RecipeLine[], yieldQuantity: number, toProduce: number) {
  const factor = toProduce / yieldQuantity;
  return lines.map((l) => ({ productId: l.productId, required: round4(l.quantity * factor) }));
}

/** RF-9.3: máxima cantidad producible con el disponible de cada insumo (en múltiplos enteros si la unidad es und). */
export function maxProducible(
  lines: RecipeLine[],
  yieldQuantity: number,
  available: Map<string, number>,
  wholeUnits: boolean,
) {
  let max = Infinity;
  for (const l of lines) {
    if (l.quantity <= 0) continue;
    const perUnit = l.quantity / yieldQuantity;
    max = Math.min(max, (available.get(l.productId) ?? 0) / perUnit);
  }
  if (!Number.isFinite(max)) return 0;
  // Tolerancia por redondeo de decimales
  const v = max + 1e-9;
  return wholeUnits ? Math.floor(v) : Math.floor(v * 1000) / 1000;
}
