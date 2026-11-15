import Link from "next/link";
import { MovementBadge } from "@/components/badges";
import { ButtonLink, Card, Empty, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { documentHref, movementLabel } from "@/shared/labels";
import { fmtDateTime, fmtMoney, fmtQty, n } from "@/shared/numbers";
import { kardexQuery, pickFilters } from "./query";

export default async function Kardex(props: PageProps<"/kardex">) {
  const f = pickFilters(await props.searchParams);
  const [rows, products, warehouses] = await Promise.all([
    kardexQuery(f),
    prisma.product.findMany({ orderBy: { sku: "asc" }, select: { id: true, sku: true, name: true } }),
    prisma.warehouse.findMany({ orderBy: { code: "asc" } }),
  ]);
  const qs = new URLSearchParams(f as Record<string, string>).toString();
  const single = f.producto ? products.find((p) => p.id === f.producto) : null;
  return (
    <>
      <PageHeader
        title={single ? `Kardex · ${single.name}` : "Kardex"}
        description="Historial inmutable con trazabilidad completa: documento, remisión, tercero, lote, serial, saldo y costo antes y después (RF-3.2, RF-3.5)."
        actions={<ButtonLink href={`/kardex/csv?${qs}`} variant="outline">Exportar CSV</ButtonLink>}
      />
      <Card className="mb-4 p-4">
        <form className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Select name="producto" defaultValue={f.producto ?? ""}>
            <option value="">Todos los productos</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
          </Select>
          <Select name="tipo" defaultValue={f.tipo ?? ""}>
            <option value="">Todos los movimientos</option>
            {Object.entries(movementLabel).map(([k, v]) => <option key={k} value={k}>{v.name} ({v.code})</option>)}
          </Select>
          <Select name="bodega" defaultValue={f.bodega ?? ""}>
            <option value="">Todas las bodegas</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
          </Select>
          <Input name="lote" placeholder="Lote" defaultValue={f.lote} />
          <Input name="serial" placeholder="Serial" defaultValue={f.serial} />
          <Input name="documento" placeholder="Documento (OC-, OP-, REM-…)" defaultValue={f.documento} />
          <Input name="remision" placeholder="Remisión" defaultValue={f.remision} />
          <Input name="tercero" placeholder="Proveedor o cliente" defaultValue={f.tercero} />
          <Input name="desde" type="date" defaultValue={f.desde} aria-label="Desde" />
          <Input name="hasta" type="date" defaultValue={f.hasta} aria-label="Hasta" />
          <button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white">Filtrar</button>
          <Link href="/kardex" className="px-3 py-2 text-sm text-muted hover:underline">Limpiar</Link>
        </form>
      </Card>
      <Card>
        {rows.length === 0 ? <Empty>No hay movimientos con esos filtros.</Empty> : (
          <Table>
            <thead>
              <tr>
                <Th>#</Th><Th>Fecha</Th><Th>Producto</Th><Th>Movimiento</Th><Th>Documento</Th><Th>Remisión</Th><Th>Tercero</Th><Th>Bodega</Th><Th>Lote / serial</Th>
                <Th className="text-right">Entrada</Th><Th className="text-right">Salida</Th><Th className="text-right">Saldo</Th><Th className="text-right">Costo unit.</Th><Th className="text-right">Costo prom.</Th><Th className="text-right">Valor saldo</Th><Th>Usuario</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const q = n(m.quantity);
                const u = m.product.baseUnit;
                return (
                  <tr key={m.id} className="hover:bg-accent/40">
                    <Td><Link className="text-primary hover:underline" href={`/kardex/${m.id}`}>{m.number}</Link></Td>
                    <Td className="whitespace-nowrap text-xs">{fmtDateTime(m.createdAt)}</Td>
                    <Td className="text-xs"><Link className="hover:underline" href={`/productos/${m.productId}`}>{m.product.name}</Link></Td>
                    <Td><MovementBadge type={m.type} /></Td>
                    <Td className="whitespace-nowrap"><Link className="text-primary hover:underline" href={documentHref(m.documentType, m.documentId)}>{m.documentNumber}</Link></Td>
                    <Td className="whitespace-nowrap text-xs">{m.remissionNumber ?? "—"}</Td>
                    <Td className="text-xs">{m.partyName ?? "—"}</Td>
                    <Td className="text-xs">{m.warehouse.code}{m.toWarehouse ? ` ↔ ${m.toWarehouse.code}` : ""}</Td>
                    <Td className="text-xs">{m.lot ? <Link className="hover:underline" href={`/lotes/${m.lotId}`}>{m.lot.code}</Link> : "—"}<div className="font-mono text-muted">{m.container?.serial}</div></Td>
                    <Td className="text-right tabular text-green-700">{q > 0 ? fmtQty(q, u) : ""}</Td>
                    <Td className="text-right tabular text-red-700">{q < 0 ? fmtQty(-q, u) : ""}</Td>
                    <Td className="text-right tabular">{fmtQty(n(m.balanceAfter), u)}</Td>
                    <Td className="text-right tabular">{fmtMoney(n(m.unitCost))}</Td>
                    <Td className="text-right tabular">{fmtMoney(n(m.avgCostAfter))}</Td>
                    <Td className="text-right tabular">{fmtMoney(n(m.balanceAfter) * n(m.avgCostAfter))}</Td>
                    <Td className="text-xs text-muted">{m.userName.split(" (")[0]}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
