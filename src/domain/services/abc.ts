export type AbcClass = "A" | "B" | "C";

/** RF-10.1: A = 80% del valor, B = siguiente 15%, C = 5% restante. */
export function classifyAbc(items: { id: string; value: number }[]): Map<string, AbcClass> {
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0);
  const result = new Map<string, AbcClass>();
  let acc = 0;
  for (const i of [...items].sort((a, b) => b.value - a.value)) {
    // Se clasifica según el acumulado ANTES de sumar el ítem: el que cruza el 80% sigue siendo A.
    const share = total > 0 ? acc / total : 1;
    result.set(i.id, share < 0.8 ? "A" : share < 0.95 ? "B" : "C");
    acc += Math.max(0, i.value);
  }
  return result;
}

/** Frecuencia sugerida de conteo en días. */
export const abcFrequencyDays: Record<AbcClass, number> = { A: 7, B: 30, C: 90 };
export const abcFrequencyLabel: Record<AbcClass, string> = { A: "Semanal", B: "Mensual", C: "Trimestral" };
