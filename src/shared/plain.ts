import { Prisma } from "@prisma/client";

/** Convierte Decimal de Prisma a number en profundidad, para pasar datos a componentes cliente. */
export function plain<T>(v: T): Plainify<T> {
  if (v instanceof Prisma.Decimal) return Number(v.toString()) as Plainify<T>;
  if (v instanceof Date || v === null || typeof v !== "object") return v as Plainify<T>;
  if (Array.isArray(v)) return v.map(plain) as Plainify<T>;
  return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, plain(x)])) as Plainify<T>;
}

export type Plainify<T> = T extends Prisma.Decimal
  ? number
  : T extends Date
    ? Date
    : T extends (infer U)[]
      ? Plainify<U>[]
      : T extends object
        ? { [K in keyof T]: Plainify<T[K]> }
        : T;
