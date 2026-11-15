/**
 * Datos de ejemplo: "Botánica Viva", laboratorio de cosmética natural en Medellín (S11).
 * Todo el historial se crea con los mismos casos de uso de la aplicación,
 * así el Kardex, los costos y los bultos quedan consistentes.
 *
 * Solo siembra si la base está vacía. Con SEED_RESET=1 borra todo antes (solo desarrollo).
 */
import { PrismaClient } from "@prisma/client";
import * as catalog from "@/application/use-cases/catalog";
import * as dispatches from "@/application/use-cases/dispatches";
import * as inv from "@/application/use-cases/inventory";
import * as production from "@/application/use-cases/production";
import * as purchasing from "@/application/use-cases/purchasing";
import { createSimulator } from "./seed-history";

const prisma = new PrismaClient();
const day = 86_400_000;
const inDays = (d: number) => new Date(Date.now() + d * day);

async function reset() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

async function main() {
  if (process.env.SEED_RESET === "1") await reset();
  if ((await prisma.product.count()) > 0) {
    console.log("La base ya tiene datos: no se siembra (usa SEED_RESET=1 para reiniciar en desarrollo).");
    return;
  }

  // ── Bodegas
  const W = {
    MP: await catalog.saveWarehouse({ code: "BOD-MP", name: "Materias primas", type: "MATERIAS_PRIMAS", active: true }),
    EMP: await catalog.saveWarehouse({ code: "BOD-EMP", name: "Material de empaque", type: "EMPAQUE", active: true }),
    PROD: await catalog.saveWarehouse({ code: "BOD-PROD", name: "Sala de producción", type: "PRODUCCION", active: true }),
    PT: await catalog.saveWarehouse({ code: "BOD-PT", name: "Producto terminado", type: "PRODUCTO_TERMINADO", active: true }),
  };

  // ── Proveedores
  const S = {
    oleo: await catalog.saveSupplier({ taxId: "900.123.456-7", name: "Oleoquímicos Andinos S.A.S.", contactName: "Camilo Arango", phone: "604 444 1020", email: "ventas@oleoandinos.example", city: "Medellín", paymentTermDays: 30, leadTimeDays: 5 }),
    envases: await catalog.saveSupplier({ taxId: "900.234.567-1", name: "Envases del Valle S.A.S.", contactName: "Diana Cifuentes", phone: "602 380 5566", email: "pedidos@envasesvalle.example", city: "Cali", paymentTermDays: 45, leadTimeDays: 10 }),
    etiquetas: await catalog.saveSupplier({ taxId: "900.345.678-2", name: "Etiquetas & Cajas Antioquia S.A.S.", contactName: "Julián Mesa", phone: "604 372 9911", email: "comercial@etiquetasantioquia.example", city: "Itagüí", paymentTermDays: 30, leadTimeDays: 7 }),
    quimicos: await catalog.saveSupplier({ taxId: "800.456.789-3", name: "Químicos Esenciales Ltda.", contactName: "Sandra Rojas", phone: "601 745 3300", email: "ventas@quimicosesenciales.example", city: "Bogotá", paymentTermDays: 30, leadTimeDays: 8 }),
  };

  // ── Transportadoras (plantilla de rastreo editable en Configuración)
  const C = {
    servientrega: await catalog.saveCarrier({ name: "Servientrega", trackingUrlTemplate: "https://www.servientrega.com/wps/portal/rastreo-envio", acceptsParam: false }),
    coordinadora: await catalog.saveCarrier({ name: "Coordinadora", trackingUrlTemplate: "https://coordinadora.com/rastreo/rastreo-de-guia/", acceptsParam: false }),
    inter: await catalog.saveCarrier({ name: "Interrapidísimo", trackingUrlTemplate: "https://www.interrapidisimo.com/sigue-tu-envio/", acceptsParam: false }),
  };

  // ── Catálogo
  type P = Parameters<typeof catalog.saveProduct>[0];
  const base = { minStock: 0, safetyStock: 0, leadTimeDays: 7, tracksLot: false, tracksExpiry: false } as const;
  const mp = (sku: string, name: string, unit: string, minStock: number, supplierId: string, extra: Partial<P> = {}): P => ({
    ...base, sku, name, category: "Materias primas", type: "MATERIA_PRIMA", baseUnit: unit, tracksLot: true, tracksExpiry: true,
    minStock, safetyStock: round(minStock / 2), preferredSupplierId: supplierId, ...extra,
  });
  const emp = (sku: string, name: string, minStock: number, supplierId: string, extra: Partial<P> = {}): P => ({
    ...base, sku, name, category: "Empaques", type: "EMPAQUE", baseUnit: "und", minStock, safetyStock: round(minStock / 2), preferredSupplierId: supplierId, leadTimeDays: 10, ...extra,
  });
  const pt = (sku: string, name: string, shortName: string, price: number, pack: number, shelf: number, nso: string, minStock: number): P => ({
    ...base, sku, name, shortName, category: "Cuidado personal", type: "PRODUCTO_TERMINADO", baseUnit: "und", tracksLot: true, tracksExpiry: true,
    shelfLifeDays: shelf, salePrice: price, defaultPackSize: pack, nsoCode: nso, nsoExpiry: inDays(365 * 4), minStock, safetyStock: round(minStock / 2),
  });
  const round = (v: number) => Math.round(v * 1000) / 1000;

  const defs = {
    karite: mp("MP-001", "Manteca de karité", "kg", 2, S.oleo.id, { shortName: "Manteca karité", defaultPackSize: 25, conversions: [{ unit: "Saco 25 kg", factor: 25 }] }),
    almendras: mp("MP-002", "Aceite de almendras", "L", 2, S.oleo.id, { shortName: "Aceite almendras", conversions: [{ unit: "Garrafa 20 L", factor: 20 }] }),
    ceraEmul: mp("MP-003", "Cera emulsionante", "kg", 1, S.oleo.id),
    glicerina: mp("MP-004", "Glicerina vegetal", "L", 1, S.quimicos.id),
    vitE: mp("MP-005", "Vitamina E", "L", 0.2, S.quimicos.id),
    conservante: mp("MP-006", "Conservante natural", "kg", 0.2, S.quimicos.id),
    lavanda: mp("MP-007", "Aceite esencial de lavanda", "L", 0.1, S.quimicos.id, { shortName: "AE lavanda" }),
    agua: mp("MP-008", "Agua desmineralizada", "L", 10, S.quimicos.id, { tracksLot: false, tracksExpiry: false, conversions: [{ unit: "Garrafa 20 L", factor: 20 }] }),
    ceraAbejas: mp("MP-009", "Cera de abejas", "kg", 1, S.oleo.id),
    cacao: mp("MP-010", "Manteca de cacao", "kg", 1, S.oleo.id),
    coco: mp("MP-011", "Aceite de coco", "L", 2, S.oleo.id),
    oliva: mp("MP-012", "Aceite de oliva", "L", 2, S.oleo.id),
    soda: mp("MP-013", "Hidróxido de sodio", "kg", 0.5, S.quimicos.id),
    avena: mp("MP-014", "Avena coloidal", "kg", 0.5, S.quimicos.id),
    vitC: mp("MP-015", "Vitamina C (ascorbil fosfato)", "kg", 0.05, S.quimicos.id, { shortName: "Vitamina C" }),
    hialuronico: mp("MP-016", "Ácido hialurónico", "kg", 0.01, S.quimicos.id),
    frasco: emp("EMP-001", "Frasco ámbar 50 g", 150, S.envases.id, { barcode: "7701234500017", conversions: [{ unit: "Caja x200", factor: 200 }] }),
    tapa: emp("EMP-002", "Tapa rosca negra", 150, S.envases.id, { conversions: [{ unit: "Caja x200", factor: 200 }] }),
    etiquetaCrema: emp("EMP-003", "Etiqueta crema karité", 150, S.etiquetas.id),
    tubo: emp("EMP-004", "Tubo labial 10 g", 100, S.envases.id),
    etiquetaBalsamo: emp("EMP-005", "Etiqueta bálsamo labial", 100, S.etiquetas.id),
    cajaJabon: emp("EMP-006", "Caja kraft jabón", 60, S.etiquetas.id),
    gotero: emp("EMP-007", "Frasco gotero 30 ml", 60, S.envases.id),
    etiquetaSerum: emp("EMP-008", "Etiqueta serum", 60, S.etiquetas.id),
    cajaSerum: emp("EMP-009", "Caja serum", 60, S.etiquetas.id),
    crema: pt("PT-001", "Crema hidratante de karité 50 g", "Crema karité 50 g", 35000, 24, 365, "NSOC12345-25CO", 30),
    balsamo: pt("PT-002", "Bálsamo labial 10 g", "Bálsamo labial", 14000, 50, 730, "NSOC12346-25CO", 40),
    jabon: pt("PT-003", "Jabón artesanal de avena 100 g", "Jabón avena", 18000, 20, 540, "NSOC12347-25CO", 30),
    serum: pt("PT-004", "Serum facial vitamina C 30 ml", "Serum vit. C", 68000, 12, 365, "NSOC12348-25CO", 20),
  };
  const P: Record<keyof typeof defs, Awaited<ReturnType<typeof catalog.saveProduct>>> = {} as never;
  for (const [k, d] of Object.entries(defs)) P[k as keyof typeof defs] = await catalog.saveProduct(d);

  // ── Inventario inicial (INV_INICIAL · OB)
  type Init = { p: keyof typeof defs; wh: keyof typeof W; qty: number; cost: number; bultos?: number; lot?: string; exp?: number };
  const initial: Init[] = [
    { p: "karite", wh: "MP", qty: 2, cost: 57000, lot: "KT-2210", exp: 220 },
    { p: "almendras", wh: "MP", qty: 8, cost: 45000, bultos: 2, lot: "AL-0931", exp: 300 },
    { p: "ceraEmul", wh: "MP", qty: 4, cost: 38000, lot: "CE-118", exp: 400 },
    { p: "glicerina", wh: "MP", qty: 4, cost: 12000, lot: "GL-0587", exp: 500 },
    { p: "vitE", wh: "MP", qty: 0.5, cost: 180000, lot: "VE-2207", exp: 280 },
    { p: "conservante", wh: "MP", qty: 0.5, cost: 120000, lot: "CN-339", exp: 350 },
    { p: "lavanda", wh: "MP", qty: 0.3, cost: 400000, lot: "LV-1504", exp: 600 },
    { p: "agua", wh: "MP", qty: 40, cost: 500, bultos: 2 },
    { p: "ceraAbejas", wh: "MP", qty: 3, cost: 48000, lot: "CA-772", exp: 700 },
    { p: "cacao", wh: "MP", qty: 2, cost: 55000, lot: "MC-415", exp: 450 },
    { p: "coco", wh: "MP", qty: 6, cost: 28000, bultos: 2, lot: "CO-901", exp: 360 },
    { p: "oliva", wh: "MP", qty: 6, cost: 32000, bultos: 2, lot: "OL-233", exp: 400 },
    { p: "soda", wh: "MP", qty: 2, cost: 18000, lot: "NA-082", exp: 900 },
    { p: "avena", wh: "MP", qty: 1.5, cost: 30000, lot: "AV-310", exp: 240 },
    { p: "vitC", wh: "MP", qty: 0.2, cost: 650000, lot: "VC-650", exp: 210 },
    { p: "hialuronico", wh: "MP", qty: 0.05, cost: 2400000, lot: "AH-077", exp: 500 },
    { p: "frasco", wh: "EMP", qty: 140, cost: 1200 },
    { p: "tapa", wh: "EMP", qty: 140, cost: 300 },
    { p: "etiquetaCrema", wh: "EMP", qty: 140, cost: 250 },
    { p: "tubo", wh: "EMP", qty: 300, cost: 450, bultos: 3 },
    { p: "etiquetaBalsamo", wh: "EMP", qty: 300, cost: 120, bultos: 3 },
    { p: "cajaJabon", wh: "EMP", qty: 200, cost: 600, bultos: 2 },
    { p: "gotero", wh: "EMP", qty: 120, cost: 1800, bultos: 2 },
    { p: "etiquetaSerum", wh: "EMP", qty: 150, cost: 250 },
    { p: "cajaSerum", wh: "EMP", qty: 150, cost: 700 },
    { p: "crema", wh: "PT", qty: 12, cost: 2850, lot: "PT001-260901-01", exp: 290 },
  ];
  // El inventario inicial se cargó hace 6 meses, al implementar SYNTHEX
  const start = new Date(Date.now() - 182 * day);
  start.setHours(8, 0, 0, 0);
  const sim = createSimulator({ prisma, P, W, S, C, baseCost: new Map(initial.map((i) => [P[i.p].id, i.cost])), start, untilDaysAgo: 8 });
  for (const i of initial)
    await sim.at(start, () => inv.adjustUp({
      productId: P[i.p].id, warehouseId: W[i.wh].id, quantity: i.qty, containers: i.bultos ?? 1, unitCost: i.cost,
      lotCode: i.lot, expiryDate: i.exp ? inDays(i.exp) : null, reason: "INVENTARIO_INICIAL", notes: "Saldo inicial al implementar SYNTHEX",
    }));

  // ── Fórmulas (M8)
  const item = (k: keyof typeof defs, quantity: number, unit?: string) => ({ ingredientId: P[k].id, quantity, unit: unit ?? defs[k].baseUnit });
  await production.saveRecipe({
    productId: P.crema.id, name: "Crema hidratante de karité", yieldQuantity: 100,
    instructions: "1) Calentar fase oleosa (karité, almendras, cera) a 70 °C. 2) Calentar agua y glicerina a 70 °C. 3) Emulsionar. 4) Bajo 40 °C agregar vitamina E, conservante y lavanda. 5) Envasar, tapar y etiquetar.",
    items: [item("agua", 2.88), item("karite", 0.8), item("almendras", 0.6), item("ceraEmul", 0.4), item("glicerina", 0.2), item("vitE", 0.05), item("conservante", 0.05), item("lavanda", 20, "ml"), item("frasco", 100), item("tapa", 100), item("etiquetaCrema", 100)],
  });
  await production.saveRecipe({
    productId: P.balsamo.id, name: "Bálsamo labial", yieldQuantity: 100,
    instructions: "Fundir cera y mantecas a baño maría, agregar aceite y vitamina E, llenar tubos en caliente y etiquetar.",
    items: [item("ceraAbejas", 400, "g"), item("cacao", 300, "g"), item("coco", 280, "ml"), item("vitE", 20, "ml"), item("tubo", 100), item("etiquetaBalsamo", 100)],
  });
  await production.saveRecipe({
    productId: P.jabon.id, name: "Jabón artesanal de avena (proceso en frío)", yieldQuantity: 20,
    instructions: "Disolver la soda en agua (con protección), mezclar con los aceites a traza, agregar avena, moldear y curar 4 semanas antes de empacar.",
    items: [item("coco", 0.6), item("oliva", 0.9), item("soda", 0.28), item("agua", 0.6), item("avena", 0.1), item("cajaJabon", 20)],
  });
  await production.saveRecipe({
    productId: P.serum.id, name: "Serum facial vitamina C", yieldQuantity: 50,
    instructions: "Hidratar el ácido hialurónico, disolver la vitamina C en agua y glicerina, unir, agregar conservante, envasar en gotero, etiquetar y encajar.",
    items: [item("agua", 1.2), item("glicerina", 0.15), item("vitC", 0.06), item("hialuronico", 5, "g"), item("conservante", 15, "g"), item("gotero", 50), item("etiquetaSerum", 50), item("cajaSerum", 50)],
  });

  // ── 6 meses de historia semana a semana (ver seed-history.ts)
  console.log("Simulando 6 meses de historia…");
  await sim.run();

  // ── Escenario actual (última semana): lo que se usa en el recorrido del demo
  // Insumos suficientes para las órdenes de esta semana
  const lastWeek = new Date(Date.now() - 7 * day);
  await sim.buyFor(P.balsamo as never, 100, lastWeek);
  await sim.buyFor(P.jabon as never, 40, lastWeek);
  await sim.buyFor(P.serum as never, 50, lastWeek);

  // Orden cronológico de la última semana (el Kardex queda en orden de fechas)
  // ── Compra en tránsito con retraso (alerta): envases
  const oc2 = await sim.at(inDays(-8), async () => {
    const o = await purchasing.createPurchaseOrder({
      supplierId: S.envases.id, expectedDate: inDays(-1),
      lines: [
        { productId: P.frasco.id, quantity: 1, unit: "Caja x200", unitPrice: 240000 },
        { productId: P.tapa.id, quantity: 1, unit: "Caja x200", unitPrice: 60000 },
      ],
    });
    await purchasing.sendPurchaseOrder(o.id);
    return o;
  });
  // ── Compra de karité: pedida hace 6 días, recibida ayer
  const oc1 = await sim.at(inDays(-6), async () => {
    const o = await purchasing.createPurchaseOrder({ supplierId: S.oleo.id, lines: [{ productId: P.karite.id, quantity: 3, unit: "kg", unitPrice: 62000 }] });
    await purchasing.sendPurchaseOrder(o.id);
    return o;
  });
  // ── Producción: bálsamo completado, liberado y despachado
  const op1 = await sim.at(inDays(-6), async () => {
    const o = await production.createProductionOrder({ productId: P.balsamo.id, quantity: 100, plannedDate: inDays(-6) });
    await production.startProductionOrder(o.id);
    await production.completeProductionOrder({ orderId: o.id, producedQty: 100, consumed: {}, warehouseId: W.PT.id, packSize: 50 });
    return o;
  });
  const lotB = await prisma.lot.findFirstOrThrow({ where: { productionOrderId: op1.id } });
  await sim.at(inDays(-5), () => inv.releaseLot(lotB.id, "pH 6,2, textura y llenado conformes. Liberado."));

  // Glicerina de corta fecha (vence en 25 días): genera la alerta de vencimiento
  const gl = await sim.at(new Date(Date.now() - 5 * day), async () => {
    const o = await purchasing.createPurchaseOrder({ supplierId: S.quimicos.id, lines: [{ productId: P.glicerina.id, quantity: 1, unit: "L", unitPrice: 9500 }], notes: "Lote de corta fecha con descuento" });
    await purchasing.sendPurchaseOrder(o.id);
    const line = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { orderId: o.id } });
    await purchasing.receivePurchaseOrder({ orderId: o.id, supplierRemission: "QE-30117", warehouseId: W.MP.id, lines: [{ lineId: line.id, quantity: 1, lotCode: "GL-0412", expiryDate: inDays(25), containers: 1 }] });
    return o;
  });
  void gl;

  const rem1 = await sim.at(inDays(-4), async () => {
    const r = await dispatches.createDispatch({
      customerName: "Tienda Naturista Vida Sana S.A.S.", customerTaxId: "901.555.210-4", address: "Cra. 43A # 7-50, local 102", city: "Medellín",
      salesRef: "FE-1043", lines: [{ productId: P.balsamo.id, quantity: 50 }],
    });
    await dispatches.startPicking(r.id);
    for (const a of await prisma.dispatchAllocation.findMany({ where: { dispatchId: r.id }, include: { container: true } }))
      await dispatches.pickScan(r.id, a.container.serial);
    await dispatches.shipDispatch({ dispatchId: r.id, carrierId: C.inter.id, trackingNumber: "700045218963", eta: inDays(-2), freightCost: 18000 });
    return r;
  });
  const shRem1 = await prisma.shipment.findFirstOrThrow({ where: { dispatchId: rem1.id } });
  const sh2 = await sim.at(inDays(-4), () => purchasing.addShipment({ purchaseOrderId: oc2.id, carrierId: C.coordinadora.id, trackingNumber: "88001234455", shippedAt: inDays(-4), eta: inDays(-1) }));
  await sim.at(inDays(-3), () => purchasing.addShipmentEvent(sh2.id, "EN_TRANSITO", "Salió de Cali", inDays(-3)));

  const sh1 = await sim.at(inDays(-3), () => purchasing.addShipment({ purchaseOrderId: oc1.id, carrierId: C.servientrega.id, trackingNumber: "2154879631", shippedAt: inDays(-3), eta: inDays(-1) }));
  await sim.at(inDays(-2), () => purchasing.addShipmentEvent(sh1.id, "EN_TRANSITO", "En ruta Medellín", inDays(-2)));
  await sim.at(inDays(-2), () => purchasing.addShipmentEvent(shRem1.id, "ENTREGADO", "Recibió: Marcela Ortiz", inDays(-2)));


  // ── Conteo cíclico aprobado con una diferencia (etiquetas de bálsamo)
  await sim.at(inDays(-2), async () => {
    const cc = await inv.createCycleCount({ warehouseId: W.EMP.id, productIds: [P.etiquetaBalsamo.id], notes: "Conteo semanal clase A/B" });
    const labels = await prisma.container.findMany({ where: { productId: P.etiquetaBalsamo.id, warehouseId: W.EMP.id, status: { in: ["SELLADO", "ABIERTO"] } }, orderBy: { serial: "asc" } });
    for (const [i, c] of labels.entries()) {
      // El primer rollo tenía el sello roto: se cuenta y faltan 2 etiquetas.
      if (i === 0) await inv.recordScan({ countId: cc.id, code: c.serial, sealIntact: false, countedQty: Math.max(0, Number(c.currentQty) - 2), comment: "Etiquetas dañadas en la impresora" });
      else await inv.recordScan({ countId: cc.id, code: c.serial, sealIntact: true });
    }
    await inv.closeCycleCount(cc.id);
    await inv.approveCycleCount(cc.id);
  });

  const oc1Line = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { orderId: oc1.id } });
  await sim.at(inDays(-1), async () => {
    await purchasing.addShipmentEvent(sh1.id, "ENTREGADO", "Recibido en portería", inDays(-1));
    await purchasing.receivePurchaseOrder({
      orderId: oc1.id, supplierRemission: "RM-55821", warehouseId: W.MP.id,
      lines: [{ lineId: oc1Line.id, quantity: 3, lotCode: "KT-2291", expiryDate: inDays(590), containers: 1 }],
    });
  });


  // ── Producción: jabón completado, lote en CUARENTENA (pendiente de liberación)
  await sim.at(inDays(-1), async () => {
    const o = await production.createProductionOrder({ productId: P.jabon.id, quantity: 40, plannedDate: inDays(-1), notes: "Lote para pedido de Tiendas Orgánicas" });
    await production.startProductionOrder(o.id);
    await production.completeProductionOrder({ orderId: o.id, producedQty: 39, consumed: {}, warehouseId: W.PT.id, packSize: 20 });
  });

  // ── Compra en borrador
  await purchasing.createPurchaseOrder({ supplierId: S.quimicos.id, lines: [{ productId: P.lavanda.id, quantity: 0.5, unit: "L", unitPrice: 395000 }], notes: "Reposición antes de temporada de regalos" });

  // ── Producción: serum en borrador
  await production.createProductionOrder({ productId: P.serum.id, quantity: 50, plannedDate: inDays(3) });

  // ── Despacho pendiente de crema (para alistar con escáner en el demo)
  await dispatches.createDispatch({
    customerName: "Farmacia Botánica El Poblado S.A.S.", customerTaxId: "900.888.432-1", address: "Calle 10 # 35-20", city: "Medellín",
    salesRef: "FE-1051", lines: [{ productId: P.crema.id, quantity: 6 }],
  });

  console.log("Datos de ejemplo de Botánica Viva creados.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
