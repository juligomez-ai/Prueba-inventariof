"use client";

import {
  Barcode, Boxes, ClipboardCheck, Factory, FlaskConical, GitBranch, HelpCircle, LayoutDashboard, Menu,
  PackageSearch, ScanLine, ScrollText, Settings, ShoppingCart, Sparkles, Truck, Warehouse, Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const groups = [
  { title: "", items: [
    { href: "/", label: "Tablero", icon: LayoutDashboard },
    { href: "/copiloto", label: "Copiloto IA", icon: Sparkles },
  ] },
  { title: "Manufactura", items: [
    { href: "/produccion", label: "Órdenes de producción", icon: Factory },
    { href: "/formulas", label: "Fórmulas", icon: FlaskConical },
    { href: "/calidad", label: "Control de calidad", icon: ClipboardCheck },
  ] },
  { title: "Logística", items: [
    { href: "/compras", label: "Compras y recepción", icon: ShoppingCart },
    { href: "/despachos", label: "Despachos y remisiones", icon: Truck },
    { href: "/envios", label: "Seguimiento de envíos", icon: PackageSearch },
  ] },
  { title: "Inventario", items: [
    { href: "/existencias", label: "Existencias", icon: Boxes },
    { href: "/kardex", label: "Kardex", icon: ScrollText },
    { href: "/lotes", label: "Lotes y trazabilidad", icon: GitBranch },
    { href: "/conteos", label: "Conteo cíclico", icon: ScanLine },
    { href: "/ajustes", label: "Ajustes", icon: Wrench },
    { href: "/bodegas", label: "Bodegas y traslados", icon: Warehouse },
    { href: "/etiquetas", label: "Etiquetas", icon: Barcode },
  ] },
  { title: "Configuración", items: [
    { href: "/productos", label: "Productos", icon: Settings },
    { href: "/proveedores", label: "Proveedores y transportadoras", icon: Settings },
    { href: "/ayuda", label: "Centro de ayuda", icon: HelpCircle },
  ] },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <aside className="border-b border-border bg-card md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-brand" aria-hidden />
          <span>
            <span className="block text-lg font-bold tracking-tight text-foreground">synthex</span>
            <span className="block text-xs text-muted">Botánica Viva S.A.S.</span>
          </span>
        </Link>
        <button className="rounded-md p-2 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Abrir menú">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      <nav className={`${open ? "block" : "hidden"} px-2 pb-4 md:block`}>
        {groups.map((g) => (
          <div key={g.title || "root"} className="mb-3">
            {g.title && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.title}</div>}
            {g.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 rounded-md border-l-[3px] px-3 py-2 text-sm ${isActive(item.href) ? "border-brand bg-accent font-medium text-primary" : "border-transparent text-foreground/80 hover:bg-gray-50"}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
