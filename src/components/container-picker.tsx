"use client";

import { useState, type ReactNode } from "react";
import { lookupCodeAction } from "@/app/actions";
import { fmtQty } from "@/shared/numbers";
import { Scanner } from "./scanner";
import { Notice } from "./ui";

export type PickedContainer = Extract<Awaited<ReturnType<typeof lookupCodeAction>>, { kind: "container" }>;

/** Escanear un serial para operar sobre un bulto (ajustes, traslados). */
export function ContainerPicker({ children }: { children: (c: PickedContainer, reset: () => void) => ReactNode }) {
  const [c, setC] = useState<PickedContainer | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Scanner
        autoFocus={false}
        placeholder="Escanea o digita el serial del bulto (ej. MP-001-000001)"
        onCode={async (code) => {
          const r = await lookupCodeAction(code);
          if (!r) { setC(null); setError(`Código desconocido: ${code}`); return; }
          if (r.kind === "product") { setC(null); setError(`${r.name}: escanea la etiqueta del bulto (serial), no el código del producto.`); return; }
          if (r.status === "VACIO" || r.status === "DADO_DE_BAJA") { setC(null); setError(`El bulto ${r.serial} está ${r.status === "VACIO" ? "vacío" : "dado de baja"}.`); return; }
          setError(null);
          setC(r);
        }}
      />
      {error && <Notice tone="red">{error}</Notice>}
      {c && (
        <div className="rounded-lg border border-border bg-accent/40 p-3 text-sm">
          <div className="font-medium">{c.name} · <span className="font-mono">{c.serial}</span></div>
          <div className="text-muted">Bodega {c.warehouse}{c.lotCode ? ` · lote ${c.lotCode}` : ""} · contiene {fmtQty(c.currentQty, c.unit)} · {c.status === "SELLADO" ? "sellado" : "abierto"}</div>
          <div className="mt-3">{children(c, () => setC(null))}</div>
        </div>
      )}
    </div>
  );
}
