import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveProductAction, markOpenAction } from "@/app/actions";
import { inTransitByProduct } from "@/application/use-cases/insights";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CostHistoryChart } from "@/components/cost-history-chart";
import { ContainerStatusBadge, ExpiryBadge, LotStatusBadge, MovementBadge, ProductTypeBadge, StockLight } from "@/components/badges";
import { Badge, ButtonLink, Card, CardHeader, Empty, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { stockSummary, ACTIVE_STATUSES } from "@/infrastructure/database/stock";
import { documentHref, movementLabel } from "@/shared/labels";
import { fmtDate, fmtDateTime, fmtMoney, fmtPct, fmtQty, n } from "@/shared/numbers";

export default async function ProductPage(props: PageProps<"/productos/[id]">) {
  const { id } = await props.params;
  const p = await prisma.product.findUnique({
    where: { id },
    include: {
      preferredSupplier: true,
      conversions: true,
      recipe: true,
      containers: { where: { status: { in: ACTIVE_STATUSES } }, include: { lot: true, warehouse: true, reservations: { where: { order: { status: "EN_PROCESO" } }, include: { order: true } } }, orderBy: { serial: "asc" } },
      movements: { orderBy: { number: "desc" }, take: 12, include: { lot: true, warehouse: true, container: true } },
    },
  });
  if (!p) notFound();
  const s = (await stockSummary(prisma, [p.id])).get(p.id) ?? { onHand: 0, reserved: 0, quarantine: 0, blocked: 0, available: 0 };
  const transit = (await inTransitByProduct()).get(p.id) ?? 0;
  // RF-4.7: puntos donde cambió el costo promedio (más el primero)
  const costMoves = await prisma.stockMovement.findMany({ where: { productId: p.id }, orderBy: { number: "asc" }, select: { createdAt: true, avgCostBefore: true, avgCostAfter: true, documentNumber: true, type: true } });
  const costPoints = costMoves
    .filter((m, i) => i === 0 || Math.abs(n(m.avgCostAfter) - n(m.avgCostBefore)) > 0.005)
    .map((m) => ({ at: m.createdAt.toISOString(), cost: n(m.avgCostAfter), doc: m.documentNumber, movement: movementLabel[m.type].name }));
  const avg = n(p.avgCost);
  const price = n(p.salePrice);
  const u = p.baseUnit;

  return (
    <>
      <PageHeader
        title={`${p.sku} · ${p.name}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ProductTypeBadge type={p.type} /> <StockLight qty={s.available} min={n(p.minStock)} safety={n(p.safetyStock)} />
            {p.archived && <Badge tone="red">Archivado</Badge>}
            <span>{p.category} · unidad base {u}{p.tracksLot ? " · controla lote" : ""}{p.tracksExpiry ? " y vencimiento" : ""}</span>
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/kardex?producto=${p.id}`} variant="outline">Kardex</ButtonLink>
            <ButtonLink href={`/etiquetas?producto=${p.id}`} variant="outline">Etiquetas</ButtonLink>
            <ButtonLink href={`/productos/${p.id}/editar`} variant="outline">Editar</ButtonLink>
            <ActionForm action={archiveProductAction}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="archived" value={p.archived ? "0" : "1"} />
              <SubmitButton variant="ghost">{p.archived ? "Reactivar" : "Archivar"}</SubmitButton>
            </ActionForm>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Físico" value={fmtQty(s.onHand, u)} />
        <Stat label="Disponible" value={fmtQty(s.available, u)} tone={s.available <= n(p.minStock) ? "yellow" : undefined} />
        <Stat label="Reservado" value={fmtQty(s.reserved, u)} />
        <Stat label="Cuarentena" value={fmtQty(s.quarantine, u)} />
        <Stat label="En tránsito" value={fmtQty(transit, u)} />
        <Stat label="Costo promedio" value={fmtMoney(avg)} sub={`por ${u}`} />
        <Stat label="Valor" value={fmtMoney(s.onHand * avg)} sub={price ? `Margen bruto ${fmtPct(((price - avg) / price) * 100)}` : undefined} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
        <span>Mínimo {fmtQty(n(p.minStock), u)} · seguridad {fmtQty(n(p.safetyStock), u)} · reposición {p.leadTimeDays} días</span>
        {p.preferredSupplier && <span>Proveedor preferido: {p.preferredSupplier.name}</span>}
        {p.conversions.length > 0 && <span>Unidades de compra: {p.conversions.map((c) => `${c.unit} = ${n(c.factor)} ${u}`).join(" · ")}</span>}
        {p.barcode && <span>Código fabricante: <span className="font-mono">{p.barcode}</span></span>}
        {p.nsoCode && <span>NSO INVIMA {p.nsoCode} (vence {fmtDate(p.nsoExpiry)})</span>}
        {price > 0 && <span>Precio de venta {fmtMoney(price)}</span>}
        {p.type === "PRODUCTO_TERMINADO" && <Link className="text-primary hover:underline" href={`/formulas/${p.id}`}>{p.recipe ? "Ver fórmula" : "Crear fórmula"}</Link>}
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Historial del costo promedio"
          description={`Costo por ${u}. Cambia con cada compra o producción; las salidas no lo modifican (RN-4.1).`}
          actions={<Link className="text-sm text-primary hover:underline" href={`/kardex?producto=${p.id}`}>Ver en tabla (Kardex)</Link>}
        />
        <CostHistoryChart points={costPoints} unit={u} now={new Date().toISOString()} />
      </Card>

      <Card className="mt-6">
        <CardHeader title="Bultos en inventario" description="Cada saco, garrafa o caja con su serial (M5.1). La suma cuadra con el Kardex." />
        {p.containers.length === 0 ? (
          <Empty>Sin existencias. <Link className="text-primary hover:underline" href="/ajustes">Cargar inventario</Link></Empty>
        ) : (
          <Table>
            <thead>
              <tr><Th>Serial</Th><Th>Bodega</Th><Th>Lote</Th><Th>Estado lote</Th><Th>Vence</Th><Th>Bulto</Th><Th className="text-right">Actual / inicial</Th><Th>Reservado</Th><Th></Th></tr>
            </thead>
            <tbody>
              {p.containers.map((c) => (
                <tr key={c.id}>
                  <Td className="font-mono text-xs">{c.serial}</Td>
                  <Td>{c.warehouse.code}</Td>
                  <Td>{c.lot ? <Link className="text-primary hover:underline" href={`/lotes/${c.lot.id}`}>{c.lot.code}</Link> : "—"}</Td>
                  <Td>{c.lot ? <LotStatusBadge status={c.lot.status} /> : "—"}</Td>
                  <Td><ExpiryBadge date={c.lot?.expiryDate} /></Td>
                  <Td><ContainerStatusBadge status={c.status} /></Td>
                  <Td className="text-right tabular">{fmtQty(n(c.currentQty), u)} / {fmtQty(n(c.initialQty))}</Td>
                  <Td className="text-xs">{c.reservations.map((r) => <Link key={r.id} className="block text-primary hover:underline" href={`/produccion/${r.orderId}`}>{r.order.code}: {fmtQty(n(r.quantity), u)}</Link>)}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <Link className="mr-2 text-xs text-primary hover:underline" href={`/api/etiquetas?serials=${c.serial}`} target="_blank">Etiqueta</Link>
                    {c.status === "SELLADO" && (
                      <ActionForm action={markOpenAction} className="inline-block">
                        <input type="hidden" name="containerId" value={c.id} />
                        <SubmitButton variant="ghost" className="px-2 py-1 text-xs">Marcar abierto</SubmitButton>
                      </ActionForm>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Últimos movimientos" actions={<Link className="text-sm text-primary hover:underline" href={`/kardex?producto=${p.id}`}>Kardex completo</Link>} />
        {p.movements.length === 0 ? <Empty>Sin movimientos.</Empty> : (
          <Table>
            <thead><tr><Th>#</Th><Th>Fecha</Th><Th>Movimiento</Th><Th>Documento</Th><Th>Lote / serial</Th><Th className="text-right">Cantidad</Th><Th className="text-right">Saldo</Th></tr></thead>
            <tbody>
              {p.movements.map((m) => (
                <tr key={m.id}>
                  <Td><Link className="text-primary hover:underline" href={`/kardex/${m.id}`}>{m.number}</Link></Td>
                  <Td className="whitespace-nowrap text-xs">{fmtDateTime(m.createdAt)}</Td>
                  <Td><MovementBadge type={m.type} /></Td>
                  <Td><Link className="text-primary hover:underline" href={documentHref(m.documentType, m.documentId)}>{m.documentNumber}</Link></Td>
                  <Td className="text-xs">{m.lot?.code ?? "—"}<div className="font-mono text-muted">{m.container?.serial}</div></Td>
                  <Td className={`text-right tabular ${n(m.quantity) < 0 ? "text-red-700" : "text-green-700"}`}>{fmtQty(n(m.quantity), u)}</Td>
                  <Td className="text-right tabular">{fmtQty(n(m.balanceAfter), u)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
