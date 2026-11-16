import type { EstadoBulto, OrigenLote, Prisma, TipoDocumento, TipoMovimiento } from "@prisma/client";
import { type AllocatableContainer } from "@/domain/services/allocation";
import { formatSerial } from "@/domain/services/codes";
import { weightedAverage } from "@/domain/services/weightedAverageCost";
import { DomainError } from "@/shared/errors";
import { fmtDate, MS_PER_DAY, n, QTY_EPSILON, round2, round4, startOfToday } from "@/shared/numbers";
import { CURRENT_USER } from "@/shared/user";
import { nextSequence, type Db, type Tx } from "./prisma";

/**
 * Único punto por donde cambia el inventario (RN-3.2).
 * Todo el stock vive en bultos serializados (Container): el saldo de un producto
 * es la suma de sus bultos, y cada movimiento del Kardex apunta a un bulto.
 */

export interface DocRef {
  documentType: TipoDocumento;
  documentId: string;
  documentNumber: string;
  remissionNumber?: string | null;
  partyType?: "PROVEEDOR" | "CLIENTE" | null;
  partyName?: string | null;
  reason?: string | null;
}

/** Un bulto cuenta en inventario mientras está sellado o abierto (no vacío ni dado de baja). */
export const ACTIVE_STATUSES: EstadoBulto[] = ["SELLADO", "ABIERTO"];
const ACTIVE = { status: { in: ACTIVE_STATUSES } };
/** Lo comprometido de un bulto: reservas de órdenes en proceso y asignaciones de despachos sin despachar. */
const OPEN_DISPATCH = { status: { in: ["PENDIENTE", "EN_ALISTAMIENTO"] as ("PENDIENTE" | "EN_ALISTAMIENTO")[] } };
type Committed = { quantity: Prisma.Decimal };
const reservedQty = (c: { reservations: Committed[]; allocations: Committed[] }) =>
  [...c.reservations, ...c.allocations].reduce((s, r) => s + n(r.quantity), 0);

/** Saldo físico total del producto (todas las bodegas, lotes y estados de lote). */
export async function productBalance(db: Db, productId: string) {
  const agg = await db.container.aggregate({ where: { productId, ...ACTIVE }, _sum: { currentQty: true } });
  return n(agg._sum.currentQty);
}

/**
 * Busca un lote por su código o lo crea. Un lote tiene una sola fecha de vencimiento:
 * si llega de nuevo con otra fecha, se rechaza en vez de conservar la anterior en silencio.
 */
export async function findOrCreateLot(
  tx: Tx,
  productId: string,
  code: string,
  expiryDate: Date | null | undefined,
  data: Omit<Prisma.LotUncheckedCreateInput, "productId" | "code" | "expiryDate">,
) {
  const existing = await tx.lot.findUnique({ where: { productId_code: { productId, code } } });
  if (!existing) return tx.lot.create({ data: { productId, code, expiryDate, ...data } });
  if (expiryDate && existing.expiryDate && Math.abs(existing.expiryDate.getTime() - expiryDate.getTime()) >= MS_PER_DAY / 2)
    throw new DomainError(`El lote ${code} ya existe con vencimiento ${fmtDate(existing.expiryDate)}. Revisa la fecha o el código del lote.`);
  return existing;
}

async function nextMovementNumber(tx: Tx) {
  return nextSequence(tx, "KARDEX");
}

async function nextSerial(tx: Tx, sku: string) {
  return formatSerial(sku, await nextSequence(tx, `SERIAL:${sku}`));
}

/**
 * Entrada: crea un bulto por cada cantidad de `packs` y un movimiento por bulto.
 * Recalcula el costo promedio si la entrada trae costo (RF-4.1).
 */
export async function postEntry(
  tx: Tx,
  args: {
    type: Extract<TipoMovimiento, "ENT_COMPRA" | "ENT_PRODUCCION" | "AJUSTE_ENT" | "INV_INICIAL">;
    productId: string;
    warehouseId: string;
    lotId: string | null;
    packs: number[];
    unitCost: number;
    sourceType: OrigenLote;
    doc: DocRef;
  },
) {
  const product = await tx.product.findUniqueOrThrow({ where: { id: args.productId } });
  if (product.tracksLot && !args.lotId) throw new DomainError(`${product.name} controla lote: indica el lote.`);
  if (args.packs.some((q) => q <= 0)) throw new DomainError("Las cantidades deben ser mayores que cero.");

  let balance = await productBalance(tx, product.id);
  let avg = n(product.avgCost);
  const containers = [];
  for (const qty of args.packs) {
    const serial = await nextSerial(tx, product.sku);
    const container = await tx.container.create({
      data: {
        serial,
        productId: product.id,
        lotId: args.lotId,
        warehouseId: args.warehouseId,
        initialQty: qty,
        currentQty: qty,
        sourceType: args.sourceType,
        sourceRef: args.doc.documentNumber,
      },
    });
    const newAvg = weightedAverage(balance, avg, qty, args.unitCost);
    await tx.stockMovement.create({
      data: {
        number: await nextMovementNumber(tx),
        type: args.type,
        productId: product.id,
        warehouseId: args.warehouseId,
        lotId: args.lotId,
        containerId: container.id,
        quantity: qty,
        unitCost: args.unitCost,
        totalValue: round2(qty * args.unitCost),
        avgCostBefore: avg,
        avgCostAfter: newAvg,
        balanceBefore: balance,
        balanceAfter: round4(balance + qty),
        userName: CURRENT_USER,
        ...docFields(args.doc),
      },
    });
    balance = round4(balance + qty);
    avg = newAvg;
    containers.push(container);
  }
  await tx.product.update({ where: { id: product.id }, data: { avgCost: avg } });
  return containers;
}

const docFields = (d: DocRef) => ({
  documentType: d.documentType,
  documentId: d.documentId,
  documentNumber: d.documentNumber,
  remissionNumber: d.remissionNumber ?? null,
  partyType: d.partyType ?? null,
  partyName: d.partyName ?? null,
  reason: d.reason ?? null,
});

/** Salida desde un bulto concreto, valorizada al costo promedio vigente (RN-4.1). */
export async function postExit(
  tx: Tx,
  args: {
    type: Extract<TipoMovimiento, "SAL_CONSUMO" | "SAL_VENTA" | "AJUSTE_SAL" | "BAJA">;
    containerId: string;
    quantity: number;
    doc: DocRef;
  },
) {
  const c = await tx.container.findUniqueOrThrow({ where: { id: args.containerId }, include: { product: true } });
  const qty = round4(args.quantity);
  const current = n(c.currentQty);
  if (qty <= 0) throw new DomainError("La cantidad debe ser mayor que cero.");
  if (c.status === "VACIO" || c.status === "DADO_DE_BAJA" || qty > current + QTY_EPSILON)
    throw new DomainError(`El bulto ${c.serial} solo tiene ${current} ${c.product.baseUnit}.`);

  const balance = await productBalance(tx, c.productId);
  const avg = n(c.product.avgCost);
  const left = round4(current - qty);
  await tx.container.update({
    where: { id: c.id },
    data: {
      currentQty: left,
      // RF-5.1.12: pasa a ABIERTO con la primera salida parcial; VACIO al llegar a 0
      status: left <= 0 ? (args.type === "BAJA" ? "DADO_DE_BAJA" : "VACIO") : "ABIERTO",
      openedAt: c.openedAt ?? new Date(),
    },
  });
  return tx.stockMovement.create({
    data: {
      number: await nextMovementNumber(tx),
      type: args.type,
      productId: c.productId,
      warehouseId: c.warehouseId,
      lotId: c.lotId,
      containerId: c.id,
      quantity: -qty,
      unitCost: avg,
      totalValue: round2(-qty * avg),
      avgCostBefore: avg,
      avgCostAfter: avg,
      balanceBefore: balance,
      balanceAfter: round4(balance - qty),
      userName: CURRENT_USER,
      ...docFields(args.doc),
    },
  });
}

/** Ajuste positivo sobre un bulto existente (conteo con sobrante). No cambia el costo promedio. */
export async function postContainerIncrease(tx: Tx, containerId: string, quantity: number, doc: DocRef) {
  const c = await tx.container.findUniqueOrThrow({ where: { id: containerId }, include: { product: true } });
  const balance = await productBalance(tx, c.productId);
  const avg = n(c.product.avgCost);
  const qty = round4(quantity);
  await tx.container.update({
    where: { id: c.id },
    data: { currentQty: round4(n(c.currentQty) + qty), status: c.status === "VACIO" ? "ABIERTO" : c.status },
  });
  return tx.stockMovement.create({
    data: {
      number: await nextMovementNumber(tx),
      type: "AJUSTE_ENT",
      productId: c.productId,
      warehouseId: c.warehouseId,
      lotId: c.lotId,
      containerId: c.id,
      quantity: qty,
      unitCost: avg,
      totalValue: round2(qty * avg),
      avgCostBefore: avg,
      avgCostAfter: avg,
      balanceBefore: balance,
      balanceAfter: round4(balance + qty),
      userName: CURRENT_USER,
      ...docFields(doc),
    },
  });
}

/** Traslado de un bulto completo o parcial (RN-2.1: no cambia el costo). */
export async function transferContainer(tx: Tx, containerId: string, toWarehouseId: string, quantity: number, doc: DocRef) {
  const c = await tx.container.findUniqueOrThrow({ where: { id: containerId }, include: { product: true } });
  if (c.warehouseId === toWarehouseId) throw new DomainError("La bodega destino es la misma de origen.");
  const current = n(c.currentQty);
  const qty = round4(quantity);
  if (qty <= 0 || qty > current + QTY_EPSILON) throw new DomainError(`El bulto ${c.serial} solo tiene ${current} ${c.product.baseUnit}.`);
  const avg = n(c.product.avgCost);
  const balance = await productBalance(tx, c.productId);
  const base = {
    productId: c.productId,
    lotId: c.lotId,
    unitCost: avg,
    avgCostBefore: avg,
    avgCostAfter: avg,
    balanceBefore: balance,
    balanceAfter: balance,
    userName: CURRENT_USER,
    ...docFields(doc),
  };

  let target = c;
  if (qty >= current - QTY_EPSILON) {
    // Bulto completo: cambia de bodega y conserva su serial.
    await tx.container.update({ where: { id: c.id }, data: { warehouseId: toWarehouseId } });
  } else {
    // Parcial: el bulto origen queda abierto y se crea un bulto nuevo en destino.
    await tx.container.update({ where: { id: c.id }, data: { currentQty: round4(current - qty), status: "ABIERTO", openedAt: c.openedAt ?? new Date() } });
    target = await tx.container.create({
      data: {
        serial: await nextSerial(tx, c.product.sku),
        productId: c.productId,
        lotId: c.lotId,
        warehouseId: toWarehouseId,
        initialQty: qty,
        currentQty: qty,
        sourceType: c.sourceType,
        sourceRef: doc.documentNumber,
      },
      include: { product: true },
    });
  }
  const out = await tx.stockMovement.create({
    data: {
      ...base,
      number: await nextMovementNumber(tx),
      type: "TRASLADO_SAL",
      warehouseId: c.warehouseId,
      toWarehouseId,
      containerId: c.id,
      quantity: -qty,
      totalValue: round2(-qty * avg),
    },
  });
  const inbound = await tx.stockMovement.create({
    data: {
      ...base,
      number: await nextMovementNumber(tx),
      type: "TRASLADO_ENT",
      warehouseId: toWarehouseId,
      toWarehouseId: c.warehouseId,
      containerId: target.id,
      quantity: qty,
      totalValue: round2(qty * avg),
      relatedMovementId: out.id,
    },
  });
  await tx.stockMovement.update({ where: { id: out.id }, data: { relatedMovementId: inbound.id } });
  return target;
}

// ───────────────────────── Disponibilidad ─────────────────────────

export interface AvailableContainer extends AllocatableContainer {
  serial: string;
  lotId: string | null;
  lotCode: string | null;
  warehouseId: string;
  currentQty: number;
  reserved: number;
}

/**
 * Bultos utilizables de un producto: lote DISPONIBLE (o sin lote), no vencido,
 * descontando lo reservado por otras OPs y despachos en alistamiento (RN-5.3).
 */
export async function availableContainers(
  db: Db,
  productId: string,
  opts: { excludeOrderId?: string; excludeDispatchId?: string; warehouseId?: string } = {},
): Promise<AvailableContainer[]> {
  const today = startOfToday();
  const rows = await db.container.findMany({
    where: {
      productId,
      ...ACTIVE,
      ...(opts.warehouseId ? { warehouseId: opts.warehouseId } : {}),
      OR: [{ lotId: null }, { lot: { status: "DISPONIBLE", OR: [{ expiryDate: null }, { expiryDate: { gte: today } }] } }],
    },
    include: {
      lot: true,
      reservations: { where: { order: { status: "EN_PROCESO" }, ...(opts.excludeOrderId ? { orderId: { not: opts.excludeOrderId } } : {}) } },
      allocations: {
        where: { dispatch: OPEN_DISPATCH, ...(opts.excludeDispatchId ? { dispatchId: { not: opts.excludeDispatchId } } : {}) },
      },
    },
  });
  return rows.map((c) => {
    const reserved = reservedQty(c);
    return {
      id: c.id,
      serial: c.serial,
      lotId: c.lotId,
      lotCode: c.lot?.code ?? null,
      warehouseId: c.warehouseId,
      expiryDate: c.lot?.expiryDate ?? null,
      createdAt: c.createdAt,
      currentQty: n(c.currentQty),
      reserved: round4(reserved),
      available: round4(Math.max(0, n(c.currentQty) - reserved)),
    };
  });
}

export async function availableQty(db: Db, productId: string, opts?: Parameters<typeof availableContainers>[2]) {
  const cs = await availableContainers(db, productId, opts);
  return round4(cs.reduce((s, c) => s + c.available, 0));
}

/** Resumen de existencias por producto (RF-3.1). */
export async function stockSummary(db: Db, productIds?: string[]) {
  const today = startOfToday();
  const containers = await db.container.findMany({
    where: { ...ACTIVE, ...(productIds ? { productId: { in: productIds } } : {}) },
    include: {
      lot: true,
      reservations: { where: { order: { status: "EN_PROCESO" } } },
      allocations: { where: { dispatch: OPEN_DISPATCH } },
    },
  });
  const map = new Map<string, { onHand: number; reserved: number; quarantine: number; blocked: number; available: number }>();
  for (const c of containers) {
    const s = map.get(c.productId) ?? { onHand: 0, reserved: 0, quarantine: 0, blocked: 0, available: 0 };
    const q = n(c.currentQty);
    const reserved = reservedQty(c);
    s.onHand += q;
    s.reserved += reserved;
    const expired = c.lot?.expiryDate && c.lot.expiryDate < today;
    if (c.lot?.status === "CUARENTENA") s.quarantine += q;
    else if (c.lot && (c.lot.status !== "DISPONIBLE" || expired)) s.blocked += q;
    else s.available += Math.max(0, q - reserved);
    map.set(c.productId, s);
  }
  for (const s of map.values()) for (const k of Object.keys(s) as (keyof typeof s)[]) s[k] = round4(s[k]);
  return map;
}
