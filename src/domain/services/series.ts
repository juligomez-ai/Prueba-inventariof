import { MS_PER_DAY } from "@/shared/numbers";
/**
 * Series de tiempo para el tablero. Funciones puras: reciben movimientos del Kardex ya valorizados.
 * - El valor del inventario en una fecha es la suma acumulada de totalValue hasta esa fecha
 *   (las entradas suman a su costo y las salidas restan al costo promedio vigente).
 * - Entradas y salidas excluyen los traslados, que no cambian el valor total.
 */
export interface ValuedMove {
  at: Date;
  value: number; // totalValue con signo
  isTransfer: boolean;
}

export interface Bucket {
  start: Date;
  end: Date; // exclusivo
}

export const PERIODS = { "30": 30, "90": 90, "180": 180 } as const;
export type PeriodKey = keyof typeof PERIODS;
export const periodLabel: Record<PeriodKey, string> = { "30": "Últimos 30 días", "90": "Últimos 3 meses", "180": "Últimos 6 meses" };

/** Divide [from, to) en cubetas: diarias para 30 días, semanales para periodos más largos. */
export function buckets(from: Date, to: Date): Bucket[] {
  const days = Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
  const size = days <= 31 ? 1 : 7;
  const out: Bucket[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += size * MS_PER_DAY)
    out.push({ start: new Date(t), end: new Date(Math.min(t + size * MS_PER_DAY, to.getTime())) });
  return out;
}

/** Valor del inventario al cierre de cada cubeta. */
export function inventoryValueSeries(moves: ValuedMove[], bs: Bucket[]): number[] {
  const sorted = [...moves].sort((a, b) => a.at.getTime() - b.at.getTime());
  let i = 0;
  let acc = 0;
  return bs.map((b) => {
    while (i < sorted.length && sorted[i].at < b.end) acc += sorted[i++].value;
    return Math.round(acc * 100) / 100;
  });
}

/** Entradas y salidas (en pesos, positivas) por cubeta. */
export function flowSeries(moves: ValuedMove[], bs: Bucket[]) {
  return bs.map((b) => {
    let inflow = 0;
    let outflow = 0;
    for (const m of moves) {
      if (m.isTransfer || m.at < b.start || m.at >= b.end) continue;
      if (m.value > 0) inflow += m.value;
      else outflow += -m.value;
    }
    return { inflow: Math.round(inflow), outflow: Math.round(outflow) };
  });
}

/** Variación porcentual contra el período anterior; null si no hay base para comparar. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
