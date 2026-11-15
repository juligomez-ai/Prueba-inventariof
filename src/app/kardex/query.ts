import type { Prisma, TipoMovimiento } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";

export interface KardexFilters {
  producto?: string;
  tipo?: TipoMovimiento;
  bodega?: string;
  lote?: string;
  serial?: string;
  documento?: string;
  remision?: string;
  tercero?: string;
  desde?: string;
  hasta?: string;
}

export function pickFilters(sp: Record<string, string | string[] | undefined>): KardexFilters {
  const f: Record<string, string> = {};
  for (const k of ["producto", "tipo", "bodega", "lote", "serial", "documento", "remision", "tercero", "desde", "hasta"]) {
    const v = sp[k];
    if (typeof v === "string" && v.trim()) f[k] = v.trim();
  }
  return f as KardexFilters;
}

export function kardexQuery(f: KardexFilters, take = 500) {
  const where: Prisma.StockMovementWhereInput = {
    ...(f.producto ? { productId: f.producto } : {}),
    ...(f.tipo ? { type: f.tipo } : {}),
    ...(f.bodega ? { warehouseId: f.bodega } : {}),
    ...(f.lote ? { lot: { code: { contains: f.lote, mode: "insensitive" } } } : {}),
    ...(f.serial ? { container: { serial: { contains: f.serial, mode: "insensitive" } } } : {}),
    ...(f.documento ? { documentNumber: { contains: f.documento, mode: "insensitive" } } : {}),
    ...(f.remision ? { remissionNumber: { contains: f.remision, mode: "insensitive" } } : {}),
    ...(f.tercero ? { partyName: { contains: f.tercero, mode: "insensitive" } } : {}),
    ...(f.desde || f.hasta
      ? { createdAt: { ...(f.desde ? { gte: new Date(`${f.desde}T00:00:00-05:00`) } : {}), ...(f.hasta ? { lte: new Date(`${f.hasta}T23:59:59-05:00`) } : {}) } }
      : {}),
  };
  return prisma.stockMovement.findMany({
    where,
    include: { product: true, lot: true, container: true, warehouse: true, toWarehouse: true },
    orderBy: { number: "desc" },
    take,
  });
}
