import Link from "next/link";
import type { EstadoLote } from "@prisma/client";
import { ExpiryBadge, LotStatusBadge } from "@/components/badges";
import { Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { lotStatusLabel } from "@/shared/labels";
import { fmtDate, fmtQty, n } from "@/shared/numbers";

export default async function Lots(props: PageProps<"/lotes">) {
  const sp = await props.searchParams;
  const status = typeof sp.estado === "string" ? (sp.estado as EstadoLote) : null;
  const q = typeof sp.q === "string" ? sp.q : "";
  const lots = await prisma.lot.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: { product: true, supplier: true, containers: { where: { status: { in: ["SELLADO", "ABIERTO"] } } } },
    orderBy: [{ expiryDate: "asc" }],
  });
  return (
    <>
      <PageHeader title="Lotes y trazabilidad" description="Cada lote con su origen, vencimiento y estado. Ordenados por vencimiento (FEFO)." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[null, ...Object.keys(lotStatusLabel)].map((k) => (
          <Link key={k ?? "all"} href={k ? `/lotes?estado=${k}` : "/lotes"} className={`rounded-full border px-3 py-1 text-sm ${status === k ? "border-primary bg-primary text-white" : "border-border bg-card hover:bg-accent"}`}>
            {k ? lotStatusLabel[k as EstadoLote] : "Todos"}
          </Link>
        ))}
        <form className="ml-auto"><input name="q" defaultValue={q} placeholder="Buscar lote o producto" className="rounded-md border border-border px-3 py-1.5 text-sm" /></form>
      </div>
      <Card>
        {lots.length === 0 ? <Empty>No hay lotes.</Empty> : (
          <Table>
            <thead><tr><Th>Lote</Th><Th>Producto</Th><Th>Origen</Th><Th>Estado</Th><Th>Vence</Th><Th className="text-right">Existencia</Th><Th>Bultos</Th><Th>Creado</Th></tr></thead>
            <tbody>
              {lots.map((l) => (
                <tr key={l.id} className="hover:bg-accent/40">
                  <Td><Link className="font-medium text-primary hover:underline" href={`/lotes/${l.id}`}>{l.code}</Link></Td>
                  <Td>{l.product.name}</Td>
                  <Td className="text-xs">{l.sourceType === "COMPRA" ? `Compra ${l.sourceRef ?? ""} · ${l.supplier?.name ?? ""}` : l.sourceType === "PRODUCCION" ? `Producción ${l.sourceRef}` : `Ajuste ${l.sourceRef ?? ""}`}</Td>
                  <Td><LotStatusBadge status={l.status} /></Td>
                  <Td><ExpiryBadge date={l.expiryDate} /> <span className="text-xs text-muted">{fmtDate(l.expiryDate)}</span></Td>
                  <Td className="text-right tabular">{fmtQty(l.containers.reduce((s, c) => s + n(c.currentQty), 0), l.product.baseUnit)}</Td>
                  <Td>{l.containers.length}</Td>
                  <Td className="text-xs">{fmtDate(l.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
