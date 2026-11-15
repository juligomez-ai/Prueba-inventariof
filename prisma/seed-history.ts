/**
 * Historia de ejemplo de 6 meses (semana a semana) para que las gráficas del tablero
 * puedan comparar períodos. Todo se registra con los mismos casos de uso de la aplicación
 * (Kardex, costos y bultos consistentes) y después se le asigna la fecha simulada.
 *
 * Reglas de la simulación:
 * - Demanda semanal por producto con temporadas: Día de la Madre (mayo), Amor y Amistad (septiembre)
 *   y temporada de regalos (noviembre-diciembre).
 * - Se produce cuando el stock no cubre ~2,5 semanas de demanda; antes se compran los insumos faltantes
 *   al proveedor preferido. Los precios suben ~0,5 % al mes con variación de ±3 %.
 * - Despachos a varios clientes, entregados dos días después.
 * - Cada 4 semanas: una baja por daño y un conteo cíclico de empaques.
 */
import type { PrismaClient, Product } from "@prisma/client";
import * as dispatches from "@/application/use-cases/dispatches";
import * as inv from "@/application/use-cases/inventory";
import * as production from "@/application/use-cases/production";
import * as purchasing from "@/application/use-cases/purchasing";
import { productionLotCode } from "@/domain/services/codes";
import { availableContainers, availableQty } from "@/infrastructure/database/stock";

const day = 86_400_000;

/** Generador pseudoaleatorio con semilla: la historia sale igual en cada carga. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Tablas y columnas de fecha que se re-fechan al valor simulado. */
const DATE_COLUMNS: [string, string[]][] = [
  ["StockMovement", ["createdAt"]],
  ["Container", ["createdAt", "openedAt"]],
  ["Lot", ["createdAt"]],
  ["LotStatusChange", ["createdAt"]],
  ["PurchaseOrder", ["createdAt", "sentAt"]],
  ["Receipt", ["createdAt"]],
  ["Shipment", ["createdAt"]],
  ["ShipmentEvent", ["occurredAt"]],
  ["ProductionOrder", ["createdAt", "startedAt", "completedAt"]],
  ["Dispatch", ["createdAt", "shippedAt", "deliveredAt"]],
  ["CycleCount", ["createdAt", "closedAt", "approvedAt"]],
  ["CycleCountLine", ["scannedAt"]],
  ["Adjustment", ["createdAt"]],
];

export function makeClock(prisma: PrismaClient) {
  /** Ejecuta `fn` y re-fecha a `date` todo lo que se creó o actualizó mientras corría. */
  return async function at<T>(date: Date, fn: () => Promise<T>): Promise<T> {
    const t0 = new Date(Date.now() - 5);
    const r = await fn();
    for (const [table, cols] of DATE_COLUMNS)
      for (const c of cols) await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "${c}" = $1 WHERE "${c}" >= $2`, date, t0);
    return r;
  };
}

interface Ctx {
  prisma: PrismaClient;
  P: Record<string, Product>;
  W: Record<"MP" | "EMP" | "PROD" | "PT", { id: string }>;
  S: Record<string, { id: string }>;
  C: Record<string, { id: string }>;
  baseCost: Map<string, number>;
  start: Date; // fecha del inventario inicial
  untilDaysAgo: number; // la historia termina hace N días
}

export const SEASON: Record<number, number> = { 0: 0.8, 1: 0.9, 2: 1.0, 3: 1.0, 4: 1.45, 5: 1.1, 6: 1.0, 7: 0.95, 8: 1.25, 9: 1.05, 10: 1.35, 11: 1.6 };

const CUSTOMERS = [
  { customerName: "Tienda Naturista Vida Sana S.A.S.", customerTaxId: "901.555.210-4", address: "Cra. 43A # 7-50, local 102", city: "Medellín" },
  { customerName: "Farmacia Botánica El Poblado S.A.S.", customerTaxId: "900.888.432-1", address: "Calle 10 # 35-20", city: "Medellín" },
  { customerName: "Tiendas Orgánicas Medellín S.A.S.", customerTaxId: "901.222.900-7", address: "Cl. 33 # 76-12", city: "Medellín" },
  { customerName: "Spa Raíz Natural", customerTaxId: "1.036.555.888", address: "Cra. 70 # 44-10", city: "Envigado" },
  { customerName: "Venta en línea (tienda virtual)", customerTaxId: "222.222.222", address: "Varios destinos", city: "Bogotá" },
];

export function createSimulator(ctx: Ctx) {
  const { prisma, P, W, S, C } = ctx;
  const at = makeClock(prisma);
  const rand = rng(20261114);
  const noise = (spread: number) => 1 + (rand() * 2 - 1) * spread;
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const carriers = Object.values(C);

  /** Precio de compra: costo base con inflación ~0,5 %/mes y ±3 %. */
  const priceOn = (productId: string, date: Date) => {
    const months = (date.getTime() - ctx.start.getTime()) / (30 * day);
    return Math.round((ctx.baseCost.get(productId) ?? 1000) * (1 + 0.005 * months) * noise(0.03));
  };

  /** Compra y recibe los insumos que faltan para producir `qty` (más un colchón). */
  async function buyFor(pt: Product, qty: number, date: Date) {
    const f = await production.checkFeasibility(pt.id, qty * 2); // colchón: cubre dos producciones
    const short = f.rows.filter((r) => r.shortage > 0);
    if (!short.length) return;
    const bySupplier = new Map<string, typeof short>();
    for (const r of short) {
      const sup = r.preferredSupplierId ?? Object.values(S)[0].id;
      bySupplier.set(sup, [...(bySupplier.get(sup) ?? []), r]);
    }
    for (const [supplierId, rows] of bySupplier) {
      const lines = rows.map((r) => {
        const unit = r.unit;
        const quantity = unit === "und" ? Math.ceil(r.shortage / 50) * 50 : Math.ceil(r.shortage * 2) / 2;
        return { productId: r.productId, quantity, unit, unitPrice: priceOn(r.productId, date) };
      });
      const po = await at(new Date(date.getTime() - 4 * day), async () => {
        const o = await purchasing.createPurchaseOrder({ supplierId, lines, expectedDate: date });
        await purchasing.sendPurchaseOrder(o.id);
        return o;
      });
      const sh = await at(new Date(date.getTime() - 2 * day), () =>
        purchasing.addShipment({ purchaseOrderId: po.id, carrierId: pick(carriers).id, trackingNumber: String(Math.floor(1e9 + rand() * 9e9)), shippedAt: new Date(date.getTime() - 2 * day), eta: date }),
      );
      await at(date, async () => {
        await purchasing.addShipmentEvent(sh.id, "ENTREGADO", "Recibido en bodega", date);
        const poLines = await prisma.purchaseOrderLine.findMany({ where: { orderId: po.id }, include: { product: true } });
        await purchasing.receivePurchaseOrder({
          orderId: po.id,
          supplierRemission: `RM-${Math.floor(10000 + rand() * 89999)}`,
          warehouseId: poLines[0].product.type === "EMPAQUE" ? W.EMP.id : W.MP.id,
          lines: poLines.map((l) => ({
            lineId: l.id,
            quantity: Number(l.quantity),
            lotCode: l.product.tracksLot ? `${l.product.sku.replace("MP-", "")}-${Math.floor(1000 + rand() * 8999)}` : null,
            expiryDate: l.product.tracksExpiry ? new Date(date.getTime() + (420 + Math.floor(rand() * 240)) * day) : null,
            containers: l.product.baseUnit === "und" ? Math.max(1, Math.ceil(Number(l.quantity) / 200)) : Math.max(1, Math.ceil(Number(l.quantity) / 5)),
          })),
        });
      });
    }
  }

  let lotSeq = 0;
  /** Produce, completa con merma pequeña y libera el lote dos días después. */
  async function produce(pt: Product, qty: number, date: Date) {
    const recipe = await prisma.recipe.findUniqueOrThrow({ where: { productId: pt.id } });
    const op = await at(date, async () => {
      const o = await production.createProductionOrder({ productId: pt.id, quantity: qty, plannedDate: date });
      try {
        await production.startProductionOrder(o.id);
      } catch (e) {
        await production.cancelProductionOrder(o.id); // no deja órdenes huérfanas en borrador
        throw e;
      }
      const good = Math.max(1, Math.round(qty * (0.97 + rand() * 0.03)));
      await production.completeProductionOrder({
        orderId: o.id,
        producedQty: good,
        consumed: {},
        warehouseId: W.PT.id,
        lotCode: productionLotCode(pt.sku, date, ++lotSeq % 90 + 10),
      });
      return o;
    });
    const lot = await prisma.lot.findFirstOrThrow({ where: { productionOrderId: op.id } });
    await prisma.lot.update({ where: { id: lot.id }, data: { expiryDate: new Date(date.getTime() + (pt.shelfLifeDays ?? 365) * day) } });
    await at(new Date(date.getTime() + 2 * day), () => inv.releaseLot(lot.id, "pH, olor, textura y llenado conformes. Liberado."));
    void recipe;
  }

  /** Despacha hasta `qty` unidades (lo que haya liberado y con vida útil suficiente). */
  async function sell(pt: Product, qty: number, date: Date) {
    const minExpiry = new Date(Date.now() + dispatches.MIN_SHELF_LIFE_DAYS * day);
    const usable = (await availableContainers(prisma, pt.id)).filter((c) => !c.expiryDate || c.expiryDate >= minExpiry);
    const avail = Math.floor(usable.reduce((s, c) => s + c.available, 0));
    const q = Math.min(qty, avail);
    if (q <= 0) return;
    const d = await at(date, async () => {
      const r = await dispatches.createDispatch({ ...pick(CUSTOMERS), salesRef: `FE-${Math.floor(1000 + rand() * 8000)}`, lines: [{ productId: pt.id, quantity: q }] });
      await dispatches.startPicking(r.id);
      await dispatches.shipDispatch({ dispatchId: r.id, carrierId: pick(carriers).id, trackingNumber: String(Math.floor(7e11 + rand() * 1e11)), eta: new Date(date.getTime() + 2 * day), freightCost: 12000 + Math.round(rand() * 10) * 1000, requireAllPicked: false });
      return r;
    });
    const sh = await prisma.shipment.findFirstOrThrow({ where: { dispatchId: d.id } });
    const delivered = new Date(date.getTime() + 2 * day);
    await at(delivered, () => purchasing.addShipmentEvent(sh.id, "ENTREGADO", "Entregado al cliente", delivered));
  }

  return { at, buyFor, run: () => run() };

  async function run() {
  const pts = [
    { p: P.crema, demand: 38, yield: 100 },
    { p: P.balsamo, demand: 45, yield: 100 },
    { p: P.jabon, demand: 26, yield: 20 },
    { p: P.serum, demand: 14, yield: 50 },
  ];
  const firstWeek = Math.floor((Date.now() - ctx.start.getTime()) / (7 * day)) - 1;

  for (let w = firstWeek; w * 7 >= ctx.untilDaysAgo; w--) {
    const monday = new Date(Date.now() - w * 7 * day);
    monday.setHours(9, 0, 0, 0);
    const season = SEASON[monday.getMonth()];

    const plan = [];
    for (const { p, demand, yield: y } of pts) {
      const weekly = Math.round(demand * season * noise(0.15));
      // Producción cuando el stock no cubre ~2,5 semanas de demanda
      const free = await availableQty(prisma, p.id);
      const quarantine = await prisma.container.aggregate({ where: { productId: p.id, status: { in: ["SELLADO", "ABIERTO"] }, lot: { status: "CUARENTENA" } }, _sum: { currentQty: true } });
      const stock = free + Number(quarantine._sum.currentQty ?? 0);
      const target = weekly * 2.5;
      plan.push({ p, weekly, produce: stock < target ? Math.ceil((target - stock) / y) * y : 0 });
    }
    // Fase 1 (lunes): compras de insumos · Fase 2 (martes): producción · Fase 3 (jue-vie): despachos
    for (const x of plan) if (x.produce) await buyFor(x.p, x.produce, monday);
    for (const x of plan)
      if (x.produce) {
        try {
          await produce(x.p, x.produce, new Date(monday.getTime() + day));
        } catch {
          // Si dos productos compitieron por el mismo insumo, se compra lo faltante y se reintenta
          await buyFor(x.p, x.produce, new Date(monday.getTime() + day));
          await produce(x.p, x.produce, new Date(monday.getTime() + day));
        }
      }
    // Jueves y viernes: los productos con más demanda se despachan en dos días
    for (let i = 0; i < 2; i++)
      for (const x of plan) {
        const parts = x.weekly > 30 ? 2 : 1;
        if (i < parts) await sell(x.p, Math.round(x.weekly / parts), new Date(monday.getTime() + (3 + i) * day));
      }

    // Cada 4 semanas: baja por daño y conteo cíclico de empaques
    if (w % 4 === 0) {
      const ptLot = await prisma.container.findFirst({ where: { productId: P.crema.id, status: { in: ["SELLADO", "ABIERTO"] }, lot: { status: "DISPONIBLE" } }, orderBy: { createdAt: "asc" } });
      if (ptLot && Number(ptLot.currentQty) >= 3)
        await at(new Date(monday.getTime() + 4 * day), () => inv.adjustContainerDown({ containerId: ptLot.id, quantity: 1 + Math.floor(rand() * 3), reason: "DANADO", notes: "Frasco golpeado en alistamiento" }));
      await at(new Date(monday.getTime() + 5 * day), async () => {
        const products = [P.frasco, P.tapa, P.tubo];
        const cc = await inv.createCycleCount({ warehouseId: W.EMP.id, productIds: products.map((x) => x.id), notes: "Conteo mensual de empaques" });
        const containers = await prisma.container.findMany({ where: { warehouseId: W.EMP.id, productId: { in: products.map((x) => x.id) }, status: { in: ["SELLADO", "ABIERTO"] } } });
        for (const c of containers) {
          if (c.status === "SELLADO") await inv.recordScan({ countId: cc.id, code: c.serial, sealIntact: true });
          else {
            const diff = rand() < 0.4 ? -(1 + Math.floor(rand() * 4)) : 0;
            await inv.recordScan({ countId: cc.id, code: c.serial, countedQty: Math.max(0, Number(c.currentQty) + diff), comment: diff ? "Unidades averiadas sin reportar" : null });
          }
        }
        await inv.closeCycleCount(cc.id);
        await inv.approveCycleCount(cc.id);
      });
    }
  }
}
}
