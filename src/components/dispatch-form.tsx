"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { createDispatchAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "./action-form";
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "./ui";

export function DispatchForm({ products }: { products: { id: string; sku: string; name: string; available: number }[] }) {
  const [lines, setLines] = useState([{ productId: "", quantity: "" }]);
  return (
    <ActionForm action={createDispatchAction} className="space-y-4">
      <Card>
        <CardHeader title="Cliente" description="Normalmente viene del pedido o factura del módulo de ventas de SYNTHEX (S7)." />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Razón social"><Input name="customerName" required /></Field>
          <Field label="NIT / cédula"><Input name="customerTaxId" required /></Field>
          <Field label="Dirección"><Input name="address" required /></Field>
          <Field label="Ciudad"><Input name="city" required defaultValue="Medellín" /></Field>
          <Field label="Pedido o factura" hint="(opcional)"><Input name="salesRef" placeholder="FE-1060" /></Field>
          <Field label="Notas"><Textarea name="notes" rows={1} /></Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Productos" />
        <CardBody className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <Select name="line.productId" value={l.productId} required onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))}>
                <option value="">Selecciona…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name} (disponible {p.available})</option>)}
              </Select>
              <Input name="line.quantity" type="number" min={1} step={1} className="w-32" placeholder="Cantidad" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} required />
              <Button type="button" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setLines([...lines, { productId: "", quantity: "" }])}><Plus className="h-4 w-4" /> Agregar producto</Button>
        </CardBody>
      </Card>
      <SubmitButton>Crear despacho</SubmitButton>
    </ActionForm>
  );
}
