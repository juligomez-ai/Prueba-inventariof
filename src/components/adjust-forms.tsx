"use client";

import { adjustDownAction, transferAction } from "@/app/actions";
import { adjustmentReasonLabel } from "@/shared/labels";
import { ActionForm, SubmitButton } from "./action-form";
import { ContainerPicker } from "./container-picker";
import { Field, Input, Select } from "./ui";

export function AdjustDownForm() {
  return (
    <ContainerPicker>
      {(c) => (
        <ActionForm action={adjustDownAction} className="grid gap-3 sm:grid-cols-3" resetOnSuccess>
          <input type="hidden" name="containerId" value={c.containerId} />
          <Field label={`Cantidad a descontar (${c.unit})`}><Input name="quantity" type="number" step="any" min={0} max={c.currentQty} required /></Field>
          <Field label="Motivo">
            <Select name="reason" defaultValue="DANADO">
              {(["DANADO", "VENCIDO", "MERMA_PROCESO", "MUESTRA_OBSEQUIO", "ERROR_REGISTRO"] as const).map((k) => <option key={k} value={k}>{adjustmentReasonLabel[k]}</option>)}
            </Select>
          </Field>
          <Field label="Nota"><Input name="notes" /></Field>
          <div className="sm:col-span-3"><SubmitButton variant="danger">Registrar salida</SubmitButton></div>
        </ActionForm>
      )}
    </ContainerPicker>
  );
}

export function TransferForm({ warehouses }: { warehouses: { id: string; code: string; name: string }[] }) {
  return (
    <ContainerPicker>
      {(c) => (
        <ActionForm action={transferAction} className="grid gap-3 sm:grid-cols-3" resetOnSuccess>
          <input type="hidden" name="containerId" value={c.containerId} />
          <Field label="Bodega destino">
            <Select name="toWarehouseId">{warehouses.filter((w) => w.id !== c.warehouseId).map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</Select>
          </Field>
          <Field label={`Cantidad (${c.unit})`} hint="(vacío = bulto completo)"><Input name="quantity" type="number" step="any" min={0} max={c.currentQty} /></Field>
          <Field label="Nota"><Input name="notes" /></Field>
          <div className="sm:col-span-3"><SubmitButton>Trasladar</SubmitButton></div>
        </ActionForm>
      )}
    </ContainerPicker>
  );
}
