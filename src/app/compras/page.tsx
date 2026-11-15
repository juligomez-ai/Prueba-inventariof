import Link from "next/link";
import { PoStatusBadge } from "@/components/badges";
import { Badge, ButtonLink, Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtDate, fmtMoney, n } from "@/shared/numbers";

export default async function Purchases() {
  const orders = await prisma.purchaseOrder.findMany({ include: { supplier: true, lines: true, shipments: true }, orderBy: { createdAt: "desc" } });
  const today = new Date();
  return (
    <>
      <PageHeader title="Compras y recepción" description="Órdenes de compra, envíos entrantes y recepción por lote con remisión del proveedor (M6, M7)." actions={<><ButtonLink href="/proveedores" variant="outline">Proveedores</ButtonLink><ButtonLink href="/compras/nueva">Nueva orden de compra</ButtonLink></>} />
      <Card>
        {orders.length === 0 ? <Empty>Aún no hay órdenes de compra.</Empty> : (
          <Table>
            <thead><tr><Th>OC</Th><Th>Proveedor</Th><Th>Estado</Th><Th>Fecha esperada</Th><Th className="text-right">Líneas</Th><Th className="text-right">Total sin IVA</Th><Th>Envíos</Th><Th>Creada</Th></tr></thead>
            <tbody>
              {orders.map((o) => {
                const total = o.lines.reduce((s, l) => s + n(l.quantity) * n(l.unitPrice), 0);
                const late = o.expectedDate && o.expectedDate < today && ["ENVIADA", "EN_TRANSITO", "RECIBIDA_PARCIAL"].includes(o.status);
                return (
                  <tr key={o.id} className="hover:bg-accent/40">
                    <Td><Link className="font-medium text-primary hover:underline" href={`/compras/${o.id}`}>{o.code}</Link> {o.createdByAI && <Badge tone="purple">IA</Badge>}</Td>
                    <Td>{o.supplier.name}</Td>
                    <Td><PoStatusBadge status={o.status} /> {late && <Badge tone="red">Retrasada</Badge>}</Td>
                    <Td className="text-xs">{fmtDate(o.expectedDate)}</Td>
                    <Td className="text-right">{o.lines.length}</Td>
                    <Td className="text-right tabular">{fmtMoney(total)}</Td>
                    <Td>{o.shipments.length || "—"}</Td>
                    <Td className="text-xs">{fmtDate(o.createdAt)}</Td>
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
