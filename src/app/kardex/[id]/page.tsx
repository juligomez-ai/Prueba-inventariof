import Link from "next/link";
import { notFound } from "next/navigation";
import { MovementBadge } from "@/components/badges";
import { Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { documentHref, documentLabel, movementLabel } from "@/shared/labels";
import { fmtDateTime, fmtMoney, fmtQty, n } from "@/shared/numbers";

/** Detalle de un movimiento con toda su cadena (RF-3.6). */
export default async function MovementPage(props: PageProps<"/kardex/[id]">) {
  const { id } = await props.params;
  const m = await prisma.stockMovement.findUnique({
    where: { id },
    include: { product: true, lot: { include: { supplier: true } }, container: true, warehouse: true, toWarehouse: true },
  });
  if (!m) notFound();
  const [related, lotHistory] = await Promise.all([
    m.relatedMovementId ? prisma.stockMovement.findUnique({ where: { id: m.relatedMovementId } }) : null,
    m.lotId ? prisma.stockMovement.findMany({ where: { lotId: m.lotId }, orderBy: { number: "asc" }, include: { container: true } }) : [],
  ]);
  const u = m.product.baseUnit;
  const mv = movementLabel[m.type];
  const rows: [string, React.ReactNode][] = [
    ["Consecutivo", `#${m.number}`],
    ["Fecha y hora", fmtDateTime(m.createdAt)],
    ["Usuario", m.userName],
    ["Tipo", <span key="t">{mv.name} · <b>{mv.code}</b> ({mv.meaning})</span>],
    ["Documento soporte", <Link key="d" className="text-primary hover:underline" href={documentHref(m.documentType, m.documentId)}>{documentLabel[m.documentType].name} ({documentLabel[m.documentType].intl}) {m.documentNumber}</Link>],
    ["Remisión", m.remissionNumber ?? "—"],
    ["Tercero", m.partyName ? `${m.partyType === "CLIENTE" ? "Cliente" : "Proveedor"}: ${m.partyName}` : "—"],
    ["Producto", <Link key="p" className="text-primary hover:underline" href={`/productos/${m.productId}`}>{m.product.sku} · {m.product.name}</Link>],
    ["Lote", m.lot ? <Link key="l" className="text-primary hover:underline" href={`/lotes/${m.lot.id}`}>{m.lot.code}{m.lot.supplier ? ` (proveedor ${m.lot.supplier.name})` : ""}</Link> : "—"],
    ["Serial del bulto", m.container?.serial ?? "—"],
    ["Bodega", `${m.warehouse.code} · ${m.warehouse.name}${m.toWarehouse ? ` (contraparte ${m.toWarehouse.code})` : ""}`],
    ["Cantidad", <span key="q" className={n(m.quantity) < 0 ? "text-red-700" : "text-green-700"}>{fmtQty(n(m.quantity), u)}</span>],
    ["Costo unitario / valor", `${fmtMoney(n(m.unitCost))} / ${fmtMoney(n(m.totalValue))}`],
    ["Costo promedio antes → después", `${fmtMoney(n(m.avgCostBefore))} → ${fmtMoney(n(m.avgCostAfter))}`],
    ["Saldo antes → después", `${fmtQty(n(m.balanceBefore), u)} → ${fmtQty(n(m.balanceAfter), u)}`],
    ["Motivo", m.reason ?? "—"],
    ["Movimiento relacionado", related ? <Link key="r" className="text-primary hover:underline" href={`/kardex/${related.id}`}>#{related.number}</Link> : "—"],
  ];
  return (
    <>
      <PageHeader title={`Movimiento #${m.number}`} description={<MovementBadge type={m.type} />} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Trazabilidad del movimiento" description="RF-3.5: todos los datos se guardan siempre; el movimiento es inmutable." />
          <CardBody>
            <dl className="grid grid-cols-[minmax(0,12rem)_1fr] gap-x-4 gap-y-2 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </CardBody>
        </Card>
        {m.lot && (
          <Card>
            <CardHeader title={`Cadena del lote ${m.lot.code}`} description="Movimientos anteriores y posteriores del mismo lote." />
            <Table>
              <thead><tr><Th>#</Th><Th>Movimiento</Th><Th>Documento</Th><Th>Serial</Th><Th className="text-right">Cantidad</Th></tr></thead>
              <tbody>
                {lotHistory.map((x) => (
                  <tr key={x.id} className={x.id === m.id ? "bg-accent" : ""}>
                    <Td><Link className="text-primary hover:underline" href={`/kardex/${x.id}`}>{x.number}</Link></Td>
                    <Td><MovementBadge type={x.type} /></Td>
                    <Td>{x.documentNumber}</Td>
                    <Td className="font-mono text-xs">{x.container?.serial}</Td>
                    <Td className="text-right tabular">{fmtQty(n(x.quantity), u)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
