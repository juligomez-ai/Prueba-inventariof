// Uso: con la app corriendo y datos recién sembrados (npm run db:reset):
//   DATABASE_URL=... node e2e/qa-modulos.js   (requiere playwright y psql)
// QA funcional: ejecuta cada botón, filtro y lista de cada módulo y registra PASA / FALLA sin detenerse.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const results = [];
const ok = (m, name, cond, extra = '') => { results.push(`${cond ? 'PASA ' : 'FALLA'} · ${m} · ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  const go = async (u) => { await p.goto(base + u, { waitUntil: 'networkidle' }); };
  const text = async () => (await p.locator('main').innerText());
  // Espera el aviso verde o rojo del formulario (ActionForm)
  let lastPost = Promise.resolve();
  p.on('request', (r) => { if (r.method() === 'POST') lastPost = p.waitForResponse((x) => x.request() === r, { timeout: 30000 }).catch(() => {}); });
  const notice = async (scope = p) => {
    await p.waitForTimeout(300); await lastPost; await p.waitForTimeout(700);
    const l = scope.locator('.border-green-200, .border-red-200, .border-amber-200').last();
    return ((await l.textContent({ timeout: 5000 }).catch(() => '')) || '').trim();
  };
  // Abre un PDF en ventana nueva: valida la URL y que el servidor devuelva un PDF
  const pdfPopup = async (click) => {
    const reqP = ctx.waitForEvent('request', { predicate: (r) => r.url().includes('/api/'), timeout: 15000 });
    const [pop] = await Promise.all([ctx.waitForEvent('page'), click()]);
    const url = (await reqP).url(); await pop.close().catch(() => {});
    const r = await p.request.get(url);
    return { url, ok: r.status() === 200 && (r.headers()['content-type'] || '').includes('pdf') };
  };
  const step = async (m, name, fn) => { try { await fn(); } catch (e) { ok(m, name, false, 'excepción: ' + e.message.split('\n')[0].slice(0, 160)); } };
  const rows = async (tableSel = 'main table') => p.locator(`${tableSel} tbody tr`).count();
  const scan = async (code) => { await p.fill('input[aria-label="Código escaneado"]', code); await p.keyboard.press('Enter'); };

  // ───────── Navegación
  await step('Navegación', 'menú lateral', async () => {
    await go('/');
    const links = await p.locator('aside nav a').evaluateAll(as => as.map(a => a.getAttribute('href')));
    let bad = [];
    for (const h of links) { const r = await p.goto(base + h, { waitUntil: 'domcontentloaded' }); if (r.status() !== 200) bad.push(h); }
    ok('Navegación', `${links.length} enlaces del menú`, bad.length === 0, bad.join(', '));
  });
  await step('Navegación', 'menú en celular', async () => {
    const m = await ctx.newPage(); await m.setViewportSize({ width: 390, height: 800 });
    await m.goto(base + '/', { waitUntil: 'networkidle' });
    const hidden = !(await m.locator('aside nav').isVisible());
    await m.click('button[aria-label="Abrir menú"]');
    const shown = await m.locator('aside nav').isVisible();
    await m.click('aside nav >> text=Kardex'); await m.waitForURL(/kardex/);
    ok('Navegación', 'abrir menú hamburguesa y navegar', hidden && shown);
    await m.close();
  });

  // ───────── Tablero
  await step('Tablero', 'tarjetas enlazadas', async () => {
    await go('/');
    const hrefs = await p.locator('main a.block').evaluateAll(as => as.map(a => a.getAttribute('href')));
    ok('Tablero', `${hrefs.length - 1} indicadores con enlace (+ ayuda)`, hrefs.length === 9, hrefs.join(' '));
    const alerts = await p.locator('main ul li a').count();
    ok('Tablero', 'lista de alertas con enlaces', alerts > 0, `${alerts} alertas`);
    await p.click('text=Preguntar al Copiloto'); await p.waitForURL(/copiloto/);
    await go('/'); await p.click('text=Nueva orden de producción'); await p.waitForURL(/produccion\/nueva/);
    ok('Tablero', 'botones Copiloto y Nueva orden', true);
  });

  // ───────── Productos
  await step('Productos', 'crear con unidad de compra', async () => {
    await go('/productos/nuevo');
    await p.fill('input[name=sku]', 'MP-QA1'); await p.fill('input[name=name]', 'Aceite de jojoba QA');
    await p.selectOption('select[name=type]', 'MATERIA_PRIMA'); await p.selectOption('select[name=baseUnit]', 'L');
    await p.selectOption('select[name=preferredSupplierId]', { index: 1 });
    await p.fill('input[name=minStock]', '2');
    await p.click('text=Agregar unidad de compra');
    await p.fill('input[name="conv.unit"]', 'Garrafa 5 L'); await p.fill('input[name="conv.factor"]', '5');
    await p.click('button:has-text("Guardar producto")'); await p.waitForURL(/productos\/c/, { timeout: 20000 });
    const t = await text();
    ok('Productos', 'crear producto y ver detalle', t.includes('MP-QA1') && t.includes('Garrafa 5 L = 5 L'));
  });
  await step('Productos', 'SKU duplicado', async () => {
    await go('/productos/nuevo');
    await p.fill('input[name=sku]', 'MP-001'); await p.fill('input[name=name]', 'Duplicado');
    await p.click('button:has-text("Guardar producto")');
    ok('Productos', 'rechaza SKU duplicado', (await notice()).includes('Ya existe'));
  });
  await step('Productos', 'producto terminado sin vida útil', async () => {
    await go('/productos/nuevo');
    await p.fill('input[name=sku]', 'PT-QA'); await p.fill('input[name=name]', 'Tónico QA');
    await p.selectOption('select[name=type]', 'PRODUCTO_TERMINADO'); await p.selectOption('select[name=baseUnit]', 'und');
    await p.click('button:has-text("Guardar producto")');
    const n1 = await notice();
    await p.fill('input[name=shelfLifeDays]', '365'); await p.fill('input[name=salePrice]', '42000');
    await p.click('button:has-text("Guardar producto")'); await p.waitForURL(/productos\/c/, { timeout: 20000 });
    ok('Productos', 'exige vida útil y luego crea el producto terminado', n1.includes('vida útil'));
  });
  await step('Productos', 'editar', async () => {
    const id = sql("select id from \"Product\" where sku='MP-QA1'");
    await go(`/productos/${id}/editar`);
    await p.fill('input[name=name]', 'Aceite de jojoba QA editado');
    await p.click('button:has-text("Guardar producto")'); await p.waitForURL(new RegExp(`/productos/${id}$`), { timeout: 20000 });
    ok('Productos', 'editar nombre', (await text()).includes('jojoba QA editado'));
  });
  await step('Productos', 'archivar y reactivar', async () => {
    const id = sql("select id from \"Product\" where sku='MP-QA1'");
    await go(`/productos/${id}`); await p.click('main button:has-text("Archivar")'); await p.waitForSelector('text=Archivado');
    await go('/productos?archivados=1'); const inArch = (await text()).includes('MP-QA1');
    await go('/productos'); const notInActive = !(await text()).includes('MP-QA1');
    await go(`/productos/${id}`); await p.click('main button:has-text("Reactivar")'); await p.waitForSelector('text=Archivado', { state: 'detached' });
    ok('Productos', 'archivar, filtro de archivados y reactivar', inArch && notInActive);
  });
  await step('Productos', 'marcar bulto abierto y enlaces', async () => {
    const id = sql("select id from \"Product\" where sku='EMP-004'");
    await go(`/productos/${id}`);
    const before = await p.locator('text=Marcar abierto').count();
    await p.locator('button:has-text("Marcar abierto")').first().click();
    await p.waitForFunction((n) => document.querySelectorAll('button').length && [...document.querySelectorAll('button')].filter(b => b.textContent.includes('Marcar abierto')).length === n - 1, before, { timeout: 15000 });
    ok('Productos', 'marcar bulto abierto', true);
    for (const [label, re] of [['Kardex', /kardex\?producto/], ['Etiquetas', /etiquetas\?producto/], ['Editar', /editar/]]) {
      await go(`/productos/${id}`); await p.click(`main a:has-text("${label}")`); await p.waitForURL(re);
    }
    ok('Productos', 'botones Kardex, Etiquetas y Editar', true);
  });

  // ───────── Existencias
  await step('Existencias', 'filtros por tipo', async () => {
    for (const [label, type] of [['Materia prima', 'MP-'], ['Empaque', 'EMP-'], ['Producto terminado', 'PT-']]) {
      await go('/existencias'); await p.click(`main a:has-text("${label}")`); await p.waitForURL(/tipo=/);
      const skus = await p.locator('main tbody tr td:first-child .font-mono').allTextContents();
      ok('Existencias', `filtro ${label}`, skus.length > 0 && skus.every(s => s.startsWith(type)), `${skus.length} filas`);
    }
  });

  // ───────── Kardex
  await step('Kardex', 'filtros', async () => {
    await go('/kardex'); const all = await rows();
    const karite = sql("select id from \"Product\" where sku='MP-001'");
    const checks = [
      ['producto', `producto=${karite}`, (t) => !t.includes('Cera emulsionante')],
      ['tipo', 'tipo=SAL_CONSUMO', (t) => !t.includes('Inventario inicial')],
      ['bodega', `bodega=${sql("select id from \"Warehouse\" where code='BOD-PT'")}`, (t) => !t.includes('BOD-MP')],
      ['lote', 'lote=KT-2291', (t) => t.includes('KT-2291')],
      ['serial', 'serial=MP-001-000002', (t) => t.includes('MP-001-000002')],
      ['documento', 'documento=REM-0001', (t) => t.includes('REM-0001')],
      ['remisión', 'remision=RM-55821', (t) => t.includes('RM-55821')],
      ['tercero', 'tercero=Vida Sana', (t) => t.includes('Vida Sana')],
      ['fechas', `desde=2020-01-01&hasta=2099-12-31`, () => true],
    ];
    for (const [name, qs, test] of checks) {
      await go('/kardex?' + qs); const n = await rows(); const t = await p.locator('main table').innerText().catch(() => '');
      ok('Kardex', `filtro ${name}`, n > 0 && n <= all && test(t), `${n} de ${all}`);
    }
    await go('/kardex?desde=2099-01-01'); ok('Kardex', 'filtro sin resultados muestra mensaje', (await text()).includes('No hay movimientos'));
    await go('/kardex'); await p.selectOption('select[name=tipo]', 'ENT_COMPRA'); await p.click('button:has-text("Filtrar")'); await p.waitForURL(/tipo=ENT_COMPRA/);
    ok('Kardex', 'formulario de filtros (botón Filtrar)', (await rows()) > 0);
    await p.click('main a:has-text("Limpiar")'); await p.waitForURL(/\/kardex$/);
    ok('Kardex', 'botón Limpiar', (await rows()) === all);
    const csv = await p.request.get(base + '/kardex/csv?tipo=SAL_VENTA');
    const lines = (await csv.text()).trim().split('\n');
    ok('Kardex', 'exportar CSV con filtro', csv.status() === 200 && lines.length >= 2 && lines.slice(1).every(l => l.includes('Salida por venta')), `${lines.length - 1} filas`);
    await go('/kardex'); await p.locator('main tbody tr td a').first().click(); await p.waitForURL(/kardex\/c/);
    const d = await text();
    ok('Kardex', 'detalle de movimiento con trazabilidad', ['Consecutivo', 'Usuario', 'Documento soporte', 'Saldo antes'].every(k => d.includes(k)));
  });

  // ───────── Lotes y calidad
  await step('Lotes', 'filtros y búsqueda', async () => {
    for (const [label, st] of [['Disponible', 'Disponible'], ['Cuarentena', 'Cuarentena']]) {
      await go('/lotes'); await p.click(`main a:has-text("${label}")`); await p.waitForURL(/estado=/);
      const badges = await p.locator('main tbody tr td:nth-child(4)').allTextContents();
      ok('Lotes', `filtro ${label}`, badges.length > 0 && badges.every(b => b.includes(st)), `${badges.length} lotes`);
    }
    await go('/lotes?estado=BLOQUEADO'); ok('Lotes', 'filtro Bloqueado (vacío) muestra mensaje', (await text()).includes('No hay lotes'));
    await go('/lotes'); await p.fill('input[name=q]', 'karité'); await p.keyboard.press('Enter'); await p.waitForURL(/q=/);
    const names = await p.locator('main tbody tr td:nth-child(2)').allTextContents();
    ok('Lotes', 'búsqueda por producto', names.length > 0 && names.every(n => n.includes('karité')), `${names.length}`);
  });
  await step('Calidad', 'cuarentena, rechazo y liberación', async () => {
    const lot = sql("select id from \"Lot\" where code='GL-0587'");
    await go(`/lotes/${lot}`);
    await p.click('button:has-text("Poner en cuarentena")');
    ok('Calidad', 'nota obligatoria', (await p.locator('input[name=note]').evaluate(e => !e.checkValidity())));
    await p.fill('input[name=note]', 'Proveedor reporta posible contaminación');
    await p.click('button:has-text("Poner en cuarentena")'); await p.waitForSelector('main >> text=Liberar', { timeout: 15000 });
    ok('Calidad', 'poner en cuarentena', sql(`select status from "Lot" where id='${lot}'`) === 'CUARENTENA');
    await go('/calidad'); ok('Calidad', 'aparece en pendientes de liberación', (await text()).includes('GL-0587'));
    await go(`/lotes/${lot}`); await p.fill('input[name=note]', 'Análisis no conforme');
    await p.click('button:has-text("Rechazar / bloquear")'); await p.waitForTimeout(1500);
    ok('Calidad', 'rechazar', sql(`select status from "Lot" where id='${lot}'`) === 'BLOQUEADO');
    await go(`/lotes/${lot}`); await p.fill('input[name=note]', 'Reanálisis conforme'); await p.click('button:has-text("Liberar")'); await p.waitForTimeout(1500);
    ok('Calidad', 'liberar', sql(`select status from "Lot" where id='${lot}'`) === 'DISPONIBLE');
    await go(`/lotes/${lot}`); const h = await text();
    ok('Calidad', 'historial de estados con notas', h.includes('Análisis no conforme') && h.includes('Reanálisis conforme'));
  });

  // ───────── Fórmulas
  await step('Fórmulas', 'crear fórmula con unidades g y ml', async () => {
    const pt = sql("select id from \"Product\" where sku='PT-QA'");
    await go(`/formulas/${pt}`);
    await p.fill('input[name=yieldQuantity]', '50');
    const add = async (label, qty, unit) => {
      const rowsN = await p.locator('select[name="item.ingredientId"]').count();
      let i = rowsN - 1;
      if (await p.locator('select[name="item.ingredientId"]').nth(i).inputValue()) { await p.click('text=Agregar insumo'); i++; }
      await p.locator('select[name="item.ingredientId"]').nth(i).selectOption({ label });
      await p.locator('input[name="item.quantity"]').nth(i).fill(qty);
      if (unit) await p.locator('select[name="item.unit"]').nth(i).selectOption(unit);
    };
    await add('MP-008 · Agua desmineralizada', '1400', 'ml');
    await add('MP-004 · Glicerina vegetal', '100', 'ml');
    await add('MP-007 · Aceite esencial de lavanda', '5', 'ml');
    await add('EMP-007 · Frasco gotero 30 ml', '50');
    const live = await p.locator('text=Costo por lote').locator('..').innerText();
    ok('Fórmulas', 'costo en vivo mientras se edita', /\$\s?[1-9]/.test(live), live.replace(/\s+/g, ' '));
    await p.click('text=Agregar insumo'); await p.locator('button[aria-label="Quitar"]').last().click();
    ok('Fórmulas', 'agregar y quitar fila', (await p.locator('select[name="item.ingredientId"]').count()) === 4);
    await p.click('button:has-text("Guardar fórmula")'); await p.waitForSelector('text=Costo por unidad', { timeout: 20000 });
    const q = sql(`select ri.quantity from "RecipeItem" ri join "Recipe" r on r.id=ri."recipeId" join "Product" i on i.id=ri."ingredientId" where r."productId"='${pt}' and i.sku='MP-008'`);
    ok('Fórmulas', 'guardar convierte 1400 ml → 1,4 L', Number(q) === 1.4, q);
  });
  await step('Fórmulas', 'editar y cancelar', async () => {
    const pt = sql("select id from \"Product\" where sku='PT-QA'");
    await go(`/formulas/${pt}`); await p.click('main a:has-text("Editar")'); await p.waitForURL(/editar=1/);
    ok('Fórmulas', 'aviso de que no cambia órdenes existentes', (await text()).includes('RN-8.3'));
    await p.click('main a:has-text("Cancelar")'); await p.waitForURL(/formulas\/c[a-z0-9]+$/);
    await p.click('main a:has-text("Producir")'); await p.waitForURL(/produccion\/nueva\?producto=/);
    ok('Fórmulas', 'botones Editar, Cancelar y Producir', true);
    await go('/formulas'); const f = await text();
    ok('Fórmulas', 'lista con costo y margen del nuevo producto', f.includes('Tónico QA'));
  });

  // ───────── Producción
  await step('Producción', 'validar, crear, iniciar y anular', async () => {
    await go('/produccion/nueva');
    await p.selectOption('select[name=producto]', { label: 'PT-004 · Serum facial vitamina C 30 ml' });
    await p.fill('input[name=cantidad]', '20'); await p.click('text=Validar disponibilidad'); await p.waitForURL(/cantidad=20/);
    ok('Producción', 'validar disponibilidad', (await text()).includes('Te alcanza'));
    await p.click('button:has-text("Crear orden en borrador")'); await p.waitForURL(/produccion\/c/, { timeout: 20000 });
    await p.click('button:has-text("Iniciar y reservar lotes")'); await p.waitForSelector('text=Completar orden', { timeout: 20000 });
    ok('Producción', 'iniciar reserva bultos', (await p.locator('main').textContent()).includes('Bultos reservados'));
    await p.click('main button:has-text("Anular")'); await p.waitForSelector('text=Anulada', { timeout: 15000 });
    const id = p.url().split('/').pop();
    ok('Producción', 'anular libera reservas', sql(`select count(*) from "Reservation" where "orderId"='${id}'`) === '0');
  });
  await step('Producción', 'no inicia con faltantes', async () => {
    await go('/produccion/nueva?producto=' + sql("select id from \"Product\" where sku='PT-001'") + '&cantidad=500');
    await p.click('button:has-text("Crear orden en borrador")'); await p.waitForURL(/produccion\/c/, { timeout: 20000 });
    ok('Producción', 'orden con faltantes muestra tabla y botón de compra', (await text()).includes('Crear OC con faltantes'));
    await p.click('button:has-text("Iniciar y reservar lotes")');
    ok('Producción', 'iniciar con faltantes da error claro', (await notice()).includes('No hay stock disponible'));
    await p.click('main a:has-text("Crear OC con faltantes")'); await p.waitForURL(/compras\/nueva\?op=/);
    const n = await p.locator('select[name="line.productId"]').count();
    ok('Producción', 'OC prellenada con faltantes', n > 0, `${n} líneas`);
    await p.click('button:has-text("Crear orden de compra")'); await p.waitForURL(/compras\/c/, { timeout: 20000 });
    ok('Compras', 'crear OC desde faltantes', (await text()).includes('Generada con faltantes'));
  });
  await step('Producción', 'completar con consumo real', async () => {
    await go('/produccion/nueva?producto=' + sql("select id from \"Product\" where sku='PT-002'") + '&cantidad=30');
    await p.click('button:has-text("Crear orden en borrador")'); await p.waitForURL(/produccion\/c/, { timeout: 20000 });
    await p.click('button:has-text("Iniciar y reservar lotes")'); await p.waitForSelector('input[name=producedQty]', { timeout: 20000 });
    await p.locator('input[name="consumed.qty"]').first().fill('0.13');
    await p.fill('input[name=producedQty]', '29'); await p.fill('input[name=packSize]', '10');
    await p.getByRole('button', { name: 'Completar orden' }).click(); await p.waitForSelector('text=Lote producido', { timeout: 25000 });
    const t = await text();
    const boxes = await p.locator('main .font-mono.rounded, main span.font-mono').count();
    ok('Producción', 'completar crea lote en cuarentena y cajas de 10', t.includes('Cuarentena') && t.includes('3 caja(s)'));
    ok('Producción', 'muestra costo real y variación', t.includes('variación'));
    const e1 = await pdfPopup(() => p.click('text=Imprimir etiquetas')); ok('Producción', 'imprimir etiquetas abre PDF', e1.ok, e1.url);
    ok('Producción', 'botón imprimir hoja de trabajo', await p.locator('button:has-text("Imprimir hoja de trabajo")').isVisible());
    await go('/produccion'); ok('Producción', 'lista de órdenes', (await rows()) >= 5);
  });

  // ───────── Compras
  await step('Compras', 'crear OC manual con unidad de compra', async () => {
    await go('/compras/nueva');
    await p.selectOption('select[name=supplierId]', { label: 'Oleoquímicos Andinos S.A.S.' });
    await p.selectOption('select[name="line.productId"]', { label: 'MP-002 · Aceite de almendras' });
    const priceL = await p.inputValue('input[name="line.unitPrice"]');
    await p.selectOption('select[name="line.unit"]', 'Garrafa 20 L');
    const priceG = await p.inputValue('input[name="line.unitPrice"]');
    ok('Compras', 'cambiar unidad recalcula precio (L → garrafa 20 L)', Number(priceG) === Number(priceL) * 20, `${priceL} → ${priceG}`);
    await p.fill('input[name="line.quantity"]', '2');
    await p.click('text=Agregar producto');
    await p.locator('select[name="line.productId"]').nth(1).selectOption({ label: 'MP-001 · Manteca de karité' });
    await p.locator('input[name="line.quantity"]').nth(1).fill('5');
    const tot = await p.locator('text=Total').last().innerText();
    ok('Compras', 'totales con IVA en vivo', /Total \$/.test(tot), tot);
    await p.click('button:has-text("Crear orden de compra")'); await p.waitForURL(/compras\/c/, { timeout: 20000 });
    ok('Compras', 'crear OC', (await text()).includes('Borrador'));
  });
  await step('Compras', 'enviar, envío, eventos y recepción parcial/total', async () => {
    await p.click('button:has-text("Marcar como enviada")'); await p.waitForSelector('text=Registrar envío del proveedor', { timeout: 15000 });
    await p.fill('input[name=trackingNumber]', 'QA-123456'); await p.fill('input[name=shippedAt]', '2026-11-14'); await p.fill('input[name=eta]', '2026-11-20');
    await p.click('button:has-text("Registrar envío")'); await p.waitForSelector('text=QA-123456', { timeout: 15000 });
    ok('Compras', 'registrar envío y pasar a En tránsito', (await text()).includes('En tránsito'));
    await p.selectOption('select[name=status]', 'EN_CIUDAD_DESTINO'); await p.fill('input[name=note]', 'Llegó a Medellín');
    await p.click('button:has-text("Registrar estado")'); await p.waitForSelector('text=Llegó a Medellín', { timeout: 15000 });
    ok('Compras', 'registrar estado del envío', true);
    // recepción parcial: 1 garrafa de 2, sin remisión primero
    const q = p.locator('input[name="r.quantity"]');
    await q.nth(0).fill('1'); await q.nth(1).fill('0');
    await p.locator('input[name="r.lotCode"]').nth(0).fill('AL-QA1'); await p.locator('input[name="r.expiryDate"]').nth(0).fill('2027-12-31');
    await p.locator('input[name="r.lotCode"]').nth(1).fill('X'); await p.locator('input[name="r.expiryDate"]').nth(1).fill('2027-12-31');
    await p.fill('input[name=supplierRemission]', 'RM-QA-1');
    await p.click('button:has-text("Registrar recepción")'); await p.waitForSelector('text=REC-', { timeout: 20000 });
    ok('Compras', 'recepción parcial', (await text()).includes('Recibida parcial'));
    const e2 = await pdfPopup(() => p.locator('main a:has-text("Etiquetas (")').first().click()); ok('Compras', 'etiquetas de la recepción', e2.ok);
    await p.fill('input[name=supplierRemission]', 'RM-QA-2');
    await p.locator('input[name="r.containers"]').last().fill('5');
    for (let i = 0; i < await p.locator('input[name="r.lotCode"]').count(); i++) {
      if (await p.locator('input[name="r.lotCode"]').nth(i).isEditable().catch(() => false)) {
        await p.locator('input[name="r.lotCode"]').nth(i).fill('QA-' + i); await p.locator('input[name="r.expiryDate"]').nth(i).fill('2027-12-31');
      }
    }
    await p.click('button:has-text("Registrar recepción")'); await p.waitForSelector('main >> text=Recibida', { timeout: 20000 });
    const st = (await text()).includes('RM-QA-2');
    ok('Compras', 'recepción final en 5 bultos', st);
    const karite = sql("select count(*) from \"Container\" c join \"Product\" p on p.id=c.\"productId\" join \"Lot\" l on l.id=c.\"lotId\" where p.sku='MP-001' and l.code like 'QA-%'");
    ok('Compras', '5 sacos de karité con serial', karite === '5', karite);
  });
  await step('Compras', 'validaciones de recepción y anular', async () => {
    const po = sql("select id from \"PurchaseOrder\" where code='OC-0003'");
    await go(`/compras/${po}`);
    await p.click('button:has-text("Marcar como enviada")'); await p.waitForSelector('text=Recibir mercancía', { timeout: 15000 });
    await p.fill('input[name=supplierRemission]', 'RM-QA-3'); await p.locator('input[name="r.quantity"]').first().fill('9');
    await p.locator('input[name="r.lotCode"]').first().fill('LV-QA'); await p.locator('input[name="r.expiryDate"]').first().fill('2028-01-01');
    await p.click('button:has-text("Registrar recepción")');
    ok('Compras', 'no deja recibir más de lo pedido', (await notice()).includes('solo quedan'));
    await p.click('main button:has-text("Anular")'); await p.waitForSelector('main >> text=Anulada', { timeout: 15000 });
    ok('Compras', 'anular OC', true);
    await go('/compras'); ok('Compras', 'lista de OCs', (await rows()) >= 5);
  });

  // ───────── Proveedores y transportadoras
  await step('Proveedores', 'crear, NIT duplicado, transportadora y plantilla', async () => {
    await go('/proveedores');
    const sup = p.locator('form', { has: p.locator('input[name=taxId]') });
    await sup.locator('input[name=name]').fill('Proveedor QA S.A.S.'); await sup.locator('input[name=taxId]').fill('900.000.111-1');
    await sup.locator('button:has-text("Guardar proveedor")').click(); await p.waitForSelector('main td:has-text("Proveedor QA S.A.S.")', { timeout: 15000 });
    ok('Proveedores', 'crear proveedor', true);
    await sup.locator('input[name=name]').fill('Otro'); await sup.locator('input[name=taxId]').fill('900.000.111-1');
    await sup.locator('button:has-text("Guardar proveedor")').click();
    ok('Proveedores', 'rechaza NIT duplicado', (await notice(sup)).includes('Ya existe'));
    const car = p.locator('form', { has: p.locator('input[placeholder*="{guia}"]') }).last();
    await car.locator('input[name=name]').fill('Envía QA'); await car.locator('input[name=trackingUrlTemplate]').fill('https://example.com/rastreo?guia={guia}');
    await car.locator('button:has-text("Guardar")').click(); await p.waitForSelector('main td:has-text("Envía QA")', { timeout: 15000 });
    const row = p.locator('tr', { hasText: 'Envía QA' });
    ok('Proveedores', 'transportadora con {guia} queda "Sí"', (await row.innerText()).includes('Sí'));
    await row.locator('input[name=trackingUrlTemplate]').fill('https://example.com/rastreo');
    await row.locator('button:has-text("Guardar")').click(); await p.waitForTimeout(1500); await go('/proveedores');
    ok('Proveedores', 'editar plantilla sin {guia} pasa a "copiar guía"', (await p.locator('tr', { hasText: 'Envía QA' }).innerText()).includes('se copia'));
  });

  // ───────── Despachos
  await step('Despachos', 'crear, alistar, cancelar alistamiento y eliminar', async () => {
    await go('/despachos/nuevo');
    for (const [n, v] of [['customerName', 'Cliente QA'], ['customerTaxId', '123'], ['address', 'Calle 1']]) await p.fill(`input[name=${n}]`, v);
    await p.selectOption('select[name="line.productId"]', { index: 1 }); await p.fill('input[name="line.quantity"]', '1');
    await p.click('button:has-text("Crear despacho")'); await p.waitForURL(/despachos\/c/, { timeout: 20000 });
    ok('Despachos', 'crear despacho con número REM', (await text()).includes('Remisión REM-'));
    await p.click('button:has-text("Alistar")'); await p.waitForSelector('text=Lista de alistamiento', { timeout: 20000 });
    await p.click('button:has-text("Cancelar alistamiento")'); await p.waitForSelector('button:has-text("Alistar")', { timeout: 15000 });
    ok('Despachos', 'cancelar alistamiento', true);
    await p.click('button:has-text("Eliminar")'); await p.waitForURL(/despachos$/, { timeout: 15000 });
    ok('Despachos', 'eliminar despacho pendiente', true);
  });
  await step('Despachos', 'alistar con escáner, despachar, POD y entrega', async () => {
    await go('/despachos'); await p.click('main a:has-text("REM-0002")');
    await p.click('button:has-text("Alistar")'); await p.waitForSelector('text=Lista de alistamiento', { timeout: 20000 });
    await scan('NO-EXISTE'); ok('Despachos', 'escanear caja no asignada da error', await p.locator('.border-red-200:has-text("no está asignado")').isVisible({ timeout: 10000 }).catch(() => false) || await p.waitForSelector('text=no está asignado', { timeout: 10000 }).then(() => true).catch(() => false));
    await p.fill('input[name=trackingNumber]', '7000'); await p.getByRole('button', { name: 'Despachar' }).click();
    ok('Despachos', 'no despacha sin verificar cajas', (await notice()).includes('Faltan cajas'));
    const serials = await p.locator('table:has-text("Verificada") tbody tr td:first-child').allTextContents();
    for (const s of serials) { await scan(s); await p.waitForSelector(`text=${s} verificada`, { timeout: 15000 }); }
    await scan(serials[0]); ok('Despachos', 'reescanear avisa "ya estaba verificada"', await p.waitForSelector('text=ya estaba verificada', { timeout: 10000 }).then(() => true).catch(() => false));
    await p.fill('input[name=trackingNumber]', '700012345'); await p.fill('input[name=freightCost]', '15000');
    await p.getByRole('button', { name: 'Despachar' }).click(); await p.waitForSelector('text=Salidas registradas', { timeout: 20000 });
    ok('Despachos', 'despachar registra salida GI con remisión', (await text()).includes('Prueba de entrega'));
    const img = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await p.setInputFiles('input[name=proof]', { name: 'firma.png', mimeType: 'image/png', buffer: img });
    await p.click('button:has-text("Adjuntar")'); await p.waitForSelector('img[alt="Remisión firmada"]', { timeout: 15000 });
    ok('Despachos', 'adjuntar remisión firmada (POD)', true);
    await p.selectOption('select[name=status]', 'ENTREGADO'); await p.fill('input[name=note]', 'Recibió QA');
    await p.click('button:has-text("Registrar estado")'); await p.waitForSelector('main >> text=Entregado', { timeout: 15000 });
    ok('Despachos', 'evento Entregado actualiza el despacho', sql("select status from \"Dispatch\" where code='REM-0002'") === 'ENTREGADO');
    const pdf = await p.request.get(base + '/api/remision/' + p.url().split('/').pop());
    ok('Despachos', 'remisión PDF', pdf.status() === 200 && (pdf.headers()['content-type'] || '').includes('pdf'));
    await go('/despachos'); ok('Despachos', 'lista y contadores', (await rows()) >= 2);
  });
  await step('Envíos', 'listas y enlace de rastreo', async () => {
    await go('/envios'); const t = await text();
    ok('Envíos', 'en camino y entregados', t.includes('En camino') && t.includes('Entregados recientemente'));
    const href = await p.locator('main a[target=_blank]').first().getAttribute('href');
    ok('Envíos', 'enlace a página oficial de rastreo', /^https:\/\//.test(href || ''), href);
  });

  // ───────── Conteo cíclico
  await step('Conteo', 'cambiar bodega, crear, errores de escaneo y anular', async () => {
    await go('/conteos');
    await p.selectOption('main select[name=bodega]', { label: 'BOD-PT · Producto terminado' }); await p.click('text=Cambiar bodega'); await p.waitForURL(/bodega=/);
    const names = await p.locator('main tbody tr td:nth-child(2)').allTextContents();
    ok('Conteo', 'cambiar bodega cambia la lista ABC', names.length > 0 && names.every(n => /Crema|Bálsamo|Jabón|Serum|Tónico/.test(n)), names.join(', '));
    await p.click('button:has-text("Crear sesión de conteo")'); await p.waitForURL(/conteos\/c/, { timeout: 20000 });
    await scan('XYZ-999'); ok('Conteo', 'código desconocido', await p.waitForSelector('text=desconocido', { timeout: 10000 }).then(() => true).catch(() => false));
    await scan('PT-001'); ok('Conteo', 'código de producto pide escanear el bulto', await p.waitForSelector('text=escanea la etiqueta del bulto', { timeout: 10000 }).then(() => true).catch(() => false));
    await scan('MP-001-000001'); ok('Conteo', 'bulto de otra bodega', await p.waitForSelector('text=otra bodega', { timeout: 10000 }).then(() => true).catch(() => false));
    await p.click('main button:has-text("Anular")'); await p.waitForSelector('main >> text=Anulado', { timeout: 15000 });
    ok('Conteo', 'anular conteo', true);
  });
  await step('Conteo', 'sellado, abierto, cerrar, comentario obligatorio y aprobar', async () => {
    await go('/conteos');
    await p.selectOption('main select[name=bodega]', { label: 'BOD-MP · Materias primas' }); await p.click('text=Cambiar bodega'); await p.waitForURL(/bodega=/);
    for (const cb of await p.locator('input[name=productId]').all()) await cb.uncheck();
    await p.locator('tr', { hasText: 'Manteca de karité' }).locator('input[name=productId]').check();
    await p.click('button:has-text("Crear sesión de conteo")'); await p.waitForURL(/conteos\/c/, { timeout: 20000 });
    const serials = sql("select string_agg(serial||':'||status, ',' order by serial) from \"Container\" c join \"Product\" p on p.id=c.\"productId\" where p.sku='MP-001' and c.status in ('SELLADO','ABIERTO')").split(',');
    const sealed = serials.find(s => s.endsWith('SELLADO')).split(':')[0];
    const open = serials.find(s => s.endsWith('ABIERTO'))?.split(':')[0];
    await scan(sealed); await p.waitForSelector('text=Caja sellada ✓', { timeout: 15000 });
    ok('Conteo', 'caja sellada con un escaneo sin mostrar cantidad', !(await p.locator('.border-green-200').last().innerText()).match(/\d+\s?kg/));
    if (open) {
      await scan(open); await p.waitForSelector('text=cuenta las unidades', { timeout: 15000 });
      await p.fill('input[type=number][required]', '0.5'); await p.click('button:has-text("Guardar")'); await p.waitForSelector(`text=✓ ${open} contado`, { timeout: 15000 });
      ok('Conteo', 'caja abierta obliga a digitar', true);
    }
    await p.click('button:has-text("Cerrar conteo")'); await p.waitForSelector('text=Revisión: sistema vs contado', { timeout: 20000 });
    const nf = (await text()).includes('No encontrado');
    ok('Conteo', 'al cerrar, bultos no escaneados quedan "No encontrado"', nf);
    await p.click('button:has-text("Aprobar y generar ajustes")');
    ok('Conteo', 'diferencia > $50.000 exige comentario', (await notice()).includes('agrega un comentario'));
    for (const c of await p.locator('input[name^="comment."]').all()) await c.fill('QA: diferencia revisada');
    await p.click('button:has-text("Aprobar y generar ajustes")'); await p.waitForSelector('text=Ajustes generados', { timeout: 20000 });
    ok('Conteo', 'aprobar genera ajustes por serial', true);
  });

  // ───────── Ajustes
  await step('Ajustes', 'entrada con lote, validaciones y salida por escáner', async () => {
    await go('/ajustes');
    const up = p.locator('form', { has: p.locator('input[name=containers]') });
    await up.locator('select[name=productId]').selectOption({ label: 'MP-009 · Cera de abejas (kg)' });
    await up.locator('input[name=quantity]').fill('2');
    await up.locator('button:has-text("Registrar entrada")').click();
    ok('Ajustes', 'exige lote si el producto lo controla', (await notice(up)).includes('controla lote'));
    await up.locator('input[name=lotCode]').fill('CA-QA'); await up.locator('input[name=expiryDate]').fill('2028-02-02');
    await up.locator('select[name=reason]').selectOption('ERROR_REGISTRO');
    await up.locator('button:has-text("Registrar entrada")').click();
    ok('Ajustes', 'registrar entrada', (await notice(up)).includes('registrado'));
    await go('/ajustes');
    const e3 = await pdfPopup(() => p.click('text=Etiquetas del último ajuste')); ok('Ajustes', 'etiquetas del último ajuste', e3.ok);
    const serial = sql("select serial from \"Container\" c join \"Lot\" l on l.id=c.\"lotId\" where l.code='CA-QA' limit 1");
    await scan(serial); await p.waitForSelector('button:has-text("Registrar salida")', { timeout: 15000 });
    await p.fill('input[name=quantity] >> nth=0', '0.5'); await p.selectOption('select[name=reason] >> nth=0', 'VENCIDO');
    await p.click('button:has-text("Registrar salida")');
    ok('Ajustes', 'salida/baja escaneando el serial', (await notice()).includes('registrado'));
    await go('/ajustes'); const t = await text();
    ok('Ajustes', 'historial y pérdidas por motivo', t.includes('Pérdidas') && t.includes('Baja'));
  });

  // ───────── Bodegas y traslados
  await step('Bodegas', 'crear bodega y trasladar completo y parcial', async () => {
    await go('/bodegas');
    const f = p.locator('form', { has: p.locator('input[name=code]') });
    await f.locator('input[name=code]').fill('BOD-QA'); await f.locator('input[name=name]').fill('Bodega QA'); await f.locator('select[name=type]').selectOption('EMPAQUE');
    await f.locator('button:has-text("Crear bodega")').click(); await p.waitForSelector('main td:has-text("BOD-QA")', { timeout: 15000 });
    ok('Bodegas', 'crear bodega', true);
    const s1 = sql("select serial from \"Container\" c join \"Product\" p on p.id=c.\"productId\" where p.sku='EMP-009' and c.status='SELLADO' limit 1");
    await scan(s1); await p.waitForSelector('select[name=toWarehouseId]', { timeout: 15000 });
    await p.selectOption('select[name=toWarehouseId]', { label: 'BOD-QA · Bodega QA' });
    await p.click('button:has-text("Trasladar")'); await p.waitForTimeout(2000);
    ok('Bodegas', 'trasladar bulto completo conserva serial', sql(`select w.code from "Container" c join "Warehouse" w on w.id=c."warehouseId" where serial='${s1}'`) === 'BOD-QA');
    await go('/bodegas'); await scan(s1); await p.waitForSelector('select[name=toWarehouseId]', { timeout: 15000 });
    await p.selectOption('select[name=toWarehouseId]', { label: 'BOD-EMP · Material de empaque' }); await p.fill('input[name=quantity]', '50');
    await p.click('button:has-text("Trasladar")'); await p.waitForTimeout(2000);
    ok('Bodegas', 'trasladar parcial crea bulto nuevo', sql(`select status from "Container" where serial='${s1}'`) === 'ABIERTO');
    await go('/bodegas'); ok('Bodegas', 'traslados recientes', (await text()).includes('BOD-QA'));
  });

  // ───────── Etiquetas
  await step('Etiquetas', 'por bulto y por SKU', async () => {
    await go('/etiquetas');
    await p.selectOption('main select[name=producto]', { label: 'MP-002 · Aceite de almendras' }); await p.click('main button:has-text("Ver")'); await p.waitForURL(/producto=/);
    const n = await p.locator('input[name=serials]').count();
    ok('Etiquetas', 'cambiar producto lista sus bultos', n > 0, `${n} bultos`);
    const e4 = await pdfPopup(() => p.click('text=Generar PDF de etiquetas')); ok('Etiquetas', 'PDF de bultos seleccionados', e4.ok, e4.url.slice(0, 80));
    await p.locator('input[name=skus]').nth(0).check(); await p.locator('input[name=skus]').nth(1).check();
    const e5 = await pdfPopup(() => p.getByRole('button', { name: 'Generar PDF', exact: true }).click()); ok('Etiquetas', 'PDF por SKU', e5.ok && e5.url.includes('skus='));
  });

  // ───────── Ayuda y Copiloto
  await step('Ayuda', 'enlaces', async () => {
    await go('/ayuda');
    const hrefs = await p.locator('main a').evaluateAll(as => as.map(a => a.getAttribute('href')));
    let bad = 0; for (const h of hrefs) { const r = await p.request.get(base + h); if (r.status() !== 200) bad++; }
    ok('Ayuda', `${hrefs.length} enlaces de guías`, bad === 0);
  });
  await step('Copiloto', 'pregunta, reiniciar', async () => {
    await go('/copiloto?q=' + encodeURIComponent('¿Qué lotes vencen en los próximos 60 días?'));
    ok('Copiloto', 'pregunta precargada desde enlace', (await p.inputValue('textarea')).includes('vencen'));
    await p.click('button[aria-label="Enviar"]'); await p.waitForSelector('text=Revisó vencimientos', { timeout: 120000 });
    ok('Copiloto', 'responde con herramienta de vencimientos', true);
    await p.click('button[aria-label="Reiniciar conversación"]');
    ok('Copiloto', 'reiniciar conversación', (await text()).includes('Pregunta por una producción'));
  });

  ok('General', 'sin errores de JavaScript en consola', errs.length === 0, [...new Set(errs)].slice(0, 3).join(' | '));
  console.log(results.join('\n'));
  console.log(`\nTOTAL: ${results.filter(r => r.startsWith('PASA')).length} pasan, ${results.filter(r => r.startsWith('FALLA')).length} fallan`);
  await b.close();
})();
