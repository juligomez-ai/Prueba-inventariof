import Link from "next/link";
import { saveWarehouseAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TransferForm } from "@/components/adjust-forms";
import { Card, CardBody, CardHeader, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { warehouseTypeLabel } from "@/shared/labels";
import { fmtDateTime, fmtMoney, fmtQty, n } from "@/shared/numbers";

export default async function Warehouses() {
  const [warehouses, transfers] = await Promise.all([
    prisma.warehouse.findMany({ include: { containers: { where: { status: { in: ["SELLADO", "ABIERTO"] } }, include: { product: true } } }, orderBy: { code: "asc" } }),
    prisma.stockMovement.findMany({ where: { type: "TRASLADO_SAL" }, include: { product: true, warehouse: true, toWarehouse: true, container: true }, orderBy: { number: "desc" }, take: 20 }),
  ]);
  return (
    <>
      <PageHeader title="Bodegas y traslados" description="Dónde está cada cosa. Un traslado mueve el bulto sin cambiar su costo (M2, RN-2.1)." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Table>
            <thead><tr><Th>Código</Th><Th>Nombre</Th><Th>Tipo</Th><Th className="text-right">Bultos</Th><Th className="text-right">Valor</Th></tr></thead>
            <tbody>
              {warehouses.map((w) => (
                <tr key={w.id}>
                  <Td className="font-medium">{w.code}</Td><Td>{w.name}</Td><Td>{warehouseTypeLabel[w.type]}</Td>
                  <Td className="text-right">{w.containers.length}</Td>
                  <Td className="text-right tabular">{fmtMoney(w.containers.reduce((s, c) => s + n(c.currentQty) * n(c.product.avgCost), 0))}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Nueva bodega" />
          <CardBody>
            <ActionForm action={saveWarehouseAction} resetOnSuccess>
              <Field label="Código"><Input name="code" required placeholder="BOD-02" /></Field>
              <Field label="Nombre"><Input name="name" required /></Field>
              <Field label="Tipo"><Select name="type">{Object.entries(warehouseTypeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <SubmitButton>Crear bodega</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Trasladar un bulto" description="Escanea su serial. Si trasladas solo una parte, se crea un bulto nuevo en la bodega destino." />
        <CardBody><TransferForm warehouses={warehouses.filter((w) => w.active).map((w) => ({ id: w.id, code: w.code, name: w.name }))} /></CardBody>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Traslados recientes" />
        <Table>
          <thead><tr><Th>#</Th><Th>Fecha</Th><Th>Documento</Th><Th>Producto</Th><Th>Serial</Th><Th>De → a</Th><Th className="text-right">Cantidad</Th></tr></thead>
          <tbody>
            {transfers.map((m) => (
              <tr key={m.id}>
                <Td><Link className="text-primary hover:underline" href={`/kardex/${m.id}`}>{m.number}</Link></Td>
                <Td className="text-xs">{fmtDateTime(m.createdAt)}</Td><Td>{m.documentNumber}</Td><Td>{m.product.name}</Td>
                <Td className="font-mono text-xs">{m.container?.serial}</Td><Td>{m.warehouse.code} → {m.toWarehouse?.code}</Td>
                <Td className="text-right tabular">{fmtQty(-n(m.quantity), m.product.baseUnit)}</Td>
              </tr>
            ))}
            {transfers.length === 0 && <tr><Td className="text-muted">Sin traslados.</Td></tr>}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
