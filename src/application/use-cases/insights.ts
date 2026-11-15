import { abcFrequencyDays, classifyAbc, type AbcClass } from "@/domain/services/abc";
import { countAccuracyByValue, productionVariance } from "@/domain/services/kpis";
import { prisma } from "@/infrastructure/database/prisma";
import { startOfToday, stockSummary } from "@/infrastructure/database/stock";
import { daysBetween, n, round2 } from "@/shared/numbers";

/** Existencias valorizadas por producto (RF-3.1, RF-4.2). */
export async function inventoryRows() {
  const products = await prisma.product.findMany({ where: { archived: false }, orderBy: [{ type: "asc" }, { sku: "asc" }] });
  const summary = await stockSummary(prisma);
  const inTransit = await inTransitByProduct();
  return products.map((p) => {
    const s = summary.get(p.id) ?? { onHand: 0, reserved: 0, quarantine: 0, blocked: 0, available: 0 };
    return { product: p, ...s, inTransit: inTransit.get(p.id) ?? 0, value: round2(s.onHand * n(p.avgCost)) };
  });
}

/** Lo comprado y aún no recibido de OCs enviadas o en tránsito (RN-6.2). */
export async function inTransitByProduct() {
  const lines = await prisma.purchaseOrderLine.findMany({ where: { order: { status: { in: ["ENVIADA", "EN_TRANSITO", "RECIBIDA_PARCIAL"] } } } });
  const map = new Map<string, number>();
  for (const l of lines) map.set(l.productId, (map.get(l.productId) ?? 0) + Math.max(0, n(l.quantity) * n(l.factor) - n(l.receivedQty)));
  return map;
}

export type AlertItem = { kind: "stock" | "vencimiento" | "cuarentena" | "envio" | "despacho"; tone: "red" | "yellow"; text: string; href: string };

export async function alerts(): Promise<AlertItem[]> {
  const today = startOfToday();
  const out: AlertItem[] = [];
  for (const r of await inventoryRows()) {
    const min = n(r.product.minStock);
    if (min > 0 && r.available <= min)
      out.push({
        kind: "stock",
        tone: r.available <= n(r.product.safetyStock) ? "red" : "yellow",
        text: `${r.product.name}: disponible ${fmt(r.available)} ${r.product.baseUnit} (mínimo ${fmt(min)})${r.inTransit > 0 ? ` · ${fmt(r.inTransit)} en tránsito` : ""}`,
        href: `/productos/${r.product.id}`,
      });
  }
  const lots = await prisma.lot.findMany({
    where: { expiryDate: { lte: new Date(today.getTime() + 90 * 86_400_000) }, status: { not: "BLOQUEADO" }, containers: { some: { status: { in: ["SELLADO", "ABIERTO"] } } } },
    include: { product: true },
    orderBy: { expiryDate: "asc" },
  });
  for (const l of lots) {
    const d = daysBetween(today, l.expiryDate!);
    out.push({ kind: "vencimiento", tone: d <= 30 ? "red" : "yellow", text: `Lote ${l.code} de ${l.product.name} ${d < 0 ? `venció hace ${-d} días` : `vence en ${d} días`}`, href: `/lotes/${l.id}` });
  }
  const q = await prisma.lot.findMany({ where: { status: "CUARENTENA", containers: { some: { status: { in: ["SELLADO", "ABIERTO"] } } } }, include: { product: true } });
  for (const l of q)
    out.push({ kind: "cuarentena", tone: "yellow", text: `Lote ${l.code} de ${l.product.name} pendiente de liberación (${daysBetween(l.createdAt, new Date())} días)`, href: "/calidad" });
  const late = await prisma.purchaseOrder.findMany({
    where: { status: { in: ["ENVIADA", "EN_TRANSITO", "RECIBIDA_PARCIAL"] }, expectedDate: { lt: today } },
    include: { supplier: true },
  });
  for (const o of late)
    out.push({ kind: "envio", tone: "red", text: `${o.code} de ${o.supplier.name} retrasada: debía llegar hace ${Math.max(1, daysBetween(o.expectedDate!, today))} día(s)`, href: `/compras/${o.id}` });
  const incidents = await prisma.dispatch.findMany({ where: { status: "NOVEDAD" } });
  for (const d of incidents) out.push({ kind: "despacho", tone: "red", text: `Despacho ${d.code} a ${d.customerName} con novedad`, href: `/despachos/${d.id}` });
  return out.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "red" ? -1 : 1));
}

const fmt = (v: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(v);

/** KPIs del tablero (RF-15.1): responden las preguntas diarias del negocio. */
export async function dashboard() {
  const rows = await inventoryRows();
  const byType = { MATERIA_PRIMA: 0, EMPAQUE: 0, PRODUCTO_TERMINADO: 0 };
  for (const r of rows) byType[r.product.type] += r.value;
  const today = startOfToday();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const in30 = new Date(today.getTime() + 30 * 86_400_000);
  const ago30 = new Date(today.getTime() - 30 * 86_400_000);

  const [inProgress, completed, losses, expiring, toRelease, toDispatch, countLines] = await Promise.all([
    prisma.productionOrder.count({ where: { status: "EN_PROCESO" } }),
    prisma.productionOrder.findMany({ where: { status: "COMPLETADA", completedAt: { gte: monthStart } } }),
    prisma.stockMovement.findMany({ where: { type: { in: ["BAJA", "AJUSTE_SAL"] }, createdAt: { gte: monthStart } } }),
    prisma.lot.findMany({
      where: { expiryDate: { lte: in30 }, status: { not: "BLOQUEADO" }, containers: { some: { status: { in: ["SELLADO", "ABIERTO"] } } } },
      include: { product: true, containers: { where: { status: { in: ["SELLADO", "ABIERTO"] } } } },
    }),
    prisma.lot.findMany({ where: { status: "CUARENTENA", containers: { some: { status: { in: ["SELLADO", "ABIERTO"] } } } }, orderBy: { createdAt: "asc" } }),
    prisma.dispatch.groupBy({ by: ["status"], where: { status: { in: ["PENDIENTE", "EN_ALISTAMIENTO", "DESPACHADO", "EN_TRANSITO", "NOVEDAD"] } }, _count: true }),
    prisma.cycleCountLine.findMany({ where: { count: { status: "APROBADO", approvedAt: { gte: ago30 } } }, include: { product: true } }),
  ]);

  const production = productionVariance(
    completed.map((o) => ({ plannedQty: n(o.plannedQty), producedQty: n(o.producedQty), theoreticalCost: n(o.theoreticalCost), actualCost: n(o.actualCost) })),
  );
  const supplies = rows.filter((r) => r.product.type !== "PRODUCTO_TERMINADO" && n(r.product.minStock) > 0 && r.available <= n(r.product.minStock));
  const dispatchCount = (s: string[]) => toDispatch.filter((d) => s.includes(d.status)).reduce((a, d) => a + d._count, 0);

  return {
    value: { ...byType, total: round2(byType.MATERIA_PRIMA + byType.EMPAQUE + byType.PRODUCTO_TERMINADO) },
    production: { orders: completed.length, inProgress, actual: round2(production.actual), variance: round2(production.variance), variancePct: round2(production.variancePct) },
    losses: { value: round2(-losses.reduce((s, m) => s + n(m.totalValue), 0)), movements: losses.length },
    supplies: { count: supplies.length, critical: supplies.filter((r) => r.available <= n(r.product.safetyStock)).length, inTransit: supplies.filter((r) => r.inTransit > 0).length },
    expiring: {
      count: expiring.length,
      expired: expiring.filter((l) => l.expiryDate! < today).length,
      value: round2(expiring.reduce((s, l) => s + l.containers.reduce((a, c) => a + n(c.currentQty), 0) * n(l.product.avgCost), 0)),
    },
    toRelease: { count: toRelease.length, oldestDays: toRelease[0] ? daysBetween(toRelease[0].createdAt, new Date()) : 0 },
    toDispatch: { pending: dispatchCount(["PENDIENTE", "EN_ALISTAMIENTO"]), onTheWay: dispatchCount(["DESPACHADO", "EN_TRANSITO"]), incidents: dispatchCount(["NOVEDAD"]) },
    accuracy: {
      value: countAccuracyByValue(countLines.map((l) => ({ systemQty: n(l.systemQty), countedQty: n(l.countedQty), unitCost: n(l.product.avgCost) }))),
      lines: countLines.length,
      counts: new Set(countLines.map((l) => l.countId)).size,
    },
  };
}

/** ABC + sugerencia de conteo (RF-10.1). */
export async function abcSuggestions(warehouseId?: string) {
  const rows = await inventoryRows();
  const cls = classifyAbc(rows.map((r) => ({ id: r.product.id, value: r.value })));
  const lastCounted = await prisma.cycleCountLine.groupBy({
    by: ["productId"],
    where: { count: { status: "APROBADO" } },
    _max: { scannedAt: true },
  });
  const last = new Map(lastCounted.map((l) => [l.productId, l._max.scannedAt]));
  const inWarehouse = warehouseId
    ? new Set((await prisma.container.findMany({ where: { warehouseId, status: { in: ["SELLADO", "ABIERTO"] } }, select: { productId: true } })).map((c) => c.productId))
    : null;
  const today = new Date();
  return rows
    .filter((r) => r.onHand > 0 && (!inWarehouse || inWarehouse.has(r.product.id)))
    .map((r) => {
      const c = (cls.get(r.product.id) ?? "C") as AbcClass;
      const lastDate = last.get(r.product.id) ?? null;
      const due = !lastDate || daysBetween(lastDate, today) >= abcFrequencyDays[c];
      return { ...r, abc: c, lastCounted: lastDate, due };
    })
    .sort((a, b) => a.abc.localeCompare(b.abc) || b.value - a.value);
}
