"use client";

import { Camera, CameraOff, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input } from "./ui";

/**
 * Escáner de códigos de barras (RF-10.4):
 * - Pistola USB/Bluetooth: funciona como teclado; el campo con foco recibe el código + Enter.
 * - Cámara del celular: lectura en el navegador con ZXing (Code 128, EAN-13…).
 */
export function Scanner({
  onCode,
  disabled,
  placeholder = "Escanea o digita el código y presiona Enter",
  autoFocus = true,
}: {
  onCode: (code: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const emit = useCallback(
    async (raw: string, fromCamera = false) => {
      const code = raw.trim();
      if (!code) return;
      // La cámara lee la misma etiqueta muchas veces por segundo: se descartan repeticiones de menos de 2 s.
      // La pistola y el teclado sí pueden repetir el código a propósito.
      const now = Date.now();
      if (fromCamera && lastRef.current.code === code && now - lastRef.current.at < 2000) return;
      lastRef.current = { code, at: now };
      try {
        navigator.vibrate?.(60);
      } catch {}
      beep();
      await onCode(code);
    },
    [onCode],
  );

  useEffect(() => {
    if (!camera) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current!,
          (result) => {
            if (result) void emit(result.getText(), true);
          },
        );
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      } catch {
        setCameraError("No se pudo abrir la cámara. Revisa los permisos del navegador o usa la pistola / el teclado.");
        setCamera(false);
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [camera, emit]);

  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = value;
          setValue("");
          await emit(v);
          inputRef.current?.focus();
        }}
      >
        <div className="relative flex-1">
          <ScanLine className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            disabled={disabled}
            className="pl-9 font-mono"
            aria-label="Código escaneado"
          />
        </div>
        <Button type="submit" disabled={disabled}>Leer</Button>
        <Button type="button" variant="outline" onClick={() => { setCameraError(null); setCamera((c) => !c); }} disabled={disabled} title="Usar la cámara">
          {camera ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          <span className="hidden sm:inline">{camera ? "Cerrar cámara" : "Cámara"}</span>
        </Button>
      </form>
      {camera && <video ref={videoRef} className="aspect-video w-full max-w-md rounded-lg border border-border bg-black object-cover" muted playsInline />}
      {cameraError && <p className="text-sm text-red-700">{cameraError}</p>}
    </div>
  );
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.frequency.value = 880;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.08);
  } catch {}
}
