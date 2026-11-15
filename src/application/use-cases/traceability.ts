import { expiryConflicts } from "@/domain/services/expiry";
import { prisma } from "@/infrastructure/database/prisma";
import { n, round4 } from "@/shared/numbers";

/**
 * Trazabilidad de un lote (RF-5.4 y RF-5.5).
 * Hacia atrás: insumos y proveedores usados para producirlo.
 * Hacia adelante: OPs donde se consumió, lotes resultantes y clientes a los que se despachó.
 */
export async function lotTraceability(lotId: string) {
  const lot = await prisma.lot.findUniqueOrThrow({ where: { id: lotId }, include: { product: true, supplier: true, productionOrder: true } });

  const backward = lot.productionOrder
    ? await prisma.stockMovement.findMany({
        where: { documentType: "OP", documentId: lot.productionOrder.id, type: "SAL_CONSUMO" },
        include: { product: true, lot: { include: { supplier: true } }, container: true },
        orderBy: { number: "asc" },
      })
    : [];

  const consumptions = await prisma.stockMovement.findMany({ where: { lotId, type: "SAL_CONSUMO" } });
  const orderIds = [...new Set(consumptions.map((m) => m.documentId))];
  const usedIn = await prisma.productionOrder.findMany({ where: { id: { in: orderIds } }, include: { product: true, outputLot: true } });
  const usedInRows = usedIn.map((o) => ({
    order: o,
    quantity: round4(-consumptions.filter((m) => m.documentId === o.id).reduce((s, m) => s + n(m.quantity), 0)),
  }));

  // Clientes: salidas del propio lote y de los lotes que se produjeron con él
  const lotIds = [lotId, ...usedIn.map((o) => o.outputLot?.id).filter((x): x is string => Boolean(x))];
  const sales = await prisma.stockMovement.findMany({
    where: { lotId: { in: lotIds }, type: "SAL_VENTA" },
    include: { lot: true, product: true },
    orderBy: { number: "asc" },
  });
  return { lot, backward, usedIn: usedInRows, sales };
}

/** RN-5.2: lotes de insumo usados en la OP que vencen antes que el lote producido. */
export async function productionExpiryWarning(orderId: string) {
  const order = await prisma.productionOrder.findUnique({ where: { id: orderId }, include: { outputLot: true } });
  if (!order?.outputLot?.expiryDate) return [];
  const moves = await prisma.stockMovement.findMany({
    where: { documentType: "OP", documentId: orderId, type: "SAL_CONSUMO", lotId: { not: null } },
    include: { lot: true, product: true },
  });
  const lots = new Map(moves.filter((m) => m.lot).map((m) => [m.lot!.id, { code: m.lot!.code, expiryDate: m.lot!.expiryDate, productName: m.product.name, lotId: m.lot!.id }]));
  return expiryConflicts(order.outputLot.expiryDate, [...lots.values()]);
}
