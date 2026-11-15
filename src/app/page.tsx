import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { alerts, dashboard } from "@/application/use-cases/insights";
import type { ReactNode } from "react";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { Badge, ButtonLink, Card, CardBody, CardHeader, Empty, PageHeader, Stat } from "@/components/ui";
import { prisma } from "@/infrastructure/database/prisma";
import { fmtDate, fmtMoney, fmtPct } from "@/shared/numbers";

export default async function Dashboard() {
  const [k, al, shipments] = await Promise.all([
    dashboard(),
    alerts(),
    prisma.shipment.findMany({
      where: { direction: "ENTRANTE", status: { not: "ENTREGADO" }, purchaseOrder: { status: { in: ["ENVIADA", "EN_TRANSITO", "RECIBIDA_PARCIAL"] } } },
      include: { carrier: true, purchaseOrder: { include: { supplier: true } } },
      orderBy: { eta: "asc" },
      take: 5,
    }),
  ]);
  const today = new Date();

  return (
    <>
      <PageHeader
        title="Tablero"
        description="Inventario, producción y logística de Botánica Viva en un solo lugar."
        actions={
          <>
            <ButtonLink href="/copiloto"><Sparkles className="h-4 w-4" /> Preguntar al Copiloto</ButtonLink>
            <ButtonLink href="/produccion/nueva" variant="outline">Nueva orden de producción</ButtonLink>
          </>
        }
      />
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Dinero</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi href="/existencias" label="Valor del inventario" value={fmtMoney(k.value.total)}
          sub={`MP ${fmtMoney(k.value.MATERIA_PRIMA)} · Empaques ${fmtMoney(k.value.EMPAQUE)} · Terminado ${fmtMoney(k.value.PRODUCTO_TERMINADO)}`} />
        <Kpi href="/produccion" label="Costo de producción del mes" value={fmtMoney(k.production.actual)}
          sub={k.production.orders === 0 ? `Sin órdenes completadas · ${k.production.inProgress} en proceso` : `${k.production.orders} orden(es) · ${k.production.variance === 0 ? "igual a la fórmula" : `${k.production.variance > 0 ? "+" : "−"}${fmtMoney(Math.abs(k.production.variance))} (${fmtPct(Math.abs(k.production.variancePct))}) vs fórmula`} · ${k.production.inProgress} en proceso`}
          tone={k.production.variancePct > 2 ? "yellow" : undefined} />
        <Kpi href="/ajustes" label="Pérdidas del mes" value={fmtMoney(k.losses.value)}
          sub={`${k.losses.movements} baja(s) y ajuste(s) negativos`} tone={k.losses.value > 0 ? "red" : "green"} />
        <Kpi href="/conteos" label="Exactitud del inventario" value={k.accuracy.value === null ? "—" : fmtPct(k.accuracy.value)}
          sub={k.accuracy.value === null ? "Sin conteos aprobados en 30 días" : `Por valor · ${k.accuracy.lines} bultos en ${k.accuracy.counts} conteo(s), últimos 30 días`}
          tone={k.accuracy.value === null ? undefined : k.accuracy.value >= 95 ? "green" : "yellow"} />
      </div>
      <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Operación</h2>
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

function Kpi({ href, ...p }: { href: string; label: string; value: ReactNode; sub?: ReactNode; tone?: "red" | "yellow" | "green" }) {
  return (
    <Link href={href} className="block rounded-xl transition hover:ring-2 hover:ring-primary/20">
      <Stat {...p} />
    </Link>
  );
}
