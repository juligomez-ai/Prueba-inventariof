"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { pickScanAction } from "@/app/actions";
import { Scanner } from "./scanner";
import { Notice } from "./ui";

/** Verificación del alistamiento escaneando el serial de cada caja (RF-12.2). */
export function PickScanner({ dispatchId }: { dispatchId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "green" | "red" | "yellow"; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <Scanner
        placeholder="Escanea la etiqueta de cada caja"
        onCode={async (code) => {
          const r = await pickScanAction(dispatchId, code);
          if (!r.ok) setMsg({ tone: "red", text: r.error });
          else setMsg(r.already ? { tone: "yellow", text: `${r.serial} ya estaba verificada.` } : { tone: "green", text: `✓ ${r.serial} verificada.` });
          router.refresh();
        }}
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
