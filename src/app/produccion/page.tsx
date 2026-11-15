import Link from "next/link";
import { OpStatusBadge } from "@/components/badges";
import { Badge, ButtonLink, Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtDate, fmtMoney, fmtQty, n } from "@/shared/numbers";

export default async function Orders() {
  const orders = await prisma.productionOrder.findMany({ include: { product: true, outputLot: true }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeader title="Órdenes de producción" description="Borrador → En proceso (reserva FEFO) → Completada (consume e ingresa el lote en cuarentena)." actions={<ButtonLink href="/produccion/nueva">Nueva orden</ButtonLink>} />
      <Card>
        {orders.length === 0 ? <Empty>No hay órdenes. Crea la primera o pídesela al Copiloto.</Empty> : (
          <Table>
            <thead><tr><Th>Orden</Th><Th>Producto</Th><Th>Estado</Th><Th className="text-right">Planeado</Th><Th className="text-right">Producido</Th><Th>Fecha planeada</Th><Th>Lote</Th><Th className="text-right">Costo teórico</Th><Th className="text-right">Costo real</Th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-accent/40">
                  <Td><Link className="font-medium text-primary hover:underline" href={`/produccion/${o.id}`}>{o.code}</Link> {o.createdByAI && <Badge tone="purple">IA</Badge>}</Td>
                  <Td>{o.product.name}</Td>
                  <Td><OpStatusBadge status={o.status} /></Td>
                  <Td className="text-right tabular">{fmtQty(n(o.plannedQty), o.product.baseUnit)}</Td>
                  <Td className="text-right tabular">{o.producedQty ? fmtQty(n(o.producedQty), o.product.baseUnit) : "—"}</Td>
                  <Td className="text-xs">{fmtDate(o.plannedDate)}</Td>
                  <Td>{o.outputLot ? <Link className="text-primary hover:underline" href={`/lotes/${o.outputLot.id}`}>{o.outputLot.code}</Link> : "—"}</Td>
                  <Td className="text-right tabular">{fmtMoney(n(o.theoreticalCost))}</Td>
                  <Td className="text-right tabular">{o.actualCost !== null ? fmtMoney(n(o.actualCost)) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
