import Link from "next/link";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { HELP_TOPICS } from "@/shared/help";
import { movementLabel } from "@/shared/labels";

const quickStart = [
  { t: "Crea tus insumos y productos", d: "Productos → Nuevo. Indica la unidad (kg, L, und.), si controla lote y vencimiento, y su stock mínimo.", href: "/productos/nuevo" },
  { t: "Carga tu inventario inicial", d: "Ajustes → Entrada / inventario inicial. Cada saco, garrafa o caja recibe un serial; imprime sus etiquetas.", href: "/ajustes" },
  { t: "Crea tu fórmula", d: "Fórmulas → elige el producto y agrega los insumos para un lote (ej. 100 cremas). O dísela al Copiloto en texto libre.", href: "/formulas" },
  { t: "Produce", d: "Órdenes de producción → Nueva. El sistema te dice si te alcanza; al completar descuenta insumos y crea el lote.", href: "/produccion/nueva" },
  { t: "Revisa tu costo", d: "En la orden completada y en Fórmulas ves el costo real por unidad y el margen.", href: "/formulas" },
];

const glossary: [string, string][] = [
  ["Fórmula (receta)", "Lista de insumos y cantidades para producir un lote estándar (ej. 100 cremas)."],
  ["Rendimiento", "Cuántas unidades da la fórmula."],
  ["Lote", "Grupo de unidades con el mismo origen y fecha; tiene código y vencimiento."],
  ["Bulto / serial", "Saco, garrafa o caja con una etiqueta de código de barras única. Un solo producto y un solo lote."],
  ["FEFO", "First Expired, First Out: se usa primero lo que vence antes."],
  ["Cuarentena", "El producto existe pero no se puede usar ni vender hasta que calidad lo libere."],
  ["Kardex", "Historial de entradas y salidas de cada producto, con su costo y saldo."],
  ["Costo promedio ponderado", "Valor total del inventario ÷ cantidad total. Se recalcula con cada compra o producción."],
  ["Stock disponible", "Físico − reservado − en cuarentena o bloqueado."],
  ["Stock en tránsito", "Comprado y enviado por el proveedor, aún no recibido."],
  ["Clasificación ABC", "A = pocos ítems con mucho valor (se cuentan más seguido); C = muchos ítems de poco valor."],
  ["Remisión de entrega", "Documento que acompaña la mercancía al cliente. No reemplaza la factura electrónica."],
];

const faq: [string, string][] = [
  ["¿Puedo editar el stock directamente?", "No. Todo cambio es un movimiento con documento y motivo (ajuste, conteo, compra…). Así el Kardex siempre explica el saldo."],
  ["¿Qué pasa si edito una fórmula?", "Las órdenes ya creadas no cambian: cada orden guardó su propia copia de cantidades."],
  ["¿Por qué no puedo despachar un lote?", "Puede estar en cuarentena, bloqueado, vencido o con menos de 90 días de vida útil."],
  ["¿El IVA entra en el costo?", "No: el IVA de las compras es descontable, así que el costo se calcula sin IVA."],
  ["¿Marcar un envío como entregado suma stock?", "No. El stock entra solo cuando registras la recepción, que valida cantidades y lotes."],
  ["¿Qué hace el Copiloto?", "Responde con datos reales del sistema y prepara borradores de órdenes de producción, órdenes de compra y fórmulas. Nunca mueve inventario por su cuenta: tú confirmas."],
];

/** Centro de ayuda e instrucciones de uso (M14). */
export default function Help() {
  return (
    <>
      <PageHeader title="Centro de ayuda" description="Todo lo necesario para empezar, aunque nunca hayas usado un software de manufactura." />
      <Card>
        <CardHeader title="Inicio rápido en 5 pasos" />
        <CardBody>
          <ol className="grid gap-3 md:grid-cols-5">
            {quickStart.map((s, i) => (
              <li key={i}>
                <Link href={s.href} className="block h-full rounded-lg border border-border p-3 hover:bg-accent">
                  <div className="mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{i + 1}</div>
                  <div className="font-medium">{s.t}</div>
                  <div className="mt-1 text-xs text-muted">{s.d}</div>
                </Link>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {HELP_TOPICS.map((g) => (
          <Card key={g.title}>
            <CardHeader title={g.title} actions={<Link className="text-sm text-primary hover:underline" href={g.href}>Ir</Link>} />
            <CardBody>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Glosario" />
          <CardBody>
            <dl className="space-y-2 text-sm">{glossary.map(([k, v]) => <div key={k}><dt className="font-medium">{k}</dt><dd className="text-muted">{v}</dd></div>)}</dl>
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Tipos de movimiento" description="En español con su sigla internacional de logística." />
            <CardBody>
              <ul className="space-y-1 text-sm">
                {Object.entries(movementLabel).filter(([k]) => k !== "TRASLADO_ENT").map(([k, v]) => (
                  <li key={k}><b>{v.code}</b> · {k === "TRASLADO_SAL" ? "Traslado entre bodegas" : v.name} <span className="text-muted">({v.meaning})</span></li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Preguntas frecuentes" />
            <CardBody className="space-y-3 text-sm">{faq.map(([q, a]) => <div key={q}><div className="font-medium">{q}</div><div className="text-muted">{a}</div></div>)}</CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
