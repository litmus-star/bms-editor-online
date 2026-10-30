const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const page = await b.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const html = fs.readFileSync(path.resolve(__dirname, '../dist/index.html'), 'utf8');
  await page.setContent(`<iframe id=f sandbox="allow-scripts allow-modals allow-downloads" style="width:1200px;height:800px"></iframe>`);
  await page.$eval('#f', (f, h) => { f.srcdoc = h; }, html);
  await page.waitForTimeout(800);
  const fr = page.frames()[1];
  await fr.click('#eOpen');
  await fr.waitForSelector('#modal:not([hidden])');
  console.log('modal:', await fr.$eval('#mTitle', (e) => e.textContent), '| buttons:', await fr.$$eval('#mBtns button', (bs) => bs.map((x) => x.textContent)));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), fr.click('#mBtns button:nth-child(2)')]);
  const dir = path.resolve(__dirname); 
  await chooser.setFiles([path.join(dir, 'sample.bme')]);
  await page.waitForTimeout(500);
  console.log('loaded:', await fr.evaluate(() => BMSApp.A.fileName + ' notes ' + BMSApp.A.st.notes.length), 'errors', errs);
  await b.close();
})();
