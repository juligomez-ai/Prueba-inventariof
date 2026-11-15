import { DomainError } from "@/shared/errors";

/** Unidades base del catálogo y sus submúltiplos aceptados al capturar (RN-8.2). */
const FACTORS: Record<string, { base: string; factor: number }> = {
  kg: { base: "kg", factor: 1 },
  g: { base: "kg", factor: 0.001 },
  L: { base: "L", factor: 1 },
  ml: { base: "L", factor: 0.001 },
  und: { base: "und", factor: 1 },
};

export const BASE_UNITS = ["kg", "L", "und"] as const;

/** Unidades en las que se puede digitar una cantidad para un producto con esa unidad base. */
export const unitsFor = (baseUnit: string) =>
  Object.entries(FACTORS)
    .filter(([, v]) => v.base === baseUnit)
    .map(([k]) => k);

/** Convierte una cantidad a la unidad base del producto. */
export function toBase(quantity: number, unit: string, baseUnit: string): number {
  const f = FACTORS[unit];
  if (!f || f.base !== baseUnit) throw new DomainError(`No se puede convertir ${unit} a ${baseUnit}.`);
  return quantity * f.factor;
}
