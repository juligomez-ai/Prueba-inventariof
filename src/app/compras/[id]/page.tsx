import Link from "next/link";
import { notFound } from "next/navigation";
import { addShipmentAction, purchaseTransitionAction, receiveAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PoStatusBadge } from "@/components/badges";
import { ShipmentCard } from "@/components/shipment-card";
import { Badge, ButtonLink, Card, CardBody, CardHeader, Empty, Field, Input, Notice, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, n } from "@/shared/numbers";

export default async function PurchasePage(props: PageProps<"/compras/[id]">) {
  const { id } = await props.params;
  const o = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      lines: { include: { product: true } },
      receipts: { include: { lines: { include: { line: { include: { product: true } } } } }, orderBy: { createdAt: "desc" } },
      shipments: { include: { carrier: true, events: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!o) notFound();
  const [carriers, warehouses, receiptMovements] = await Promise.all([
    prisma.carrier.findMany({ orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.stockMovement.findMany({ where: { documentType: "OC", documentId: o.id }, include: { container: true } }),
  ]);
  const subtotal = o.lines.reduce((s, l) => s + n(l.quantity) * n(l.unitPrice), 0);
  const tax = o.lines.reduce((s, l) => s + n(l.quantity) * n(l.unitPrice) * (n(l.taxRate) / 100), 0);
  const canReceive = ["ENVIADA", "EN_TRANSITO", "RECIBIDA_PARCIAL"].includes(o.status);
  const mpWarehouse = warehouses.find((w) => w.type === (o.lines[0]?.product.type === "EMPAQUE" ? "EMPAQUE" : "MATERIAS_PRIMAS"));
  const late = o.expectedDate && o.expectedDate < new Date() && canReceive;

  return (
    <>
      <PageHeader
        title={`${o.code} · ${o.supplier.name}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <PoStatusBadge status={o.status} /> {late && <Badge tone="red">Retrasada</Badge>} {o.createdByAI && <Badge tone="purple">Creada con Copiloto IA</Badge>}
            <span>NIT {o.supplier.taxId} · esperada {fmtDate(o.expectedDate)} · plazo de pago {o.supplier.paymentTermDays} días</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
          <ButtonLink variant="outline" href={`/api/orden-compra/${o.id}`} target="_blank">OC en PDF</ButtonLink>
          {(o.status === "BORRADOR" || o.status === "ENVIADA" || o.status === "EN_TRANSITO") && (
            <ActionForm action={purchaseTransitionAction}>
              <input type="hidden" name="id" value={o.id} />
              <div className="flex gap-2">
                {o.status === "BORRADOR" && <SubmitButton name="op" value="send">Marcar como enviada</SubmitButton>}
                <SubmitButton name="op" value="cancel" variant="outline">Anular</SubmitButton>
              </div>
            </ActionForm>
          )}
          </div>
        }
      />
      {o.notes && <div className="mb-4"><Notice tone="blue">{o.notes}</Notice></div>}

      <Card>
        <CardHeader title="Productos" />
        <Table>
          <thead><tr><Th>Producto</Th><Th className="text-right">Cantidad</Th><Th className="text-right">Precio sin IVA</Th><Th className="text-right">Costo por unidad base</Th><Th className="text-right">Recibido</Th><Th className="text-right">Subtotal</Th></tr></thead>
          <tbody>
            {o.lines.map((l) => {
              const base = n(l.quantity) * n(l.factor);
              return (
                <tr key={l.id}>
                  <Td><Link className="hover:underline" href={`/productos/${l.productId}`}>{l.product.sku} · {l.product.name}</Link></Td>
                  <Td className="text-right tabular">{fmtQty(n(l.quantity))} {l.unit}{n(l.factor) !== 1 && <div className="text-xs text-muted">= {fmtQty(base, l.product.baseUnit)}</div>}</Td>
                  <Td className="text-right tabular">{fmtMoney(n(l.unitPrice))}</Td>
                  <Td className="text-right tabular">{fmtMoney(n(l.unitPrice) / n(l.factor))}/{l.product.baseUnit}</Td>
                  <Td className="text-right tabular">{fmtQty(n(l.receivedQty), l.product.baseUnit)} / {fmtQty(base)}</Td>
                  <Td className="text-right tabular">{fmtMoney(n(l.quantity) * n(l.unitPrice))}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <CardBody className="text-right text-sm tabular">
          Subtotal {fmtMoney(subtotal)} · IVA {fmtMoney(tax)} · <b>Total {fmtMoney(subtotal + tax)}</b>
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h2 className="font-semibold">Envíos y seguimiento</h2>
          {o.shipments.map((s) => <ShipmentCard key={s.id} s={s} inbound />)}
          {o.status !== "ANULADA" && o.status !== "RECIBIDA" && o.status !== "BORRADOR" && (
            <Card>
              <CardHeader title="Registrar envío del proveedor" description="Transportadora, número de guía y fecha estimada (RF-7.1)." />
              <CardBody>
                <ActionForm action={addShipmentAction} className="grid gap-3 sm:grid-cols-2" resetOnSuccess>
                  <input type="hidden" name="purchaseOrderId" value={o.id} />
                  <Field label="Transportadora"><Select name="carrierId">{carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
                  <Field label="Número de guía"><Input name="trackingNumber" required /></Field>
                  <Field label="Fecha de despacho"><Input name="shippedAt" type="date" /></Field>
                  <Field label="Llegada estimada (ETA)"><Input name="eta" type="date" /></Field>
                  <div className="sm:col-span-2"><SubmitButton variant="outline">Registrar envío</SubmitButton></div>
                </ActionForm>
              </CardBody>
            </Card>
          )}
          {o.status === "BORRADOR" && <Card><Empty>Marca la OC como enviada para registrar el envío del proveedor.</Empty></Card>}
        </div>

        <div className="space-y-4">
          <h2 className="font-semibold">Recepción</h2>
          {canReceive && (
            <Card>
              <CardHeader title="Recibir mercancía" description="Total o parcial. Cada bulto recibe su serial y etiqueta (M5.1). La remisión del proveedor es obligatoria." />
              <CardBody>
                <ActionForm action={receiveAction} className="space-y-4">
                  <input type="hidden" name="id" value={o.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Remisión del proveedor"><Input name="supplierRemission" required placeholder="RM-00000" /></Field>
                    <Field label="Bodega destino"><Select name="warehouseId" defaultValue={mpWarehouse?.id}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</Select></Field>
                  </div>
                  {o.lines.map((l) => {
                    const pending = (n(l.quantity) * n(l.factor) - n(l.receivedQty)) / n(l.factor);
                    if (pending <= 1e-9) return null;
                    return (
                      <fieldset key={l.id} className="rounded-lg border border-border p-3">
                        <legend className="px-1 text-sm font-medium">{l.product.name} <span className="font-normal text-muted">· pendiente {fmtQty(pending)} {l.unit}</span></legend>
                        <input type="hidden" name="r.lineId" value={l.id} />
                        <div className="grid gap-2 sm:grid-cols-4">
                          <Field label={`Recibido (${l.unit})`}><Input name="r.quantity" type="number" step="any" min={0} defaultValue={pending} /></Field>
                          <Field label="Bultos"><Input name="r.containers" type="number" min={1} step={1} defaultValue={1} /></Field>
                          {l.product.tracksLot ? <Field label="Lote proveedor"><Input name="r.lotCode" required /></Field> : <input type="hidden" name="r.lotCode" value="" />}
                          {l.product.tracksExpiry ? <Field label="Vencimiento"><Input name="r.expiryDate" type="date" required /></Field> : <input type="hidden" name="r.expiryDate" value="" />}
                        </div>
                      </fieldset>
                    );
                  })}
                  <SubmitButton>Registrar recepción</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          )}
          {o.receipts.length === 0 ? <Card><Empty>Sin recepciones.</Empty></Card> : o.receipts.map((r) => {
            const serials = receiptMovements.filter((m) => m.reason === `Recepción ${r.code}`).map((m) => m.container?.serial).filter(Boolean);
            return (
              <Card key={r.id}>
                <CardHeader
                  title={`${r.code} · remisión ${r.supplierRemission}`}
                  description={`${fmtDateTime(r.createdAt)} · ${r.userName}`}
                  actions={serials.length > 0 && <ButtonLink variant="outline" href={`/api/etiquetas?serials=${serials.join(",")}`} target="_blank">Etiquetas ({serials.length})</ButtonLink>}
                />
                <ul className="divide-y divide-border text-sm">
                  {r.lines.map((x) => (
                    <li key={x.id} className="px-5 py-2">
                      {x.line.product.name}: {fmtQty(n(x.quantity), x.line.product.baseUnit)} en {x.containers} bulto(s){x.lotCode ? ` · lote ${x.lotCode}` : ""}{x.expiryDate ? ` · vence ${fmtDate(x.expiryDate)}` : ""}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
