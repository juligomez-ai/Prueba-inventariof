import Link from "next/link";
import { recipeCost } from "@/application/use-cases/production";
import { Badge, ButtonLink, Card, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtMoney, fmtPct, fmtQty, n } from "@/shared/numbers";

export default async function Recipes() {
  const products = await prisma.product.findMany({ where: { type: "PRODUCTO_TERMINADO", archived: false }, include: { recipe: { include: { items: true } } }, orderBy: { sku: "asc" } });
  const costs = new Map(await Promise.all(products.filter((p) => p.recipe).map(async (p) => [p.id, await recipeCost(p.recipe!.id)] as const)));
  return (
    <>
      <PageHeader title="Fórmulas" description="La receta de cada producto: qué insumos lleva, cuánto rinde y cuánto cuesta (M8)." actions={<ButtonLink href="/copiloto?q=Quiero%20crear%20una%20f%C3%B3rmula" variant="outline">Crear con el Copiloto</ButtonLink>} />
      <Notice tone="blue">
        <b>En una frase:</b> la fórmula es la receta de la crema: para hacer 100 unidades uso 0,8 kg de karité, 100 frascos, 100 tapas… Con eso el sistema sabe qué descontar al producir, si me alcanza y cuánto me cuesta cada crema.
      </Notice>
      <Card className="mt-4">
        <Table>
          <thead><tr><Th>Producto</Th><Th>Fórmula</Th><Th className="text-right">Rinde</Th><Th className="text-right">Insumos</Th><Th className="text-right">Costo lote</Th><Th className="text-right">Costo unidad</Th><Th className="text-right">Precio</Th><Th className="text-right">Margen</Th></tr></thead>
          <tbody>
            {products.map((p) => {
              const c = costs.get(p.id);
              const price = n(p.salePrice);
              return (
                <tr key={p.id} className="hover:bg-accent/40">
                  <Td><Link className="font-medium text-primary hover:underline" href={`/formulas/${p.id}`}>{p.name}</Link></Td>
                  <Td>{p.recipe ? <>{p.recipe.name} {p.recipe.createdByAI && <Badge tone="purple">IA</Badge>}</> : <Badge tone="yellow">Sin fórmula</Badge>}</Td>
                  <Td className="text-right tabular">{p.recipe ? fmtQty(n(p.recipe.yieldQuantity), p.baseUnit) : "—"}</Td>
                  <Td className="text-right">{p.recipe?.items.length ?? "—"}</Td>
                  <Td className="text-right tabular">{c ? fmtMoney(c.batchCost) : "—"}</Td>
                  <Td className="text-right font-medium tabular">{c ? fmtMoney(c.unitCost) : "—"}</Td>
                  <Td className="text-right tabular">{price ? fmtMoney(price) : "—"}</Td>
                  <Td className="text-right tabular">{c && price ? fmtPct(((price - c.unitCost) / price) * 100) : "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
