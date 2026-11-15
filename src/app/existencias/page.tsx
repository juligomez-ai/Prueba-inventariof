import Link from "next/link";
import type { TipoProducto } from "@prisma/client";
import { inventoryRows } from "@/application/use-cases/insights";
import { ProductTypeBadge, StockLight } from "@/components/badges";
import { Card, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { productTypeLabel } from "@/shared/labels";
import { fmtMoney, fmtQty, n } from "@/shared/numbers";

export default async function Stock(props: PageProps<"/existencias">) {
  const sp = await props.searchParams;
  const type = typeof sp.tipo === "string" ? (sp.tipo as TipoProducto) : null;
  const rows = (await inventoryRows()).filter((r) => !type || r.product.type === type);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const tabs: [string, string | null][] = [["Todos", null], ...Object.entries(productTypeLabel).map(([k, v]) => [v, k] as [string, string])];
  return (
    <>
      <PageHeader title="Existencias" description="Físico, reservado, cuarentena, disponible y en tránsito, valorizado al costo promedio (RF-3.1, RF-4.2)." />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([label, k]) => (
          <Link key={label} href={k ? `/existencias?tipo=${k}` : "/existencias"} className={`rounded-full border px-3 py-1 text-sm ${type === k ? "border-primary bg-primary text-white" : "border-border bg-card hover:bg-accent"}`}>{label}</Link>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Valor" value={fmtMoney(total)} />
        <Stat label="Productos" value={rows.length} />
        <Stat label="Bajo mínimo" value={rows.filter((r) => n(r.product.minStock) > 0 && r.available <= n(r.product.minStock)).length} tone="yellow" />
        <Stat label="Con stock en cuarentena" value={rows.filter((r) => r.quarantine > 0).length} />
      </div>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Producto</Th><Th>Tipo</Th><Th className="text-right">Físico</Th><Th className="text-right">Reservado</Th><Th className="text-right">Cuarentena / bloq.</Th>
              <Th className="text-right">Disponible</Th><Th className="text-right">En tránsito</Th><Th>Semáforo</Th><Th className="text-right">Costo prom.</Th><Th className="text-right">Valor</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const u = r.product.baseUnit;
              return (
                <tr key={r.product.id} className="hover:bg-accent/40">
                  <Td><Link href={`/productos/${r.product.id}`} className="font-medium text-primary hover:underline">{r.product.name}</Link><div className="font-mono text-xs text-muted">{r.product.sku}</div></Td>
                  <Td><ProductTypeBadge type={r.product.type} /></Td>
                  <Td className="text-right tabular">{fmtQty(r.onHand, u)}</Td>
                  <Td className="text-right tabular">{r.reserved ? fmtQty(r.reserved, u) : "—"}</Td>
                  <Td className="text-right tabular">{r.quarantine + r.blocked ? fmtQty(r.quarantine + r.blocked, u) : "—"}</Td>
                  <Td className="text-right font-medium tabular">{fmtQty(r.available, u)}</Td>
                  <Td className="text-right tabular">{r.inTransit ? fmtQty(r.inTransit, u) : "—"}</Td>
                  <Td><StockLight qty={r.available} min={n(r.product.minStock)} safety={n(r.product.safetyStock)} /></Td>
                  <Td className="text-right tabular">{fmtMoney(n(r.product.avgCost))}</Td>
                  <Td className="text-right tabular">{fmtMoney(r.value)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
