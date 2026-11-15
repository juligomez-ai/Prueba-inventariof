"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { scanCountAction } from "@/app/actions";
import { Scanner } from "./scanner";
import { Button, Card, CardBody, Field, Input, Notice } from "./ui";

type Pending = { code: string; serial: string; productName: string; unit: string; lotCode: string | null; brokenSeal: boolean };

/**
 * Captura del conteo (RF-10.3 a RF-10.5). La cantidad del sistema NUNCA se muestra aquí:
 * - caja sellada → un escaneo confirma ("Caja sellada ✓"), con la opción de reportar sello roto;
 * - caja abierta → "Caja abierta: cuenta las unidades" y hay que digitar.
 */
export function CountScanner({ countId }: { countId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [qty, setQty] = useState("");
  const [msg, setMsg] = useState<{ tone: "green" | "red" | "yellow" | "blue"; text: string } | null>(null);
  const [lastSealed, setLastSealed] = useState<string | null>(null);

  async function send(code: string, extra: { countedQty?: number; sealIntact?: boolean } = {}) {
    const r = await scanCountAction({ countId, code, ...extra });
    if (!r.ok) {
      setMsg({ tone: "red", text: r.error });
      return;
    }
    const res = r.result;
    if (res.needsQuantity) {
      setPending({ code, serial: res.serial, productName: res.productName, unit: res.unit, lotCode: res.lotCode, brokenSeal: extra.sealIntact === false });
      setQty("");
      setMsg(null);
      return;
    }
    setPending(null);
    setLastSealed(res.sealed ? code : null);
    setMsg(res.sealed ? { tone: "green", text: `Caja sellada ✓ ${res.serial} · ${res.productName}` } : { tone: "green", text: `✓ ${res.serial} contado.` });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <Scanner onCode={(code) => send(code)} disabled={Boolean(pending)} placeholder="Escanea la etiqueta del bulto" />
      {msg && (
        <Notice tone={msg.tone}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{msg.text}</span>
            {lastSealed && msg.tone === "green" && (
              <Button type="button" variant="outline" className="py-1 text-xs" onClick={() => send(lastSealed, { sealIntact: false })}>
                El sello está roto: contar
              </Button>
            )}
          </div>
        </Notice>
      )}
      {pending && (
        <Card className="border-amber-300 bg-amber-50">
          <CardBody>
            <div className="mb-2 font-semibold text-amber-900">{pending.brokenSeal ? "Sello roto" : "Caja abierta"}: cuenta las unidades</div>
            <div className="mb-3 text-sm">{pending.productName} · <span className="font-mono">{pending.serial}</span>{pending.lotCode ? ` · lote ${pending.lotCode}` : ""}</div>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const v = Number(qty.replace(",", "."));
                if (qty === "" || Number.isNaN(v)) return;
                await send(pending.code, { countedQty: v, sealIntact: pending.brokenSeal ? false : undefined });
              }}
            >
              <Field label={pending.unit === "und" ? "Unidades contadas" : `Cantidad medida (${pending.unit})`}>
                <Input type="number" step="any" min={0} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus required />
              </Field>
              <Button type="submit">Guardar</Button>
              <Button type="button" variant="ghost" onClick={() => setPending(null)}>Cancelar</Button>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
