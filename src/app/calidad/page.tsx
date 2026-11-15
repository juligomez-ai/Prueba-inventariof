import Link from "next/link";
import { ExpiryBadge, LotStatusBadge } from "@/components/badges";
import { LotStatusForm } from "@/components/lot-status-form";
import { Card, CardBody, CardHeader, Empty, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { daysBetween, fmtDateTime, fmtQty, n } from "@/shared/numbers";

/** Pendientes de liberación (RF-5.8, RF-5.10) e historial de decisiones de calidad. */
export default async function Quality() {
  const [pending, history] = await Promise.all([
    prisma.lot.findMany({
      where: { status: "CUARENTENA" },
      include: { product: true, productionOrder: true, containers: { where: { status: { in: ["SELLADO", "ABIERTO"] } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.lotStatusChange.findMany({ where: { NOT: { fromStatus: "CUARENTENA", toStatus: "CUARENTENA" } }, include: { lot: { include: { product: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return (
    <>
      <PageHeader title="Control de calidad" description="Todo lote producido entra en cuarentena. Aquí se libera o se rechaza, con nota obligatoria." />
      <Notice tone="blue">Un lote en cuarentena o bloqueado no se puede consumir ni despachar, pero sí cuenta en el stock físico y en el valor del inventario (RN-5.3).</Notice>
      <h2 className="mb-3 mt-6 font-semibold">Pendientes de liberación ({pending.length})</h2>
      {pending.length === 0 ? <Card><Empty>No hay lotes en cuarentena.</Empty></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pending.map((l) => {
            const days = daysBetween(l.createdAt, new Date());
            return (
              <Card key={l.id}>
                <CardHeader
                  title={<Link className="text-primary hover:underline" href={`/lotes/${l.id}`}>{l.code}</Link>}
                  description={`${l.product.name} · ${fmtQty(l.containers.reduce((s, c) => s + n(c.currentQty), 0), l.product.baseUnit)} en ${l.containers.length} bulto(s)`}
                  actions={<span className={`text-sm ${days >= 3 ? "font-medium text-red-700" : "text-muted"}`}>{days} día(s) en cuarentena</span>}
                />
                <CardBody className="space-y-3">
                  <div className="text-sm text-muted">
                    {l.productionOrder ? <>Producido en <Link className="text-primary hover:underline" href={`/produccion/${l.productionOrder.id}`}>{l.productionOrder.code}</Link> · </> : null}
                    Vence <ExpiryBadge date={l.expiryDate} />
                  </div>
                  <LotStatusForm lotId={l.id} status={l.status} />
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
      <Card className="mt-6">
        <CardHeader title="Historial de decisiones" />
        {history.length === 0 ? <Empty>Sin decisiones todavía.</Empty> : (
          <Table>
            <thead><tr><Th>Fecha</Th><Th>Lote</Th><Th>Producto</Th><Th>Cambio</Th><Th>Nota</Th><Th>Usuario</Th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <Td className="whitespace-nowrap text-xs">{fmtDateTime(h.createdAt)}</Td>
                  <Td><Link className="text-primary hover:underline" href={`/lotes/${h.lotId}`}>{h.lot.code}</Link></Td>
                  <Td>{h.lot.product.name}</Td>
                  <Td className="whitespace-nowrap"><LotStatusBadge status={h.fromStatus} /> → <LotStatusBadge status={h.toStatus} /></Td>
                  <Td className="text-sm">{h.reason}</Td>
                  <Td className="text-xs text-muted">{h.userName}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
