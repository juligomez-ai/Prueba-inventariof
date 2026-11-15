import { prisma } from "@/infrastructure/database/prisma";
import { remissionPdf } from "@/infrastructure/pdf/remission";
import { COMPANY } from "@/shared/company";
import { dispatchStatusLabel } from "@/shared/labels";
import { fmtDate, fmtQty, n } from "@/shared/numbers";

export async function GET(_: Request, ctx: RouteContext<"/api/remision/[id]">) {
  const { id } = await ctx.params;
  const d = await prisma.dispatch.findUnique({
    where: { id },
    include: { lines: { include: { product: true } }, allocations: { include: { container: { include: { lot: true, product: true } } } }, shipment: { include: { carrier: true } } },
  });
  if (!d) return new Response("Remisión no encontrada", { status: 404 });
  // Una línea por producto y lote, con los seriales de sus cajas
  const groups = new Map<string, { sku: string; name: string; lot: string; expiry: string; serials: string[]; qty: number }>();
  for (const a of d.allocations) {
    const c = a.container;
    const key = `${c.productId}:${c.lotId}`;
    const g = groups.get(key) ?? { sku: c.product.sku, name: c.product.name, lot: c.lot?.code ?? "—", expiry: fmtDate(c.lot?.expiryDate), serials: [], qty: 0 };
    g.serials.push(c.serial);
    g.qty += n(a.quantity);
    groups.set(key, g);
  }
  const lines = groups.size
    ? [...groups.values()].map((g) => ({ ...g, serials: g.serials.join(", "), quantity: fmtQty(g.qty, "und") }))
    : d.lines.map((l) => ({ sku: l.product.sku, name: l.product.name, lot: "Por asignar", expiry: "—", serials: "Se asignan al alistar", quantity: fmtQty(n(l.quantity), "und") }));
  const bytes = await remissionPdf({
    code: d.code,
    date: fmtDate(d.shippedAt ?? d.createdAt),
    company: COMPANY,
    customer: { name: d.customerName, taxId: d.customerTaxId, address: d.address, city: d.city },
    salesRef: d.salesRef,
    status: dispatchStatusLabel[d.status],
    carrier: d.shipment?.carrier.name ?? null,
    trackingNumber: d.shipment?.trackingNumber ?? null,
    lines,
    notes: d.notes,
  });
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${d.code}.pdf"` } });
}
