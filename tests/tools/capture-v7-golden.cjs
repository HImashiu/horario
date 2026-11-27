// Runs the ORIGINAL v7 app (index.html from the base commit) with its demo data and records
// pairing, combos and generator output, so the ported modules can be checked against it.
// Usage: node tests/tools/capture-v7-golden.cjs <path-to-v7-index.html> <out.json>
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const [htmlPath, outPath] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto('file://' + path.resolve(htmlPath));
  const golden = await page.evaluate(() => {
    localStorage.clear();
    loadSampleData();
    const codes = [...new Set(cleanedCourses.map(c => c.code))].sort();
    const info = {};
    codes.forEach(code => {
      const i = courseInfo(code);
      info[code] = { secs: i.secs.length, mags: i.mags.map(s => s.id), comps: i.comps.map(s => s.id), linked: i.linked,
        parent: Object.fromEntries([...i.parent.entries()]), combos: i.combos.map(c => c.map(s => s.id)) };
    });
    const rules = getRules();
    runGenerator();
    const gen = ui.gen;
    return { rules, creditTarget: document.getElementById('credit-target').value, sectionIds: cleanedCourses.map(s => s.id), info,
      generator: { count: gen.results.length, truncated: gen.truncated, all: gen.results.map(r => ({ ids: r.ids.slice().sort(), score: r.score, days: r.days, end: r.end })) } };
  });
  fs.writeFileSync(outPath, JSON.stringify(golden, null, 1));
  console.log(`codes: ${Object.keys(golden.info).join(', ')}; generator results: ${golden.generator.count}; top score ${golden.generator.all[0]?.score}`);
  await browser.close();
})();
