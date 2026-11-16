"use server";

import { EstadoEnvio, MotivoAjuste, TipoBodega, TipoProducto } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import * as catalog from "@/application/use-cases/catalog";
import * as dispatches from "@/application/use-cases/dispatches";
import * as inv from "@/application/use-cases/inventory";
import * as production from "@/application/use-cases/production";
import * as purchasing from "@/application/use-cases/purchasing";
import { productionExpiryWarning } from "@/application/use-cases/traceability";
import { DomainError, errorMessage } from "@/shared/errors";
import { parseLocalDate } from "@/shared/numbers";

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
  if (v === null || Number.isNaN(v)) throw new DomainError(`${label}: ingresa un número válido.`);
  return v;
};
const date = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v ? parseLocalDate(v) : null;
};
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const all = (fd: FormData, k: string) => fd.getAll(k).map((v) => String(v).trim());
const toNum = (v: string) => (v === "" ? NaN : Number(v.replace(",", "."))); // a diferencia de num(): "" → NaN
/** Valor de una lista cerrada (enum): las acciones son endpoints públicos, no se confía en el formulario. */
const oneOf = <T extends string>(fd: FormData, k: string, values: Record<string, T>, label: string): T => {
  const v = str(fd, k);
  if (!(Object.values(values) as string[]).includes(v)) throw new DomainError(`${label}: valor no válido.`);
  return v as T;
};

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
        type: oneOf(fd, "type", TipoProducto, "Tipo de producto"),
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
    await catalog.saveWarehouse({ code: str(fd, "code"), name: str(fd, "name"), type: oneOf(fd, "type", TipoBodega, "Tipo de bodega"), active: true }, opt(fd, "id") ?? undefined);
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
    switch (op) {
      case "start":
        await production.startProductionOrder(id);
        return { message: "Orden iniciada: lotes reservados con FEFO." };
      case "cancel":
        await production.cancelProductionOrder(id);
        return { message: "Orden anulada: reservas liberadas." };
      default:
        throw new DomainError("Operación no válida.");
    }
  });
}

export async function completeOrderAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const consumed: Record<string, number> = {};
    const ids = all(fd, "consumed.productId");
    const qtys = all(fd, "consumed.qty");
    ids.forEach((id, i) => {
      const v = toNum(qtys[i] ?? "");
      if (Number.isNaN(v)) throw new DomainError("Revisa las cantidades consumidas.");
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
    const warn = await productionExpiryWarning(str(fd, "id"));
    return {
      message: warn.length
        ? `Orden completada: el lote quedó en cuarentena. Atención: vence después que ${warn.length} insumo(s); el más próximo es ${warn[0].productName}, lote ${warn[0].code} (RN-5.2).`
        : "Orden completada: el lote quedó en cuarentena hasta su liberación.",
    };
  });
}

// ───────────────────────── Calidad / lotes ─────────────────────────

export async function lotStatusAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const id = str(fd, "lotId");
    const op = str(fd, "op");
    const note = str(fd, "note");
    switch (op) {
      case "release":
        await inv.releaseLot(id, note);
        return { message: "Lote liberado: disponible para usar y despachar." };
      case "reject":
        await inv.rejectLot(id, note);
        return { message: "Lote rechazado y bloqueado." };
      case "quarantine":
        await inv.quarantineLot(id, note);
        return { message: "Lote puesto en cuarentena." };
      default:
        throw new DomainError("Operación no válida.");
    }
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
    switch (str(fd, "op")) {
      case "send":
        await purchasing.sendPurchaseOrder(id);
        return { message: "OC enviada al proveedor." };
      case "cancel":
        await purchasing.cancelPurchaseOrder(id);
        return { message: "OC anulada." };
      default:
        throw new DomainError("Operación no válida.");
    }
  });
}

export async function receiveAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const ids = all(fd, "r.lineId");
    const qtys = all(fd, "r.quantity");
    const lots = all(fd, "r.lotCode");
    const exps = all(fd, "r.expiryDate");
    const containerCounts = all(fd, "r.containers");
    const rec = await purchasing.receivePurchaseOrder({
      orderId: str(fd, "id"),
      supplierRemission: str(fd, "supplierRemission"),
      warehouseId: str(fd, "warehouseId"),
      notes: opt(fd, "notes"),
      lines: ids.map((lineId, i) => ({
        lineId,
        quantity: toNum(qtys[i] ?? "") || 0,
        lotCode: lots[i] || null,
        expiryDate: exps[i] ? parseLocalDate(exps[i]) : null,
        containers: Math.max(1, Math.floor(toNum(containerCounts[i] ?? "1") || 1)),
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
    await purchasing.addShipmentEvent(str(fd, "shipmentId"), oneOf(fd, "status", EstadoEnvio, "Estado del envío"), opt(fd, "note"), date(fd, "occurredAt"));
    return { message: "Estado del envío actualizado." };
  });
}

// ───────────────────────── Inventario ─────────────────────────

export async function adjustDownAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const adj = await inv.adjustContainerDown({
      containerId: str(fd, "containerId"),
      quantity: req(fd, "quantity", "Cantidad"),
      reason: oneOf(fd, "reason", MotivoAjuste, "Motivo"),
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
      reason: oneOf(fd, "reason", MotivoAjuste, "Motivo"),
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
    if (r.needsQuantity) return { ok: true as const, result: r };
    revalidatePath(`/conteos/${input.countId}`);
    // Solo datos simples al cliente (sin Decimal) y sin la cantidad del sistema (RF-10.3)
    return { ok: true as const, result: { needsQuantity: false as const, serial: r.serial, productName: r.productName, sealed: r.sealed } };
  } catch (e) {
    return { ok: false as const, error: errorMessage(e) };
  }
}

export async function countTransitionAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const id = str(fd, "id");
    const op = str(fd, "op");
    switch (op) {
      case "close":
        await inv.closeCycleCount(id);
        return { message: "Conteo cerrado: revisa las diferencias." };
      case "approve": {
        const comments: Record<string, string> = {};
        for (const [k, v] of fd.entries()) if (k.startsWith("comment.")) comments[k.slice(8)] = String(v);
        await inv.approveCycleCount(id, comments);
        return { message: "Conteo aprobado: ajustes generados." };
      }
      case "cancel":
        await inv.cancelCycleCount(id);
        return { message: "Conteo anulado." };
      default:
        throw new DomainError("Operación no válida.");
    }
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
  let deleted = false;
  const result = await run(async () => {
    const id = str(fd, "id");
    const op = str(fd, "op");
    switch (op) {
      case "pick":
        await dispatches.startPicking(id);
        return { message: "Bultos asignados con FEFO. Verifica cada caja con el escáner." };
      case "unpick":
        await dispatches.cancelPicking(id);
        return { message: "Alistamiento cancelado." };
      case "delete":
        await dispatches.cancelDispatch(id);
        deleted = true;
        return { message: "Despacho eliminado." };
      default:
        throw new DomainError("Operación no válida.");
    }
  });
  // La página del despacho eliminado ya no existe: se redirige desde el servidor.
  if (deleted) redirect("/despachos");
  return result;
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
    if (!(file instanceof File) || file.size === 0) throw new DomainError("Selecciona la foto o PDF de la remisión firmada.");
    if (file.size > dispatches.MAX_PROOF_BYTES) throw new DomainError("El archivo supera 2 MB.");
    const buf = Buffer.from(await file.arrayBuffer());
    await dispatches.attachProof(str(fd, "id"), `data:${file.type || "application/octet-stream"};base64,${buf.toString("base64")}`);
    return { message: "Remisión firmada adjunta (prueba de entrega)." };
  });
}

// ───────────────────────── Confirmación de propuestas del Copiloto (RN-13.1) ─────────────────────────

// Las propuestas llegan desde el navegador: se validan antes de crear cualquier documento.
const OrderProposal = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  plannedDate: z.string().nullish(),
  notes: z.string().nullish(),
});
const PurchaseProposal = z.object({
  supplierId: z.string().min(1),
  notes: z.string().nullish(),
  lines: z.array(z.object({ productId: z.string().min(1), quantity: z.number().positive(), unit: z.string().min(1), unitPrice: z.number().nonnegative() })).min(1),
});
const RecipeProposal = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  yieldQuantity: z.number().positive(),
  items: z.array(z.object({ ingredientId: z.string().min(1), quantity: z.number().positive(), unit: z.string().min(1) })).min(1),
});

function parseProposal<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new DomainError("La propuesta no es válida; pídele al Copiloto que la genere de nuevo.");
  return r.data;
}

export async function confirmOrderProposalAction(input: z.input<typeof OrderProposal>) {
  return run(async () => {
    const p = parseProposal(OrderProposal, input);
    const o = await production.createProductionOrder({
      productId: p.productId,
      quantity: p.quantity,
      plannedDate: p.plannedDate ? parseLocalDate(p.plannedDate) : null,
      notes: p.notes ?? null,
      createdByAI: true,
    });
    return { message: `Orden ${o.code} creada en borrador.`, redirect: `/produccion/${o.id}` };
  });
}

export async function confirmPurchaseProposalAction(input: z.input<typeof PurchaseProposal>) {
  return run(async () => {
    const p = parseProposal(PurchaseProposal, input);
    const po = await purchasing.createPurchaseOrder({ supplierId: p.supplierId, notes: p.notes ?? null, lines: p.lines, createdByAI: true });
    return { message: `Orden de compra ${po.code} creada en borrador.`, redirect: `/compras/${po.id}` };
  });
}

export async function confirmRecipeProposalAction(input: z.input<typeof RecipeProposal>) {
  return run(async () => {
    const p = parseProposal(RecipeProposal, input);
    const r = await production.saveRecipe({ ...p, createdByAI: true });
    return { message: "Fórmula guardada.", redirect: `/formulas/${r.productId}` };
  });
}
