"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDate, fmtMoney } from "@/shared/numbers";

export interface CostPoint {
  at: string; // ISO
  cost: number; // costo promedio después del movimiento
  doc: string;
  movement: string;
}

/**
 * Historial del costo promedio ponderado (RF-4.7).
 * Línea escalonada: el costo cambia solo con las entradas con costo y se mantiene entre ellas.
 * Una sola serie (sin leyenda: el título la nombra), marcadores en cada cambio y tooltip al pasar el cursor.
 */
export function CostHistoryChart({ points: raw, unit, now: nowIso }: { points: CostPoint[]; unit: string; now: string }) {
  const [hover, setHover] = useState<number | null>(null);
  // Ancho real del contenedor: el texto se ve a su tamaño en cualquier pantalla
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const H = 220, L = 72, R = 16, T = 16, B = 28;
  // Un punto por día (el último costo del día), para no apilar marcadores
  const byDay = new Map<string, CostPoint>();
  for (const pt of raw) byDay.set(pt.at.slice(0, 10), pt);
  const points = [...byDay.values()];
  const color = "#00A08E"; // turquesa validado: luminosidad, croma y contraste vs superficie

  if (points.length < 2)
    return <p className="px-5 py-6 text-sm text-muted">Aún no hay suficientes cambios de costo para graficar. El costo cambia con cada compra o producción.</p>;

  const times = points.map((p) => new Date(p.at).getTime());
  // El eje llega hasta hoy: el último costo sigue vigente
  const now = new Date(nowIso).getTime(); // viene del servidor para que no cambie al hidratar
  const t0 = times[0], t1 = Math.max(now, times[times.length - 1], t0 + 1);
  const costs = points.map((p) => p.cost);
  let min = Math.min(...costs), max = Math.max(...costs);
  if (max === min) { min = min * 0.95; max = max * 1.05 || 1; }
  const pad = (max - min) * 0.15;
  min = Math.max(0, min - pad); max = max + pad;
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (c: number) => T + (1 - (c - min) / (max - min)) * (H - T - B);

  // Trazo escalonado: horizontal hasta el siguiente cambio, luego vertical
  let d = `M ${x(times[0])} ${y(costs[0])}`;
  for (let i = 1; i < points.length; i++) d += ` H ${x(times[i])} V ${y(costs[i])}`;
  d += ` H ${x(t1)}`;
  const ticks = [min, (min + max) / 2, max];
  const h = hover !== null ? points[hover] : null;

  return (
    <div ref={box} className="relative mx-5 mb-4 mt-2">
      <svg width={W} height={H} role="img" aria-label="Historial del costo promedio" onMouseLeave={() => setHover(null)}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-border" strokeWidth={1} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" className="fill-muted text-[11px] tabular">{fmtMoney(v)}</text>
          </g>
        ))}
        <text x={L} y={H - 8} className="fill-muted text-[11px]">{fmtDate(new Date(t0))}</text>
        <text x={W - R} y={H - 8} textAnchor="end" className="fill-muted text-[11px]">Hoy</text>
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {h && <line x1={x(times[hover!])} x2={x(times[hover!])} y1={T} y2={H - B} stroke="currentColor" className="text-muted" strokeDasharray="3 3" />}
        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${fmtDate(new Date(p.at))}: ${fmtMoney(p.cost)} por ${unit} (${p.doc})`}>
            {/* Zona de toque más grande que el marcador */}
            <circle cx={x(times[i])} cy={y(p.cost)} r={12} fill="transparent" />
            <circle cx={x(times[i])} cy={y(p.cost)} r={hover === i ? 6 : 4} fill={color} stroke="var(--card)" strokeWidth={2} />
          </g>
        ))}
        {/* Etiqueta directa solo del valor actual */}
        <text x={W - R} y={y(costs[costs.length - 1]) - 8} textAnchor="end" className="fill-foreground text-[11px] font-semibold tabular">
          {fmtMoney(costs[costs.length - 1])}
        </text>
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md"
          style={{
            ...(x(times[hover!]) / W > 0.65 ? { right: `calc(${(1 - x(times[hover!]) / W) * 100}% + 12px)` } : { left: `calc(${(x(times[hover!]) / W) * 100}% + 12px)` }),
            // Debajo del punto si está en la mitad superior, encima si está en la inferior: nunca lo tapa
            ...(y(h.cost) / H < 0.5 ? { top: `calc(${(y(h.cost) / H) * 100}% + 16px)` } : { bottom: `calc(${(1 - y(h.cost) / H) * 100}% + 16px)` }),
          }}
        >
          <div className="font-semibold tabular">{fmtMoney(h.cost)} / {unit}</div>
          <div className="text-muted">{fmtDate(new Date(h.at))} · {h.doc}</div>
          <div className="text-muted">{h.movement}</div>
        </div>
      )}
    </div>
  );
}
