/** Redondeo controlado: cantidades a 4 decimales y dinero a 2. */
export const round4 = (v: number) => Math.round((v + Number.EPSILON) * 10000) / 10000;
export const round3 = (v: number) => Math.round((v + Number.EPSILON) * 1000) / 1000;
export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Convierte Decimal de Prisma (o null) a number. */
export const n = (v: { toString(): string } | number | null | undefined): number =>
  v === null || v === undefined ? 0 : typeof v === "number" ? v : Number(v.toString());

const qtyFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });
const unitLabel: Record<string, string> = { und: "und." };
const moneyFmt = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const pctFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export const fmtQty = (v: number, unit?: string) =>
  `${qtyFmt.format(v)}${unit ? ` ${unitLabel[unit] ?? unit}` : ""}`;
export const fmtMoney = (v: number) => moneyFmt.format(v);
export const fmtPct = (v: number) => `${pctFmt.format(v)}%`;
export const fmtDate = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" }).format(d) : "—";
export const fmtDateTime = (d: Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" }).format(d)
    : "—";

export const daysBetween = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / 86_400_000);
