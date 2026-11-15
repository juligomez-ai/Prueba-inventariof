import Link from "next/link";
import { notFound } from "next/navigation";
import { completeOrderAction, orderTransitionAction } from "@/app/actions";
import { checkFeasibility } from "@/application/use-cases/production";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { LotStatusBadge, OpStatusBadge } from "@/components/badges";
import { FeasibilityTable } from "@/components/feasibility-table";
import { PrintButton } from "@/components/print-button";
import { Badge, ButtonLink, Card, CardBody, CardHeader, Field, Input, Notice, PageHeader, Select, Stat, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtDate, fmtDateTime, fmtMoney, fmtPct, fmtQty, n } from "@/shared/numbers";

export default async function OrderPage(props: PageProps<"/produccion/[id]">) {
  const { id } = await props.params;
  const o = await prisma.productionOrder.findUnique({
    where: { id },
    include: {
      product: true,
      recipe: true,
      outputLot: { include: { containers: true } },
      lines: { include: { product: true } },
      reservations: { include: { container: { include: { lot: true } } } },
    },
  });
  if (!o) notFound();
  const [feas, warehouses, consumptions] = await Promise.all([
    o.status === "BORRADOR" ? checkFeasibility(o.productId, n(o.plannedQty), { excludeOrderId: o.id }).catch(() => null) : null,
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.stockMovement.findMany({ where: { documentType: "OP", documentId: o.id, type: "SAL_CONSUMO" }, include: { lot: true, container: true, product: true }, orderBy: { number: "asc" } }),
  ]);
  const unit = o.product.baseUnit;
  const planned = n(o.plannedQty);
  const produced = n(o.producedQty);
  const theoretical = n(o.theoreticalCost);
  const actual = o.actualCost !== null ? n(o.actualCost) : null;
  const ptWarehouse = warehouses.find((w) => w.type === "PRODUCTO_TERMINADO");

  return (
    <>
      <PageHeader
        title={`${o.code} · ${o.product.name}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <OpStatusBadge status={o.status} />
            {o.createdByAI && <Badge tone="purple">Creada con Copiloto IA</Badge>}
            <span>Fórmula <Link className="text-primary hover:underline" href={`/formulas/${o.productId}`}>{o.recipe.name}</Link> · planeada {fmtDate(o.plannedDate)}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <PrintButton label="Imprimir hoja de trabajo" />
            {(o.status === "BORRADOR" || o.status === "EN_PROCESO") && (
              <ActionForm action={orderTransitionAction}>
                <input type="hidden" name="id" value={o.id} />
                <div className="flex gap-2">
                  {o.status === "BORRADOR" && <SubmitButton name="op" value="start">Iniciar y reservar lotes</SubmitButton>}
                  <SubmitButton name="op" value="cancel" variant="outline">Anular</SubmitButton>
                </div>
              </ActionForm>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cantidad planeada" value={fmtQty(planned, unit)} />
        <Stat label="Producido" value={produced ? fmtQty(produced, unit) : "—"} sub={produced ? `Rendimiento ${fmtPct((produced / planned) * 100)}` : undefined} />
        <Stat label="Costo teórico" value={fmtMoney(theoretical)} sub={`${fmtMoney(theoretical / planned)} por unidad`} />
        <Stat
          label="Costo real"
          value={actual !== null ? fmtMoney(actual) : "—"}
          sub={actual !== null && produced ? `${fmtMoney(actual / produced)} por unidad · variación ${fmtMoney(actual / produced - theoretical / planned)}` : undefined}
          tone={actual !== null && produced && actual / produced > (theoretical / planned) * 1.02 ? "yellow" : undefined}
        />
      </div>

      {o.notes && <div className="mt-4"><Notice tone="blue">{o.notes}</Notice></div>}

      {feas && (
        <Card className="mt-6">
          <CardHeader
            title="Disponibilidad de insumos"
            description={feas.feasible ? "Hay stock suficiente. Al iniciar se reservan los bultos con FEFO." : `Faltan insumos: máximo producible ${fmtQty(feas.maxProducible, unit)} · no se puede iniciar hasta cubrirlos.`}
            actions={!feas.feasible ? <ButtonLink variant="outline" href={`/compras/nueva?op=${o.id}`}>Crear OC con faltantes</ButtonLink> : undefined}
          />
          <FeasibilityTable f={feas} />
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Insumos de la orden" description="Copia de la fórmula al crear la orden (RN-8.3)." />
        <Table>
          <thead><tr><Th>Insumo</Th><Th className="text-right">Planeado</Th><Th>Bultos reservados (FEFO)</Th><Th className="text-right">Consumido</Th><Th className="text-right">Costo real</Th></tr></thead>
          <tbody>
            {o.lines.map((l) => {
              const res = o.reservations.filter((r) => r.productId === l.productId);
              const cons = consumptions.filter((m) => m.productId === l.productId);
              return (
                <tr key={l.id}>
                  <Td>{l.product.sku} · {l.product.name}</Td>
                  <Td className="text-right tabular">{fmtQty(n(l.plannedQty), l.product.baseUnit)}</Td>
                  <Td className="text-xs">
                    {res.map((r) => <div key={r.id}><span className="font-mono">{r.container.serial}</span> · lote {r.container.lot?.code ?? "—"} · {fmtQty(n(r.quantity), l.product.baseUnit)}</div>)}
                    {cons.map((m) => <div key={m.id} className="text-muted"><span className="font-mono">{m.container?.serial}</span> · lote {m.lot?.code ?? "—"} · {fmtQty(-n(m.quantity), l.product.baseUnit)}</div>)}
                  </Td>
                  <Td className="text-right tabular">{l.consumedQty !== null ? fmtQty(n(l.consumedQty), l.product.baseUnit) : "—"}</Td>
                  <Td className="text-right tabular">{l.consumedQty !== null ? fmtMoney(n(l.consumedQty) * n(l.unitCost)) : "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {o.status === "EN_PROCESO" && (
        <Card className="mt-6 print:hidden">
          <CardHeader title="Completar orden" description="Registra lo que realmente se consumió y las unidades buenas. Todo se aplica en una sola transacción (RF-9.7)." />
          <CardBody>
            <ActionForm action={completeOrderAction} className="space-y-4">
              <input type="hidden" name="id" value={o.id} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {o.lines.map((l) => (
                  <Field key={l.id} label={l.product.name} hint={`(${l.product.baseUnit})`}>
                    <input type="hidden" name="consumed.productId" value={l.productId} />
                    <Input name="consumed.qty" type="number" step="any" min={0} defaultValue={n(l.plannedQty)} />
                  </Field>
                ))}
              </div>
              <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-4">
                <Field label="Unidades buenas producidas"><Input name="producedQty" type="number" step={1} min={1} defaultValue={planned} required /></Field>
                <Field label="Unidades por caja"><Input name="packSize" type="number" step={1} min={1} defaultValue={n(o.product.defaultPackSize) || ""} /></Field>
                <Field label="Bodega de entrega">
                  <Select name="warehouseId" defaultValue={ptWarehouse?.id}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</Select>
                </Field>
                <Field label="Código de lote" hint="(vacío = automático)"><Input name="lotCode" placeholder="PT001-AAMMDD-01" /></Field>
              </div>
              <SubmitButton>Completar orden</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      )}

      {o.outputLot && (
        <Card className="mt-6">
          <CardHeader
            title={<>Lote producido <Link className="text-primary hover:underline" href={`/lotes/${o.outputLot.id}`}>{o.outputLot.code}</Link> <LotStatusBadge status={o.outputLot.status} /></>}
            description={`Vence ${fmtDate(o.outputLot.expiryDate)} · ${o.outputLot.containers.length} caja(s) · completada ${fmtDateTime(o.completedAt)}`}
            actions={
              <div className="flex gap-2 print:hidden">
                <ButtonLink variant="outline" href={`/api/etiquetas?serials=${o.outputLot.containers.map((c) => c.serial).join(",")}`} target="_blank">Imprimir etiquetas</ButtonLink>
                {o.outputLot.status === "CUARENTENA" && <ButtonLink href="/calidad">Ir a liberar</ButtonLink>}
              </div>
            }
          />
          <CardBody className="flex flex-wrap gap-2 text-xs">
            {o.outputLot.containers.map((c) => <span key={c.id} className="rounded border border-border px-2 py-1 font-mono">{c.serial} · {fmtQty(n(c.initialQty), unit)}</span>)}
          </CardBody>
        </Card>
      )}

      {o.recipe.instructions && <Card className="mt-6 p-5 text-sm"><div className="mb-1 font-semibold">Instrucciones de proceso</div>{o.recipe.instructions}</Card>}
    </>
  );
}
