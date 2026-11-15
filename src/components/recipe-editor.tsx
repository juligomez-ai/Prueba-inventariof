"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { saveRecipeAction } from "@/app/actions";
import { toBase, unitsFor } from "@/domain/services/units";
import { fmtMoney, fmtPct } from "@/shared/numbers";
import { ActionForm, SubmitButton } from "./action-form";
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Table, Td, Textarea, Th } from "./ui";

type Ingredient = { id: string; sku: string; name: string; baseUnit: string; avgCost: number; type: string };
type Row = { ingredientId: string; quantity: string; unit: string };

/** Editor de fórmula con costo en vivo (RF-8.1 a RF-8.3). */
export function RecipeEditor({
  productId,
  productName,
  ingredients,
  initial,
}: {
  productId: string;
  productName: string;
  ingredients: Ingredient[];
  initial?: { name: string; yieldQuantity: number; instructions: string | null; items: Row[]; createdByAI?: boolean };
}) {
  const [rows, setRows] = useState<Row[]>(initial?.items ?? [{ ingredientId: "", quantity: "", unit: "" }]);
  const [yieldQty, setYieldQty] = useState(String(initial?.yieldQuantity ?? 100));
  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  const lines = rows.map((r) => {
    const ing = byId.get(r.ingredientId);
    const q = Number(r.quantity.replace(",", "."));
    let base = 0;
    try { base = ing && q > 0 ? toBase(q, r.unit || ing.baseUnit, ing.baseUnit) : 0; } catch { base = 0; }
    return { ing, total: ing ? base * ing.avgCost : 0 };
  });
  const batch = lines.reduce((s, l) => s + l.total, 0);
  const y = Number(yieldQty) || 0;
  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <ActionForm action={saveRecipeAction} className="space-y-6">
      <input type="hidden" name="productId" value={productId} />
      {initial?.createdByAI && <input type="hidden" name="createdByAI" value="true" />}
      <Card>
        <CardHeader title="Fórmula" description={`Qué se necesita para fabricar ${productName}.`} />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field label="Nombre"><Input name="name" defaultValue={initial?.name ?? productName} required /></Field>
          <Field label="Rendimiento" hint="(unidades que da la fórmula)"><Input name="yieldQuantity" type="number" step="any" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} required /></Field>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-accent p-3 text-sm">
            <div><div className="text-xs text-muted">Costo por lote</div><div className="text-lg font-semibold tabular">{fmtMoney(batch)}</div></div>
            <div><div className="text-xs text-muted">Costo por unidad</div><div className="text-lg font-semibold tabular">{fmtMoney(y > 0 ? batch / y : 0)}</div></div>
          </div>
        </CardBody>
        <Table>
          <thead><tr><Th>Insumo o empaque</Th><Th className="w-32">Cantidad</Th><Th className="w-28">Unidad</Th><Th className="text-right">Costo prom.</Th><Th className="text-right">Total</Th><Th className="text-right">% costo</Th><Th></Th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const ing = byId.get(r.ingredientId);
              return (
                <tr key={i}>
                  <Td>
                    <Select name="item.ingredientId" value={r.ingredientId} onChange={(e) => update(i, { ingredientId: e.target.value, unit: byId.get(e.target.value)?.baseUnit ?? "" })} required>
                      <option value="">Selecciona…</option>
                      <optgroup label="Materias primas">{ingredients.filter((x) => x.type === "MATERIA_PRIMA").map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}</optgroup>
                      <optgroup label="Empaques">{ingredients.filter((x) => x.type === "EMPAQUE").map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}</optgroup>
                    </Select>
                  </Td>
                  <Td><Input name="item.quantity" type="number" step="any" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} required /></Td>
                  <Td>
                    <Select name="item.unit" value={r.unit || ing?.baseUnit || ""} onChange={(e) => update(i, { unit: e.target.value })}>
                      {(ing ? unitsFor(ing.baseUnit) : [""]).map((u) => <option key={u} value={u}>{u || "—"}</option>)}
                    </Select>
                  </Td>
                  <Td className="text-right tabular text-xs">{ing ? `${fmtMoney(ing.avgCost)}/${ing.baseUnit}` : ""}</Td>
                  <Td className="text-right tabular">{fmtMoney(lines[i].total)}</Td>
                  <Td className="text-right tabular text-xs">{batch > 0 ? fmtPct((lines[i].total / batch) * 100) : ""}</Td>
                  <Td><Button type="button" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="h-4 w-4" /></Button></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <CardBody>
          <Button type="button" variant="outline" onClick={() => setRows([...rows, { ingredientId: "", quantity: "", unit: "" }])}><Plus className="h-4 w-4" /> Agregar insumo</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Instrucciones de proceso" description="Opcional: aparecen en la hoja de trabajo de la orden." />
        <CardBody><Textarea name="instructions" rows={4} defaultValue={initial?.instructions ?? ""} /></CardBody>
      </Card>
      <SubmitButton>Guardar fórmula</SubmitButton>
    </ActionForm>
  );
}
