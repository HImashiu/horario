// End-to-end smoke test in a real browser (Playwright, Chromium).
// Serves the repo with a tiny static server, then walks the main flow and checks the
// v7 bugs stay fixed. Uses the built assets: run ./build.sh first.
// Usage: node tests/e2e/smoke.cjs [--shots <dir>]
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '..', '..');
const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.map': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const steps = [];
const step = async (name, fn) => { await fn(); steps.push(name); console.log(`✓ ${name}`); };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch();
  const errors = [];
  const watch = page => {
    page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts\.g/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    // No network beyond the local server: fonts and the Uniandes API are blocked here.
    page.route(url => !url.toString().startsWith(base.replace('/index.html', '')), r => r.abort());
  };
  const shot = async (page, name) => { if (shotsDir) await page.screenshot({ path: path.join(shotsDir, name) }); };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    watch(page);
    await page.goto(base);

    await step('first visit shows the program picker with three programs', async () => {
      assert.equal(await page.locator('.program-card').count(), 3);
      await shot(page, 'e2e-01-picker.png');
    });
    await step('choosing IMEC shows its 2026 pensum (8 semesters) and the route choice', async () => {
      await page.click('.program-card[data-program="imec"]');
      assert.equal(await page.locator('.psem').count(), 8);
      assert.ok(await page.locator('text=Elige la ruta').isVisible());
      await page.click('[data-action="route:set"][data-route="precalculo"]');
      assert.ok(await page.locator('.pblock[data-key="MATE1201"]').isVisible(), 'Precálculo route shows MATE 1201');
    });
    await step('tapping blocks adds them to next semester; tapping again removes', async () => {
      assert.ok(await page.locator('.pblock.is-locked[data-key="IMEC1543"]').count(), 'Estática needs Precálculo in this route');
      for (const code of ['MATE1201', 'ISIS1221', 'IMEC1505', 'QUIM1103']) await page.click(`.pblock[data-key="${code}"]`);
      assert.equal(await page.locator('.pblock.is-selected').count(), 4);
      assert.ok(await page.locator('.side .tray-item >> text=QUIM 1104').count(), 'Química brings its corequisite QUIM 1104');
      await page.click('.pblock[data-key="QUIM1103"]');
      assert.equal(await page.locator('.pblock.is-selected').count(), 3);
      await shot(page, 'e2e-02-pensum.png');
    });
    await step('a group block offers its options', async () => {
      await page.click('.pblock[data-key^="grp:CPO1"]');
      assert.ok(await page.locator('#pensum-info >> text=IMEC 2203').isVisible());
      await page.keyboard.press('Escape');
    });
    await step('demo data loads from the search dialog', async () => {
      await page.click('.tray-bar [data-action="search:open"]');
      await page.click('[data-action="demo:load"]');
      await page.waitForSelector('.toast >> text=Datos demo cargados');
    });
    await step('generator finds conflict-free schedules and "Usar esta" keeps one', async () => {
      await page.click('.nav [data-view="horario"]');
      await page.click('#hz-toolbar [data-action="gen:run"]');
      await page.waitForSelector('#hz-genbar >> text=Opción 1 de');
      await shot(page, 'e2e-03-generator.png');
      await page.click('[data-action="gen:use"]');
      assert.ok(await page.locator('.cal-block').count() > 0);
    });
    await step('"¿Qué cabe aquí?" survives hovering its options (v7 bug)', async () => {
      const col = await page.$('.cal-col[data-di="0"]');
      const box = await col.boundingBox();
      await page.mouse.click(box.x + 20, box.y + 30);
      await page.waitForSelector('#slot-popup');
      const opt = await page.$('#slot-popup .menu-item');
      if (opt) { await opt.hover(); await page.waitForTimeout(150); assert.ok(await page.$('#slot-popup'), 'popup still open after hover'); }
      await page.keyboard.press('Escape');
    });
    await step('undo after "No incluir" brings the course back (v7 bug)', async () => {
      const card = page.locator('.course-card', { has: page.locator('text=Cálculo Diferencial') }).first();
      await card.hover();
      await card.locator('[data-action="course:skip"]').click();
      assert.ok(await card.locator('text=No incluida').isVisible());
      await page.click('#hz-toolbar [data-action="undo"]');
      const again = page.locator('.course-card', { has: page.locator('text=Cálculo Diferencial') }).first();
      assert.ok(!(await again.locator('text=No incluida').count()), 'course is included again');
    });
    await step('opening a course shows its combinations and previews them', async () => {
      await page.click('.course-card [data-action="course:focus"][data-key="MATE1203"]');
      await page.hover('.opt-row >> nth=1');
      await page.waitForTimeout(120);
      await shot(page, 'e2e-04-course.png');
      await page.click('[data-action="course:close"]');
    });
    await step('custom dialogs replace prompt(): rename a draft', async () => {
      await page.click('#hz-toolbar [data-action="draft:menu"]');
      await page.click('[data-action="draft:rename"]');
      await page.fill('[data-dialog-value]', 'Plan A');
      await page.keyboard.press('Enter');
      await page.waitForSelector('#hz-toolbar >> text=Plan A');
    });
    await step('Exportar lists the NRCs of the current schedule', async () => {
      await page.click('.nav [data-view="exportar"]');
      // Views change inside a View Transition, so wait for the new view to be in the DOM.
      await page.waitForSelector('#view-exportar:not([hidden]) td.font-mono');
      assert.ok(await page.locator('#view-exportar td.font-mono').count() > 0);
      await shot(page, 'e2e-05-exportar.png');
    });
    await step('state survives a reload', async () => {
      await page.reload();
      await page.click('.nav [data-view="horario"]');
      await page.waitForSelector('#hz-toolbar >> text=Plan A');
      await page.waitForSelector('#view-horario:not([hidden]) .cal-block');
    });

    const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    watch(p2);
    await p2.goto(base);
    await step('history: marking Física 2 also marks its prerequisite Física 1, not corequisites', async () => {
      await p2.click('.program-card[data-program="fisica"]');
      await p2.click('[data-action="pensum:mode"][data-mode="history"] >> nth=0');
      await p2.click('.pblock[data-key="FISI1528"]');
      await p2.waitForSelector('.toast >> text=FISI 1528 aprobada');
      const marked = await p2.$$eval('.pblock.is-marked', els => els.map(e => e.dataset.key).sort());
      assert.deepEqual(marked, ['FISI1518', 'FISI1528']);
    });
    await step('history: un-marking Física 1 also un-marks Física 2, and Deshacer restores both', async () => {
      await p2.click('.pblock[data-key="FISI1518"]');
      assert.equal(await p2.locator('.pblock.is-marked').count(), 0);
      await p2.locator('.toast', { hasText: 'sin marcar' }).locator('text=Deshacer').click();
      assert.equal(await p2.locator('.pblock.is-marked').count(), 2);
      for (const k of ['MATE1214', 'CCOM1100']) await p2.click(`.pblock[data-key="${k}"]`);
      await p2.click('.btn:has-text("Listo")');
    });
    await step('plan: passed courses are muted, locked ones show what is missing', async () => {
      assert.ok(await p2.locator('.pblock.is-passed[data-key="FISI1518"]').count());
      assert.ok(await p2.locator('.pblock.is-locked[data-key="MATE1207"]').count(), 'Cálculo Vectorial needs Álgebra Lineal');
      await p2.click('.pblock[data-key="FISI3515"]');
      await p2.waitForSelector('dialog[open] >> text=FISI 1548 · FISI 2507 · FISI 2605');
      await p2.click('dialog[open] [data-value=""]');
    });
    await step('plan: adding Física Moderna brings its corequisite Ondas y Fluidos', async () => {
      await p2.click('.pblock[data-key="FISI1548"]');
      await p2.waitForSelector('.toast >> text=correquisito FISI 1538');
      assert.ok(await p2.locator('.pblock.is-selected[data-key="FISI1538"]').count());
    });
    await step('"Sugerir mi semestre" fills up to the credit target in plan order', async () => {
      await p2.click('[data-action="pensum:suggest"]');
      await p2.waitForSelector('.toast >> text=Sugerimos');
      const total = await p2.$$eval('.side .tray-item', els => els.length);
      assert.ok(total >= 4);
      await shot(p2, 'e2e-07-plan-states.png');
    });

    const phone = await browser.newContext({ ...devices['iPhone 13'] });
    const pp = await phone.newPage(); watch(pp);
    await pp.goto(base);
    await step('phone: pensum in two columns with the bottom tab bar', async () => {
      await pp.click('.program-card[data-program="civil"]');
      assert.ok(await pp.locator('.tabbar').isVisible());
      assert.ok(!(await pp.locator('.rail').isVisible()));
      const widths = await pp.$$eval('.psem:first-child .pblock', els => els.map(e => Math.round(e.getBoundingClientRect().width)));
      assert.ok(widths.length >= 2 && widths[0] > 120, 'blocks fill two columns');
      const overflow = await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `no horizontal page scroll (overflow ${overflow}px)`);
      await shot(pp, 'e2e-06-phone.png');
    });
    assert.deepEqual(errors, [], 'no console errors');
    console.log(`\n${steps.length} steps passed, no console errors.`);
  } catch (e) {
    console.error('\n✗ ' + (e.message || e));
    if (errors.length) console.error('console errors:\n' + errors.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
