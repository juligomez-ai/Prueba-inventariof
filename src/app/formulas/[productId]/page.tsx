import Link from "next/link";
import { notFound } from "next/navigation";
import { recipeCost } from "@/application/use-cases/production";
import { RecipeEditor } from "@/components/recipe-editor";
import { ButtonLink, Card, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtMoney, fmtPct, fmtQty, n } from "@/shared/numbers";

export default async function RecipePage(props: PageProps<"/formulas/[productId]">) {
  const { productId } = await props.params;
  const sp = await props.searchParams;
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { recipe: { include: { items: { include: { ingredient: true } } } } } });
  if (!product || product.type !== "PRODUCTO_TERMINADO") notFound();
  const ingredients = (await prisma.product.findMany({ where: { type: { not: "PRODUCTO_TERMINADO" }, archived: false }, orderBy: { sku: "asc" } })).map((p) => ({
    id: p.id, sku: p.sku, name: p.name, baseUnit: p.baseUnit, avgCost: n(p.avgCost), type: p.type,
  }));
  const r = product.recipe;
  const edit = sp.editar === "1" || !r;
  const cost = r ? await recipeCost(r.id) : null;
  const price = n(product.salePrice);
  const packaging = cost ? cost.lines.filter((l) => l.ingredient.type === "EMPAQUE").reduce((s, l) => s + l.total, 0) : 0;

  return (
    <>
      <PageHeader
        title={`Fórmula · ${product.name}`}
        description={r ? `${r.name} · rinde ${fmtQty(n(r.yieldQuantity), product.baseUnit)}` : "Este producto todavía no tiene fórmula."}
        actions={r && !edit ? (
          <>
            <ButtonLink href={`/produccion/nueva?producto=${product.id}`}>Producir</ButtonLink>
            <ButtonLink href={`/formulas/${product.id}?editar=1`} variant="outline">Editar</ButtonLink>
          </>
        ) : undefined}
      />
      {edit ? (
        <>
          {r && <div className="mb-4"><Notice tone="blue">Editar la fórmula no cambia las órdenes de producción ya creadas: cada orden guardó su copia (RN-8.3).</Notice></div>}
          <RecipeEditor
            productId={product.id}
            productName={product.name}
            ingredients={ingredients}
            initial={r ? { name: r.name, yieldQuantity: n(r.yieldQuantity), instructions: r.instructions, items: r.items.map((i) => ({ ingredientId: i.ingredientId, quantity: String(n(i.quantity)), unit: i.ingredient.baseUnit })) } : undefined}
          />
          {r && <Link href={`/formulas/${product.id}`} className="mt-4 inline-block text-sm text-muted hover:underline">Cancelar</Link>}
        </>
      ) : (
        cost && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Costo por lote", fmtMoney(cost.batchCost)],
                ["Costo por unidad", fmtMoney(cost.unitCost)],
                ["Margen bruto", price ? fmtPct(((price - cost.unitCost) / price) * 100) : "—"],
                ["Peso del empaque en el costo", fmtPct((packaging / cost.batchCost) * 100)],
              ].map(([k, v]) => (
                <Card key={k} className="p-4"><div className="text-xs uppercase text-muted">{k}</div><div className="mt-1 text-xl font-semibold tabular">{v}</div></Card>
              ))}
            </div>
            <Card>
              <CardHeader title="Insumos" description="Costeo en vivo con el costo promedio actual de cada insumo (RF-4.5)." />
              <Table>
                <thead><tr><Th>Insumo</Th><Th className="text-right">Cantidad</Th><Th className="text-right">Costo promedio</Th><Th className="text-right">Total</Th><Th className="text-right">% del costo</Th></tr></thead>
                <tbody>
                  {cost.lines.map((l) => (
                    <tr key={l.ingredient.id}>
                      <Td><Link className="hover:underline" href={`/productos/${l.ingredient.id}`}>{l.ingredient.sku} · {l.ingredient.name}</Link></Td>
                      <Td className="text-right tabular">{fmtQty(l.quantity, l.ingredient.baseUnit)}</Td>
                      <Td className="text-right tabular">{fmtMoney(l.unitCost)}/{l.ingredient.baseUnit}</Td>
                      <Td className="text-right tabular">{fmtMoney(l.total)}</Td>
                      <Td className="text-right tabular">{fmtPct((l.total / cost.batchCost) * 100)}</Td>
                    </tr>
                  ))}
                  <tr className="font-semibold"><Td>Total del lote</Td><Td /><Td /><Td className="text-right tabular">{fmtMoney(cost.batchCost)}</Td><Td className="text-right">100%</Td></tr>
                </tbody>
              </Table>
            </Card>
            {r?.instructions && <Card className="mt-4 p-5 text-sm"><div className="mb-1 font-semibold">Instrucciones</div>{r.instructions}</Card>}
          </>
        )
      )}
    </>
  );
}
