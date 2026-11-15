"use client";

import type { Product, Supplier, UnitConversion } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { saveProductAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "./action-form";
import { Button, Card, CardBody, CardHeader, Field, Input, Select } from "./ui";

type P = Omit<Product, "minStock" | "safetyStock" | "avgCost" | "salePrice" | "defaultPackSize"> & {
  minStock: number; safetyStock: number; salePrice: number | null; defaultPackSize: number | null; conversions: (Pick<UnitConversion, "unit"> & { factor: number })[];
};

const d = (v: Date | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : "");

export function ProductForm({ product, suppliers }: { product?: P; suppliers: Pick<Supplier, "id" | "name">[] }) {
  const [type, setType] = useState(product?.type ?? "MATERIA_PRIMA");
  const [tracksLot, setTracksLot] = useState(product?.tracksLot ?? true);
  const [convs, setConvs] = useState<{ unit: string; factor: string }[]>(
    product?.conversions.map((c) => ({ unit: c.unit, factor: String(c.factor) })) ?? [],
  );
  const isPT = type === "PRODUCTO_TERMINADO";
  return (
    <ActionForm action={saveProductAction} className="space-y-6">
      {product && <input type="hidden" name="id" value={product.id} />}
      <Card>
        <CardHeader title="Datos básicos" description="RF-1.1: cada ítem dice qué es y cómo se mide." />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="SKU"><Input name="sku" defaultValue={product?.sku} required placeholder="MP-017" /></Field>
          <Field label="Nombre"><Input name="name" defaultValue={product?.name} required /></Field>
          <Field label="Nombre corto" hint="(para la etiqueta)"><Input name="shortName" defaultValue={product?.shortName ?? ""} maxLength={24} /></Field>
          <Field label="Tipo">
            <Select name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="MATERIA_PRIMA">Materia prima</option>
              <option value="EMPAQUE">Empaque</option>
              <option value="PRODUCTO_TERMINADO">Producto terminado</option>
            </Select>
          </Field>
          <Field label="Categoría"><Input name="category" defaultValue={product?.category ?? ""} placeholder="Aceites, Envases…" /></Field>
          <Field label="Unidad base" hint="(no cambia si hay movimientos)">
            <Select name="baseUnit" defaultValue={product?.baseUnit ?? "kg"}>
              <option value="kg">kg</option>
              <option value="L">L</option>
              <option value="und">und.</option>
            </Select>
          </Field>
          <Field label="Código de barras del fabricante" hint="(opcional)"><Input name="barcode" defaultValue={product?.barcode ?? ""} placeholder="EAN-13" /></Field>
          <Field label="Proveedor preferido">
            <Select name="preferredSupplierId" defaultValue={product?.preferredSupplierId ?? ""}>
              <option value="">—</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Cantidad por bulto" hint="(cajas de 24, sacos de 25 kg)"><Input name="defaultPackSize" type="number" step="any" defaultValue={product?.defaultPackSize ?? ""} /></Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Control de lote y vencimiento" description="RF-1.2: qué se exige al recibir o producir." />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="tracksLot" checked={tracksLot} onChange={(e) => setTracksLot(e.target.checked)} /> Controla lote
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="tracksExpiry" defaultChecked={product?.tracksExpiry ?? true} disabled={!tracksLot} /> Controla vencimiento
          </label>
          {isPT && <Field label="Vida útil (días)"><Input name="shelfLifeDays" type="number" defaultValue={product?.shelfLifeDays ?? ""} /></Field>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Parámetros de inventario" description="RF-1.5" />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field label="Stock mínimo"><Input name="minStock" type="number" step="any" defaultValue={product?.minStock ?? 0} /></Field>
          <Field label="Stock de seguridad"><Input name="safetyStock" type="number" step="any" defaultValue={product?.safetyStock ?? 0} /></Field>
          <Field label="Tiempo de reposición (días)"><Input name="leadTimeDays" type="number" defaultValue={product?.leadTimeDays ?? 7} /></Field>
        </CardBody>
      </Card>

      {isPT ? (
        <Card>
          <CardHeader title="Venta y regulatorio" description="RF-1.4 y RF-1.6" />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <Field label="Precio de venta (COP)"><Input name="salePrice" type="number" defaultValue={product?.salePrice ?? ""} /></Field>
            <Field label="NSO INVIMA"><Input name="nsoCode" defaultValue={product?.nsoCode ?? ""} /></Field>
            <Field label="Vencimiento NSO"><Input name="nsoExpiry" type="date" defaultValue={d(product?.nsoExpiry)} /></Field>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Unidades de compra" description='RF-1.3: ej. "Garrafa 20 L" = 20 L. El costo se convierte a la unidad base.' />
          <CardBody className="space-y-2">
            {convs.map((c, i) => (
              <div key={i} className="flex gap-2">
                <Input name="conv.unit" placeholder="Caja x200" value={c.unit} onChange={(e) => setConvs(convs.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                <Input name="conv.factor" type="number" step="any" placeholder="200" value={c.factor} onChange={(e) => setConvs(convs.map((x, j) => (j === i ? { ...x, factor: e.target.value } : x)))} />
                <Button type="button" variant="ghost" onClick={() => setConvs(convs.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setConvs([...convs, { unit: "", factor: "" }])}><Plus className="h-4 w-4" /> Agregar unidad de compra</Button>
          </CardBody>
        </Card>
      )}
      <SubmitButton>Guardar producto</SubmitButton>
    </ActionForm>
  );
}
