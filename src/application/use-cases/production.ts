import { allocate } from "@/domain/services/allocation";
import { productionLotCode, splitIntoPacks } from "@/domain/services/codes";
import { maxProducible, requirements } from "@/domain/services/requirements";
import { toBase } from "@/domain/services/units";
import { inTransaction, nextSequence, pad, prisma, type Db, type Tx } from "@/infrastructure/database/prisma";
import { availableContainers, availableQty, postEntry, postExit } from "@/infrastructure/database/stock";
import { DomainError } from "@/shared/errors";
import { n, round2, round4 } from "@/shared/numbers";
import { CURRENT_USER } from "@/shared/user";

// ───────────────────────── Fórmulas (M8) ─────────────────────────

export interface RecipeInput {
  productId: string;
  name: string;
  yieldQuantity: number;
  instructions?: string | null;
  items: { ingredientId: string; quantity: number; unit: string }[];
  createdByAI?: boolean;
}

export async function saveRecipe(input: RecipeInput) {
  if (!input.name.trim()) throw new DomainError("El nombre de la fórmula es obligatorio.");
  if (!(input.yieldQuantity > 0)) throw new DomainError("El rendimiento debe ser mayor que cero.");
  const items = input.items.filter((i) => i.ingredientId && i.quantity > 0);
  if (items.length === 0) throw new DomainError("Agrega al menos un insumo con cantidad.");
  if (new Set(items.map((i) => i.ingredientId)).size !== items.length) throw new DomainError("Hay insumos repetidos en la fórmula.");

  return inTransaction(async (tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
    if (product.type !== "PRODUCTO_TERMINADO") throw new DomainError("Solo los productos terminados tienen fórmula.");
    const converted = [];
    for (const i of items) {
      const ing = await tx.product.findUniqueOrThrow({ where: { id: i.ingredientId } });
      // RN-8.1: solo insumos y empaques
      if (ing.type === "PRODUCTO_TERMINADO") throw new DomainError(`${ing.name} es producto terminado y no puede ser insumo.`);
      converted.push({ ingredientId: ing.id, quantity: round4(toBase(i.quantity, i.unit, ing.baseUnit)) });
    }
    const data = { name: input.name.trim(), yieldQuantity: input.yieldQuantity, instructions: input.instructions, createdByAI: input.createdByAI ?? false };
    const existing = await tx.recipe.findUnique({ where: { productId: product.id } });
    if (existing) {
      // RN-8.3: las OPs existentes guardaron su copia; editar no las afecta.
      await tx.recipeItem.deleteMany({ where: { recipeId: existing.id } });
      return tx.recipe.update({ where: { id: existing.id }, data: { ...data, items: { create: converted } } });
    }
    return tx.recipe.create({ data: { ...data, productId: product.id, items: { create: converted } } });
  });
}

/** Costo en vivo de la fórmula con los costos promedio actuales (RF-4.5, RF-8.3). */
export async function recipeCost(recipeId: string, db: Db = prisma) {
  const r = await db.recipe.findUniqueOrThrow({ where: { id: recipeId }, include: { items: { include: { ingredient: true } }, product: true } });
  const lines = r.items.map((i) => {
    const qty = n(i.quantity);
    const cost = n(i.ingredient.avgCost);
    return { ingredient: i.ingredient, quantity: qty, unitCost: cost, total: round2(qty * cost) };
  });
  const batch = round2(lines.reduce((s, l) => s + l.total, 0));
  const yieldQty = n(r.yieldQuantity);
  return { recipe: r, lines, batchCost: batch, unitCost: yieldQty > 0 ? round2(batch / yieldQty) : 0 };
}

// ───────────────────────── Factibilidad (RF-9.3) ─────────────────────────

export async function checkFeasibility(productId: string, quantity: number, opts: { excludeOrderId?: string; db?: Db } = {}) {
  const db = opts.db ?? prisma;
  const recipe = await db.recipe.findUnique({ where: { productId }, include: { items: { include: { ingredient: true } }, product: true } });
  if (!recipe) throw new DomainError("El producto no tiene fórmula. Créala primero.");
  const yieldQty = n(recipe.yieldQuantity);
  const lines = recipe.items.map((i) => ({ productId: i.ingredientId, quantity: n(i.quantity) }));
  const req = requirements(lines, yieldQty, quantity);
  const available = new Map<string, number>();
  for (const l of lines) available.set(l.productId, await availableQty(db, l.productId, { excludeOrderId: opts.excludeOrderId }));

  const rows = recipe.items.map((i) => {
    const required = req.find((r) => r.productId === i.ingredientId)!.required;
    const avail = available.get(i.ingredientId) ?? 0;
    return {
      productId: i.ingredientId,
      sku: i.ingredient.sku,
      name: i.ingredient.name,
      unit: i.ingredient.baseUnit,
      required,
      available: avail,
      shortage: round4(Math.max(0, required - avail)),
      unitCost: n(i.ingredient.avgCost),
      leadTimeDays: i.ingredient.leadTimeDays,
      preferredSupplierId: i.ingredient.preferredSupplierId,
    };
  });
  const estimatedCost = round2(rows.reduce((s, r) => s + r.required * r.unitCost, 0));
  return {
    recipe,
    product: recipe.product,
    quantity,
    rows,
    feasible: rows.every((r) => r.shortage <= 0),
    maxProducible: maxProducible(lines, yieldQty, available, recipe.product.baseUnit === "und"),
    estimatedCost,
    estimatedUnitCost: quantity > 0 ? round2(estimatedCost / quantity) : 0,
  };
}

// ───────────────────────── Órdenes de producción (M9) ─────────────────────────

export async function createProductionOrder(input: {
  productId: string;
  quantity: number;
  plannedDate?: Date | null;
  notes?: string | null;
  createdByAI?: boolean;
}) {
  if (!(input.quantity > 0)) throw new DomainError("La cantidad a producir debe ser mayor que cero.");
  return inTransaction(async (tx) => {
    const recipe = await tx.recipe.findUnique({ where: { productId: input.productId }, include: { items: { include: { ingredient: true } }, product: true } });
    if (!recipe) throw new DomainError("El producto no tiene fórmula.");
    if (recipe.product.baseUnit === "und" && !Number.isInteger(input.quantity)) throw new DomainError("La cantidad debe ser un número entero de unidades.");
    const req = requirements(
      recipe.items.map((i) => ({ productId: i.ingredientId, quantity: n(i.quantity) })),
      n(recipe.yieldQuantity),
      input.quantity,
    );
    const theoretical = round2(recipe.items.reduce((s, i) => s + req.find((r) => r.productId === i.ingredientId)!.required * n(i.ingredient.avgCost), 0));
    const code = `OP-${pad(await nextSequence(tx, "OP"))}`;
    return tx.productionOrder.create({
      data: {
        code,
        productId: input.productId,
        recipeId: recipe.id,
        plannedQty: input.quantity,
        plannedDate: input.plannedDate,
        notes: input.notes,
        createdByAI: input.createdByAI ?? false,
        theoreticalCost: theoretical,
        // RN-8.3: copia de la fórmula al crear la OP
        lines: { create: req.map((r) => ({ productId: r.productId, plannedQty: r.required })) },
      },
    });
  });
}

/** Iniciar: valida stock y reserva bultos con FEFO (RF-9.5, RN-9.1). */
export async function startProductionOrder(id: string) {
  return inTransaction(async (tx) => {
    const o = await tx.productionOrder.findUniqueOrThrow({ where: { id }, include: { lines: { include: { product: true } } } });
    if (o.status !== "BORRADOR") throw new DomainError("Solo se inicia una OP en borrador.");
    const shortages: string[] = [];
    const reservations: { containerId: string; productId: string; quantity: number }[] = [];
    for (const l of o.lines) {
      const { picks, shortage } = allocate(await availableContainers(tx, l.productId), n(l.plannedQty));
      if (shortage > 0) shortages.push(`${l.product.name}: faltan ${round4(shortage)} ${l.product.baseUnit}`);
      for (const p of picks) reservations.push({ containerId: p.container.id, productId: l.productId, quantity: p.quantity });
    }
    if (shortages.length) throw new DomainError(`No hay stock disponible suficiente. ${shortages.join(" · ")}`);
    await tx.reservation.createMany({ data: reservations.map((r) => ({ ...r, orderId: o.id })) });
    return tx.productionOrder.update({ where: { id }, data: { status: "EN_PROCESO", startedAt: new Date() } });
  });
}

/** Anular: libera reservas y no genera movimientos (RN-9.3). */
export async function cancelProductionOrder(id: string) {
  return inTransaction(async (tx) => {
    const o = await tx.productionOrder.findUniqueOrThrow({ where: { id } });
    if (o.status !== "BORRADOR" && o.status !== "EN_PROCESO") throw new DomainError("La OP ya está cerrada.");
    await tx.reservation.deleteMany({ where: { orderId: id } });
    return tx.productionOrder.update({ where: { id }, data: { status: "ANULADA" } });
  });
}

/**
 * Completar (RF-9.6, RF-9.7): en una sola transacción consume lo real por insumo
 * (primero lo reservado, luego FEFO), crea el lote del terminado en CUARENTENA,
 * lo empaca en bultos serializados y lo ingresa con su costo real.
 */
export async function completeProductionOrder(input: {
  orderId: string;
  producedQty: number;
  consumed: Record<string, number>; // productId → cantidad real en unidad base
  packSize?: number | null;
  lotCode?: string | null;
  warehouseId: string;
}) {
  if (!(input.producedQty > 0)) throw new DomainError("Indica las unidades buenas producidas.");
  return inTransaction(async (tx) => {
    const o = await tx.productionOrder.findUniqueOrThrow({
      where: { id: input.orderId },
      include: { product: true, lines: { include: { product: true } }, reservations: { include: { container: { include: { lot: true } } } } },
    });
    if (o.status !== "EN_PROCESO") throw new DomainError("Solo se completa una OP en proceso.");
    if (o.product.baseUnit === "und" && !Number.isInteger(input.producedQty)) throw new DomainError("Las unidades producidas deben ser un número entero.");
    const doc = { documentType: "OP" as const, documentId: o.id, documentNumber: o.code };

    let actualCost = 0;
    for (const l of o.lines) {
      const qty = round4(input.consumed[l.productId] ?? n(l.plannedQty));
      if (qty < 0) throw new DomainError("El consumo no puede ser negativo.");
      let pending = qty;
      // 1) lo reservado para esta OP, en orden FEFO
      const reserved = o.reservations.filter((r) => r.productId === l.productId);
      const ordered = allocate(
        reserved.map((r) => ({ id: r.containerId, available: n(r.quantity), expiryDate: r.container.lot?.expiryDate ?? null, createdAt: r.container.createdAt })),
        pending,
      );
      const picks = ordered.picks.map((p) => ({ containerId: p.container.id, quantity: p.quantity }));
      pending = ordered.shortage;
      // 2) si se consumió más de lo planeado, más bultos FEFO
      if (pending > 0) {
        const extra = allocate(await availableContainers(tx, l.productId, { excludeOrderId: o.id }), pending);
        if (extra.shortage > 0) throw new DomainError(`${l.product.name}: no hay stock para consumir ${qty} ${l.product.baseUnit}.`);
        picks.push(...extra.picks.map((p) => ({ containerId: p.container.id, quantity: p.quantity })));
      }
      let lineCost = 0;
      for (const p of picks) {
        const m = await postExit(tx, { type: "SAL_CONSUMO", containerId: p.containerId, quantity: p.quantity, doc });
        lineCost += -n(m.totalValue);
      }
      actualCost += lineCost;
      await tx.productionLine.update({ where: { id: l.id }, data: { consumedQty: qty, unitCost: qty > 0 ? round4(lineCost / qty) : n(l.product.avgCost) } });
    }
    await tx.reservation.deleteMany({ where: { orderId: o.id } });

    // Lote del producto terminado (RF-5.2) en CUARENTENA (RF-5.8)
    const now = new Date();
    const lotNumber = await nextSequence(tx, `LOTE:${o.product.sku}:${productionLotCode(o.product.sku, now, 0)}`);
    const lotCode = input.lotCode?.trim() || productionLotCode(o.product.sku, now, lotNumber);
    if (await tx.lot.findUnique({ where: { productId_code: { productId: o.productId, code: lotCode } } }))
      throw new DomainError(`Ya existe el lote ${lotCode}.`);
    const expiryDate = o.product.shelfLifeDays ? new Date(now.getTime() + o.product.shelfLifeDays * 86_400_000) : null;
    const lot = await tx.lot.create({
      data: { productId: o.productId, code: lotCode, expiryDate, status: "CUARENTENA", sourceType: "PRODUCCION", sourceRef: o.code, productionOrderId: o.id },
    });
    await tx.lotStatusChange.create({
      data: { lotId: lot.id, fromStatus: "CUARENTENA", toStatus: "CUARENTENA", reason: `Lote producido en ${o.code}: pendiente de liberación por control de calidad`, userName: CURRENT_USER },
    });
    // RN-5.2 se evalúa al terminar (ver productionExpiryWarning en traceability.ts) y se muestra en la OP y el lote.
    actualCost = round2(actualCost);
    const unitCost = round4(actualCost / input.producedQty);
    await postEntry(tx, {
      type: "ENT_PRODUCCION",
      productId: o.productId,
      warehouseId: input.warehouseId,
      lotId: lot.id,
      packs: splitIntoPacks(input.producedQty, input.packSize ?? n(o.product.defaultPackSize)),
      unitCost,
      sourceType: "PRODUCCION",
      doc,
    });
    return tx.productionOrder.update({
      where: { id: o.id },
      data: { status: "COMPLETADA", producedQty: input.producedQty, actualCost, completedAt: now },
    });
  });
}

export type Feasibility = Awaited<ReturnType<typeof checkFeasibility>>;
export type { Tx };
