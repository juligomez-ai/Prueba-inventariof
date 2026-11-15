import type { EstadoLote } from "@prisma/client";
import { lotStatusAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "./action-form";
import { Input } from "./ui";

/** Liberar / rechazar / poner en cuarentena un lote con nota obligatoria (RF-5.8, RF-5.9). */
export function LotStatusForm({ lotId, status }: { lotId: string; status: EstadoLote }) {
  if (status === "VENCIDO") return null;
  return (
    <ActionForm action={lotStatusAction} className="space-y-2">
      <input type="hidden" name="lotId" value={lotId} />
      <Input name="note" placeholder={status === "CUARENTENA" ? "Resultado de calidad (ej. pH 5,8; olor y textura conformes)" : "Motivo (ej. reclamo de cliente)"} required />
      <div className="flex flex-wrap gap-2">
        {status !== "DISPONIBLE" && <SubmitButton name="op" value="release">Liberar</SubmitButton>}
        {status !== "BLOQUEADO" && <SubmitButton name="op" value="reject" variant="danger">Rechazar / bloquear</SubmitButton>}
        {status !== "CUARENTENA" && <SubmitButton name="op" value="quarantine" variant="outline">Poner en cuarentena</SubmitButton>}
      </div>
    </ActionForm>
  );
}
