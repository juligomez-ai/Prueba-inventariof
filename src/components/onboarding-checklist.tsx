import Link from "next/link";
import { prisma } from "@/infrastructure/database/prisma";

/**
 * Checklist de configuración con progreso (RF-14.2). Cada paso se marca solo,
 * leyendo el estado real de la base de datos.
 */
export async function OnboardingChecklist() {
  const [products, suppliers, initial, recipes, completed, released] = await Promise.all([
    prisma.product.count(),
    prisma.supplier.count(),
    prisma.stockMovement.count({ where: { type: "INV_INICIAL" } }),
    prisma.recipe.count(),
    prisma.productionOrder.count({ where: { status: "COMPLETADA" } }),
    prisma.lotStatusChange.count({ where: { fromStatus: "CUARENTENA", toStatus: "DISPONIBLE" } }),
  ]);
  const steps = [
    { done: products > 0, text: "Crea tus insumos y productos", href: "/productos/nuevo" },
    { done: suppliers > 0, text: "Registra tus proveedores", href: "/proveedores" },
    { done: initial > 0, text: "Carga el inventario inicial", href: "/ajustes" },
    { done: recipes > 0, text: "Crea tu primera fórmula", href: "/formulas" },
    { done: completed > 0, text: "Completa tu primera producción y revisa su costo", href: "/produccion/nueva" },
    { done: released > 0, text: "Libera tu primer lote en control de calidad", href: "/calidad" },
  ];
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>{done} de {steps.length} pasos</span>
          <span className="tabular">{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-accent" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de configuración">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {steps.map((s, i) => (
          <li key={i}>
            <Link href={s.href} className="flex items-center gap-2 hover:underline">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${s.done ? "bg-primary text-white" : "border border-border"}`}>{s.done ? "✓" : i + 1}</span>
              <span className={s.done ? "text-muted line-through" : ""}>{s.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
