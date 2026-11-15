import { checkFeasibility } from "@/application/use-cases/production";
import { lastPrices } from "@/application/use-cases/purchasing";
import { PurchaseForm } from "@/components/purchase-form";
import { Notice, PageHeader } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { n } from "@/shared/numbers";

/** Nueva OC. Con ?op=<id> o ?producto=&cantidad= se prellena con los faltantes (RF-6.7, RF-9.4). */
export default async function NewPurchase(props: PageProps<"/compras/nueva">) {
  const sp = await props.searchParams;
  const [suppliers, products, prices] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { type: { not: "PRODUCTO_TERMINADO" }, archived: false }, include: { conversions: true }, orderBy: { sku: "asc" } }),
    lastPrices(),
  ]);
  const prods = products.map((p) => ({
    id: p.id, sku: p.sku, name: p.name, baseUnit: p.baseUnit,
    lastCost: prices.get(p.id)?.unitCost ?? n(p.avgCost),
    conversions: p.conversions.map((c) => ({ unit: c.unit, factor: n(c.factor) })),
    supplierId: p.preferredSupplierId,
  }));

  let source: string | null = null;
  let shortages: { productId: string; shortage: number }[] = [];
  if (typeof sp.op === "string") {
    const o = await prisma.productionOrder.findUnique({ where: { id: sp.op } });
    if (o) {
      const f = await checkFeasibility(o.productId, n(o.plannedQty), { excludeOrderId: o.id });
      shortages = f.rows.filter((r) => r.shortage > 0);
      source = `faltantes de ${o.code}`;
    }
  } else if (typeof sp.producto === "string" && typeof sp.cantidad === "string") {
    const f = await checkFeasibility(sp.producto, Number(sp.cantidad));
    shortages = f.rows.filter((r) => r.shortage > 0);
    source = `faltantes para producir ${sp.cantidad} ${f.product.name}`;
  }
  // Se propone el proveedor preferido del primer faltante; los demás faltantes de otros proveedores se avisan.
  const firstSupplier = shortages.map((s) => prods.find((p) => p.id === s.productId)?.supplierId).find(Boolean) ?? undefined;
  const sameSupplier = shortages.filter((s) => !firstSupplier || prods.find((p) => p.id === s.productId)?.supplierId === firstSupplier);
  const others = shortages.filter((s) => !sameSupplier.includes(s));
  const initialLines = sameSupplier.map((s) => {
    const p = prods.find((x) => x.id === s.productId)!;
    return { productId: p.id, quantity: String(s.shortage), unit: p.baseUnit, unitPrice: String(Math.round(p.lastCost)) };
  });

  return (
    <div className="max-w-5xl">
      <PageHeader title="Nueva orden de compra" description={source ? `Prellenada con los ${source}.` : "Selecciona proveedor y productos."} />
      {others.length > 0 && (
        <div className="mb-4">
          <Notice>Otros faltantes son de otro proveedor y requieren otra OC: {others.map((s) => prods.find((p) => p.id === s.productId)?.name).join(", ")}.</Notice>
        </div>
      )}
      <PurchaseForm suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} products={prods} initialSupplierId={firstSupplier} initialLines={initialLines} notes={source ? `Generada con ${source}` : undefined} />
    </div>
  );
}
