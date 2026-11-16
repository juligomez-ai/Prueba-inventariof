import type { FunctionDeclaration } from "@google/genai";
import { searchProducts } from "@/application/use-cases/catalog";
import { alerts, inTransitByProduct, inventoryRows } from "@/application/use-cases/insights";
import { checkFeasibility, recipeCost } from "@/application/use-cases/production";
import { lastPrices } from "@/application/use-cases/purchasing";
import { toBase } from "@/domain/services/units";
import { prisma } from "@/infrastructure/database/prisma";
import { stockSummary, ACTIVE_STATUSES } from "@/infrastructure/database/stock";
import { DomainError, errorMessage } from "@/shared/errors";
import { HELP_TOPICS } from "@/shared/help";
import { daysBetween, n, round2, round4, startOfToday, MS_PER_DAY } from "@/shared/numbers";

/**
 * Herramientas del Copiloto. Cada una llama a casos de uso deterministas:
 * el modelo nunca calcula stock ni costos por su cuenta (RN-13.2).
 * Las herramientas "proponer_*" NO escriben en la base de datos: devuelven una propuesta
 * que el usuario confirma en la interfaz (RN-13.1).
 */

export type Proposal =
  | { kind: "order"; id: string; productId: string; sku: string; productName: string; quantity: number; plannedDate: string | null; notes: string | null; feasible: boolean; maxProducible: number; estimatedCost: number }
  | { kind: "purchase"; id: string; supplierId: string; supplierName: string; lines: { productId: string; sku: string; name: string; quantity: number; unit: string; unitPrice: number }[]; total: number; notes: string | null }
  | { kind: "recipe"; id: string; productId: string; productName: string; name: string; yieldQuantity: number; items: { ingredientId: string; sku: string; name: string; quantity: number; unit: string }[]; batchCost: number; unitCost: number };

const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });

export const tools: FunctionDeclaration[] = [
  {
    name: "buscar_producto",
    description: "Busca productos del catálogo por nombre o SKU (materias primas, empaques y productos terminados). Úsala antes de cualquier otra herramienta para obtener el SKU exacto.",
    parametersJsonSchema: obj({ texto: { type: "string", description: "Nombre o parte del nombre, p. ej. 'crema karité'" } }, ["texto"]),
  },
  {
    name: "consultar_existencias",
    description: "Existencias de un producto: físico, disponible, reservado, en cuarentena, en tránsito, costo promedio, valor y lotes con vencimiento.",
    parametersJsonSchema: obj({ sku: { type: "string" } }, ["sku"]),
  },
  {
    name: "consultar_formula",
    description: "Fórmula (receta) de un producto terminado: insumos, cantidades, rendimiento y costo por lote y por unidad con el costo promedio actual.",
    parametersJsonSchema: obj({ sku: { type: "string" } }, ["sku"]),
  },
  {
    name: "verificar_factibilidad",
    description: "Verifica si alcanza el inventario disponible para producir una cantidad de un producto terminado. Devuelve por insumo requerido, disponible y faltante, la cantidad máxima producible y el costo estimado.",
    parametersJsonSchema: obj({ sku: { type: "string" }, cantidad: { type: "number", description: "Unidades a producir" } }, ["sku", "cantidad"]),
  },
  {
    name: "valor_inventario",
    description: "Valor del inventario al costo promedio ponderado, total y por tipo (materias primas, empaques, producto terminado), con los productos de mayor valor.",
  },
  {
    name: "lotes_por_vencer",
    description: "Lotes con existencias que vencen dentro de N días (o ya vencidos).",
    parametersJsonSchema: obj({ dias: { type: "number", description: "Horizonte en días, p. ej. 30, 60 o 90" } }, ["dias"]),
  },
  {
    name: "consultar_alertas",
    description: "Alertas actuales: stock bajo mínimo, vencimientos, lotes en cuarentena pendientes de liberación, compras retrasadas y despachos con novedad.",
  },
  {
    name: "proponer_orden_produccion",
    description: "Propone una orden de producción en borrador para que el usuario la confirme con un clic. NO la crea. Proponla aunque falten insumos: quedará en borrador y no podrá iniciarse hasta cubrir los faltantes.",
    parametersJsonSchema: obj(
      { sku: { type: "string" }, cantidad: { type: "number" }, fecha_planeada: { type: "string", description: "AAAA-MM-DD (opcional)" }, notas: { type: "string" } },
      ["sku", "cantidad"],
    ),
  },
  {
    name: "proponer_orden_compra",
    description: "Propone órdenes de compra (una por proveedor preferido) con los insumos o empaques indicados y su último precio. NO las crea: el usuario confirma.",
    parametersJsonSchema: obj(
      { lineas: { type: "array", items: obj({ sku: { type: "string" }, cantidad: { type: "number", description: "En la unidad base del producto" } }, ["sku", "cantidad"]) }, notas: { type: "string" } },
      ["lineas"],
    ),
  },
  {
    name: "proponer_formula",
    description: "Propone la fórmula de un producto terminado existente a partir del texto del usuario. NO la guarda. Todos los insumos deben existir (usa buscar_producto). Las cantidades pueden venir en g, kg, ml, L o und.",
    parametersJsonSchema: obj(
      {
        sku_producto: { type: "string", description: "SKU del producto terminado" },
        nombre: { type: "string" },
        rendimiento: { type: "number", description: "Unidades que produce la fórmula" },
        insumos: { type: "array", items: obj({ sku: { type: "string" }, cantidad: { type: "number" }, unidad: { type: "string", enum: ["g", "kg", "ml", "L", "und"] } }, ["sku", "cantidad", "unidad"]) },
      },
      ["sku_producto", "nombre", "rendimiento", "insumos"],
    ),
  },
  {
    name: "ayuda_uso",
    description: "Instrucciones paso a paso de cómo usar SYNTHEX (comprar y recibir, producir, liberar calidad, contar con escáner, despachar, ajustes, etiquetas, fórmulas).",
    parametersJsonSchema: obj({ tema: { type: "string" } }, ["tema"]),
  },
];

const bySku = async (sku: string) => {
  const p = await prisma.product.findUnique({ where: { sku: String(sku).trim().toUpperCase() } });
  if (!p) throw new DomainError(`No existe el SKU ${sku}. Búscalo con buscar_producto.`);
  return p;
};

type Input = Record<string, unknown>;

export async function executeTool(name: string, input: Input, proposals: Proposal[]): Promise<{ content: string; isError?: boolean }> {
  try {
    return { content: JSON.stringify(await run(name, input, proposals)) };
  } catch (e) {
    return { content: errorMessage(e), isError: true };
  }
}

async function run(name: string, input: Input, proposals: Proposal[]) {
  switch (name) {
    case "buscar_producto": {
      const found = await searchProducts(String(input.texto ?? ""), 8);
      const s = await stockSummary(prisma, found.map((p) => p.id));
      const withRecipe = new Set((await prisma.recipe.findMany({ where: { productId: { in: found.map((p) => p.id) } } })).map((r) => r.productId));
      return found.map((p) => ({ sku: p.sku, nombre: p.name, tipo: p.type, unidad: p.baseUnit, disponible: s.get(p.id)?.available ?? 0, tiene_formula: withRecipe.has(p.id) }));
    }
    case "consultar_existencias": {
      const p = await bySku(String(input.sku));
      const s = (await stockSummary(prisma, [p.id])).get(p.id) ?? { onHand: 0, reserved: 0, quarantine: 0, blocked: 0, available: 0 };
      const lots = await prisma.lot.findMany({ where: { productId: p.id, containers: { some: { status: { in: ACTIVE_STATUSES } } } }, include: { containers: { where: { status: { in: ACTIVE_STATUSES } } } }, orderBy: { expiryDate: "asc" } });
      return {
        producto: p.name, sku: p.sku, unidad: p.baseUnit,
        fisico: s.onHand, disponible: s.available, reservado: s.reserved, cuarentena: s.quarantine, bloqueado: s.blocked,
        en_transito: round4((await inTransitByProduct()).get(p.id) ?? 0),
        minimo: n(p.minStock), costo_promedio: n(p.avgCost), valor: round2(s.onHand * n(p.avgCost)),
        lotes: lots.map((l) => ({ lote: l.code, estado: l.status, vence: l.expiryDate?.toISOString().slice(0, 10) ?? null, cantidad: round4(l.containers.reduce((a, c) => a + n(c.currentQty), 0)) })),
      };
    }
    case "consultar_formula": {
      const p = await bySku(String(input.sku));
      const r = await prisma.recipe.findUnique({ where: { productId: p.id } });
      if (!r) return { producto: p.name, formula: null, mensaje: "El producto no tiene fórmula." };
      const c = await recipeCost(r.id);
      return {
        producto: p.name, formula: r.name, rinde: n(r.yieldQuantity), costo_lote: c.batchCost, costo_unidad: c.unitCost, precio_venta: n(p.salePrice) || null,
        insumos: c.lines.map((l) => ({ sku: l.ingredient.sku, nombre: l.ingredient.name, cantidad: l.quantity, unidad: l.ingredient.baseUnit, costo: l.total })),
      };
    }
    case "verificar_factibilidad": {
      const p = await bySku(String(input.sku));
      const f = await checkFeasibility(p.id, Number(input.cantidad));
      return {
        producto: p.name, cantidad: f.quantity, factible: f.feasible, maximo_producible: f.maxProducible,
        costo_estimado: f.estimatedCost, costo_unitario_estimado: f.estimatedUnitCost,
        insumos: f.rows.map((r) => ({ sku: r.sku, nombre: r.name, unidad: r.unit, requerido: r.required, disponible: r.available, faltante: r.shortage })),
      };
    }
    case "valor_inventario": {
      const rows = await inventoryRows();
      const by: Record<string, number> = {};
      for (const r of rows) by[r.product.type] = round2((by[r.product.type] ?? 0) + r.value);
      return {
        total: round2(rows.reduce((s, r) => s + r.value, 0)),
        por_tipo: by,
        mayor_valor: rows.sort((a, b) => b.value - a.value).slice(0, 5).map((r) => ({ producto: r.product.name, valor: r.value })),
      };
    }
    case "lotes_por_vencer": {
      const today = startOfToday();
      const days = Number(input.dias ?? 60);
      const lots = await prisma.lot.findMany({
        where: { expiryDate: { lte: new Date(today.getTime() + days * MS_PER_DAY) }, containers: { some: { status: { in: ACTIVE_STATUSES } } } },
        include: { product: true, containers: { where: { status: { in: ACTIVE_STATUSES } } } },
        orderBy: { expiryDate: "asc" },
      });
      return lots.map((l) => ({ lote: l.code, producto: l.product.name, estado: l.status, vence: l.expiryDate!.toISOString().slice(0, 10), dias: daysBetween(today, l.expiryDate!), cantidad: round4(l.containers.reduce((s, c) => s + n(c.currentQty), 0)), unidad: l.product.baseUnit }));
    }
    case "consultar_alertas":
      return (await alerts()).map((a) => ({ tipo: a.kind, critica: a.tone === "red", detalle: a.text }));

    case "proponer_orden_produccion": {
      const p = await bySku(String(input.sku));
      if (p.type !== "PRODUCTO_TERMINADO") throw new DomainError("Solo se producen productos terminados.");
      const qty = Number(input.cantidad);
      if (!(qty > 0) || !Number.isInteger(qty)) throw new DomainError("La cantidad debe ser un entero mayor que 0.");
      const f = await checkFeasibility(p.id, qty);
      const proposal: Proposal = {
        kind: "order", id: `prop-${proposals.length + 1}`, productId: p.id, sku: p.sku, productName: p.name, quantity: qty,
        plannedDate: (input.fecha_planeada as string | undefined) || null, notes: (input.notas as string | undefined) || null,
        feasible: f.feasible, maxProducible: f.maxProducible, estimatedCost: f.estimatedCost,
      };
      proposals.push(proposal);
      return { propuesta: proposal.id, estado: "Propuesta mostrada al usuario; se crea en borrador solo si la confirma.", factible: f.feasible };
    }
    case "proponer_orden_compra": {
      const lines = (input.lineas as { sku: string; cantidad: number }[]) ?? [];
      if (!lines.length) throw new DomainError("Indica al menos una línea.");
      const prices = await lastPrices();
      const groups = new Map<string, Extract<Proposal, { kind: "purchase" }>>();
      for (const l of lines) {
        const p = await bySku(l.sku);
        if (p.type === "PRODUCTO_TERMINADO") throw new DomainError(`${p.name} se fabrica, no se compra.`);
        if (!(Number(l.cantidad) > 0)) throw new DomainError("Las cantidades deben ser mayores que 0.");
        const supplierId = p.preferredSupplierId ?? prices.get(p.id)?.supplierId;
        if (!supplierId) throw new DomainError(`${p.name} no tiene proveedor preferido; pide al usuario que lo configure.`);
        const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
        const g = groups.get(supplierId) ?? { kind: "purchase" as const, id: "", supplierId, supplierName: supplier.name, lines: [], total: 0, notes: (input.notas as string | undefined) || null };
        const price = round2(prices.get(p.id)?.unitCost ?? n(p.avgCost));
        g.lines.push({ productId: p.id, sku: p.sku, name: p.name, quantity: round4(Number(l.cantidad)), unit: p.baseUnit, unitPrice: price });
        g.total = round2(g.total + price * Number(l.cantidad));
        groups.set(supplierId, g);
      }
      const out = [];
      for (const g of groups.values()) {
        g.id = `prop-${proposals.length + 1}`;
        proposals.push(g);
        out.push({ propuesta: g.id, proveedor: g.supplierName, total_sin_iva: g.total });
      }
      return { propuestas: out, estado: "Mostradas al usuario; se crean solo si las confirma." };
    }
    case "proponer_formula": {
      const product = await bySku(String(input.sku_producto));
      if (product.type !== "PRODUCTO_TERMINADO") throw new DomainError("La fórmula debe ser de un producto terminado.");
      const yieldQ = Number(input.rendimiento);
      if (!(yieldQ > 0)) throw new DomainError("El rendimiento debe ser mayor que 0.");
      const items = [];
      let batch = 0;
      for (const i of (input.insumos as { sku: string; cantidad: number; unidad: string }[]) ?? []) {
        const p = await bySku(i.sku);
        if (p.type === "PRODUCTO_TERMINADO") throw new DomainError(`${p.name} es producto terminado y no puede ser insumo.`);
        const qty = round4(toBase(Number(i.cantidad), i.unidad, p.baseUnit));
        items.push({ ingredientId: p.id, sku: p.sku, name: p.name, quantity: qty, unit: p.baseUnit });
        batch += qty * n(p.avgCost);
      }
      if (!items.length) throw new DomainError("La fórmula necesita al menos un insumo.");
      const proposal: Proposal = {
        kind: "recipe", id: `prop-${proposals.length + 1}`, productId: product.id, productName: product.name, name: String(input.nombre),
        yieldQuantity: yieldQ, items, batchCost: round2(batch), unitCost: round2(batch / yieldQ),
      };
      proposals.push(proposal);
      const existing = await prisma.recipe.findUnique({ where: { productId: product.id } });
      return { propuesta: proposal.id, costo_lote: proposal.batchCost, costo_unidad: proposal.unitCost, reemplaza_formula_existente: Boolean(existing) };
    }
    case "ayuda_uso": {
      const t = String(input.tema ?? "").toLowerCase();
      const hit = HELP_TOPICS.filter((h) => h.keywords.some((k) => t.includes(k)));
      return (hit.length ? hit : HELP_TOPICS).map((h) => ({ tema: h.title, pasos: h.steps, pantalla: h.href }));
    }
    default:
      throw new DomainError(`Herramienta desconocida: ${name}`);
  }
}
