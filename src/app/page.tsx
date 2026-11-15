import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { alerts, dashboard } from "@/application/use-cases/insights";
import type { ReactNode } from "react";
import { FlowChart, InventoryValueChart } from "@/components/dashboard-charts";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { PERIODS, periodLabel, type PeriodKey } from "@/domain/services/series";
import { Badge, ButtonLink, Card, CardBody, CardHeader, Empty, PageHeader, Stat } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtDate, fmtMoney, fmtPct } from "@/shared/numbers";

export default async function Dashboard(props: PageProps<"/">) {
  const sp = await props.searchParams;
  const period = (typeof sp.periodo === "string" && sp.periodo in PERIODS ? sp.periodo : "30") as PeriodKey;
  const [k, al, shipments] = await Promise.all([
    dashboard(PERIODS[period]),
    alerts(),
    prisma.shipment.findMany({
      where: { direction: "ENTRANTE", status: { not: "ENTREGADO" }, purchaseOrder: { status: { in: ["ENVIADA", "EN_TRANSITO", "RECIBIDA_PARCIAL"] } } },
      include: { carrier: true, purchaseOrder: { include: { supplier: true } } },
      orderBy: { eta: "asc" },
      take: 5,
    }),
  ]);
  const today = new Date();
  const vs = period === "30" ? "vs 30 días anteriores" : period === "90" ? "vs 3 meses anteriores" : "vs 6 meses anteriores";

  return (
    <>
      <PageHeader
        title="Resumen de inventario y producción"
        description="Botánica Viva · inventario, producción y logística en un solo lugar."
        actions={
          <>
            <ButtonLink href="/copiloto"><Sparkles className="h-4 w-4" /> Preguntar al Copiloto</ButtonLink>
            <ButtonLink href="/produccion/nueva" variant="outline">Nueva orden de producción</ButtonLink>
          </>
        }
      />
      <nav className="mb-5 inline-flex rounded-lg border border-border bg-card p-1 text-sm" aria-label="Período">
        {(Object.keys(PERIODS) as PeriodKey[]).map((key) => (
          <Link key={key} href={key === "30" ? "/" : `/?periodo=${key}`} aria-current={key === period ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 ${key === period ? "bg-accent font-medium text-primary" : "text-muted hover:text-foreground"}`}>
            {periodLabel[key]}
          </Link>
        ))}
      </nav>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Dinero</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi href="/existencias" label="Valor del inventario" value={fmtMoney(k.value.total)} delta={k.value.change} good="neutral" vs="vs inicio del período"
          sub={`MP ${fmtMoney(k.value.MATERIA_PRIMA)} · Empaques ${fmtMoney(k.value.EMPAQUE)} · Terminado ${fmtMoney(k.value.PRODUCTO_TERMINADO)}`} />
        <Kpi href="/produccion" label="Costo de producción" value={fmtMoney(k.production.actual)} delta={k.production.change} good="neutral" vs={vs}
          sub={k.production.orders === 0 ? `Sin órdenes completadas · ${k.production.inProgress} en proceso` : `${k.production.orders} orden(es) · ${k.production.variance === 0 ? "igual a la fórmula" : `${k.production.variance > 0 ? "+" : "−"}${fmtMoney(Math.abs(k.production.variance))} (${fmtPct(Math.abs(k.production.variancePct))}) vs fórmula`}`}
          tone={k.production.variancePct > 2 ? "yellow" : undefined} />
        <Kpi href="/ajustes" label="Pérdidas" value={fmtMoney(k.losses.value)} delta={k.losses.change} good="down" vs={vs}
          sub={`${k.losses.movements} baja(s) y ajuste(s) negativos`} tone={k.losses.value > 0 ? "red" : "green"} />
        <Kpi href="/conteos" label="Exactitud del inventario" value={k.accuracy.value === null ? "—" : fmtPct(k.accuracy.value)} delta={k.accuracy.change} deltaPoints good="up" vs={vs}
          sub={k.accuracy.value === null ? "Sin conteos aprobados en el período" : `Por valor · ${k.accuracy.lines} bultos en ${k.accuracy.counts} conteo(s)`}
          tone={k.accuracy.value === null ? undefined : k.accuracy.value >= 95 ? "green" : "yellow"} />
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Valor del inventario" description={`${periodLabel[period]} comparado con el período anterior · costo promedio ponderado`} actions={<span className="text-lg font-semibold tabular">{fmtMoney(k.value.total)}</span>} />
          <CardBody><InventoryValueChart labels={k.charts.labels} current={k.charts.value} previous={k.charts.valuePrev} weekly={k.charts.weekly} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Entradas vs salidas" description={`En pesos, por ${k.charts.weekly ? "semana" : "día"} · sin traslados entre bodegas`} actions={<Link className="text-sm text-primary hover:underline" href="/kardex">Ver Kardex</Link>} />
          <CardBody><FlowChart labels={k.charts.labels} inflow={k.charts.inflow} outflow={k.charts.outflow} weekly={k.charts.weekly} /></CardBody>
        </Card>
      </div>

      <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-muted">Operación de hoy</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi href="/existencias" label="Insumos bajo mínimo" value={k.supplies.count}
          sub={k.supplies.count ? `${k.supplies.critical} crítico(s) · ${k.supplies.inTransit} ya en camino` : "Todo sobre el mínimo"}
          tone={k.supplies.critical ? "red" : k.supplies.count ? "yellow" : "green"} />
        <Kpi href="/lotes" label="Lotes por vencer (30 días)" value={k.expiring.count}
          sub={k.expiring.count ? `${fmtMoney(k.expiring.value)} en riesgo${k.expiring.expired ? ` · ${k.expiring.expired} ya vencido(s)` : ""}` : "Nada vence pronto"}
          tone={k.expiring.expired ? "red" : k.expiring.count ? "yellow" : "green"} />
        <Kpi href="/calidad" label="Por liberar" value={k.toRelease.count}
          sub={k.toRelease.count ? `Lotes en cuarentena · el más antiguo lleva ${k.toRelease.oldestDays} día(s)` : "Sin lotes en cuarentena"}
          tone={k.toRelease.count ? "yellow" : "green"} />
        <Kpi href="/despachos" label="Por despachar" value={k.toDispatch.pending}
          sub={`${k.toDispatch.onTheWay} en camino${k.toDispatch.incidents ? ` · ${k.toDispatch.incidents} con novedad` : ""}`}
          tone={k.toDispatch.incidents ? "red" : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Alertas</span>} description="Stock bajo mínimo, vencimientos, lotes por liberar, envíos retrasados y despachos con novedad." />
          {al.length === 0 ? (
            <Empty>Todo en orden.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {al.slice(0, 14).map((a, i) => (
                <li key={i}>
                  <Link href={a.href} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-accent/50">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${a.tone === "red" ? "bg-red-500" : "bg-amber-500"}`} />
                    <Badge tone="gray" className="capitalize">{a.kind}</Badge>
                    <span className="flex-1">{a.text}</span>
                    <ArrowRight className="h-4 w-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Por llegar" description="Compras en camino por fecha estimada." actions={<Link href="/envios" className="text-sm text-primary hover:underline">Ver todo</Link>} />
            {shipments.length === 0 ? (
              <Empty>No hay envíos en camino.</Empty>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {shipments.map((s) => {
                  const late = s.eta && s.eta < today;
                  return (
                    <li key={s.id} className="px-5 py-2.5">
                      <Link href={`/compras/${s.purchaseOrderId}`} className="font-medium hover:underline">{s.purchaseOrder?.code}</Link> · {s.purchaseOrder?.supplier.name}
                      <div className={`text-xs ${late ? "font-medium text-red-700" : "text-muted"}`}>
                        {s.carrier.name} · ETA {fmtDate(s.eta)} {late && "· retrasado"}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Configuración" description="Se marca sola a medida que avanzas (RF-14.2)." />
            <CardBody className="space-y-3 text-sm">
              <OnboardingChecklist />
              <Link href="/ayuda" className="block pt-1 text-primary hover:underline">Ir al centro de ayuda →</Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function Kpi({ href, delta, deltaPoints, good = "neutral", vs, sub, ...p }: {
  href: string; label: string; value: ReactNode; sub?: ReactNode; tone?: "red" | "yellow" | "green";
  delta?: number | null; deltaPoints?: boolean; good?: "up" | "down" | "neutral"; vs?: string;
}) {
  // Flecha y color según si subir es bueno, malo o neutro para ese indicador
  const d = delta === undefined || delta === null || !Number.isFinite(delta) ? null : delta;
  const up = d !== null && d > 0.05, down = d !== null && d < -0.05;
  const color = !d || (!up && !down) || good === "neutral" ? "text-muted" : (up && good === "up") || (down && good === "down") ? "text-green-700" : "text-red-700";
  const badge = d === null ? null : (
    <span className={`whitespace-nowrap text-xs font-medium ${color}`} title={vs}>
      {up ? "↑" : down ? "↓" : "→"} {deltaPoints ? `${Math.abs(d).toLocaleString("es-CO", { maximumFractionDigits: 1 })} pts` : fmtPct(Math.abs(d))}
    </span>
  );
  return (
    <Link href={href} className="block rounded-xl transition hover:ring-2 hover:ring-primary/20">
      <Stat {...p} sub={<>{badge && <span className="mb-0.5 block">{badge} <span className="text-muted">{vs}</span></span>}{sub}</>} />
    </Link>
  );
}
