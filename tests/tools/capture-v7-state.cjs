// Builds a schedule in the ORIGINAL v7 app and saves its localStorage state as a fixture,
// so the v7 → v8 migration is tested against real saved data.
// Usage: node tests/tools/capture-v7-state.cjs <path-to-v7-index.html> <out.json>
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const [htmlPath, outPath] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto('file://' + path.resolve(htmlPath));
  const raw = await page.evaluate(() => {
    localStorage.clear();
    loadSampleData();
    selectPensumMajor('imec');                         // v7 pensum preference
    runGenerator(); useGenerator();                    // a full schedule in "Horario 1"
    toggleLock('MATE1203');
    duplicateDraft(currentDraftId);                    // a second draft
    renameDraft = () => {};                            // (no prompts)
    toggleSkip('QUIM1103');                            // skipped in the copy
    document.getElementById('rule-no-late-hour').value = '16'; rulesChanged();
    return localStorage.getItem(STORAGE_KEY);
  });
  fs.writeFileSync(outPath, JSON.stringify(JSON.parse(raw), null, 1));
  const st = JSON.parse(raw);
  console.log(`v${st.v}: ${st.cleanedCourses.length} sections, ${st.basket.length} basket items, ${st.drafts.length} drafts`);
  await browser.close();
})();
