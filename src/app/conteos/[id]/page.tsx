import Link from "next/link";
import { notFound } from "next/navigation";
import { countTransitionAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CountStatusBadge } from "@/components/badges";
import { CountScanner } from "@/components/count-scanner";
import { Badge, Card, CardBody, CardHeader, Empty, Input, Notice, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtDateTime, fmtMoney, fmtPct, fmtQty, n } from "@/shared/numbers";

export default async function CountPage(props: PageProps<"/conteos/[id]">) {
  const { id } = await props.params;
  const c = await prisma.cycleCount.findUnique({
    where: { id },
    include: {
      warehouse: true,
      items: { include: { product: true } },
      lines: { include: { product: true, container: { include: { lot: true } } }, orderBy: { scannedAt: "desc" } },
    },
  });
  if (!c) notFound();
  const adjustments = c.status === "APROBADO" ? await prisma.stockMovement.findMany({ where: { documentType: "CC", documentId: c.id }, include: { product: true, container: true } }) : [];
  const diffs = c.lines.map((l) => ({ l, diff: n(l.countedQty) - n(l.systemQty), value: (n(l.countedQty) - n(l.systemQty)) * n(l.product.avgCost) }));
  const exact = diffs.filter((d) => Math.abs(d.diff) < 1e-9).length;
  const accuracy = c.lines.length ? (exact / c.lines.length) * 100 : 0;
  const netValue = diffs.reduce((s, d) => s + d.value, 0);

  return (
    <>
      <PageHeader
        title={`Conteo ${c.code} · ${c.warehouse.code}`}
        description={<span className="flex items-center gap-2"><CountStatusBadge status={c.status} /> {c.warehouse.name} · creado {fmtDateTime(c.createdAt)} por {c.userName}</span>}
        actions={
          c.status !== "APROBADO" && c.status !== "ANULADO" && (
            <ActionForm action={countTransitionAction}>
              <input type="hidden" name="id" value={c.id} />
              <div className="flex gap-2">
                {c.status === "EN_CURSO" && <SubmitButton name="op" value="close">Cerrar conteo</SubmitButton>}
                <SubmitButton name="op" value="cancel" variant="outline">Anular</SubmitButton>
              </div>
            </ActionForm>
          )
        }
      />

      {c.status === "EN_CURSO" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Escanear" description="Pistola USB/Bluetooth o cámara del celular. La cantidad del sistema no se muestra mientras cuentas." />
            <CardBody><CountScanner countId={c.id} /></CardBody>
            <Table>
              <thead><tr><Th>Hora</Th><Th>Serial</Th><Th>Producto</Th><Th>Lote</Th><Th>Cómo</Th><Th className="text-right">Contado</Th></tr></thead>
              <tbody>
                {c.lines.map((l) => (
                  <tr key={l.id}>
                    <Td className="text-xs">{fmtDateTime(l.scannedAt)}</Td>
                    <Td className="font-mono text-xs">{l.container?.serial}</Td>
                    <Td>{l.product.name}</Td>
                    <Td className="text-xs">{l.container?.lot?.code ?? "—"}</Td>
                    <Td>{l.sealedOk ? <Badge tone="blue">Caja sellada ✓</Badge> : <Badge tone="yellow">Contada</Badge>}</Td>
                    <Td className="text-right tabular">{l.sealedOk ? "—" : fmtQty(n(l.countedQty), l.product.baseUnit)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {c.lines.length === 0 && <Empty>Escanea el primer bulto.</Empty>}
          </Card>
          <Card>
            <CardHeader title="Productos a contar" description="Al cerrar, los bultos esperados que no se escanearon quedan como 'no encontrados'." />
            <ul className="divide-y divide-border text-sm">
              {c.items.map((i) => {
                const scanned = c.lines.filter((l) => l.productId === i.productId).length;
                return <li key={i.id} className="flex justify-between px-5 py-2"><span>{i.product.name}</span><span className="text-muted">{scanned} escaneado(s)</span></li>;
              })}
            </ul>
          </Card>
        </div>
      )}

      {c.status !== "EN_CURSO" && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Bultos revisados" value={c.lines.length} />
            <Stat label="Exactitud" value={fmtPct(accuracy)} tone={accuracy >= 95 ? "green" : "yellow"} />
            <Stat label="Con diferencia" value={c.lines.length - exact} />
            <Stat label="Diferencia neta" value={fmtMoney(netValue)} tone={netValue < 0 ? "red" : undefined} />
          </div>
          {c.status === "EN_REVISION" && <div className="mb-4"><Notice>Revisa sistema vs contado. Las diferencias de más de $50.000 requieren comentario. Al aprobar se generan los ajustes sobre cada serial (RN-10.3).</Notice></div>}
          <Card>
            <CardHeader title="Revisión: sistema vs contado" description="Aquí sí se ven las cantidades del sistema (RF-10.7)." />
            <ActionForm action={countTransitionAction}>
              <input type="hidden" name="id" value={c.id} />
              <Table>
                <thead><tr><Th>Serial</Th><Th>Producto</Th><Th>Lote</Th><Th>Captura</Th><Th className="text-right">Sistema</Th><Th className="text-right">Contado</Th><Th className="text-right">Diferencia</Th><Th className="text-right">Valor</Th><Th>Comentario</Th></tr></thead>
                <tbody>
                  {diffs.map(({ l, diff, value }) => (
                    <tr key={l.id} className={Math.abs(diff) > 1e-9 ? "bg-amber-50" : ""}>
                      <Td className="font-mono text-xs">{l.container?.serial}</Td>
                      <Td>{l.product.name}</Td>
                      <Td className="text-xs">{l.container?.lot?.code ?? "—"}</Td>
                      <Td>{l.notFound ? <Badge tone="red">No encontrado</Badge> : l.sealedOk ? <Badge tone="blue">Sellada</Badge> : <Badge tone="yellow">Contada</Badge>}</Td>
                      <Td className="text-right tabular">{fmtQty(n(l.systemQty), l.product.baseUnit)}</Td>
                      <Td className="text-right tabular">{fmtQty(n(l.countedQty), l.product.baseUnit)}</Td>
                      <Td className={`text-right font-medium tabular ${diff < 0 ? "text-red-700" : diff > 0 ? "text-green-700" : ""}`}>{Math.abs(diff) > 1e-9 ? fmtQty(diff) : "—"}</Td>
                      <Td className="text-right tabular">{Math.abs(diff) > 1e-9 ? fmtMoney(value) : ""}</Td>
                      <Td className="min-w-48">{c.status === "EN_REVISION" && Math.abs(diff) > 1e-9 ? <Input name={`comment.${l.id}`} defaultValue={l.comment ?? ""} placeholder="Motivo" /> : <span className="text-xs">{l.comment}</span>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {c.status === "EN_REVISION" && <CardBody><SubmitButton name="op" value="approve">Aprobar y generar ajustes</SubmitButton></CardBody>}
            </ActionForm>
          </Card>
          {adjustments.length > 0 && (
            <Card className="mt-6">
              <CardHeader title="Ajustes generados" />
              <ul className="divide-y divide-border text-sm">
                {adjustments.map((m) => (
                  <li key={m.id} className="px-5 py-2"><Link className="text-primary hover:underline" href={`/kardex/${m.id}`}>#{m.number}</Link> · {m.product.name} · <span className="font-mono text-xs">{m.container?.serial}</span> · {fmtQty(n(m.quantity), m.product.baseUnit)} · {fmtMoney(n(m.totalValue))}</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}
