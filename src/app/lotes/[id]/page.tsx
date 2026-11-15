import Link from "next/link";
import { notFound } from "next/navigation";
import { lotTraceability } from "@/application/use-cases/traceability";
import { ContainerStatusBadge, ExpiryBadge, LotStatusBadge, MovementBadge } from "@/components/badges";
import { LotStatusForm } from "@/components/lot-status-form";
import { Card, CardBody, CardHeader, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtDate, fmtDateTime, fmtQty, n } from "@/shared/numbers";

export default async function LotPage(props: PageProps<"/lotes/[id]">) {
  const { id } = await props.params;
  const exists = await prisma.lot.findUnique({ where: { id } });
  if (!exists) notFound();
  const { lot, backward, usedIn, sales } = await lotTraceability(id);
  const [containers, history, movements] = await Promise.all([
    prisma.container.findMany({ where: { lotId: id }, include: { warehouse: true }, orderBy: { serial: "asc" } }),
    prisma.lotStatusChange.findMany({ where: { lotId: id }, orderBy: { createdAt: "desc" } }),
    prisma.stockMovement.findMany({ where: { lotId: id }, orderBy: { number: "asc" }, include: { container: true } }),
  ]);
  const u = lot.product.baseUnit;
  return (
    <>
      <PageHeader
        title={`Lote ${lot.code}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <LotStatusBadge status={lot.status} /> <Link className="text-primary hover:underline" href={`/productos/${lot.productId}`}>{lot.product.name}</Link>
            · vence {fmtDate(lot.expiryDate)} <ExpiryBadge date={lot.expiryDate} />
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Origen" />
          <CardBody className="space-y-1 text-sm">
            {lot.sourceType === "COMPRA" && <p>Compra <b>{lot.sourceRef}</b> a <b>{lot.supplier?.name}</b>. Lote del proveedor: {lot.supplierLot}</p>}
            {lot.sourceType === "PRODUCCION" && lot.productionOrder && <p>Producido en <Link className="text-primary hover:underline" href={`/produccion/${lot.productionOrder.id}`}>{lot.productionOrder.code}</Link> el {fmtDate(lot.createdAt)}</p>}
            {lot.sourceType === "AJUSTE" && <p>Ingresó por ajuste / inventario inicial {lot.sourceRef}</p>}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Estado del lote" description="Liberar, rechazar o poner en cuarentena. No mueve cantidades; queda en el historial (RN-5.5)." />
          <CardBody><LotStatusForm lotId={lot.id} status={lot.status} /></CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="← Trazabilidad hacia atrás" description="Insumos, lotes y proveedores usados para producir este lote (RF-5.4)." />
          {backward.length === 0 ? <Empty>{lot.sourceType === "PRODUCCION" ? "Sin consumos." : "Es un insumo comprado: su origen es el proveedor."}</Empty> : (
            <Table>
              <thead><tr><Th>Insumo</Th><Th>Lote</Th><Th>Proveedor</Th><Th className="text-right">Cantidad</Th></tr></thead>
              <tbody>
                {backward.map((m) => (
                  <tr key={m.id}>
                    <Td>{m.product.name}<div className="font-mono text-xs text-muted">{m.container?.serial}</div></Td>
                    <Td>{m.lot ? <Link className="text-primary hover:underline" href={`/lotes/${m.lot.id}`}>{m.lot.code}</Link> : "—"}</Td>
                    <Td className="text-xs">{m.lot?.supplier?.name ?? "—"}</Td>
                    <Td className="text-right tabular">{fmtQty(-n(m.quantity), m.product.baseUnit)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Trazabilidad hacia adelante →" description="Dónde se usó y a qué clientes llegó (RF-5.5)." />
          <CardBody className="space-y-4">
            {usedIn.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted">Usado en producción</div>
                {usedIn.map((r) => (
                  <div key={r.order.id} className="text-sm">
                    <Link className="text-primary hover:underline" href={`/produccion/${r.order.id}`}>{r.order.code}</Link> · {r.order.product.name} · {fmtQty(r.quantity, u)}
                    {r.order.outputLot && <> → lote <Link className="text-primary hover:underline" href={`/lotes/${r.order.outputLot.id}`}>{r.order.outputLot.code}</Link></>}
                  </div>
                ))}
              </div>
            )}
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted">Despachado a clientes</div>
              {sales.length === 0 ? <p className="text-sm text-muted">Aún no se ha despachado.</p> : sales.map((m) => (
                <div key={m.id} className="text-sm">
                  <Link className="text-primary hover:underline" href={`/despachos/${m.documentId}`}>{m.remissionNumber}</Link> · {m.partyName} · {fmtQty(-n(m.quantity), m.product.baseUnit)} ({m.product.name}, lote {m.lot?.code})
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Bultos del lote" />
        <Table>
          <thead><tr><Th>Serial</Th><Th>Bodega</Th><Th>Estado</Th><Th className="text-right">Actual / inicial</Th></tr></thead>
          <tbody>
            {containers.map((c) => (
              <tr key={c.id}>
                <Td className="font-mono text-xs">{c.serial}</Td><Td>{c.warehouse.code}</Td><Td><ContainerStatusBadge status={c.status} /></Td>
                <Td className="text-right tabular">{fmtQty(n(c.currentQty), u)} / {fmtQty(n(c.initialQty))}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Movimientos del lote" />
          <Table>
            <thead><tr><Th>#</Th><Th>Movimiento</Th><Th>Documento</Th><Th className="text-right">Cantidad</Th></tr></thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <Td><Link className="text-primary hover:underline" href={`/kardex/${m.id}`}>{m.number}</Link></Td>
                  <Td><MovementBadge type={m.type} /></Td><Td>{m.documentNumber}</Td>
                  <Td className="text-right tabular">{fmtQty(n(m.quantity), u)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Historial de estados" />
          {history.length === 0 ? <Empty>Sin cambios de estado.</Empty> : (
            <ul className="divide-y divide-border text-sm">
              {history.map((h) => (
                <li key={h.id} className="px-5 py-2">
                  <LotStatusBadge status={h.fromStatus} /> → <LotStatusBadge status={h.toStatus} /> <span className="text-xs text-muted">{fmtDateTime(h.createdAt)} · {h.userName}</span>
                  <div>{h.reason}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
