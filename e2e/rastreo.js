// Uso: con la app corriendo: node e2e/rastreo.js (requiere playwright)
// Rastreo: visita todas las páginas alcanzables por enlaces internos,
// revisa estado HTTP, errores de consola, listas desplegables vacías y enlaces rotos.
const { chromium } = require('playwright');
const base = process.env.BASE_URL ?? 'http://localhost:3000';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  let errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  const seen = new Set(), queue = ['/'], problems = [], selectsReport = [];
  const norm = (h) => { try { const u = new URL(h, base); if (u.origin !== base) return null; return u.pathname + u.search; } catch { return null; } };
  // Limita variantes de query para no explotar (kardex con muchos filtros)
  const key = (u) => u.replace(/\/c[a-z0-9]{24}/g, '/:id').replace(/\?.*$/, (q) => q.includes('producto=') ? '?producto' : q);
  const seenKeys = new Map();
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const k = key(url); const c = (seenKeys.get(k) || 0) + 1; seenKeys.set(k, c);
    if (c > 2 && !url.startsWith('/api')) continue;
    if (url.startsWith('/api/') || url.startsWith('/kardex/csv')) {
      const r = await p.request.get(base + url);
      const ct = r.headers()['content-type'] || '';
      if (r.status() !== 200) problems.push(`${url} → HTTP ${r.status()}`);
      else if (!/pdf|csv/.test(ct)) problems.push(`${url} → content-type ${ct}`);
      continue;
    }
    errs = [];
    const r = await p.goto(base + url, { waitUntil: 'networkidle' }).catch(e => null);
    const st = r ? r.status() : 0;
    if (st !== 200) { problems.push(`${url} → HTTP ${st}`); continue; }
    const body = await p.locator('main').innerText();
    if (/Application error|Unhandled Runtime Error|Error:/.test(body)) problems.push(`${url} → texto de error en pantalla`);
    // listas desplegables
    for (const s of await p.locator('main select').all()) {
      const name = await s.getAttribute('name');
      const opts = await s.locator('option').allTextContents();
      const real = opts.filter(o => o.trim() && !/^Selecciona|^Todos|^Todas|^—$/.test(o.trim()));
      selectsReport.push(`${key(url)} [${name}] ${opts.length} opciones`);
      if (real.length === 0) problems.push(`${url} → lista "${name}" sin opciones reales`);
      if (opts.some(o => /undefined|null|NaN/.test(o))) problems.push(`${url} → lista "${name}" con texto inválido`);
    }
    if (/undefined|NaN|\[object Object\]/.test(body)) problems.push(`${url} → texto "undefined/NaN/[object Object]" visible`);
    if (errs.length) problems.push(`${url} → consola: ${[...new Set(errs)].slice(0, 2).join(' | ')}`);
    for (const h of await p.locator('a[href]').evaluateAll(as => as.map(a => a.getAttribute('href')))) {
      const n = norm(h); if (n && !seen.has(n)) queue.push(n);
    }
    for (const f of await p.locator('form[action^="/api"]').evaluateAll(fs => fs.map(f => f.getAttribute('action')))) {}
  }
  console.log('Páginas visitadas:', seen.size);
  console.log([...new Set(selectsReport)].join('\n'));
  console.log('\nPROBLEMAS (' + problems.length + '):\n' + problems.join('\n'));
  await b.close();
})();
