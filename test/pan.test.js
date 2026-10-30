const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1300, height: 760 } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  const b64 = fs.readFileSync(path.join(__dirname, 'sample.bme')).toString('base64');
  await page.evaluate((b64) => BMSApp.loadDoc(BMSCore.parse(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))), 's.bme'), b64);
  await page.evaluate(() => BMSApp.setBottom(10));
  const before = await page.evaluate(() => ({ b: BMSApp.A.view.bottom, l: BMSApp.A.view.left, n: BMSApp.A.st.notes.length }));
  await page.mouse.move(700, 400); await page.mouse.down({ button: 'middle' }); await page.mouse.move(600, 496, { steps: 8 }); await page.mouse.up({ button: 'middle' });
  const after = await page.evaluate(() => ({ b: BMSApp.A.view.bottom, l: BMSApp.A.view.left, n: BMSApp.A.st.notes.length, dirty: BMSApp.A.dirty }));
  console.log(JSON.stringify({ before, after, errs }));
  await b.close();
})();
