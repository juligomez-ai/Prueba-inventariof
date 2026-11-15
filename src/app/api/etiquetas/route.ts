import { prisma } from "@/infrastructure/database/prisma";
import { labelsPdf, type LabelData } from "@/infrastructure/pdf/labels";
import { fmtDate, fmtQty, n } from "@/shared/numbers";

/**
 * GET /api/etiquetas?serials=A,B,C → etiquetas de bultos (serial).
 * GET /api/etiquetas?skus=MP-001,EMP-002 → etiquetas por SKU para estanterías (RF-5.1.11).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const list = (k: string) => url.searchParams.getAll(k).flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean);
  const serials = list("serials");
  const skus = list("skus");
  const labels: LabelData[] = [];
  if (serials.length) {
    const containers = await prisma.container.findMany({ where: { serial: { in: serials } }, include: { product: true, lot: true }, orderBy: { serial: "asc" } });
    for (const c of containers)
      labels.push({
        code: c.serial,
        title: c.product.shortName ?? c.product.name,
        sku: c.product.sku,
        lines: [
          c.lot ? `Lote ${c.lot.code}${c.lot.expiryDate ? ` · Vence ${fmtDate(c.lot.expiryDate)}` : ""}` : "Sin lote",
          `Cant. inicial: ${fmtQty(n(c.initialQty), c.product.baseUnit)}`,
        ],
      });
  }
  if (skus.length) {
    const products = await prisma.product.findMany({ where: { sku: { in: skus } }, orderBy: { sku: "asc" } });
    for (const p of products) labels.push({ code: p.sku, title: p.shortName ?? p.name, sku: "", lines: [p.name, `Unidad: ${p.baseUnit}`] });
  }
  if (labels.length === 0) return new Response("No se encontraron bultos ni productos.", { status: 404 });
  const bytes = await labelsPdf(labels);
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="etiquetas.pdf"` },
  });
}
