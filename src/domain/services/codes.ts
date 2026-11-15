import { round4 } from "@/shared/numbers";

/** Serial de bulto: <SKU>-<consecutivo de 6 dígitos> (RF-5.1.1). */
export const formatSerial = (sku: string, n: number) => `${sku}-${String(n).padStart(6, "0")}`;

/** Lote de producto terminado: <SKU sin guiones>-<AAMMDD>-<nn> (RF-5.2). */
export function productionLotCode(sku: string, date: Date, n: number) {
  // Fecha calendario en Colombia, sin importar la zona horaria del servidor.
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "2-digit", month: "2-digit", day: "2-digit" })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, x) => ({ ...acc, [x.type]: x.value }), {});
  return `${sku.replace(/-/g, "")}-${parts.year}${parts.month}${parts.day}-${String(n).padStart(2, "0")}`;
}

/** Divide una cantidad en bultos de tamaño fijo: 100 en cajas de 24 → [24,24,24,24,4] (RF-5.1.3). */
export function splitIntoPacks(total: number, packSize: number | null | undefined): number[] {
  if (!packSize || packSize <= 0 || packSize >= total) return [round4(total)];
  const packs: number[] = [];
  let left = round4(total);
  while (left > 0) {
    const q = round4(Math.min(packSize, left));
    packs.push(q);
    left = round4(left - q);
  }
  return packs;
}

/** URL de rastreo de la transportadora (RF-7.3b). */
export function trackingUrl(template: string | null | undefined, trackingNumber: string) {
  if (!template) return null;
  return template.includes("{guia}") ? template.replace("{guia}", encodeURIComponent(trackingNumber)) : template;
}

/** Divide una cantidad en N bultos iguales; el último absorbe el redondeo (RF-5.1.2). */
export function splitIntoCount(total: number, count: number): number[] {
  if (count <= 1) return [round4(total)];
  const each = round4(total / count);
  const packs = Array.from({ length: count - 1 }, () => each);
  packs.push(round4(total - each * (count - 1)));
  return packs;
}
