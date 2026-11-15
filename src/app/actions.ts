"use server";

import type { EstadoEnvio, MotivoAjuste, TipoBodega, TipoProducto } from "@prisma/client";
import { revalidatePath } from "next/cache";
import * as catalog from "@/application/use-cases/catalog";
import * as dispatches from "@/application/use-cases/dispatches";
import * as inv from "@/application/use-cases/inventory";
import * as production from "@/application/use-cases/production";
import * as purchasing from "@/application/use-cases/purchasing";
import { errorMessage } from "@/shared/errors";

// Fase 1 sin autenticación: un solo usuario administrador (S9).

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  redirect?: string;
  data?: unknown;
}

async function run(fn: () => Promise<Omit<ActionResult, "ok"> | void>): Promise<ActionResult> {
  try {
    const r = await fn();
    revalidatePath("/", "layout");
    return { ok: true, ...(r ?? {}) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;
const num = (fd: FormData, k: string) => {
  const v = str(fd, k).replace(",", ".");
  return v === "" ? null : Number(v);
};
const req = (fd: FormData, k: string, label: string) => {
  const v = num(fd, k);
  if (v === null || Number.isNaN(v)) throw new Error(`${label}: ingresa un número válido.`);
  return v;
};
const date = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v ? new Date(`${v}T12:00:00-05:00`) : null;
};
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const all = (fd: FormData, k: string) => fd.getAll(k).map((v) => String(v).trim());
const toNum = (v: string) => (v === "" ? NaN : Number(v.replace(",", ".")));

// ───────────────────────── Catálogo ─────────────────────────

export async function saveProductAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const id = opt(fd, "id") ?? undefined;
    const units = all(fd, "conv.unit");
    const factors = all(fd, "conv.factor");
    const p = await catalog.saveProduct(
      {
        sku: str(fd, "sku"),
        name: str(fd, "name"),
        shortName: opt(fd, "shortName"),
        category: str(fd, "category") || "General",
        type: str(fd, "type") as TipoProducto,
        baseUnit: str(fd, "baseUnit"),
        barcode: opt(fd, "barcode"),
        tracksLot: bool(fd, "tracksLot"),
        tracksExpiry: bool(fd, "tracksExpiry"),
        shelfLifeDays: num(fd, "shelfLifeDays"),
        minStock: num(fd, "minStock") ?? 0,
        safetyStock: num(fd, "safetyStock") ?? 0,
        leadTimeDays: num(fd, "leadTimeDays") ?? 7,
        salePrice: num(fd, "salePrice"),
        nsoCode: opt(fd, "nsoCode"),
        nsoExpiry: date(fd, "nsoExpiry"),
        defaultPackSize: num(fd, "defaultPackSize"),
        preferredSupplierId: opt(fd, "preferredSupplierId"),
        conversions: units.map((u, i) => ({ unit: u, factor: toNum(factors[i] ?? "") })).filter((c) => c.unit && c.factor > 0),
      },
      id,
    );
    return { message: "Producto guardado.", redirect: `/productos/${p.id}` };
  });
}

export async function archiveProductAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    await catalog.setArchived(str(fd, "id"), str(fd, "archived") === "1");
    return { message: str(fd, "archived") === "1" ? "Producto archivado." : "Producto reactivado." };
  });
}

export async function saveWarehouseAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    await catalog.saveWarehouse({ code: str(fd, "code"), name: str(fd, "name"), type: str(fd, "type") as TipoBodega, active: true }, opt(fd, "id") ?? undefined);
    return { message: "Bodega guardada." };
  });
}

export async function saveSupplierAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    await catalog.saveSupplier(
      {
        taxId: str(fd, "taxId"), name: str(fd, "name"), contactName: str(fd, "contactName"), phone: str(fd, "phone"),
        email: str(fd, "email"), city: str(fd, "city"), paymentTermDays: num(fd, "paymentTermDays") ?? 30, leadTimeDays: num(fd, "leadTimeDays") ?? 7,
      },
      opt(fd, "id") ?? undefined,
    );
    return { message: "Proveedor guardado." };
  });
}

export async function saveCarrierAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    await catalog.saveCarrier({ name: str(fd, "name"), trackingUrlTemplate: opt(fd, "trackingUrlTemplate"), acceptsParam: str(fd, "trackingUrlTemplate").includes("{guia}") }, opt(fd, "id") ?? undefined);
    return { message: "Transportadora guardada." };
  });
}

// ───────────────────────── Fórmulas y producción ─────────────────────────

export async function saveRecipeAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const ids = all(fd, "item.ingredientId");
    const qtys = all(fd, "item.quantity");
    const units = all(fd, "item.unit");
    const r = await production.saveRecipe({
      productId: str(fd, "productId"),
      name: str(fd, "name"),
      yieldQuantity: req(fd, "yieldQuantity", "Rendimiento"),
      instructions: opt(fd, "instructions"),
      createdByAI: bool(fd, "createdByAI"),
      items: ids.map((id, i) => ({ ingredientId: id, quantity: toNum(qtys[i] ?? ""), unit: units[i] ?? "" })),
    });
    return { message: "Fórmula guardada.", redirect: `/formulas/${r.productId}` };
  });
}

export async function createOrderAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const o = await production.createProductionOrder({
      productId: str(fd, "productId"),
      quantity: req(fd, "quantity", "Cantidad"),
      plannedDate: date(fd, "plannedDate"),
      notes: opt(fd, "notes"),
      createdByAI: bool(fd, "createdByAI"),
    });
    return { message: `Orden ${o.code} creada en borrador.`, redirect: `/produccion/${o.id}` };
  });
}

export async function orderTransitionAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const id = str(fd, "id");
    const op = str(fd, "op");
    if (op === "start") await production.startProductionOrder(id);
    else if (op === "cancel") await production.cancelProductionOrder(id);
    return { message: op === "start" ? "Orden iniciada: lotes reservados con FEFO." : "Orden anulada: reservas liberadas." };
  });
}

export async function completeOrderAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const consumed: Record<string, number> = {};
    const ids = all(fd, "consumed.productId");
    const qtys = all(fd, "consumed.qty");
    ids.forEach((id, i) => {
      const v = toNum(qtys[i] ?? "");
      if (Number.isNaN(v)) throw new Error("Revisa las cantidades consumidas.");
      consumed[id] = v;
    });
    await production.completeProductionOrder({
      orderId: str(fd, "id"),
      producedQty: req(fd, "producedQty", "Unidades buenas"),
      consumed,
      packSize: num(fd, "packSize"),
      lotCode: opt(fd, "lotCode"),
      warehouseId: str(fd, "warehouseId"),
    });
    return { message: "Orden completada: el lote quedó en cuarentena hasta su liberación." };
  });
}

// ───────────────────────── Calidad / lotes ─────────────────────────

export async function lotStatusAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const id = str(fd, "lotId");
    const op = str(fd, "op");
    const note = str(fd, "note");
    if (op === "release") await inv.releaseLot(id, note);
    else if (op === "reject") await inv.rejectLot(id, note);
    else await inv.quarantineLot(id, note);
    return { message: op === "release" ? "Lote liberado: disponible para usar y despachar." : op === "reject" ? "Lote rechazado y bloqueado." : "Lote puesto en cuarentena." };
  });
}

// ───────────────────────── Compras y tracking ─────────────────────────

export async function createPurchaseAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const ids = all(fd, "line.productId");
    const qtys = all(fd, "line.quantity");
    const units = all(fd, "line.unit");
    const prices = all(fd, "line.unitPrice");
    const po = await purchasing.createPurchaseOrder({
      supplierId: str(fd, "supplierId"),
      expectedDate: date(fd, "expectedDate"),
      notes: opt(fd, "notes"),
      createdByAI: bool(fd, "createdByAI"),
      lines: ids.map((id, i) => ({ productId: id, quantity: toNum(qtys[i] ?? ""), unit: units[i] ?? "", unitPrice: toNum(prices[i] ?? "") || 0 })),
    });
    return { message: `Orden de compra ${po.code} creada.`, redirect: `/compras/${po.id}` };
  });
}

export async function purchaseTransitionAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const id = str(fd, "id");
    if (str(fd, "op") === "send") {
      await purchasing.sendPurchaseOrder(id);
      return { message: "OC enviada al proveedor." };
    }
    await purchasing.cancelPurchaseOrder(id);
    return { message: "OC anulada." };
  });
}

export async function receiveAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const ids = all(fd, "r.lineId");
    const qtys = all(fd, "r.quantity");
    const lots = all(fd, "r.lotCode");
    const exps = all(fd, "r.expiryDate");
    const bultos = all(fd, "r.containers");
    const rec = await purchasing.receivePurchaseOrder({
      orderId: str(fd, "id"),
      supplierRemission: str(fd, "supplierRemission"),
      warehouseId: str(fd, "warehouseId"),
      notes: opt(fd, "notes"),
      lines: ids.map((lineId, i) => ({
        lineId,
        quantity: toNum(qtys[i] ?? "") || 0,
        lotCode: lots[i] || null,
        expiryDate: exps[i] ? new Date(`${exps[i]}T12:00:00-05:00`) : null,
        containers: Math.max(1, Math.floor(toNum(bultos[i] ?? "1") || 1)),
      })),
    });
    return { message: `Recepción ${rec.code} registrada. Imprime las etiquetas de los bultos.`, data: { receiptId: rec.id } };
  });
}

export async function addShipmentAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    await purchasing.addShipment({
      purchaseOrderId: opt(fd, "purchaseOrderId") ?? undefined,
      carrierId: str(fd, "carrierId"),
      trackingNumber: str(fd, "trackingNumber"),
      shippedAt: date(fd, "shippedAt"),
      eta: date(fd, "eta"),
    });
    return { message: "Envío registrado." };
  });
}

export async function shipmentEventAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    await purchasing.addShipmentEvent(str(fd, "shipmentId"), str(fd, "status") as EstadoEnvio, opt(fd, "note"), date(fd, "occurredAt"));
    return { message: "Estado del envío actualizado." };
  });
}

// ───────────────────────── Inventario ─────────────────────────

export async function adjustDownAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const adj = await inv.adjustContainerDown({
      containerId: str(fd, "containerId"),
      quantity: req(fd, "quantity", "Cantidad"),
      reason: str(fd, "reason") as MotivoAjuste,
      notes: opt(fd, "notes"),
    });
    return { message: `Ajuste ${adj.code} registrado.` };
  });
}

export async function adjustUpAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const adj = await inv.adjustUp({
      productId: str(fd, "productId"),
      warehouseId: str(fd, "warehouseId"),
      quantity: req(fd, "quantity", "Cantidad"),
      containers: num(fd, "containers") ?? 1,
      unitCost: num(fd, "unitCost"),
      lotCode: opt(fd, "lotCode"),
      expiryDate: date(fd, "expiryDate"),
      reason: str(fd, "reason") as MotivoAjuste,
      notes: opt(fd, "notes"),
    });
    return { message: `Ajuste ${adj.code} registrado. Imprime las etiquetas de los bultos nuevos.`, data: { adjustmentId: adj.id } };
  });
}

export async function markOpenAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    await inv.markContainerOpen(str(fd, "containerId"));
    return { message: "Bulto marcado como abierto." };
  });
}

export async function transferAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const t = await inv.transfer({ containerId: str(fd, "containerId"), toWarehouseId: str(fd, "toWarehouseId"), quantity: num(fd, "quantity"), notes: opt(fd, "notes") });
    return { message: `Traslado ${t.code} registrado.` };
  });
}

/** Busca un bulto o producto por código escaneado (para formularios con escáner). */
export async function lookupCodeAction(code: string) {
  const r = await inv.resolveCode(code);
  if (!r) return null;
  if (r.kind === "product") return { kind: "product" as const, productId: r.product.id, sku: r.product.sku, name: r.product.name, unit: r.product.baseUnit };
  const c = r.container;
  return {
    kind: "container" as const,
    containerId: c.id,
    serial: c.serial,
    productId: c.productId,
    sku: c.product.sku,
    name: c.product.name,
    unit: c.product.baseUnit,
    lotCode: c.lot?.code ?? null,
    warehouse: c.warehouse.code,
    warehouseId: c.warehouseId,
    currentQty: Number(c.currentQty),
    status: c.status,
  };
}

// ───────────────────────── Conteo cíclico ─────────────────────────

export async function createCountAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const c = await inv.createCycleCount({ warehouseId: str(fd, "warehouseId"), productIds: all(fd, "productId"), notes: opt(fd, "notes") });
    return { message: `Conteo ${c.code} creado.`, redirect: `/conteos/${c.id}` };
  });
}

export async function scanCountAction(input: { countId: string; code: string; countedQty?: number | null; sealIntact?: boolean; comment?: string | null }) {
  try {
    const r = await inv.recordScan(input);
    if (!r.needsQuantity) revalidatePath(`/conteos/${input.countId}`);
    return { ok: true as const, result: r };
  } catch (e) {
    return { ok: false as const, error: errorMessage(e) };
  }
}

export async function countTransitionAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const id = str(fd, "id");
    const op = str(fd, "op");
    if (op === "close") await inv.closeCycleCount(id);
    else if (op === "approve") {
      const comments: Record<string, string> = {};
      for (const [k, v] of fd.entries()) if (k.startsWith("comment.")) comments[k.slice(8)] = String(v);
      await inv.approveCycleCount(id, comments);
    } else await inv.cancelCycleCount(id);
    return { message: op === "close" ? "Conteo cerrado: revisa las diferencias." : op === "approve" ? "Conteo aprobado: ajustes generados." : "Conteo anulado." };
  });
}

// ───────────────────────── Despachos ─────────────────────────

export async function createDispatchAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const ids = all(fd, "line.productId");
    const qtys = all(fd, "line.quantity");
    const d = await dispatches.createDispatch({
      customerName: str(fd, "customerName"),
      customerTaxId: str(fd, "customerTaxId"),
      address: str(fd, "address"),
      city: str(fd, "city"),
      salesRef: opt(fd, "salesRef"),
      notes: opt(fd, "notes"),
      lines: ids.map((id, i) => ({ productId: id, quantity: toNum(qtys[i] ?? "") || 0 })),
    });
    return { message: `Despacho ${d.code} creado.`, redirect: `/despachos/${d.id}` };
  });
}

export async function dispatchTransitionAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const id = str(fd, "id");
    const op = str(fd, "op");
    if (op === "pick") await dispatches.startPicking(id);
    else if (op === "unpick") await dispatches.cancelPicking(id);
    else if (op === "delete") {
      await dispatches.cancelDispatch(id);
      return { message: "Despacho eliminado.", redirect: "/despachos" };
    }
    return { message: op === "pick" ? "Bultos asignados con FEFO. Verifica cada caja con el escáner." : "Alistamiento cancelado." };
  });
}

export async function pickScanAction(dispatchId: string, code: string) {
  try {
    const r = await dispatches.pickScan(dispatchId, code);
    revalidatePath(`/despachos/${dispatchId}`);
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: errorMessage(e) };
  }
}

export async function shipDispatchAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    await dispatches.shipDispatch({
      dispatchId: str(fd, "id"),
      carrierId: str(fd, "carrierId"),
      trackingNumber: str(fd, "trackingNumber"),
      eta: date(fd, "eta"),
      freightCost: num(fd, "freightCost"),
    });
    return { message: "Despacho enviado: salida registrada con la remisión." };
  });
}

export async function attachProofAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const file = fd.get("proof");
    if (!(file instanceof File) || file.size === 0) throw new Error("Selecciona la foto o PDF de la remisión firmada.");
    if (file.size > 2_000_000) throw new Error("El archivo supera 2 MB.");
    const buf = Buffer.from(await file.arrayBuffer());
    await dispatches.attachProof(str(fd, "id"), `data:${file.type || "application/octet-stream"};base64,${buf.toString("base64")}`);
    return { message: "Remisión firmada adjunta (prueba de entrega)." };
  });
}
