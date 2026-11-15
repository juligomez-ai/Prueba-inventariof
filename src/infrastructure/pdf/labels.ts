import bwipjs from "bwip-js/node";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MM = 72 / 25.4;
/** Etiqueta térmica de 50 × 25 mm (RF-5.1.5). */
export const LABEL_W = 50 * MM;
export const LABEL_H = 25 * MM;

export interface LabelData {
  code: string; // texto del código de barras (serial o SKU)
  title: string; // nombre corto
  sku: string;
  lines: string[]; // lote, vence, cantidad inicial
}

async function barcodePng(text: string) {
  return bwipjs.toBuffer({ bcid: "code128", text, scale: 3, height: 9, includetext: false, paddingwidth: 0, paddingheight: 0 });
}

/** PDF con una etiqueta por página, del tamaño exacto de la etiqueta. */
export async function labelsPdf(labels: LabelData[]) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Etiquetas SYNTHEX");
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  for (const l of labels) {
    const page = pdf.addPage([LABEL_W, LABEL_H]);
    const m = 2.2 * MM;
    const fit = (text: string, size: number, font = regular) => {
      let t = text;
      while (font.widthOfTextAtSize(t, size) > LABEL_W - 2 * m && t.length > 3) t = t.slice(0, -2) + "…";
      return t;
    };
    let y = LABEL_H - m - 7;
    page.drawText(fit(l.title, 8, bold), { x: m, y, size: 8, font: bold });
    const skuW = regular.widthOfTextAtSize(l.sku, 6);
    if (bold.widthOfTextAtSize(l.title, 8) < LABEL_W - 2 * m - skuW - 4) page.drawText(l.sku, { x: LABEL_W - m - skuW, y: y + 1, size: 6, font: regular });
    const png = await pdf.embedPng(await barcodePng(l.code));
    const bw = LABEL_W - 2 * m;
    const bh = 8.5 * MM;
    y -= bh + 2;
    page.drawImage(png, { x: m, y, width: bw, height: bh });
    y -= 7.5;
    const codeW = mono.widthOfTextAtSize(l.code, 7.5);
    page.drawText(l.code, { x: (LABEL_W - codeW) / 2, y, size: 7.5, font: mono, color: rgb(0, 0, 0) });
    for (const line of l.lines.slice(0, 2)) {
      y -= 7;
      page.drawText(fit(line, 6), { x: m, y, size: 6, font: regular });
    }
  }
  return pdf.save();
}
