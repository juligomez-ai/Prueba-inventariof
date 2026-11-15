/**
 * RN-5.2: el vencimiento del producto terminado no debería ser posterior al vencimiento
 * más próximo de los insumos con que se fabricó. En la Fase 1 es una alerta, no un bloqueo.
 * Devuelve los lotes de insumo que vencen antes que el producto (el más próximo primero).
 */
export function expiryConflicts<T extends { expiryDate: Date | null }>(productExpiry: Date | null, inputLots: T[]): T[] {
  if (!productExpiry) return [];
  return inputLots
    .filter((l) => l.expiryDate && l.expiryDate.getTime() < productExpiry.getTime())
    .sort((a, b) => a.expiryDate!.getTime() - b.expiryDate!.getTime());
}
