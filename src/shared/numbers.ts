/** Zona horaria del negocio: Colombia (UTC−5, sin horario de verano). */
export const TIME_ZONE = "America/Bogota";
export const MS_PER_DAY = 86_400_000;
/** Tolerancia para comparar cantidades decimales (evita falsos "faltantes" por redondeo). */
export const QTY_EPSILON = 1e-9;

/** Redondeo controlado: cantidades a 4 decimales y dinero a 2. */
export const round4 = (v: number) => Math.round((v + Number.EPSILON) * 10000) / 10000;
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
  d ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: TIME_ZONE }).format(d) : "—";
export const fmtDateTime = (d: Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE }).format(d)
    : "—";

export const daysBetween = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * MS_PER_DAY);

const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
/** Medianoche de hoy en Colombia, sin depender de la zona horaria del servidor. */
export const startOfToday = () => new Date(`${isoDay.format(new Date())}T00:00:00-05:00`);
/** Fecha de un campo AAAA-MM-DD, fijada al mediodía en Colombia para que no cambie de día. */
export const parseLocalDate = (v: string) => new Date(`${v}T12:00:00-05:00`);
