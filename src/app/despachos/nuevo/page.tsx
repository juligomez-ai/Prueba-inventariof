import { DispatchForm } from "@/components/dispatch-form";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { stockSummary } from "@/infrastructure/database/stock";

export default async function NewDispatch() {
  const products = await prisma.product.findMany({ where: { type: "PRODUCTO_TERMINADO", archived: false }, orderBy: { sku: "asc" } });
  const s = await stockSummary(prisma, products.map((p) => p.id));
  return (
    <div className="max-w-4xl">
      <PageHeader title="Nuevo despacho" description="Al crearlo se asigna el número de remisión de entrega (REM)." />
      <DispatchForm products={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, available: s.get(p.id)?.available ?? 0 }))} />
    </div>
  );
}
