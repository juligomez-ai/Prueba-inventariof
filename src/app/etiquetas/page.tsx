import { ContainerStatusBadge } from "@/components/badges";
import { Card, CardBody, CardHeader, Notice, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtDate, fmtQty, n } from "@/shared/numbers";
import { ACTIVE_STATUSES } from "@/infrastructure/database/stock";

/** Impresión de etiquetas térmicas 50 × 25 mm (M5.1): por bulto (serial) o por SKU. */
export default async function Labels(props: PageProps<"/etiquetas">) {
  const sp = await props.searchParams;
  const products = await prisma.product.findMany({ where: { archived: false }, orderBy: { sku: "asc" } });
  const productId = typeof sp.producto === "string" ? sp.producto : products[0]?.id;
  const containers = productId
    ? await prisma.container.findMany({ where: { productId, status: { in: ACTIVE_STATUSES } }, include: { lot: true, warehouse: true, product: true }, orderBy: { serial: "asc" } })
    : [];
  return (
    <>
      <PageHeader title="Etiquetas" description="Código de barras Code 128 para impresora térmica de 50 × 25 mm. El PDF trae una etiqueta por página, del tamaño exacto." />
      <Notice tone="blue">Las etiquetas de recepciones, producción y ajustes también se imprimen desde cada documento. La etiqueta muestra la <b>cantidad inicial</b> del bulto, para no confundirla con lo que contiene hoy.</Notice>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Etiquetas de bultos (serial)"
            actions={
              <form className="flex gap-2">
                <Select name="producto" defaultValue={productId}>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</Select>
                <button className="rounded-md border border-border px-3 text-sm hover:bg-accent">Ver</button>
              </form>
            }
          />
          <form action="/api/etiquetas" target="_blank">
            <Table>
              <thead><tr><Th></Th><Th>Serial</Th><Th>Lote</Th><Th>Vence</Th><Th>Bodega</Th><Th>Estado</Th><Th className="text-right">Actual / inicial</Th></tr></thead>
              <tbody>
                {containers.map((c) => (
                  <tr key={c.id}>
                    <Td><input type="checkbox" name="serials" value={c.serial} defaultChecked aria-label={c.serial} /></Td>
                    <Td className="font-mono text-xs">{c.serial}</Td><Td>{c.lot?.code ?? "—"}</Td><Td className="text-xs">{fmtDate(c.lot?.expiryDate)}</Td>
                    <Td>{c.warehouse.code}</Td><Td><ContainerStatusBadge status={c.status} /></Td>
                    <Td className="text-right tabular">{fmtQty(n(c.currentQty), c.product.baseUnit)} / {fmtQty(n(c.initialQty))}</Td>
                  </tr>
                ))}
                {containers.length === 0 && <tr><Td className="text-muted">Este producto no tiene bultos activos.</Td></tr>}
              </tbody>
            </Table>
            {containers.length > 0 && <CardBody><button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white">Generar PDF de etiquetas</button></CardBody>}
          </form>
        </Card>
        <Card>
          <CardHeader title="Etiquetas por SKU" description="Para estanterías y para insumos que no traen código del fabricante (RF-5.1.11)." />
          <form action="/api/etiquetas" target="_blank">
            <CardBody className="max-h-96 space-y-1 overflow-y-auto text-sm">
              {products.map((p) => (
                <label key={p.id} className="flex items-center gap-2"><input type="checkbox" name="skus" value={p.sku} /> <span className="font-mono text-xs">{p.sku}</span> {p.name}</label>
              ))}
            </CardBody>
            <CardBody className="border-t border-border"><button className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">Generar PDF</button></CardBody>
          </form>
        </Card>
      </div>
    </>
  );
}
