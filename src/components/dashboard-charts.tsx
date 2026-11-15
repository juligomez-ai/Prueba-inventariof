"use client";

import { useEffect, useRef, useState } from "react";
import { fmtMoney } from "@/shared/numbers";

/** Colores validados (luminosidad, croma, separación para daltonismo y contraste vs blanco). */
export const CHART = { primary: "#00A08E", secondary: "#E0653A", previous: "#9CA3AF" };

const shortMoney = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `$${(v / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : Math.abs(v) >= 1000 ? `$${Math.round(v / 1000).toLocaleString("es-CO")} mil` : `$${Math.round(v)}`;
const dayLabel = (iso: string) => new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", timeZone: "America/Bogota" }).format(new Date(iso));

/** Ancho real del contenedor, para que los textos del SVG se vean a su tamaño. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceTicks(max: number, min = 0) {
  const span = Math.max(1, max - min);
  const step = Math.pow(10, Math.floor(Math.log10(span / 3)));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => span / s <= 4) ?? step * 10;
  const lo = Math.floor(min / nice) * nice;
  const ticks = [];
  for (let v = lo; v <= max + nice * 0.001; v += nice) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + nice);
  return ticks;
}

/** Índices del eje X a rotular según su posición en píxeles: el primero, el último y los que quepan con al menos `gap` px entre sí. */
function tickIndexes(xs: number[], gap = 76) {
  const out = new Set<number>();
  if (xs.length === 0) return out;
  const last = xs.length - 1;
  let prev = -Infinity;
  for (let i = 0; i < last; i++) {
    if (xs[i] - prev >= gap && xs[last] - xs[i] >= gap) { out.add(i); prev = xs[i]; }
  }
  out.add(last);
  return out;
}
const anchor = (i: number, count: number) => (i === 0 ? "start" : i === count - 1 ? "end" : "middle");

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden><line x1="1" x2="17" y1="4" y2="4" stroke={i.color} strokeWidth={2} strokeDasharray={i.dashed ? "4 3" : undefined} strokeLinecap="round" /></svg>
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, width, children }: { x: number; width: number; children: React.ReactNode }) {
  const right = x > width * 0.6;
  return (
    <div className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md" style={right ? { right: width - x + 12 } : { left: x + 12 }}>
      {children}
    </div>
  );
}

/** Valor del inventario en el tiempo: período actual (línea) vs período anterior (punteada). */
export function InventoryValueChart({ labels, current, previous, weekly }: { labels: string[]; current: number[]; previous: number[]; weekly: boolean }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = 240, L = 64, R = 16, T = 12, B = 28;
  const all = [...current, ...previous];
  const ticks = niceTicks(Math.max(...all, 1), Math.min(...all.filter((v) => v > 0), 0) * 0.9);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const x = (i: number) => L + (labels.length <= 1 ? 0 : (i / (labels.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"} ${x(i)} ${y(v)}`).join(" ");
  const shown = tickIndexes(labels.map((_, i) => x(i)));

  return (
    <div className="space-y-3">
      <Legend items={[{ label: "Período actual", color: CHART.primary }, { label: "Período anterior", color: CHART.previous, dashed: true }]} />
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={W} height={H} role="img" aria-label="Valor del inventario en el tiempo"
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left - L) / (W - L - R)) * (labels.length - 1));
            setHover(Math.max(0, Math.min(labels.length - 1, i)));
          }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#EEF0F2" />
              <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#6B6B6B">{shortMoney(t)}</text>
            </g>
          ))}
          {labels.map((l, i) => shown.has(i) && (
            <text key={l} x={x(i)} y={H - 8} textAnchor={anchor(i, labels.length)} fontSize={11} fill="#6B6B6B">{dayLabel(l)}</text>
          ))}
          <path d={path(previous)} fill="none" stroke={CHART.previous} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
          <path d={path(current)} fill="none" stroke={CHART.primary} strokeWidth={2} strokeLinejoin="round" />
          {hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#9CA3AF" strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(previous[hover])} r={4} fill={CHART.previous} stroke="#fff" strokeWidth={2} />
              <circle cx={x(hover)} cy={y(current[hover])} r={5} fill={CHART.primary} stroke="#fff" strokeWidth={2} />
            </>
          )}
          {/* Etiqueta directa del valor actual */}
          <circle cx={x(current.length - 1)} cy={y(current[current.length - 1])} r={4} fill={CHART.primary} stroke="#fff" strokeWidth={2} />
        </svg>
        {hover !== null && (
          <Tooltip x={x(hover)} width={W}>
            <div className="mb-1 font-medium">{weekly ? "Semana del " : ""}{dayLabel(labels[hover])}</div>
            <div className="flex justify-between gap-4"><span className="text-muted">Actual</span><b className="tabular">{fmtMoney(current[hover])}</b></div>
            <div className="flex justify-between gap-4"><span className="text-muted">Período anterior</span><span className="tabular">{fmtMoney(previous[hover])}</span></div>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Entradas vs salidas en pesos por día o semana (barras agrupadas). */
export function FlowChart({ labels, inflow, outflow, weekly }: { labels: string[]; inflow: number[]; outflow: number[]; weekly: boolean }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = 240, L = 64, R = 16, T = 12, B = 28;
  const ticks = niceTicks(Math.max(...inflow, ...outflow, 1));
  const hi = ticks[ticks.length - 1];
  const band = (W - L - R) / Math.max(1, labels.length);
  const barW = Math.max(2, Math.min(18, (band - 6) / 2));
  const y = (v: number) => T + (1 - v / hi) * (H - T - B);
  const shown = tickIndexes(labels.map((_, i) => L + band * i + band / 2));
  // Barra con esquinas superiores redondeadas (4 px) apoyada en la base
  const bar = (x0: number, v: number, color: string, key: string) => {
    if (v <= 0) return null;
    const top = y(v), base = H - B, r = Math.min(4, barW / 2, base - top);
    return <path key={key} d={`M ${x0} ${base} V ${top + r} Q ${x0} ${top} ${x0 + r} ${top} H ${x0 + barW - r} Q ${x0 + barW} ${top} ${x0 + barW} ${top + r} V ${base} Z`} fill={color} />;
  };
  return (
    <div className="space-y-3">
      <Legend items={[{ label: "Entradas (compras, producción, ajustes +)", color: CHART.primary }, { label: "Salidas (consumo, ventas, bajas, ajustes −)", color: CHART.secondary }]} />
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={W} height={H} role="img" aria-label="Entradas y salidas del inventario">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#EEF0F2" />
              <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#6B6B6B">{shortMoney(t)}</text>
            </g>
          ))}
          {labels.map((l, i) => {
            const cx = L + band * i + band / 2;
            return (
              <g key={l} onMouseEnter={() => setHover(i)}>
                {/* Zona de hover de toda la columna */}
                <rect x={L + band * i} y={T} width={band} height={H - T - B} fill={hover === i ? "#F3F4F6" : "transparent"} />
                {bar(cx - barW - 1, inflow[i], CHART.primary, "in")}
                {bar(cx + 1, outflow[i], CHART.secondary, "out")}
                {shown.has(i) && (
                  <text x={i === 0 ? L + band * i : i === labels.length - 1 ? L + band * (i + 1) : cx} y={H - 8} textAnchor={anchor(i, labels.length)} fontSize={11} fill="#6B6B6B">{dayLabel(l)}</text>
                )}
              </g>
            );
          })}
          <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="#D1D5DB" />
        </svg>
        {hover !== null && (
          <Tooltip x={L + band * hover + band / 2} width={W}>
            <div className="mb-1 font-medium">{weekly ? "Semana del " : ""}{dayLabel(labels[hover])}</div>
            <div className="flex justify-between gap-4"><span className="flex items-center gap-1 text-muted"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: CHART.primary }} />Entradas</span><b className="tabular">{fmtMoney(inflow[hover])}</b></div>
            <div className="flex justify-between gap-4"><span className="flex items-center gap-1 text-muted"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: CHART.secondary }} />Salidas</span><b className="tabular">{fmtMoney(outflow[hover])}</b></div>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
