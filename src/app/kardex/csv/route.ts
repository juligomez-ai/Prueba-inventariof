import { movementLabel } from "@/shared/labels";
import { n } from "@/shared/numbers";
import { kardexQuery, pickFilters } from "../query";

const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Exportar Kardex a CSV (RF-3.3), abre en Excel. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rows = await kardexQuery(pickFilters(Object.fromEntries(url.searchParams)), 20_000);
  const header = ["numero", "fecha", "usuario", "sku", "producto", "movimiento", "sigla", "documento", "remision", "tercero", "bodega", "lote", "serial", "cantidad", "unidad", "costo_unitario", "valor", "costo_prom_antes", "costo_prom_despues", "saldo_antes", "saldo_despues", "motivo"];
  const lines = rows.map((m) =>
    [
      m.number, m.createdAt.toISOString(), m.userName, m.product.sku, m.product.name, movementLabel[m.type].name, movementLabel[m.type].code,
      m.documentNumber, m.remissionNumber, m.partyName, m.warehouse.code, m.lot?.code, m.container?.serial, n(m.quantity), m.product.baseUnit,
      n(m.unitCost), n(m.totalValue), n(m.avgCostBefore), n(m.avgCostAfter), n(m.balanceBefore), n(m.balanceAfter), m.reason,
    ].map(esc).join(","),
  );
  return new Response("﻿" + [header.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="kardex.csv"` },
  });
}
