import type { EstadoLote, MotivoAjuste } from "@prisma/client";
import { splitIntoCount } from "@/domain/services/codes";
import { inTransaction, nextSequence, pad, prisma, type Db } from "@/infrastructure/database/prisma";
import { postContainerIncrease, postEntry, postExit, transferContainer } from "@/infrastructure/database/stock";
import { DomainError } from "@/shared/errors";
import { n, round4 } from "@/shared/numbers";
import { CURRENT_USER } from "@/shared/user";

// ───────────────────────── Calidad / estados del lote (RF-5.7 a RF-5.10) ─────────────────────────

async function changeLotStatus(lotId: string, to: EstadoLote, reason: string) {
  if (!reason.trim()) throw new DomainError("El motivo o nota es obligatorio.");
  return inTransaction(async (tx) => {
    const lot = await tx.lot.findUniqueOrThrow({ where: { id: lotId } });
    if (lot.status === to) throw new DomainError("El lote ya está en ese estado.");
    if (lot.status === "VENCIDO") throw new DomainError("Un lote vencido solo se puede dar de baja.");
    // RN-5.5: cambiar el estado no mueve cantidades, pero queda en el historial
    await tx.lotStatusChange.create({ data: { lotId, fromStatus: lot.status, toStatus: to, reason: reason.trim(), userName: CURRENT_USER } });
    return tx.lot.update({ where: { id: lotId }, data: { status: to } });
  });
}

export const releaseLot = (lotId: string, note: string) => changeLotStatus(lotId, "DISPONIBLE", note);
export const rejectLot = (lotId: string, note: string) => changeLotStatus(lotId, "BLOQUEADO", note);
export const quarantineLot = (lotId: string, reason: string) => changeLotStatus(lotId, "CUARENTENA", reason);

// ───────────────────────── Ajustes (M11) ─────────────────────────

const reasonText: Record<MotivoAjuste, string> = {
  MERMA_PROCESO: "Merma de proceso",
  DANADO: "Producto dañado",
  VENCIDO: "Vencido",
  MUESTRA_OBSEQUIO: "Muestra / obsequio",
  ERROR_REGISTRO: "Error de registro",
  INVENTARIO_INICIAL: "Inventario inicial",
  CONTEO: "Conteo",
};

/** Ajuste negativo o baja sobre un bulto (RN-11.1: vencidos y dañados salen como BAJA · SCR). */
export async function adjustContainerDown(input: { containerId: string; quantity: number; reason: MotivoAjuste; notes?: string | null }) {
  return inTransaction(async (tx) => {
    const code = `AJ-${pad(await nextSequence(tx, "AJ"))}`;
    const adj = await tx.adjustment.create({ data: { code, reason: input.reason, notes: input.notes, userName: CURRENT_USER } });
    const type = input.reason === "VENCIDO" || input.reason === "DANADO" || input.reason === "MERMA_PROCESO" ? "BAJA" : "AJUSTE_SAL";
    await postExit(tx, {
      type,
      containerId: input.containerId,
      quantity: input.quantity,
      doc: { documentType: "AJ", documentId: adj.id, documentNumber: code, reason: [reasonText[input.reason], input.notes].filter(Boolean).join(" · ") },
    });
    return adj;
  });
}

/** Ajuste positivo / inventario inicial: crea lote (si aplica) y bultos con su costo (RF-11.3). */
export async function adjustUp(input: {
  productId: string;
  warehouseId: string;
  quantity: number;
  containers: number;
  unitCost?: number | null;
  lotCode?: string | null;
  expiryDate?: Date | null;
  reason: MotivoAjuste;
  notes?: string | null;
}) {
  if (!(input.quantity > 0)) throw new DomainError("La cantidad debe ser mayor que cero.");
  return inTransaction(async (tx) => {
    const p = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
    let lotId: string | null = null;
    if (p.tracksLot) {
      if (!input.lotCode?.trim()) throw new DomainError(`${p.name} controla lote: indica el lote.`);
      if (p.tracksExpiry && !input.expiryDate) throw new DomainError(`${p.name} controla vencimiento: indica la fecha.`);
      const code = input.lotCode.trim();
      const lot = await tx.lot.upsert({
        where: { productId_code: { productId: p.id, code } },
        create: { productId: p.id, code, expiryDate: input.expiryDate, sourceType: "AJUSTE" },
        update: {},
      });
      lotId = lot.id;
    }
    const code = `AJ-${pad(await nextSequence(tx, "AJ"))}`;
    const adj = await tx.adjustment.create({ data: { code, reason: input.reason, notes: input.notes, userName: CURRENT_USER } });
    if (lotId) await tx.lot.update({ where: { id: lotId }, data: { sourceRef: code } });
    await postEntry(tx, {
      type: input.reason === "INVENTARIO_INICIAL" ? "INV_INICIAL" : "AJUSTE_ENT",
      productId: p.id,
      warehouseId: input.warehouseId,
      lotId,
      packs: splitIntoCount(input.quantity, Math.max(1, Math.floor(input.containers))),
      unitCost: input.unitCost ?? n(p.avgCost),
      sourceType: "AJUSTE",
      doc: { documentType: "AJ", documentId: adj.id, documentNumber: code, reason: [reasonText[input.reason], input.notes].filter(Boolean).join(" · ") },
    });
    return adj;
  });
}

/** Marca un bulto como abierto (RF-5.1.12: alguien lo abrió para tomar una muestra). */
export async function markContainerOpen(containerId: string) {
  const c = await prisma.container.findUniqueOrThrow({ where: { id: containerId } });
  if (c.status !== "SELLADO") throw new DomainError("El bulto no está sellado.");
  return prisma.container.update({ where: { id: containerId }, data: { status: "ABIERTO", openedAt: new Date() } });
}

// ───────────────────────── Traslados (M2) ─────────────────────────

export async function transfer(input: { containerId: string; toWarehouseId: string; quantity?: number | null; notes?: string | null }) {
  return inTransaction(async (tx) => {
    const c = await tx.container.findUniqueOrThrow({ where: { id: input.containerId } });
    const qty = input.quantity ?? n(c.currentQty);
    // RN-2.2: no se traslada lo reservado
    const reserved = await tx.reservation.aggregate({ where: { containerId: c.id, order: { status: "EN_PROCESO" } }, _sum: { quantity: true } });
    if (qty > n(c.currentQty) - n(reserved._sum.quantity) + 1e-9)
      throw new DomainError(`Parte del bulto ${c.serial} está reservada para una orden de producción.`);
    const code = `TR-${pad(await nextSequence(tx, "TR"))}`;
    const t = await tx.transfer.create({ data: { code, fromWarehouseId: c.warehouseId, toWarehouseId: input.toWarehouseId, notes: input.notes, userName: CURRENT_USER } });
    await transferContainer(tx, c.id, input.toWarehouseId, qty, { documentType: "TR", documentId: t.id, documentNumber: code, reason: input.notes });
    return t;
  });
}

// ───────────────────────── Lectura de códigos (escáner) ─────────────────────────

/** Resuelve un código escaneado: serial de bulto, código de barras del fabricante o SKU. */
export async function resolveCode(code: string, db: Db = prisma) {
  const c = code.trim();
  if (!c) return null;
  const container = await db.container.findFirst({ where: { serial: { equals: c, mode: "insensitive" } }, include: { product: true, lot: true, warehouse: true } });
  if (container) return { kind: "container" as const, container, product: container.product };
  const product = await db.product.findFirst({ where: { OR: [{ barcode: c }, { sku: { equals: c, mode: "insensitive" } }] } });
  if (product) return { kind: "product" as const, product };
  return null;
}

// ───────────────────────── Conteo cíclico (M10) ─────────────────────────

export async function createCycleCount(input: { warehouseId: string; productIds: string[]; notes?: string | null }) {
  if (input.productIds.length === 0) throw new DomainError("Selecciona al menos un producto para contar.");
  return inTransaction(async (tx) => {
    const code = `CC-${pad(await nextSequence(tx, "CC"))}`;
    return tx.cycleCount.create({
      data: { code, warehouseId: input.warehouseId, notes: input.notes, userName: CURRENT_USER, items: { create: input.productIds.map((productId) => ({ productId })) } },
    });
  });
}

/**
 * Registrar un escaneo (RF-10.5).
 * - Bulto SELLADO con sello intacto: un escaneo confirma la cantidad completa (RF-10.5a).
 * - Bulto ABIERTO o sello roto: hay que digitar la cantidad (RF-10.5b).
 * La cantidad del sistema se guarda al momento del escaneo (RN-10.1) y no se muestra a quien cuenta (RF-10.3).
 */
export async function recordScan(input: { countId: string; code: string; countedQty?: number | null; sealIntact?: boolean; comment?: string | null }) {
  return inTransaction(async (tx) => {
    const count = await tx.cycleCount.findUniqueOrThrow({ where: { id: input.countId }, include: { items: true } });
    if (count.status !== "EN_CURSO") throw new DomainError("El conteo ya fue cerrado.");
    const r = await resolveCode(input.code, tx);
    if (!r) throw new DomainError(`Código desconocido: ${input.code}`);
    if (r.kind === "product")
      throw new DomainError(`${r.product.name}: escanea la etiqueta del bulto (serial). Si el bulto no tiene etiqueta, imprímela desde Etiquetas.`);
    const c = r.container;
    if (c.warehouseId !== count.warehouseId) throw new DomainError(`El bulto ${c.serial} está registrado en otra bodega (${c.warehouse.code}).`);
    if (!count.items.some((i) => i.productId === c.productId))
      await tx.cycleCountItem.create({ data: { countId: count.id, productId: c.productId } });

    const system = n(c.currentQty);
    const sealed = c.status === "SELLADO" && input.sealIntact !== false;
    let counted: number;
    if (sealed) counted = system;
    else {
      if (input.countedQty === null || input.countedQty === undefined || Number.isNaN(input.countedQty))
        return { needsQuantity: true as const, serial: c.serial, productName: c.product.name, unit: c.product.baseUnit, lotCode: c.lot?.code ?? null };
      if (input.countedQty < 0) throw new DomainError("La cantidad no puede ser negativa.");
      counted = round4(input.countedQty);
      if (c.status === "SELLADO" && input.sealIntact === false)
        await tx.container.update({ where: { id: c.id }, data: { status: "ABIERTO", openedAt: new Date() } });
    }
    const line = await tx.cycleCountLine.upsert({
      where: { countId_containerId: { countId: count.id, containerId: c.id } },
      create: { countId: count.id, productId: c.productId, containerId: c.id, systemQty: system, countedQty: counted, sealedOk: sealed, comment: input.comment },
      update: { systemQty: system, countedQty: counted, sealedOk: sealed, comment: input.comment, scannedAt: new Date() },
    });
    return { needsQuantity: false as const, line, serial: c.serial, productName: c.product.name, sealed };
  });
}

/** Cerrar: los bultos esperados que no se escanearon quedan como "no encontrado" con conteo 0. */
export async function closeCycleCount(countId: string) {
  return inTransaction(async (tx) => {
    const count = await tx.cycleCount.findUniqueOrThrow({ where: { id: countId }, include: { items: true, lines: true } });
    if (count.status !== "EN_CURSO") throw new DomainError("El conteo ya fue cerrado.");
    const scanned = new Set(count.lines.map((l) => l.containerId));
    const expected = await tx.container.findMany({
      where: { warehouseId: count.warehouseId, productId: { in: count.items.map((i) => i.productId) }, status: { in: ["SELLADO", "ABIERTO"] } },
    });
    for (const c of expected)
      if (!scanned.has(c.id))
        await tx.cycleCountLine.create({ data: { countId, productId: c.productId, containerId: c.id, systemQty: n(c.currentQty), countedQty: 0, notFound: true } });
    return tx.cycleCount.update({ where: { id: countId }, data: { status: "EN_REVISION", closedAt: new Date() } });
  });
}

/** Aprobar: genera ajustes sobre cada serial con diferencia (RF-10.8, RN-10.3). */
export async function approveCycleCount(countId: string, comments: Record<string, string> = {}, thresholdValue = 50_000) {
  return inTransaction(async (tx) => {
    const count = await tx.cycleCount.findUniqueOrThrow({ where: { id: countId }, include: { lines: { include: { product: true, container: true } } } });
    if (count.status !== "EN_REVISION") throw new DomainError("Primero cierra el conteo.");
    const doc = { documentType: "CC" as const, documentId: count.id, documentNumber: count.code, reason: `Conteo cíclico ${count.code}` };
    for (const l of count.lines) {
      if (!l.containerId || !l.container) continue;
      // Diferencia contra el stock actual del bulto (refleja movimientos ocurridos durante el conteo)
      const diff = round4(n(l.countedQty) - n(l.systemQty));
      if (Math.abs(diff) < 1e-9) continue;
      const comment = comments[l.id]?.trim() || l.comment?.trim();
      // RN-10.2: diferencias de valor alto requieren comentario
      if (Math.abs(diff * n(l.product.avgCost)) > thresholdValue && !comment)
        throw new DomainError(`${l.product.name} (${l.container.serial}): la diferencia supera $${thresholdValue.toLocaleString("es-CO")}; agrega un comentario.`);
      if (comment) await tx.cycleCountLine.update({ where: { id: l.id }, data: { comment } });
      const lineDoc = { ...doc, reason: [doc.reason, comment].filter(Boolean).join(" · ") };
      if (diff < 0) await postExit(tx, { type: "AJUSTE_SAL", containerId: l.containerId, quantity: Math.min(-diff, n(l.container.currentQty)), doc: lineDoc });
      else await postContainerIncrease(tx, l.containerId, diff, lineDoc);
    }
    return tx.cycleCount.update({ where: { id: countId }, data: { status: "APROBADO", approvedAt: new Date() } });
  });
}

export async function cancelCycleCount(countId: string) {
  const c = await prisma.cycleCount.findUniqueOrThrow({ where: { id: countId } });
  if (c.status === "APROBADO") throw new DomainError("Un conteo aprobado no se puede anular.");
  return prisma.cycleCount.update({ where: { id: countId }, data: { status: "ANULADO" } });
}
