import type { EstadoBulto, EstadoConteo, EstadoDespacho, EstadoEnvio, EstadoLote, EstadoOC, EstadoOP, TipoMovimiento, TipoProducto } from "@prisma/client";
import {
  containerStatusLabel, countStatusLabel, dispatchStatusLabel, lotStatusLabel, movementLabel, opStatusLabel,
  poStatusLabel, productTypeLabel, shipmentStatusLabel,
} from "@/shared/labels";
import { daysBetween } from "@/shared/numbers";
import { Badge } from "./ui";

type Tone = "gray" | "green" | "yellow" | "red" | "blue" | "purple";

export const ProductTypeBadge = ({ type }: { type: TipoProducto }) => (
  <Badge tone={({ MATERIA_PRIMA: "gray", EMPAQUE: "purple", PRODUCTO_TERMINADO: "green" } as const)[type]}>{productTypeLabel[type]}</Badge>
);
export const LotStatusBadge = ({ status }: { status: EstadoLote }) => (
  <Badge tone={({ DISPONIBLE: "green", CUARENTENA: "yellow", BLOQUEADO: "red", VENCIDO: "red" } as const)[status]}>{lotStatusLabel[status]}</Badge>
);
export const ContainerStatusBadge = ({ status }: { status: EstadoBulto }) => (
  <Badge tone={({ SELLADO: "blue", ABIERTO: "yellow", VACIO: "gray", DADO_DE_BAJA: "red" } as const)[status]}>{containerStatusLabel[status]}</Badge>
);
export const PoStatusBadge = ({ status }: { status: EstadoOC }) => (
  <Badge tone={({ BORRADOR: "gray", ENVIADA: "blue", EN_TRANSITO: "purple", RECIBIDA_PARCIAL: "yellow", RECIBIDA: "green", ANULADA: "red" } as const)[status]}>{poStatusLabel[status]}</Badge>
);
export const OpStatusBadge = ({ status }: { status: EstadoOP }) => (
  <Badge tone={({ BORRADOR: "gray", EN_PROCESO: "blue", COMPLETADA: "green", ANULADA: "red" } as const)[status]}>{opStatusLabel[status]}</Badge>
);
export const DispatchStatusBadge = ({ status }: { status: EstadoDespacho }) => (
  <Badge tone={({ PENDIENTE: "gray", EN_ALISTAMIENTO: "yellow", DESPACHADO: "blue", EN_TRANSITO: "purple", ENTREGADO: "green", NOVEDAD: "red", DEVUELTO: "red" } as const)[status]}>{dispatchStatusLabel[status]}</Badge>
);
export const ShipmentStatusBadge = ({ status }: { status: EstadoEnvio }) => (
  <Badge tone={({ CREADO: "gray", DESPACHADO: "blue", EN_TRANSITO: "purple", EN_CIUDAD_DESTINO: "purple", ENTREGADO: "green", NOVEDAD: "red" } as const)[status]}>{shipmentStatusLabel[status]}</Badge>
);
export const CountStatusBadge = ({ status }: { status: EstadoConteo }) => (
  <Badge tone={({ EN_CURSO: "blue", EN_REVISION: "yellow", APROBADO: "green", ANULADO: "red" } as const)[status]}>{countStatusLabel[status]}</Badge>
);

export function MovementBadge({ type }: { type: TipoMovimiento }) {
  const tone: Tone = type.startsWith("ENT") || type === "AJUSTE_ENT" || type === "INV_INICIAL" || type === "TRASLADO_ENT" ? "green" : type === "BAJA" ? "red" : "yellow";
  const m = movementLabel[type];
  return (
    <span title={`${m.code} · ${m.meaning}`}>
      <Badge tone={tone}>{m.name} · {m.code}</Badge>
    </span>
  );
}

/** Semáforo de vencimiento: rojo vencido, amarillo ≤ 90 días, verde. */
export function ExpiryBadge({ date }: { date: Date | null | undefined }) {
  if (!date) return <span className="text-muted">—</span>;
  const days = daysBetween(new Date(), date);
  if (days < 0) return <Badge tone="red">Vencido hace {-days} d</Badge>;
  if (days <= 30) return <Badge tone="red">Vence en {days} d</Badge>;
  if (days <= 90) return <Badge tone="yellow">Vence en {days} d</Badge>;
  return <Badge tone="green">{days} d</Badge>;
}

/** RF-3.4: rojo ≤ stock de seguridad, amarillo ≤ mínimo, verde. */
export function StockLight({ qty, min, safety }: { qty: number; min: number; safety: number }) {
  if (qty <= safety && (safety > 0 || qty <= 0)) return <Badge tone="red">Crítico</Badge>;
  if (qty <= min) return <Badge tone="yellow">Bajo mínimo</Badge>;
  return <Badge tone="green">OK</Badge>;
}
