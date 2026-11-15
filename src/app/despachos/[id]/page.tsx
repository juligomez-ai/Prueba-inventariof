import Link from "next/link";
import { notFound } from "next/navigation";
import { attachProofAction, dispatchTransitionAction, shipDispatchAction } from "@/app/actions";
import { MIN_SHELF_LIFE_DAYS } from "@/application/use-cases/dispatches";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { DispatchStatusBadge, ExpiryBadge } from "@/components/badges";
import { PickScanner } from "@/components/pick-scanner";
import { ShipmentCard } from "@/components/shipment-card";
import { Badge, ButtonLink, Card, CardBody, CardHeader, Field, Input, Notice, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtDate, fmtMoney, fmtQty, n } from "@/shared/numbers";

export default async function DispatchPage(props: PageProps<"/despachos/[id]">) {
  const { id } = await props.params;
  const d = await prisma.dispatch.findUnique({
    where: { id },
    include: {
      lines: { include: { product: true } },
      allocations: { include: { container: { include: { lot: true, product: true, warehouse: true } } } },
      shipment: { include: { carrier: true, events: true } },
    },
  });
  if (!d) notFound();
  const carriers = await prisma.carrier.findMany({ orderBy: { name: "asc" } });
  const movements = await prisma.stockMovement.findMany({ where: { documentType: "REM", documentId: d.id }, include: { lot: true, container: true, product: true }, orderBy: { number: "asc" } });
  const picked = d.allocations.filter((a) => a.picked).length;
  const allPicked = d.allocations.length > 0 && picked === d.allocations.length;

  return (
    <>
      <PageHeader
        title={`Remisión ${d.code}`}
        description={<span className="flex flex-wrap items-center gap-2"><DispatchStatusBadge status={d.status} /> {d.customerName} · NIT {d.customerTaxId} · {d.address}, {d.city}{d.salesRef ? ` · ${d.salesRef}` : ""}</span>}
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink variant="outline" href={`/api/remision/${d.id}`} target="_blank">Remisión PDF</ButtonLink>
            {(d.status === "PENDIENTE" || d.status === "EN_ALISTAMIENTO") && (
              <ActionForm action={dispatchTransitionAction}>
                <input type="hidden" name="id" value={d.id} />
                <div className="flex gap-2">
                  {d.status === "PENDIENTE" && <SubmitButton name="op" value="pick">Alistar (asignar cajas FEFO)</SubmitButton>}
                  {d.status === "EN_ALISTAMIENTO" && <SubmitButton name="op" value="unpick" variant="outline">Cancelar alistamiento</SubmitButton>}
                  {d.status === "PENDIENTE" && <SubmitButton name="op" value="delete" variant="ghost">Eliminar</SubmitButton>}
                </div>
              </ActionForm>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Productos" description={`FEFO, solo lotes liberados y con más de ${MIN_SHELF_LIFE_DAYS} días de vida útil (RN-12.1).`} />
          <Table>
            <thead><tr><Th>Producto</Th><Th className="text-right">Cantidad</Th></tr></thead>
            <tbody>
              {d.lines.map((l) => <tr key={l.id}><Td>{l.product.sku} · {l.product.name}</Td><Td className="text-right tabular">{fmtQty(n(l.quantity), "und")}</Td></tr>)}
            </tbody>
          </Table>
        </Card>

        {d.status === "EN_ALISTAMIENTO" && (
          <Card>
            <CardHeader title="Verificar con escáner" description={`${picked} de ${d.allocations.length} cajas verificadas.`} />
            <CardBody><PickScanner dispatchId={d.id} /></CardBody>
          </Card>
        )}
      </div>

      {d.allocations.length > 0 && d.status === "EN_ALISTAMIENTO" && (
        <Card className="mt-6">
          <CardHeader title="Lista de alistamiento (picking)" description="Cajas asignadas por FEFO. Escanea cada una antes de despachar." />
          <Table>
            <thead><tr><Th>Serial</Th><Th>Producto</Th><Th>Lote</Th><Th>Vence</Th><Th>Bodega</Th><Th className="text-right">Cantidad</Th><Th>Verificada</Th></tr></thead>
            <tbody>
              {d.allocations.map((a) => (
                <tr key={a.id} className={a.picked ? "bg-green-50" : ""}>
                  <Td className="font-mono text-xs">{a.container.serial}</Td>
                  <Td>{a.container.product.name}</Td>
                  <Td>{a.container.lot?.code}</Td>
                  <Td><ExpiryBadge date={a.container.lot?.expiryDate} /></Td>
                  <Td>{a.container.warehouse.code}</Td>
                  <Td className="text-right tabular">{fmtQty(n(a.quantity), "und")}{n(a.quantity) < n(a.container.currentQty) && <div className="text-xs text-muted">de una caja con {fmtQty(n(a.container.currentQty))}</div>}</Td>
                  <Td>{a.picked ? <Badge tone="green">✓</Badge> : <Badge>Pendiente</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {d.status === "EN_ALISTAMIENTO" && (
        <Card className="mt-6">
          <CardHeader title="Despachar" description="Genera la salida (GI) por lote con el número de remisión y registra el envío." />
          <CardBody>
            {!allPicked && <div className="mb-3"><Notice>Faltan cajas por verificar con el escáner.</Notice></div>}
            <ActionForm action={shipDispatchAction} className="grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="id" value={d.id} />
              <Field label="Transportadora"><Select name="carrierId">{carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Número de guía"><Input name="trackingNumber" required /></Field>
              <Field label="Entrega estimada"><Input name="eta" type="date" /></Field>
              <Field label="Costo del flete"><Input name="freightCost" type="number" min={0} /></Field>
              <div className="sm:col-span-4"><SubmitButton>Despachar</SubmitButton></div>
            </ActionForm>
          </CardBody>
        </Card>
      )}

      {movements.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Salidas registradas" description={`Despachado ${fmtDate(d.shippedAt)}${d.freightCost ? ` · flete ${fmtMoney(n(d.freightCost))}` : ""}`} />
          <Table>
            <thead><tr><Th>#</Th><Th>Producto</Th><Th>Lote</Th><Th>Serial</Th><Th className="text-right">Cantidad</Th><Th className="text-right">Costo</Th></tr></thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <Td><Link className="text-primary hover:underline" href={`/kardex/${m.id}`}>{m.number}</Link></Td>
                  <Td>{m.product.name}</Td>
                  <Td>{m.lot ? <Link className="text-primary hover:underline" href={`/lotes/${m.lot.id}`}>{m.lot.code}</Link> : "—"}</Td>
                  <Td className="font-mono text-xs">{m.container?.serial}</Td>
                  <Td className="text-right tabular">{fmtQty(-n(m.quantity), "und")}</Td>
                  <Td className="text-right tabular">{fmtMoney(-n(m.totalValue))}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {d.shipment && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <ShipmentCard s={d.shipment} inbound={false} />
          <Card>
            <CardHeader title="Prueba de entrega (POD)" description="Remisión firmada por quien recibe (RF-12.5c)." />
            <CardBody className="space-y-3">
              {d.proofDataUrl ? (
                d.proofDataUrl.startsWith("data:image") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.proofDataUrl} alt="Remisión firmada" className="max-h-72 rounded border border-border" />
                ) : (
                  <a className="text-primary hover:underline" href={d.proofDataUrl} download={`${d.code}-firmada`}>Descargar remisión firmada</a>
                )
              ) : (
                <p className="text-sm text-muted">Aún no se ha adjuntado.</p>
              )}
              <ActionForm action={attachProofAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={d.id} />
                <input type="file" name="proof" accept="image/*,application/pdf" capture="environment" className="text-sm" required />
                <SubmitButton variant="outline">Adjuntar</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
