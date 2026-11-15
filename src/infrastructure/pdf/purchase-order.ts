import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export interface PurchaseOrderPdfData {
  code: string;
  date: string;
  expectedDate: string;
  status: string;
  company: { name: string; taxId: string; address: string; phone: string };
  supplier: { name: string; taxId: string; contact: string | null; phone: string | null; email: string | null; city: string | null; paymentTermDays: number };
  lines: { sku: string; name: string; quantity: string; unit: string; unitPrice: string; taxRate: string; subtotal: string }[];
  subtotal: string;
  tax: string;
  total: string;
  notes: string | null;
}

/** Orden de compra en PDF tamaño carta para enviar al proveedor (RF-6.8). */
export async function purchaseOrderPdf(d: PurchaseOrderPdfData) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Orden de compra ${d.code}`);
  const page = pdf.addPage([612, 792]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const M = 40, W = 612 - 2 * M;
  const green = rgb(0.36, 0.44, 0.31), gray = rgb(0.42, 0.42, 0.4), ink = rgb(0.1, 0.1, 0.1);
  const text = (s: string, x: number, y: number, size = 9, f: PDFFont = font, color = ink) => page.drawText(s, { x, y, size, font: f, color });
  const right = (s: string, xr: number, y: number, size = 9, f: PDFFont = font, color = ink) => text(s, xr - f.widthOfTextAtSize(s, size), y, size, f, color);
  const fit = (s: string, size: number, width: number) => {
    let t = s;
    while (font.widthOfTextAtSize(t, size) > width && t.length > 3) t = t.slice(0, -2) + "…";
    return t;
  };

  let y = 792 - M;
  text(d.company.name, M, y - 4, 16, bold, green);
  text(`NIT ${d.company.taxId} · ${d.company.address} · ${d.company.phone}`, M, y - 20, 8, font, gray);
  right("ORDEN DE COMPRA", 612 - M, y - 4, 12, bold);
  right(`N.° ${d.code}`, 612 - M, y - 22, 14, bold, green);
  right(`Fecha: ${d.date}`, 612 - M, y - 36, 9);
  y -= 56;
  page.drawLine({ start: { x: M, y }, end: { x: 612 - M, y }, thickness: 1, color: green });

  y -= 18;
  text("PROVEEDOR", M, y, 8, bold, gray);
  text("CONDICIONES", M + W / 2, y, 8, bold, gray);
  y -= 14;
  const left = [d.supplier.name, `NIT: ${d.supplier.taxId}`, [d.supplier.contact, d.supplier.phone].filter(Boolean).join(" · "), [d.supplier.email, d.supplier.city].filter(Boolean).join(" · ")];
  const cond = [`Entrega esperada: ${d.expectedDate}`, `Plazo de pago: ${d.supplier.paymentTermDays} días`, `Estado: ${d.status}`, "Enviar con remisión y lote/vencimiento de cada producto"];
  for (let i = 0; i < 4; i++) {
    if (left[i]) text(left[i], M, y, 9, i === 0 ? bold : font);
    if (cond[i]) text(cond[i], M + W / 2, y, 9);
    y -= 13;
  }

  y -= 10;
  const cols = [
    { h: "SKU", x: M + 4 }, { h: "Producto", x: M + 64 }, { h: "Cantidad", xr: M + 300 }, { h: "Unidad", x: M + 310 },
    { h: "Precio unit.", xr: M + 420 }, { h: "IVA", xr: M + 455 }, { h: "Subtotal", xr: M + W - 4 },
  ];
  page.drawRectangle({ x: M, y: y - 4, width: W, height: 16, color: rgb(0.94, 0.93, 0.9) });
  for (const c of cols) "xr" in c ? right(c.h, c.xr!, y, 8, bold) : text(c.h, c.x!, y, 8, bold);
  y -= 18;
  for (const l of d.lines) {
    text(l.sku, M + 4, y, 8);
    text(fit(l.name, 8, 170), M + 64, y, 8);
    right(l.quantity, M + 300, y, 8);
    text(fit(l.unit, 8, 60), M + 310, y, 8);
    right(l.unitPrice, M + 420, y, 8);
    right(l.taxRate, M + 455, y, 8);
    right(l.subtotal, M + W - 4, y, 8, bold);
    y -= 14;
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: 612 - M, y: y + 8 }, thickness: 0.4, color: rgb(0.85, 0.84, 0.8) });
  }
  y -= 6;
  for (const [k, v, f] of [["Subtotal", d.subtotal, font], ["IVA", d.tax, font], ["Total", d.total, bold]] as const) {
    right(k, M + W - 110, y, 9, f);
    right(v, M + W - 4, y, 9, f);
    y -= 14;
  }
  if (d.notes) {
    y -= 8;
    text(fit(`Notas: ${d.notes}`, 8, W), M, y, 8, font, gray);
  }
  text("Precios sin IVA por unidad de compra. Favor confirmar recepción de esta orden y fecha de despacho.", M, 60, 7, font, gray);
  text("Generado con SYNTHEX · Manufactura e inventario", M, 48, 7, font, gray);
  return pdf.save();
}
