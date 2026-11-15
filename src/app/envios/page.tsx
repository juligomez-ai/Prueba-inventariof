import Link from "next/link";
import { ShipmentStatusBadge } from "@/components/badges";
import { TrackLink } from "@/components/track-link";
import { Badge, Card, CardHeader, Empty, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { trackingUrl } from "@/domain/services/codes";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtDate } from "@/shared/numbers";

/** Tablero "Por llegar" y despachos en camino (RF-7.4, RF-12.7). */
export default async function Shipments() {
  const all = await prisma.shipment.findMany({
    include: { carrier: true, purchaseOrder: { include: { supplier: true } }, dispatch: true, events: { orderBy: { occurredAt: "desc" }, take: 1 } },
    orderBy: [{ eta: "asc" }],
  });
  const today = new Date();
  const open = all.filter((s) => s.status !== "ENTREGADO" && (s.direction === "SALIENTE" || !["RECIBIDA", "ANULADA"].includes(s.purchaseOrder?.status ?? "")));
  const done = all.filter((s) => !open.includes(s)).slice(-15).reverse();
  const table = (rows: typeof all, empty: string) =>
    rows.length === 0 ? <Empty>{empty}</Empty> : (
      <Table>
        <thead><tr><Th>Dirección</Th><Th>Documento</Th><Th>Tercero</Th><Th>Transportadora · guía</Th><Th>Estado</Th><Th>Último evento</Th><Th>ETA</Th></tr></thead>
        <tbody>
          {rows.map((s) => {
            const late = s.eta && s.eta < today && s.status !== "ENTREGADO";
            const href = s.direction === "ENTRANTE" ? `/compras/${s.purchaseOrderId}` : `/despachos/${s.dispatchId}`;
            return (
              <tr key={s.id} className={late ? "bg-red-50" : ""}>
                <Td>{s.direction === "ENTRANTE" ? <Badge tone="blue">Entrante</Badge> : <Badge tone="purple">Saliente</Badge>}</Td>
                <Td><Link className="font-medium text-primary hover:underline" href={href}>{s.purchaseOrder?.code ?? s.dispatch?.code}</Link></Td>
                <Td className="text-sm">{s.purchaseOrder?.supplier.name ?? s.dispatch?.customerName}</Td>
                <Td className="text-sm">{s.carrier.name} · <TrackLink url={trackingUrl(s.carrier.trackingUrlTemplate, s.trackingNumber)} trackingNumber={s.trackingNumber} acceptsParam={s.carrier.acceptsParam} /></Td>
                <Td><ShipmentStatusBadge status={s.status} /></Td>
                <Td className="text-xs text-muted">{s.events[0] ? `${fmtDate(s.events[0].occurredAt)}${s.events[0].note ? ` · ${s.events[0].note}` : ""}` : "—"}</Td>
                <Td className={`text-sm ${late ? "font-medium text-red-700" : ""}`}>{fmtDate(s.eta)}{late ? " · retrasado" : ""}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    );
  return (
    <>
      <PageHeader title="Seguimiento de envíos" description="Lo que viene de proveedores y lo que va a clientes, ordenado por fecha estimada." />
      <Notice tone="blue">En la Fase 1 el estado se actualiza a mano. El número de guía abre la página oficial de la transportadora; si la página no acepta la guía en el enlace, la guía se copia para pegarla. La actualización automática llega en la Fase 2.</Notice>
      <Card className="mt-4"><CardHeader title={`En camino (${open.length})`} />{table(open, "No hay envíos en camino.")}</Card>
      <Card className="mt-6"><CardHeader title="Entregados recientemente" />{table(done, "Sin entregas registradas.")}</Card>
    </>
  );
}
