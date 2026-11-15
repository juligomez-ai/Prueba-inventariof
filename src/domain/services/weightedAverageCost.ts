import { round4 } from "@/shared/numbers";

/**
 * Costo promedio ponderado (S3, RF-4.1).
 * Solo las entradas con costo lo recalculan; las salidas se valoran al promedio vigente (RN-4.1).
 */
export function weightedAverage(currentQty: number, currentAvg: number, inQty: number, inUnitCost: number): number {
  const qty = currentQty + inQty;
  if (qty <= 0) return inUnitCost;
  // Si el saldo previo es negativo o cero, el nuevo costo es el de la entrada.
  if (currentQty <= 0) return round4(inUnitCost);
  return round4((currentQty * currentAvg + inQty * inUnitCost) / qty);
}
