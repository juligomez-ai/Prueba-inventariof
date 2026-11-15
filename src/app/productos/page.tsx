import Link from "next/link";
import { ProductTypeBadge } from "@/components/badges";
import { ButtonLink, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtMoney, fmtQty, n } from "@/shared/numbers";

export default async function Products(props: PageProps<"/productos">) {
  const sp = await props.searchParams;
  const showArchived = sp.archivados === "1";
  const products = await prisma.product.findMany({
    where: { archived: showArchived },
    include: { preferredSupplier: true, recipe: true },
    orderBy: [{ type: "asc" }, { sku: "asc" }],
  });
  return (
    <>
      <PageHeader
        title="Productos"
        description="Catálogo único: materias primas, empaques y productos terminados (M1)."
        actions={
          <>
            <ButtonLink href={showArchived ? "/productos" : "/productos?archivados=1"} variant="outline">{showArchived ? "Ver activos" : "Ver archivados"}</ButtonLink>
            <ButtonLink href="/productos/nuevo">Nuevo producto</ButtonLink>
          </>
        }
      />
      <Card>
        <Table>
          <thead>
            <tr><Th>SKU</Th><Th>Producto</Th><Th>Tipo</Th><Th>Unidad</Th><Th>Lote / vence</Th><Th className="text-right">Costo promedio</Th><Th className="text-right">Mínimo</Th><Th>Proveedor / fórmula</Th></tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-accent/40">
                <Td className="font-mono text-xs">{p.sku}</Td>
                <Td><Link href={`/productos/${p.id}`} className="font-medium text-primary hover:underline">{p.name}</Link></Td>
                <Td><ProductTypeBadge type={p.type} /></Td>
                <Td>{p.baseUnit}</Td>
                <Td className="text-xs">{p.tracksLot ? "Lote" : "—"}{p.tracksExpiry ? " · vence" : ""}</Td>
                <Td className="text-right tabular">{fmtMoney(n(p.avgCost))}</Td>
                <Td className="text-right tabular">{fmtQty(n(p.minStock), p.baseUnit)}</Td>
                <Td className="text-xs">
                  {p.type === "PRODUCTO_TERMINADO"
                    ? p.recipe ? <Link className="text-primary hover:underline" href={`/formulas/${p.id}`}>Ver fórmula</Link> : <Link className="text-amber-700 hover:underline" href={`/formulas/${p.id}`}>Sin fórmula</Link>
                    : p.preferredSupplier?.name ?? "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
