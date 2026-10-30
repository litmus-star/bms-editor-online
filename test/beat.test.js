const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  const b64 = fs.readFileSync(path.join(__dirname, 'sample.bme')).toString('base64');
  await page.evaluate((b64) => BMSApp.loadDoc(BMSCore.parse(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))), 'song_7a.bme'), b64);
  const abs = () => page.evaluate(() => { // BGA와 블록 안 노트의 절대 박 위치
    const A = BMSApp.A;
    return { bga: A.st.notes.filter((n) => n.lane === 'G04').map((n) => n.b), ghosts: A.ghosts.map((g) => g.lane + '@' + g.b).sort(), block: A.st.blocks[0] };
  });
  const before = await abs();
  await page.click('#pnBeat summary');
  await page.click('#beatList .br[data-m="2"]');
  await page.fill('#bN', '5'); await page.fill('#bD', '8');
  await page.click('#bApply');
  const after = await abs();
  const ser = await page.evaluate(() => { const r = BMSApp.serialize(); return { ok: r.verify.ok, problems: r.verify.problems, diff: r.diff.map((d) => d.op + d.t) }; });
  await page.keyboard.press('Control+z');
  const undone = await abs();
  console.log(JSON.stringify({ before, after, sameBeats: JSON.stringify(before.bga) === JSON.stringify(after.bga) && JSON.stringify(before.ghosts) === JSON.stringify(after.ghosts), blockChanged: before.block !== after.block, undoRestores: undone.block === before.block, ser, errors }, null, 1));
  await page.keyboard.press('Control+y');
  await page.evaluate(() => BMSApp.setBottom(0));
  await page.screenshot({ path: path.join(__dirname, 'shot-6-final.png') });
  await browser.close();
})();
