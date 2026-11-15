import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface RemissionData {
  code: string;
  date: string;
  company: { name: string; taxId: string; address: string; phone: string };
  customer: { name: string; taxId: string; address: string; city: string };
  salesRef: string | null;
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  lines: { sku: string; name: string; lot: string; expiry: string; serials: string; quantity: string }[];
  notes: string | null;
}

/** Remisión de entrega en PDF, tamaño carta (RF-12.5b). */
export async function remissionPdf(d: RemissionData) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Remisión ${d.code}`);
  const page = pdf.addPage([612, 792]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const M = 40;
  const W = 612 - 2 * M;
  const green = rgb(0.36, 0.44, 0.31);
  const gray = rgb(0.42, 0.42, 0.4);
  const text = (p: PDFPage, s: string, x: number, y: number, size = 9, f: PDFFont = font, color = rgb(0.1, 0.1, 0.1)) =>
    p.drawText(s, { x, y, size, font: f, color });
  const wrap = (s: string, size: number, width: number, f: PDFFont = font) => {
    const words = s.split(" ");
    const out: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > width && cur) { out.push(cur); cur = w; } else cur = t;
    }
    if (cur) out.push(cur);
    return out;
  };

  let y = 792 - M;
  text(page, d.company.name, M, y - 4, 16, bold, green);
  text(page, `NIT ${d.company.taxId} · ${d.company.address} · ${d.company.phone}`, M, y - 20, 8, font, gray);
  text(page, "REMISIÓN DE ENTREGA", 612 - M - bold.widthOfTextAtSize("REMISIÓN DE ENTREGA", 12), y - 4, 12, bold);
  text(page, `N.° ${d.code}`, 612 - M - bold.widthOfTextAtSize(`N.° ${d.code}`, 14), y - 22, 14, bold, green);
  text(page, `Fecha: ${d.date}`, 612 - M - font.widthOfTextAtSize(`Fecha: ${d.date}`, 9), y - 36, 9);
  y -= 56;
  page.drawLine({ start: { x: M, y }, end: { x: 612 - M, y }, thickness: 1, color: green });

  y -= 18;
  text(page, "CLIENTE", M, y, 8, bold, gray);
  text(page, "ENVÍO", M + W / 2, y, 8, bold, gray);
  y -= 14;
  const left = [d.customer.name, `NIT / CC: ${d.customer.taxId}`, `${d.customer.address}, ${d.customer.city}`, d.salesRef ? `Pedido / factura: ${d.salesRef}` : ""];
  const right = [`Transportadora: ${d.carrier ?? "—"}`, `Guía: ${d.trackingNumber ?? "—"}`, `Estado: ${d.status}`];
  for (let i = 0; i < 4; i++) {
    if (left[i]) text(page, left[i], M, y, 9, i === 0 ? bold : font);
    if (right[i]) text(page, right[i], M + W / 2, y, 9);
    y -= 13;
  }

  y -= 10;
  const cols = [
    { h: "SKU", w: 50 }, { h: "Producto", w: 150 }, { h: "Lote", w: 90 }, { h: "Vence", w: 60 }, { h: "Seriales de cajas", w: 130 }, { h: "Cant.", w: W - 480 },
  ];
  page.drawRectangle({ x: M, y: y - 4, width: W, height: 16, color: rgb(0.94, 0.93, 0.9) });
  let x = M + 4;
  for (const c of cols) { text(page, c.h, x, y, 8, bold); x += c.w; }
  y -= 18;
  for (const l of d.lines) {
    const serialLines = wrap(l.serials, 7, cols[4].w - 6);
    const nameLines = wrap(l.name, 8, cols[1].w - 6);
    const h = Math.max(serialLines.length, nameLines.length, 1) * 10 + 4;
    x = M + 4;
    const cells = [[l.sku], nameLines, [l.lot], [l.expiry], serialLines, [l.quantity]];
    cells.forEach((lines, i) => {
      lines.forEach((s, j) => text(page, s, x, y - j * 10, i === 4 ? 7 : 8, i === 5 ? bold : font));
      x += cols[i].w;
    });
    y -= h;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: 612 - M, y: y + 6 }, thickness: 0.4, color: rgb(0.85, 0.84, 0.8) });
  }
  if (d.notes) {
    y -= 10;
    for (const s of wrap(`Notas: ${d.notes}`, 8, W)) { text(page, s, M, y, 8, font, gray); y -= 11; }
  }

  // Recibido conforme
  const boxY = 150;
  page.drawRectangle({ x: M, y: boxY - 80, width: W, height: 90, borderColor: rgb(0.7, 0.7, 0.68), borderWidth: 0.8 });
  text(page, "RECIBIDO CONFORME", M + 10, boxY - 4, 8, bold, gray);
  const fields = ["Nombre", "Cédula", "Fecha y hora", "Firma"];
  fields.forEach((f, i) => {
    const fx = M + 10 + (i % 2) * (W / 2);
    const fy = boxY - 32 - Math.floor(i / 2) * 32;
    page.drawLine({ start: { x: fx + 60, y: fy }, end: { x: fx + W / 2 - 30, y: fy }, thickness: 0.6, color: rgb(0.5, 0.5, 0.5) });
    text(page, `${f}:`, fx, fy + 2, 8);
  });
  text(page, "Esta remisión acompaña la mercancía y no reemplaza la factura electrónica de venta.", M, 50, 7, font, gray);
  text(page, "Generado con SYNTHEX · Manufactura e inventario", M, 40, 7, font, gray);
  return pdf.save();
}
