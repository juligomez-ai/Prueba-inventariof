import { allocate } from "@/domain/services/allocation";
import { inTransaction, nextDocCode, prisma } from "@/infrastructure/database/prisma";
import { availableContainers, postExit } from "@/infrastructure/database/stock";
import { DomainError } from "@/shared/errors";
import { n, MS_PER_DAY } from "@/shared/numbers";
import { CURRENT_USER } from "@/shared/user";

/** RN-12.1: no se despachan lotes con menos de estos días de vida útil. */
export const MIN_SHELF_LIFE_DAYS = 90;
/** Tamaño máximo de la remisión firmada (foto o PDF). En base64 ocupa ~4/3 de su peso. */
export const MAX_PROOF_BYTES = 2_000_000;

export async function createDispatch(input: {
  customerName: string;
  customerTaxId: string;
  address: string;
  city: string;
  salesRef?: string | null;
  notes?: string | null;
  lines: { productId: string; quantity: number }[];
}) {
  for (const k of ["customerName", "customerTaxId", "address", "city"] as const)
    if (!input[k].trim()) throw new DomainError("Cliente, NIT, dirección y ciudad son obligatorios.");
  const lines = input.lines.filter((l) => l.productId && l.quantity > 0);
  if (lines.length === 0) throw new DomainError("Agrega al menos un producto.");
  return inTransaction(async (tx) => {
    for (const l of lines) {
      const p = await tx.product.findUniqueOrThrow({ where: { id: l.productId } });
      if (p.type !== "PRODUCTO_TERMINADO") throw new DomainError(`${p.name} no es producto terminado.`);
    }
    // El número de la remisión de entrega se asigna al crear el despacho (REM-0001)
    const code = await nextDocCode(tx, "REM");
    return tx.dispatch.create({ data: { ...input, code, lines: { create: lines } } });
  });
}

/** Alistar: asigna bultos FEFO respetando la vida útil mínima (RF-12.2, RN-12.1). */
export async function startPicking(dispatchId: string) {
  return inTransaction(async (tx) => {
    const d = await tx.dispatch.findUniqueOrThrow({ where: { id: dispatchId }, include: { lines: { include: { product: true } } } });
    if (d.status !== "PENDIENTE") throw new DomainError("El despacho ya fue alistado.");
    const minDate = new Date(Date.now() + MIN_SHELF_LIFE_DAYS * MS_PER_DAY);
    const shortages: string[] = [];
    for (const l of d.lines) {
      const containers = (await availableContainers(tx, l.productId)).filter((c) => !c.expiryDate || c.expiryDate >= minDate);
      const { picks, shortage } = allocate(containers, n(l.quantity));
      if (shortage > 0) shortages.push(`${l.product.name}: faltan ${shortage} und. disponibles (liberadas y con más de ${MIN_SHELF_LIFE_DAYS} días de vida útil)`);
      for (const p of picks) await tx.dispatchAllocation.create({ data: { dispatchId, containerId: p.container.id, quantity: p.quantity } });
    }
    if (shortages.length) throw new DomainError(shortages.join(" · "));
    return tx.dispatch.update({ where: { id: dispatchId }, data: { status: "EN_ALISTAMIENTO" } });
  });
}

/** Verificación por escáner del alistamiento (RF-12.2). */
export async function pickScan(dispatchId: string, code: string) {
  return inTransaction(async (tx) => {
    const d = await tx.dispatch.findUniqueOrThrow({ where: { id: dispatchId }, include: { allocations: { include: { container: true } } } });
    if (d.status !== "EN_ALISTAMIENTO") throw new DomainError("El despacho no está en alistamiento.");
    const a = d.allocations.find((x) => x.container.serial.toUpperCase() === code.trim().toUpperCase());
    if (!a) throw new DomainError(`El bulto ${code} no está asignado a esta remisión. Revisa la lista de alistamiento.`);
    if (a.picked) return { already: true, serial: a.container.serial };
    await tx.dispatchAllocation.update({ where: { id: a.id }, data: { picked: true } });
    return { already: false, serial: a.container.serial };
  });
}

export async function cancelPicking(dispatchId: string) {
  return inTransaction(async (tx) => {
    const d = await tx.dispatch.findUniqueOrThrow({ where: { id: dispatchId } });
    if (d.status !== "EN_ALISTAMIENTO") throw new DomainError("El despacho no está en alistamiento.");
    await tx.dispatchAllocation.deleteMany({ where: { dispatchId } });
    return tx.dispatch.update({ where: { id: dispatchId }, data: { status: "PENDIENTE" } });
  });
}

/**
 * Despachar (RF-12.5): genera las salidas SAL_VENTA (GI) por bulto y lote con el número
 * de remisión y registra el envío con transportadora y guía.
 */
export async function shipDispatch(input: {
  dispatchId: string;
  carrierId: string;
  trackingNumber: string;
  eta?: Date | null;
  freightCost?: number | null;
}) {
  if (!input.trackingNumber.trim()) throw new DomainError("El número de guía es obligatorio.");
  return inTransaction(async (tx) => {
    const d = await tx.dispatch.findUniqueOrThrow({ where: { id: input.dispatchId }, include: { allocations: { include: { container: true } } } });
    if (d.status !== "EN_ALISTAMIENTO") throw new DomainError("Primero alista el despacho.");
    if (d.allocations.some((a) => !a.picked))
      throw new DomainError("Faltan cajas por verificar con el escáner.");
    const doc = {
      documentType: "REM" as const,
      documentId: d.id,
      documentNumber: d.code,
      remissionNumber: d.code,
      partyType: "CLIENTE" as const,
      partyName: d.customerName,
      reason: d.salesRef ? `Pedido/factura ${d.salesRef}` : null,
    };
    for (const a of d.allocations) await postExit(tx, { type: "SAL_VENTA", containerId: a.containerId, quantity: n(a.quantity), doc });
    const now = new Date();
    await tx.shipment.create({
      data: {
        direction: "SALIENTE",
        dispatchId: d.id,
        carrierId: input.carrierId,
        trackingNumber: input.trackingNumber.trim(),
        shippedAt: now,
        eta: input.eta,
        status: "DESPACHADO",
        events: { create: { status: "DESPACHADO", note: `Remisión ${d.code} entregada a la transportadora`, userName: CURRENT_USER } },
      },
    });
    return tx.dispatch.update({ where: { id: d.id }, data: { status: "DESPACHADO", shippedAt: now, freightCost: input.freightCost } });
  });
}

/** Prueba de entrega: remisión firmada (RF-12.5c). */
export async function attachProof(dispatchId: string, dataUrl: string) {
  if (!dataUrl.startsWith("data:")) throw new DomainError("Archivo inválido.");
  if (dataUrl.length > Math.ceil((MAX_PROOF_BYTES * 4) / 3) + 100) throw new DomainError("El archivo supera 2 MB.");
  return prisma.dispatch.update({ where: { id: dispatchId }, data: { proofDataUrl: dataUrl } });
}

export async function cancelDispatch(dispatchId: string) {
  return inTransaction(async (tx) => {
    const d = await tx.dispatch.findUniqueOrThrow({ where: { id: dispatchId } });
    if (d.status !== "PENDIENTE") throw new DomainError("Solo se elimina un despacho pendiente (sin alistar).");
    await tx.dispatch.delete({ where: { id: dispatchId } });
  });
}
