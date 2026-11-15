import Link from "next/link";
import { createCountAction } from "@/app/actions";
import { abcSuggestions } from "@/application/use-cases/insights";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CountStatusBadge } from "@/components/badges";
import { Badge, Card, CardBody, CardHeader, Empty, Notice, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { abcFrequencyLabel } from "@/domain/services/abc";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtDate, fmtMoney } from "@/shared/numbers";

export default async function Counts(props: PageProps<"/conteos">) {
  const sp = await props.searchParams;
  const warehouses = await prisma.warehouse.findMany({ where: { active: true }, orderBy: { code: "asc" } });
  const warehouseId = typeof sp.bodega === "string" ? sp.bodega : warehouses[0]?.id;
  const [suggestions, counts] = await Promise.all([
    abcSuggestions(warehouseId),
    prisma.cycleCount.findMany({ include: { warehouse: true, lines: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <>
      <PageHeader title="Conteo cíclico" description="Contar un poco cada semana, empezando por lo que más dinero representa (M10)." />
      <Notice tone="blue">
        <b>Clasificación ABC:</b> el sistema ordena los productos por valor en inventario. <b>A</b> = pocos ítems que suman el 80% del valor (se cuentan cada semana), <b>B</b> = el siguiente 15% (cada mes), <b>C</b> = muchos ítems de poco valor (cada tres meses). No hay nada que configurar.
      </Notice>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Nueva sesión de conteo"
            description="Marcados: los que ya toca contar según su clase ABC y la fecha del último conteo."
            actions={
              <form>
                <Select name="bodega" defaultValue={warehouseId}>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
                </Select>
                <button className="ml-2 text-sm text-primary hover:underline">Cambiar bodega</button>
              </form>
            }
          />
          {suggestions.length === 0 ? <Empty>No hay existencias en esta bodega.</Empty> : (
            <ActionForm action={createCountAction}>
              <input type="hidden" name="warehouseId" value={warehouseId} />
              <Table>
                <thead><tr><Th></Th><Th>Producto</Th><Th>Clase</Th><Th>Frecuencia</Th><Th className="text-right">Valor</Th><Th>Último conteo</Th></tr></thead>
                <tbody>
                  {suggestions.map((s) => (
                    <tr key={s.product.id}>
                      <Td><input type="checkbox" name="productId" value={s.product.id} defaultChecked={s.due} aria-label={s.product.name} /></Td>
                      <Td>{s.product.name}</Td>
                      <Td><Badge tone={s.abc === "A" ? "red" : s.abc === "B" ? "yellow" : "gray"}>{s.abc}</Badge></Td>
                      <Td className="text-xs">{abcFrequencyLabel[s.abc]}{s.due && <Badge tone="blue" className="ml-1">Toca contar</Badge>}</Td>
                      <Td className="text-right tabular">{fmtMoney(s.value)}</Td>
                      <Td className="text-xs">{fmtDate(s.lastCounted)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <CardBody><SubmitButton>Crear sesión de conteo</SubmitButton></CardBody>
            </ActionForm>
          )}
        </Card>
        <Card>
          <CardHeader title="Sesiones" />
          {counts.length === 0 ? <Empty>Sin conteos.</Empty> : (
            <ul className="divide-y divide-border text-sm">
              {counts.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-5 py-2.5">
                  <div><Link className="font-medium text-primary hover:underline" href={`/conteos/${c.id}`}>{c.code}</Link> · {c.warehouse.code}<div className="text-xs text-muted">{fmtDate(c.createdAt)} · {c.lines.length} bultos</div></div>
                  <CountStatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
