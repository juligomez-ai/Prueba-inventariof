import type { TipoBodega, TipoProducto } from "@prisma/client";
import { BASE_UNITS } from "@/domain/services/units";
import { inTransaction, prisma } from "@/infrastructure/database/prisma";
import { DomainError } from "@/shared/errors";

export interface ProductInput {
  sku: string;
  name: string;
  shortName?: string | null;
  category: string;
  type: TipoProducto;
  baseUnit: string;
  barcode?: string | null;
  tracksLot: boolean;
  tracksExpiry: boolean;
  shelfLifeDays?: number | null;
  minStock: number;
  safetyStock: number;
  leadTimeDays: number;
  salePrice?: number | null;
  nsoCode?: string | null;
  nsoExpiry?: Date | null;
  defaultPackSize?: number | null;
  preferredSupplierId?: string | null;
  conversions?: { unit: string; factor: number }[];
}

function validate(p: ProductInput) {
  if (!p.sku.trim() || !p.name.trim()) throw new DomainError("SKU y nombre son obligatorios.");
  if (!(BASE_UNITS as readonly string[]).includes(p.baseUnit)) throw new DomainError("Unidad base inválida.");
  if (p.tracksExpiry && !p.tracksLot) throw new DomainError("Para controlar vencimiento el producto debe controlar lote.");
  if (p.type === "PRODUCTO_TERMINADO" && p.tracksExpiry && !p.shelfLifeDays)
    throw new DomainError("Indica la vida útil en días para calcular el vencimiento al producir.");
}

export async function saveProduct(input: ProductInput, id?: string) {
  validate(input);
  const sku = input.sku.trim().toUpperCase();
  const { conversions = [], ...rest } = input;
  const data = { ...rest, sku, barcode: input.barcode?.trim() || null, shortName: input.shortName?.trim() || null };
  return inTransaction(async (tx) => {
    const dupSku = await tx.product.findFirst({ where: { sku, ...(id ? { id: { not: id } } : {}) } });
    if (dupSku) throw new DomainError(`Ya existe un producto con SKU ${sku}.`);
    if (data.barcode) {
      const dupBc = await tx.product.findFirst({ where: { barcode: data.barcode, ...(id ? { id: { not: id } } : {}) } });
      if (dupBc) throw new DomainError(`El código de barras ya está asignado a ${dupBc.name}.`);
    }
    if (id) {
      const current = await tx.product.findUniqueOrThrow({ where: { id } });
      const hasMovements = (await tx.stockMovement.count({ where: { productId: id } })) > 0;
      // RN-1.3: la unidad base no cambia si ya hay movimientos
      if (hasMovements && current.baseUnit !== data.baseUnit)
        throw new DomainError("No se puede cambiar la unidad base de un producto con movimientos.");
      if (hasMovements && current.tracksLot !== data.tracksLot)
        throw new DomainError("No se puede cambiar el control de lote de un producto con movimientos.");
      await tx.unitConversion.deleteMany({ where: { productId: id } });
      return tx.product.update({ where: { id }, data: { ...data, conversions: { create: conversions } } });
    }
    return tx.product.create({ data: { ...data, conversions: { create: conversions } } });
  });
}

/** RN-1.2: nunca se elimina un producto, solo se archiva. */
export async function setArchived(id: string, archived: boolean) {
  return prisma.product.update({ where: { id }, data: { archived } });
}

export async function saveWarehouse(input: { code: string; name: string; type: TipoBodega; active: boolean }, id?: string) {
  const code = input.code.trim().toUpperCase();
  if (!code || !input.name.trim()) throw new DomainError("Código y nombre son obligatorios.");
  const dup = await prisma.warehouse.findFirst({ where: { code, ...(id ? { id: { not: id } } : {}) } });
  if (dup) throw new DomainError(`Ya existe la bodega ${code}.`);
  return id
    ? prisma.warehouse.update({ where: { id }, data: { ...input, code } })
    : prisma.warehouse.create({ data: { ...input, code } });
}

export async function saveSupplier(
  input: { taxId: string; name: string; contactName?: string; phone?: string; email?: string; city?: string; paymentTermDays: number; leadTimeDays: number },
  id?: string,
) {
  if (!input.taxId.trim() || !input.name.trim()) throw new DomainError("NIT y razón social son obligatorios.");
  const dup = await prisma.supplier.findFirst({ where: { taxId: input.taxId.trim(), ...(id ? { id: { not: id } } : {}) } });
  if (dup) throw new DomainError(`Ya existe un proveedor con NIT ${input.taxId}.`);
  return id ? prisma.supplier.update({ where: { id }, data: input }) : prisma.supplier.create({ data: input });
}

export async function saveCarrier(input: { name: string; trackingUrlTemplate?: string | null; acceptsParam: boolean }, id?: string) {
  if (!input.name.trim()) throw new DomainError("El nombre es obligatorio.");
  return id ? prisma.carrier.update({ where: { id }, data: input }) : prisma.carrier.create({ data: input });
}

export async function searchProducts(text: string, take = 8) {
  const q = text.trim();
  return prisma.product.findMany({
    where: {
      archived: false,
      OR: [
        { sku: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        ...q.split(/\s+/).filter((w) => w.length > 2).map((w) => ({ name: { contains: w, mode: "insensitive" as const } })),
      ],
    },
    take,
    orderBy: { sku: "asc" },
  });
}
