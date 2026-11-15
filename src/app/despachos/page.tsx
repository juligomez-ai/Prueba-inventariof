import Link from "next/link";
import type { EstadoDespacho } from "@prisma/client";
import { DispatchStatusBadge } from "@/components/badges";
import { ButtonLink, Card, Empty, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtDate, fmtQty, n } from "@/shared/numbers";

export default async function Dispatches() {
  const list = await prisma.dispatch.findMany({ include: { lines: { include: { product: true } }, shipment: { include: { carrier: true } } }, orderBy: { createdAt: "desc" } });
  const count = (s: EstadoDespacho[]) => list.filter((d) => s.includes(d.status)).length;
  return (
    <>
      <PageHeader title="Despachos y remisiones" description="Salida de producto terminado con remisión de entrega, lotes FEFO, guía y prueba de entrega (M12)." actions={<ButtonLink href="/despachos/nuevo">Nuevo despacho</ButtonLink>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Pendientes / alistando" value={count(["PENDIENTE", "EN_ALISTAMIENTO"])} />
        <Stat label="En tránsito" value={count(["DESPACHADO", "EN_TRANSITO"])} />
        <Stat label="Con novedad" value={count(["NOVEDAD"])} tone={count(["NOVEDAD"]) ? "red" : undefined} />
        <Stat label="Entregados" value={count(["ENTREGADO"])} tone="green" />
      </div>
      <Card>
        {list.length === 0 ? <Empty>Sin despachos.</Empty> : (
          <Table>
            <thead><tr><Th>Remisión</Th><Th>Cliente</Th><Th>Productos</Th><Th>Estado</Th><Th>Transportadora / guía</Th><Th>Despachado</Th><Th>Entregado</Th></tr></thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id} className="hover:bg-accent/40">
                  <Td><Link className="font-medium text-primary hover:underline" href={`/despachos/${d.id}`}>{d.code}</Link><div className="text-xs text-muted">{d.salesRef}</div></Td>
                  <Td>{d.customerName}<div className="text-xs text-muted">{d.city}</div></Td>
                  <Td className="text-xs">{d.lines.map((l) => <div key={l.id}>{fmtQty(n(l.quantity), "und")} {l.product.name}</div>)}</Td>
                  <Td><DispatchStatusBadge status={d.status} /></Td>
                  <Td className="text-xs">{d.shipment ? `${d.shipment.carrier.name} · ${d.shipment.trackingNumber}` : "—"}</Td>
                  <Td className="text-xs">{fmtDate(d.shippedAt)}</Td>
                  <Td className="text-xs">{fmtDate(d.deliveredAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
