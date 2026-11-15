import type { EstadoEnvio } from "@prisma/client";
import { splitIntoCount } from "@/domain/services/codes";
import { inTransaction, nextSequence, pad, prisma, type Tx } from "@/infrastructure/database/prisma";
import { postEntry } from "@/infrastructure/database/stock";
import { DomainError } from "@/shared/errors";
import { n, round4 } from "@/shared/numbers";
import { CURRENT_USER } from "@/shared/user";

export interface PurchaseLineInput {
  productId: string;
  quantity: number; // en unidad de compra
  unit: string; // unidad base o una conversión del producto
  unitPrice: number; // por unidad de compra, sin IVA
  taxRate?: number;
}

async function resolveFactor(tx: Tx, productId: string, unit: string) {
  const p = await tx.product.findUniqueOrThrow({ where: { id: productId }, include: { conversions: true } });
  if (unit === p.baseUnit) return { product: p, factor: 1 };
  const c = p.conversions.find((x) => x.unit === unit);
  if (!c) throw new DomainError(`La unidad "${unit}" no está configurada para ${p.name}.`);
  return { product: p, factor: n(c.factor) };
}

export async function createPurchaseOrder(input: {
  supplierId: string;
  expectedDate?: Date | null;
  notes?: string | null;
  lines: PurchaseLineInput[];
  createdByAI?: boolean;
}) {
  const lines = input.lines.filter((l) => l.productId && l.quantity > 0);
  if (lines.length === 0) throw new DomainError("Agrega al menos una línea con cantidad.");
  return inTransaction(async (tx) => {
    const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: input.supplierId } });
    const resolved = [];
    for (const l of lines) {
      if (l.unitPrice < 0) throw new DomainError("El precio no puede ser negativo.");
      const { product, factor } = await resolveFactor(tx, l.productId, l.unit);
      if (product.type === "PRODUCTO_TERMINADO") throw new DomainError(`${product.name} es producto terminado: se fabrica, no se compra.`);
      resolved.push({ productId: l.productId, quantity: l.quantity, unit: l.unit, factor, unitPrice: l.unitPrice, taxRate: l.taxRate ?? 19 });
    }
    const code = `OC-${pad(await nextSequence(tx, "OC"))}`;
    const expectedDate =
      input.expectedDate ?? new Date(Date.now() + supplier.leadTimeDays * 86_400_000);
    return tx.purchaseOrder.create({
      data: { code, supplierId: supplier.id, expectedDate, notes: input.notes, createdByAI: input.createdByAI ?? false, lines: { create: resolved } },
    });
  });
}

export async function sendPurchaseOrder(id: string) {
  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } });
  if (po.status !== "BORRADOR") throw new DomainError("Solo se envía una OC en borrador.");
  return prisma.purchaseOrder.update({ where: { id }, data: { status: "ENVIADA", sentAt: new Date() } });
}

export async function cancelPurchaseOrder(id: string) {
  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } });
  if (!["BORRADOR", "ENVIADA", "EN_TRANSITO"].includes(po.status))
    throw new DomainError("No se puede anular una OC con recepciones.");
  return prisma.purchaseOrder.update({ where: { id }, data: { status: "ANULADA" } });
}

export interface ReceiptLineInput {
  lineId: string;
  quantity: number; // en unidad de compra
  lotCode?: string | null;
  expiryDate?: Date | null;
  containers: number; // número de bultos (RF-5.1.2)
}

/**
 * Recepción total o parcial (RF-6.5): crea lote, bultos serializados y movimientos ENT_COMPRA (GR)
 * con la remisión del proveedor (obligatoria) y recalcula el costo promedio.
 */
export async function receivePurchaseOrder(input: {
  orderId: string;
  supplierRemission: string;
  warehouseId: string;
  notes?: string | null;
  lines: ReceiptLineInput[];
}) {
  const remission = input.supplierRemission.trim();
  if (!remission) throw new DomainError("El número de remisión del proveedor es obligatorio.");
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) throw new DomainError("Indica al menos una cantidad recibida.");

  return inTransaction(async (tx) => {
    const po = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: input.orderId },
      include: { supplier: true, lines: { include: { product: true } } },
    });
    if (!["ENVIADA", "EN_TRANSITO", "RECIBIDA_PARCIAL"].includes(po.status))
      throw new DomainError("Solo se reciben OCs enviadas o en tránsito.");
    const code = `REC-${pad(await nextSequence(tx, "REC"))}`;
    const receipt = await tx.receipt.create({
      data: { code, orderId: po.id, supplierRemission: remission, warehouseId: input.warehouseId, notes: input.notes, userName: CURRENT_USER },
    });

    for (const l of lines) {
      const line = po.lines.find((x) => x.id === l.lineId);
      if (!line) throw new DomainError("Línea de OC inválida.");
      const p = line.product;
      const factor = n(line.factor);
      const baseQty = round4(l.quantity * factor);
      const pendingBase = round4(n(line.quantity) * factor - n(line.receivedQty));
      if (baseQty > pendingBase + 1e-9)
        throw new DomainError(`${p.name}: se intenta recibir ${baseQty} ${p.baseUnit} y solo quedan ${pendingBase} pendientes.`);
      if (l.containers < 1 || !Number.isInteger(l.containers)) throw new DomainError(`${p.name}: el número de bultos debe ser un entero ≥ 1.`);

      let lotId: string | null = null;
      if (p.tracksLot) {
        const lotCode = l.lotCode?.trim();
        if (!lotCode) throw new DomainError(`${p.name} controla lote: indica el lote del proveedor.`);
        if (p.tracksExpiry && !l.expiryDate) throw new DomainError(`${p.name} controla vencimiento: indica la fecha.`);
        const lot = await tx.lot.upsert({
          where: { productId_code: { productId: p.id, code: lotCode } },
          create: { productId: p.id, code: lotCode, supplierLot: lotCode, expiryDate: l.expiryDate, sourceType: "COMPRA", sourceRef: po.code, supplierId: po.supplierId },
          update: {},
        });
        lotId = lot.id;
      }
      // RN-6.1: costo sin IVA convertido a la unidad base
      const unitCost = n(line.unitPrice) / factor;
      await postEntry(tx, {
        type: "ENT_COMPRA",
        productId: p.id,
        warehouseId: input.warehouseId,
        lotId,
        packs: splitIntoCount(baseQty, l.containers),
        unitCost,
        sourceType: "COMPRA",
        doc: {
          documentType: "OC",
          documentId: po.id,
          documentNumber: po.code,
          remissionNumber: remission,
          partyType: "PROVEEDOR",
          partyName: po.supplier.name,
          reason: `Recepción ${code}`,
        },
      });
      await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: { increment: baseQty } } });
      await tx.receiptLine.create({
        data: { receiptId: receipt.id, lineId: line.id, quantity: baseQty, lotCode: l.lotCode, expiryDate: l.expiryDate, containers: l.containers },
      });
    }

    const updated = await tx.purchaseOrderLine.findMany({ where: { orderId: po.id } });
    const complete = updated.every((x) => n(x.receivedQty) >= n(x.quantity) * n(x.factor) - 1e-9);
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: complete ? "RECIBIDA" : "RECIBIDA_PARCIAL" } });
    return receipt;
  });
}

// ───────────────────────── Tracking (M7 / M12) ─────────────────────────

export async function addShipment(input: {
  purchaseOrderId?: string;
  dispatchId?: string;
  carrierId: string;
  trackingNumber: string;
  shippedAt?: Date | null;
  eta?: Date | null;
}) {
  if (!input.trackingNumber.trim()) throw new DomainError("El número de guía es obligatorio.");
  return inTransaction(async (tx) => {
    const status: EstadoEnvio = input.shippedAt ? "DESPACHADO" : "CREADO";
    const s = await tx.shipment.create({
      data: {
        direction: input.dispatchId ? "SALIENTE" : "ENTRANTE",
        purchaseOrderId: input.purchaseOrderId,
        dispatchId: input.dispatchId,
        carrierId: input.carrierId,
        trackingNumber: input.trackingNumber.trim(),
        shippedAt: input.shippedAt,
        eta: input.eta,
        status,
        events: { create: { status, note: "Envío registrado", userName: CURRENT_USER, occurredAt: input.shippedAt ?? new Date() } },
      },
    });
    if (input.purchaseOrderId) {
      const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: input.purchaseOrderId } });
      if (po.status === "ENVIADA" && input.shippedAt)
        await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: "EN_TRANSITO" } });
    }
    return s;
  });
}

/**
 * Evento manual de tracking (RF-7.3). RN-7.1: marcar ENTREGADO en un envío entrante
 * NO suma stock; el stock entra solo con la recepción.
 */
export async function addShipmentEvent(shipmentId: string, status: EstadoEnvio, note?: string | null, occurredAt?: Date | null) {
  return inTransaction(async (tx) => {
    const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { purchaseOrder: true, dispatch: true } });
    await tx.shipmentEvent.create({ data: { shipmentId, status, note, occurredAt: occurredAt ?? new Date(), userName: CURRENT_USER } });
    await tx.shipment.update({
      where: { id: shipmentId },
      data: { status, ...(status === "DESPACHADO" && !s.shippedAt ? { shippedAt: occurredAt ?? new Date() } : {}) },
    });
    if (s.purchaseOrder && s.purchaseOrder.status === "ENVIADA" && ["DESPACHADO", "EN_TRANSITO", "EN_CIUDAD_DESTINO"].includes(status))
      await tx.purchaseOrder.update({ where: { id: s.purchaseOrder.id }, data: { status: "EN_TRANSITO" } });
    if (s.dispatch) {
      const map: Partial<Record<EstadoEnvio, "EN_TRANSITO" | "ENTREGADO" | "NOVEDAD">> = {
        EN_TRANSITO: "EN_TRANSITO",
        EN_CIUDAD_DESTINO: "EN_TRANSITO",
        ENTREGADO: "ENTREGADO",
        NOVEDAD: "NOVEDAD",
      };
      const next = map[status];
      if (next && ["DESPACHADO", "EN_TRANSITO", "NOVEDAD"].includes(s.dispatch.status))
        await tx.dispatch.update({
          where: { id: s.dispatch.id },
          data: { status: next, ...(next === "ENTREGADO" ? { deliveredAt: occurredAt ?? new Date() } : {}) },
        });
    }
  });
}

/** Último precio pagado por producto (RF-6.2). */
export async function lastPrices() {
  const lines = await prisma.purchaseOrderLine.findMany({
    where: { order: { status: { not: "ANULADA" } } },
    orderBy: { order: { createdAt: "desc" } },
    include: { order: { include: { supplier: true } } },
  });
  const map = new Map<string, { unitCost: number; supplierId: string; supplierName: string }>();
  for (const l of lines)
    if (!map.has(l.productId))
      map.set(l.productId, { unitCost: n(l.unitPrice) / n(l.factor), supplierId: l.order.supplierId, supplierName: l.order.supplier.name });
  return map;
}
