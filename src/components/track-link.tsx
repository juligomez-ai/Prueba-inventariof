"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";

/**
 * Enlace a la página oficial de rastreo (RF-7.3b). Si la transportadora no acepta la guía
 * en la URL, abre su página de rastreo y copia la guía al portapapeles.
 */
export function TrackLink({ url, trackingNumber, acceptsParam }: { url: string | null; trackingNumber: string; acceptsParam: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!url) return <span className="font-mono">{trackingNumber}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
      title={acceptsParam ? "Abrir el rastreo oficial con la guía cargada" : "Abrir la página de rastreo (la guía se copia al portapapeles)"}
      onClick={() => {
        if (!acceptsParam) {
          navigator.clipboard?.writeText(trackingNumber).then(() => { setCopied(true); setTimeout(() => setCopied(false), 3000); }).catch(() => {});
        }
      }}
    >
      {trackingNumber} <ExternalLink className="h-3.5 w-3.5" />
      {copied && <span className="ml-1 rounded bg-green-100 px-1.5 font-sans text-xs text-green-800">Guía copiada: pégala en la página</span>}
    </a>
  );
}
