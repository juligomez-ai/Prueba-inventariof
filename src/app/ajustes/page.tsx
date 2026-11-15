import Link from "next/link";
import { adjustUpAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AdjustDownForm } from "@/components/adjust-forms";
import { MovementBadge } from "@/components/badges";
import { ButtonLink, Card, CardBody, CardHeader, Empty, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { adjustmentReasonLabel } from "@/shared/labels";
import { fmtDateTime, fmtMoney, fmtQty, n } from "@/shared/numbers";

export default async function Adjustments(props: PageProps<"/ajustes">) {
  const sp = await props.searchParams;
  const doc = typeof sp.doc === "string" ? sp.doc : null;
  const [products, warehouses, movements] = await Promise.all([
    prisma.product.findMany({ where: { archived: false }, orderBy: { sku: "asc" } }),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.stockMovement.findMany({
      where: { documentType: "AJ", ...(doc ? { documentId: doc } : { type: { not: "INV_INICIAL" } }) },
      include: { product: true, container: true, lot: true },
      orderBy: { number: "desc" },
      take: 60,
    }),
  ]);
  // RF-11.4: pérdidas por motivo
  const byReason = new Map<string, number>();
  for (const m of movements) if (n(m.quantity) < 0) byReason.set(m.reason?.split(" · ")[0] ?? "Otro", (byReason.get(m.reason?.split(" · ")[0] ?? "Otro") ?? 0) + -n(m.totalValue));
  const lastAdj = await prisma.adjustment.findFirst({ orderBy: { createdAt: "desc" } });
  const lastSerials = lastAdj ? (await prisma.stockMovement.findMany({ where: { documentType: "AJ", documentId: lastAdj.id, quantity: { gt: 0 } }, include: { container: true } })).map((m) => m.container?.serial) : [];

  return (
    <>
      <PageHeader title="Ajustes de inventario" description="Toda corrección es un movimiento con motivo obligatorio; nunca se edita el stock directamente (M11, RN-3.2)." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Salida o baja de un bulto" description="Dañado, vencido o merma salen como Baja (SCR); el resto como ajuste negativo (ADJ)." />
          <CardBody><AdjustDownForm /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Entrada / inventario inicial" description="Crea el lote (si aplica) y los bultos con su serial. Pide el costo unitario (RF-11.3)." actions={lastSerials.length > 0 && <ButtonLink variant="outline" href={`/api/etiquetas?serials=${lastSerials.join(",")}`} target="_blank">Etiquetas del último ajuste</ButtonLink>} />
          <CardBody>
            <ActionForm action={adjustUpAction} className="grid gap-3 sm:grid-cols-2" resetOnSuccess>
              <Field label="Producto" className="sm:col-span-2">
                <Select name="productId">{products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name} ({p.baseUnit})</option>)}</Select>
              </Field>
              <Field label="Bodega"><Select name="warehouseId">{warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</Select></Field>
              <Field label="Motivo">
                <Select name="reason" defaultValue="INVENTARIO_INICIAL">
                  {(["INVENTARIO_INICIAL", "ERROR_REGISTRO", "CONTEO"] as const).map((k) => <option key={k} value={k}>{adjustmentReasonLabel[k]}</option>)}
                </Select>
              </Field>
              <Field label="Cantidad total"><Input name="quantity" type="number" step="any" min={0} required /></Field>
              <Field label="Número de bultos"><Input name="containers" type="number" min={1} step={1} defaultValue={1} /></Field>
              <Field label="Costo unitario" hint="(vacío = costo promedio)"><Input name="unitCost" type="number" step="any" min={0} /></Field>
              <Field label="Lote" hint="(si el producto lo controla)"><Input name="lotCode" /></Field>
              <Field label="Vencimiento"><Input name="expiryDate" type="date" /></Field>
              <Field label="Nota"><Input name="notes" /></Field>
              <div className="sm:col-span-2"><SubmitButton>Registrar entrada</SubmitButton></div>
            </ActionForm>
          </CardBody>
        </Card>
      </div>

      {byReason.size > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...byReason.entries()].map(([k, v]) => (
            <Card key={k} className="p-4"><div className="text-xs uppercase text-muted">Pérdidas · {k}</div><div className="mt-1 text-lg font-semibold tabular text-red-700">{fmtMoney(v)}</div></Card>
          ))}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title={doc ? "Movimientos del ajuste" : "Ajustes recientes"} actions={doc ? <Link className="text-sm text-primary hover:underline" href="/ajustes">Ver todos</Link> : undefined} />
        {movements.length === 0 ? <Empty>Sin ajustes.</Empty> : (
          <Table>
            <thead><tr><Th>#</Th><Th>Fecha</Th><Th>Documento</Th><Th>Movimiento</Th><Th>Producto</Th><Th>Serial</Th><Th className="text-right">Cantidad</Th><Th className="text-right">Valor</Th><Th>Motivo</Th></tr></thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <Td><Link className="text-primary hover:underline" href={`/kardex/${m.id}`}>{m.number}</Link></Td>
                  <Td className="whitespace-nowrap text-xs">{fmtDateTime(m.createdAt)}</Td>
                  <Td>{m.documentNumber}</Td>
                  <Td><MovementBadge type={m.type} /></Td>
                  <Td>{m.product.name}</Td>
                  <Td className="font-mono text-xs">{m.container?.serial}</Td>
                  <Td className="text-right tabular">{fmtQty(n(m.quantity), m.product.baseUnit)}</Td>
                  <Td className="text-right tabular">{fmtMoney(n(m.totalValue))}</Td>
                  <Td className="text-xs">{m.reason}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
