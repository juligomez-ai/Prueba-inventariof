import type { Carrier, Shipment, ShipmentEvent } from "@prisma/client";
import { shipmentEventAction } from "@/app/actions";
import { trackingUrl } from "@/domain/services/codes";
import { shipmentStatusLabel } from "@/shared/labels";
import { fmtDate, fmtDateTime } from "@/shared/numbers";
import { ActionForm, SubmitButton } from "./action-form";
import { ShipmentStatusBadge } from "./badges";
import { TrackLink } from "./track-link";
import { Card, CardBody, CardHeader, Input, Select } from "./ui";

/** Envío con su línea de tiempo y registro manual de eventos (RF-7.1 a RF-7.3, RF-12.6). */
export function ShipmentCard({ s, inbound }: { s: Shipment & { carrier: Carrier; events: ShipmentEvent[] }; inbound: boolean }) {
  const late = s.eta && s.eta < new Date() && s.status !== "ENTREGADO";
  return (
    <Card>
      <CardHeader
        title={<span className="flex flex-wrap items-center gap-2">{s.carrier.name} · <TrackLink url={trackingUrl(s.carrier.trackingUrlTemplate, s.trackingNumber)} trackingNumber={s.trackingNumber} acceptsParam={s.carrier.acceptsParam} /></span>}
        description={<span className={late ? "font-medium text-red-700" : ""}>Despachado {fmtDate(s.shippedAt)} · ETA {fmtDate(s.eta)}{late ? " · retrasado" : ""}</span>}
        actions={<ShipmentStatusBadge status={s.status} />}
      />
      <CardBody className="space-y-4">
        <ol className="relative ml-2 border-l border-border">
          {[...s.events].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).map((e) => (
            <li key={e.id} className="mb-3 ml-4">
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-primary" />
              <div className="text-sm font-medium">{shipmentStatusLabel[e.status]}</div>
              <div className="text-xs text-muted">{fmtDateTime(e.occurredAt)} · {e.userName.split(" (")[0]}{e.note ? ` · ${e.note}` : ""}</div>
            </li>
          ))}
        </ol>
        {s.status !== "ENTREGADO" && (
          <ActionForm action={shipmentEventAction} className="grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="shipmentId" value={s.id} />
            <Select name="status" defaultValue="EN_TRANSITO">
              {(["DESPACHADO", "EN_TRANSITO", "EN_CIUDAD_DESTINO", "ENTREGADO", "NOVEDAD"] as const).map((k) => <option key={k} value={k}>{shipmentStatusLabel[k]}</option>)}
            </Select>
            <Input name="occurredAt" type="date" aria-label="Fecha" />
            <Input name="note" placeholder="Nota (ej. recibió Marcela Ortiz)" className="sm:col-span-2" />
            <SubmitButton variant="outline">Registrar estado</SubmitButton>
          </ActionForm>
        )}
        {inbound && <p className="text-xs text-muted">Marcar &quot;Entregado&quot; no suma stock: el inventario entra solo con la recepción, que valida cantidades y lotes (RN-7.1).</p>}
      </CardBody>
    </Card>
  );
}
