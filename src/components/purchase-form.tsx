"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { createPurchaseAction } from "@/app/actions";
import { fmtMoney } from "@/shared/numbers";
import { ActionForm, SubmitButton } from "./action-form";
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Table, Td, Textarea, Th } from "./ui";

type Prod = { id: string; sku: string; name: string; baseUnit: string; lastCost: number; conversions: { unit: string; factor: number }[] };
type Line = { productId: string; quantity: string; unit: string; unitPrice: string };

/** Orden de compra (RF-6.3) con unidades de compra (RF-1.3) y precios sin IVA. */
export function PurchaseForm({
  suppliers,
  products,
  initialSupplierId,
  initialLines,
  notes,
  createdByAI,
}: {
  suppliers: { id: string; name: string }[];
  products: Prod[];
  initialSupplierId?: string;
  initialLines?: Line[];
  notes?: string;
  createdByAI?: boolean;
}) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const [lines, setLines] = useState<Line[]>(initialLines?.length ? initialLines : [{ productId: "", quantity: "", unit: "", unitPrice: "" }]);
  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const factorOf = (p: Prod | undefined, unit: string) => (p && unit !== p.baseUnit ? p.conversions.find((c) => c.unit === unit)?.factor ?? 1 : 1);
  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);

  return (
    <ActionForm action={createPurchaseAction} className="space-y-4">
      {createdByAI && <input type="hidden" name="createdByAI" value="true" />}
      <Card>
        <CardHeader title="Proveedor" />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <Field label="Proveedor">
            <Select name="supplierId" defaultValue={initialSupplierId} required>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Fecha esperada" hint="(vacío = según tiempo de entrega)"><Input name="expectedDate" type="date" /></Field>
          <Field label="Notas"><Textarea name="notes" rows={1} defaultValue={notes} /></Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Productos" description="Precios sin IVA: el IVA descontable no entra al costo (S2, RN-6.1)." />
        <Table>
          <thead><tr><Th>Producto</Th><Th className="w-28">Cantidad</Th><Th className="w-40">Unidad de compra</Th><Th className="w-40">Precio unit. sin IVA</Th><Th className="text-right">Subtotal</Th><Th></Th></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const p = byId.get(l.productId);
              const units = p ? [p.baseUnit, ...p.conversions.map((c) => c.unit)] : [];
              return (
                <tr key={i}>
                  <Td>
                    <Select name="line.productId" value={l.productId} required onChange={(e) => {
                      const np = byId.get(e.target.value);
                      set(i, { productId: e.target.value, unit: np?.baseUnit ?? "", unitPrice: np ? String(Math.round(np.lastCost)) : "" });
                    }}>
                      <option value="">Selecciona…</option>
                      {products.map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}
                    </Select>
                  </Td>
                  <Td><Input name="line.quantity" type="number" step="any" min={0} value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} required /></Td>
                  <Td>
                    <Select name="line.unit" value={l.unit} onChange={(e) => {
                      const prev = factorOf(p, l.unit);
                      const next = factorOf(p, e.target.value);
                      set(i, { unit: e.target.value, unitPrice: l.unitPrice ? String(Math.round((Number(l.unitPrice) / prev) * next)) : "" });
                    }}>
                      {units.length === 0 && <option value="">Elige el producto</option>}
                      {units.map((u) => <option key={u} value={u}>{u}{u !== p?.baseUnit ? ` (= ${factorOf(p, u)} ${p?.baseUnit})` : ""}</option>)}
                    </Select>
                  </Td>
                  <Td><Input name="line.unitPrice" type="number" step="any" min={0} value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} /></Td>
                  <Td className="text-right tabular">{fmtMoney((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}</Td>
                  <Td><Button type="button" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="h-4 w-4" /></Button></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => setLines([...lines, { productId: "", quantity: "", unit: "", unitPrice: "" }])}><Plus className="h-4 w-4" /> Agregar producto</Button>
          <div className="text-right text-sm tabular">
            <div>Subtotal {fmtMoney(subtotal)}</div>
            <div className="text-muted">IVA 19% {fmtMoney(subtotal * 0.19)}</div>
            <div className="font-semibold">Total {fmtMoney(subtotal * 1.19)}</div>
          </div>
        </CardBody>
      </Card>
      <SubmitButton>Crear orden de compra</SubmitButton>
    </ActionForm>
  );
}
