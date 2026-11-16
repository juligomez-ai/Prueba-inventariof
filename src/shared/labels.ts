import type {
  EstadoBulto, EstadoConteo, EstadoDespacho, EstadoEnvio, EstadoLote, EstadoOC, EstadoOP, MotivoAjuste,
  TipoBodega, TipoDocumento, TipoMovimiento, TipoProducto,
} from "@prisma/client";

export const productTypeLabel: Record<TipoProducto, string> = {
  MATERIA_PRIMA: "Materia prima",
  EMPAQUE: "Empaque",
  PRODUCTO_TERMINADO: "Producto terminado",
};

export const warehouseTypeLabel: Record<TipoBodega, string> = {
  MATERIAS_PRIMAS: "Materias primas",
  EMPAQUE: "Empaque",
  PRODUCCION: "Producción",
  PRODUCTO_TERMINADO: "Producto terminado",
};

/** Tipos de movimiento en español con su sigla internacional (README M3). */
export const movementLabel: Record<TipoMovimiento, { name: string; code: string; meaning: string }> = {
  ENT_COMPRA: { name: "Entrada por compra", code: "GR", meaning: "Goods Receipt" },
  ENT_PRODUCCION: { name: "Entrada por producción", code: "FGR", meaning: "Finished Goods Receipt" },
  SAL_CONSUMO: { name: "Consumo de producción", code: "MI", meaning: "Material Issue" },
  SAL_VENTA: { name: "Salida por venta", code: "GI", meaning: "Goods Issue" },
  TRASLADO_SAL: { name: "Traslado (salida)", code: "STO", meaning: "Stock Transfer Order" },
  TRASLADO_ENT: { name: "Traslado (entrada)", code: "STO", meaning: "Stock Transfer Order" },
  AJUSTE_ENT: { name: "Ajuste positivo", code: "ADJ", meaning: "Inventory Adjustment" },
  AJUSTE_SAL: { name: "Ajuste negativo", code: "ADJ", meaning: "Inventory Adjustment" },
  BAJA: { name: "Baja", code: "SCR", meaning: "Scrap / Write-off" },
  INV_INICIAL: { name: "Inventario inicial", code: "OB", meaning: "Opening Balance" },
};
export const documentLabel: Record<TipoDocumento, { name: string; intl: string }> = {
  OC: { name: "Orden de compra", intl: "PO" },
  OP: { name: "Orden de producción", intl: "MO" },
  REM: { name: "Remisión de entrega", intl: "DN" },
  AJ: { name: "Ajuste de inventario", intl: "ADJ" },
  CC: { name: "Conteo cíclico", intl: "CC" },
  TR: { name: "Traslado", intl: "STO" },
};

/** Enlace al documento soporte de un movimiento. */
export function documentHref(type: TipoDocumento, id: string) {
  switch (type) {
    case "OC": return `/compras/${id}`;
    case "OP": return `/produccion/${id}`;
    case "REM": return `/despachos/${id}`;
    case "CC": return `/conteos/${id}`;
    case "AJ": return `/ajustes?doc=${id}`;
    case "TR": return `/bodegas?doc=${id}`;
  }
}

export const lotStatusLabel: Record<EstadoLote, string> = { DISPONIBLE: "Disponible", CUARENTENA: "Cuarentena", BLOQUEADO: "Bloqueado", VENCIDO: "Vencido" };
export const containerStatusLabel: Record<EstadoBulto, string> = { SELLADO: "Sellado", ABIERTO: "Abierto", VACIO: "Vacío", DADO_DE_BAJA: "Dado de baja" };
export const poStatusLabel: Record<EstadoOC, string> = { BORRADOR: "Borrador", ENVIADA: "Enviada", EN_TRANSITO: "En tránsito", RECIBIDA_PARCIAL: "Recibida parcial", RECIBIDA: "Recibida", ANULADA: "Anulada" };
export const opStatusLabel: Record<EstadoOP, string> = { BORRADOR: "Borrador", EN_PROCESO: "En proceso", COMPLETADA: "Completada", ANULADA: "Anulada" };
export const dispatchStatusLabel: Record<EstadoDespacho, string> = {
  PENDIENTE: "Pendiente", EN_ALISTAMIENTO: "En alistamiento", DESPACHADO: "Despachado", EN_TRANSITO: "En tránsito", ENTREGADO: "Entregado", NOVEDAD: "Novedad", DEVUELTO: "Devuelto",
};
export const shipmentStatusLabel: Record<EstadoEnvio, string> = {
  CREADO: "Creado", DESPACHADO: "Despachado", EN_TRANSITO: "En tránsito", EN_CIUDAD_DESTINO: "En ciudad destino", ENTREGADO: "Entregado", NOVEDAD: "Novedad",
};
export const countStatusLabel: Record<EstadoConteo, string> = { EN_CURSO: "En curso", EN_REVISION: "En revisión", APROBADO: "Aprobado", ANULADO: "Anulado" };
export const adjustmentReasonLabel: Record<MotivoAjuste, string> = {
  MERMA_PROCESO: "Merma de proceso", DANADO: "Producto dañado", VENCIDO: "Vencido", MUESTRA_OBSEQUIO: "Muestra / obsequio",
  ERROR_REGISTRO: "Error de registro", INVENTARIO_INICIAL: "Inventario inicial", CONTEO: "Conteo",
};
