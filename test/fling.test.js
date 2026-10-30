// 관성 스크롤: 손가락으로 빠르게 끌고 놓으면 계속 미끄러지다 멈추는지, 미끄러지는 중 탭은 멈추기만 하는지,
// 끌다가 멈춘 뒤 놓으면 미끄러지지 않는지 확인. 실행: node test/fling.test.js (playwright 필요)
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 }, hasTouch: true });
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  const b64 = fs.readFileSync(path.join(__dirname, 'sample.bme')).toString('base64');
  await page.evaluate((b64) => BMSApp.loadDoc(BMSCore.parse(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))), 's.bme'), b64);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  const bottom = () => page.evaluate(() => BMSApp.A.view.bottom);
  const swipe = async (x, y0, dy, steps, gap) => { await T('touchStart', [[x, y0]]); for (let i = 1; i <= steps; i++) { await T('touchMove', [[x, y0 + dy * i / steps]]); await page.waitForTimeout(gap); } };
  const out = {};
  // 1) 빠르게 아래로 쓸고 놓기 → 놓은 뒤에도 계속 움직임
  await page.evaluate(() => BMSApp.setBottom(0));
  await swipe(300, 150, 300, 6, 8);
  const atUp = await bottom(); await T('touchEnd', []);
  await page.waitForTimeout(150); const mid = await bottom();
  await page.waitForTimeout(2500); const end = await bottom();
  await page.waitForTimeout(300); const end2 = await bottom();
  out.fling = { atUp, mid, end, stopped: end === end2, moreAfterUp: end > atUp };
  // 2) 미끄러지는 중 탭 → 멈추고, 쓰기 모드라도 노트를 찍지 않음
  await page.evaluate(() => { BMSApp.setBottom(0); BMSApp.setMode('write'); });
  const n0 = await page.evaluate(() => BMSApp.A.st.notes.length);
  await swipe(300, 150, 300, 6, 8); await T('touchEnd', []);
  await page.waitForTimeout(100);
  await T('touchStart', [[300, 400]]); const atTap = await bottom(); await T('touchEnd', []);
  await page.waitForTimeout(400);
  out.tapStop = { stopped: Math.abs((await bottom()) - atTap) < 1e-6, placed: (await page.evaluate(() => BMSApp.A.st.notes.length)) - n0 };
  // 3) 끌다가 멈춘 뒤 놓기 → 미끄러지지 않음
  await page.evaluate(() => { BMSApp.setBottom(0); BMSApp.setMode('select'); });
  await swipe(300, 150, 300, 6, 8); await page.waitForTimeout(200);
  const held = await bottom(); await T('touchEnd', []); await page.waitForTimeout(400);
  out.holdRelease = { moved: (await bottom()) - held };
  // 4) 위로 쓸어서 곡 시작(0)에 닿으면 멈춤 (음수로 가지 않음)
  await page.evaluate(() => BMSApp.setBottom(1));
  await swipe(300, 500, -300, 6, 8); await T('touchEnd', []); await page.waitForTimeout(1500);
  out.clampBottom = await bottom();
  out.errs = errs;
  console.log(JSON.stringify(out));
  await b.close();
})();
