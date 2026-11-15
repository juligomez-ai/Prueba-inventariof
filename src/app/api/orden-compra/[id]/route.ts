import { prisma } from "@/infrastructure/database/prisma";
import { purchaseOrderPdf } from "@/infrastructure/pdf/purchase-order";
import { COMPANY } from "@/shared/company";
import { poStatusLabel } from "@/shared/labels";
import { fmtDate, fmtMoney, fmtQty, n } from "@/shared/numbers";

/** GET /api/orden-compra/[id] → PDF de la orden de compra (RF-6.8). */
export async function GET(_: Request, ctx: RouteContext<"/api/orden-compra/[id]">) {
  const { id } = await ctx.params;
  const o = await prisma.purchaseOrder.findUnique({ where: { id }, include: { supplier: true, lines: { include: { product: true } } } });
  if (!o) return new Response("Orden de compra no encontrada", { status: 404 });
  const subtotal = o.lines.reduce((s, l) => s + n(l.quantity) * n(l.unitPrice), 0);
  const tax = o.lines.reduce((s, l) => s + n(l.quantity) * n(l.unitPrice) * (n(l.taxRate) / 100), 0);
  const bytes = await purchaseOrderPdf({
    code: o.code,
    date: fmtDate(o.sentAt ?? o.createdAt),
    expectedDate: fmtDate(o.expectedDate),
    status: poStatusLabel[o.status],
    company: COMPANY,
    supplier: { name: o.supplier.name, taxId: o.supplier.taxId, contact: o.supplier.contactName, phone: o.supplier.phone, email: o.supplier.email, city: o.supplier.city, paymentTermDays: o.supplier.paymentTermDays },
    lines: o.lines.map((l) => ({
      sku: l.product.sku,
      name: l.product.name,
      quantity: fmtQty(n(l.quantity)),
      unit: l.unit,
      unitPrice: fmtMoney(n(l.unitPrice)),
      taxRate: `${n(l.taxRate)}%`,
      subtotal: fmtMoney(n(l.quantity) * n(l.unitPrice)),
    })),
    subtotal: fmtMoney(subtotal),
    tax: fmtMoney(tax),
    total: fmtMoney(subtotal + tax),
    notes: o.notes,
  });
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${o.code}.pdf"` } });
}
