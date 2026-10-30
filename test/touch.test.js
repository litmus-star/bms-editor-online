// 터치 조작: 화면 이동·노트 이동·길게 누르기 메뉴·핀치·범위 선택·쓰기 탭·펜 편집·펜 쓴 뒤 손가락 편집·펜 누르는 중 손바닥 무시
// 실행: node test/touch.test.js (playwright 필요)
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 }, hasTouch: true });
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  const b64 = fs.readFileSync(path.join(__dirname, 'sample.bme')).toString('base64');
  await page.evaluate((b64) => BMSApp.loadDoc(BMSCore.parse(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))), 's.bme'), b64);
  await page.evaluate(() => BMSApp.setBottom(0));
  const out = {};
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  const wait = (ms) => page.waitForTimeout(ms);
  const noteXY = () => page.evaluate(() => {
    const A = BMSApp.A, r = A.sc.getBoundingClientRect();
    const n = A.st.notes.find((n) => /^K1[1-5]$/.test(n.lane) && n.b > A.view.bottom + 0.5 && (n.b - A.view.bottom) * A.ppb < A.H - 80 && !n.lb);
    const l = A.laneMap.get(n.lane);
    return { lane: n.lane, b: n.b, x: r.left + l.x + l.w / 2, y: r.top + A.H - (n.b - A.view.bottom) * A.ppb - 3 };
  });
  out.side = await page.evaluate(() => document.body.classList.contains('side-off'));
  // 1. 빈 곳 손가락 끌기 = 화면 이동
  let s0 = await page.evaluate(() => BMSApp.A.view.bottom);
  await T('touchStart', [[300, 300]]); for (let i = 1; i <= 6; i++) { await T('touchMove', [[300, 300 + i * 20]]); } await T('touchEnd', []);
  out.pan = { before: s0, after: await page.evaluate(() => BMSApp.A.view.bottom), notes: await page.evaluate(() => BMSApp.A.st.notes.length) };
  await page.waitForTimeout(5000); await page.evaluate(() => BMSApp.setBottom(0));
  // 2. 노트 손가락 끌기 = 이동 (옆으로)
  const n = await noteXY(); out.note = n;
  const cnt0 = await page.evaluate(() => BMSApp.A.st.notes.length);
  await T('touchStart', [[n.x, n.y]]); for (let i = 1; i <= 5; i++) { await T('touchMove', [[n.x + i * 14, n.y + 2]]); } await T('touchEnd', []);
  out.move = await page.evaluate((n) => ({ dirty: BMSApp.A.dirty, at: BMSApp.A.st.notes.filter((x) => Math.abs(x.b - n.b) < 1e-6).map((x) => x.lane), sel: BMSApp.A.sel.size, bar: !document.getElementById('selBar').hidden, cnt: BMSApp.A.st.notes.length }), n);
  out.moveCountSame = out.move.cnt === cnt0;
  // 3. 길게 누르기 노트 = 메뉴
  const n2 = await noteXY();
  await T('touchStart', [[n2.x, n2.y]]); await wait(650);
  out.ctx = await page.evaluate(() => [...document.querySelectorAll('#ctxMenu button')].map((b) => b.textContent).join('|') + ' hidden=' + document.getElementById('ctxMenu').hidden);
  await T('touchEnd', []);
  out.ctxAfterUp = await page.evaluate(() => document.getElementById('ctxMenu').hidden);
  await page.click('#ctxMenu button:first-child'); // 삭제
  out.afterDel = await page.evaluate(() => BMSApp.A.st.notes.length);
  // 4. 핀치 (세로 벌리기)
  const z0 = await page.evaluate(() => BMSApp.cfg.zoom);
  await T('touchStart', [[400, 300], [400, 400]]); for (let i = 1; i <= 5; i++) await T('touchMove', [[400, 300 - i * 10], [400, 400 + i * 10]]); await T('touchEnd', []);
  out.pinch = { z0, z1: await page.evaluate(() => BMSApp.cfg.zoom), zx: await page.evaluate(() => BMSApp.cfg.zoomX) };
  // 5. 길게 누른 뒤 끌기 = 범위 선택
  await page.evaluate(() => { BMSApp.A.sel = new Set(); });
  await page.waitForTimeout(1500); await page.evaluate(() => BMSApp.setBottom(0)); const n3 = await noteXY(); await T('touchStart', [[n3.x - 20, n3.y + 40]]); await wait(650); out.lp = await page.evaluate(() => BMSApp.A.drag && JSON.stringify(BMSApp.A.drag, (k,v)=> v instanceof Set ? v.size : v)); for (let i = 1; i <= 6; i++) await T('touchMove', [[n3.x - 20 + i * 8, n3.y + 40 - i * 15]]); await T('touchEnd', []);
  out.band = await page.evaluate(() => BMSApp.A.sel.size);
  out.bandDbg = await page.evaluate(() => ({ bottom: BMSApp.A.view.bottom, ppb: BMSApp.A.ppb, mode: BMSApp.A.mode, pen: BMSApp.A.penMode, drag: BMSApp.A.drag && BMSApp.A.drag.kind }));
  // 6. 쓰기 모드 탭 = 노트 찍기
  await page.evaluate(() => BMSApp.setMode('write'));
  const c1 = await page.evaluate(() => BMSApp.A.st.notes.length);
  await T('touchStart', [[n.x, 200]]); await T('touchEnd', []);
  out.tapWrite = (await page.evaluate(() => BMSApp.A.st.notes.length)) - c1;
  // 7. 펜: 펜으로 끌면 편집, 그 후 손가락은 화면 이동만
  await page.evaluate(() => BMSApp.setMode('select'));
  await page.evaluate(() => BMSApp.setBottom(0));
  const p = await noteXY();
  const P = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen' });
  await P('mousePressed', p.x, p.y); for (let i = 1; i <= 5; i++) await P('mouseMoved', p.x + i * 14, p.y); await P('mouseReleased', p.x + 70, p.y);
  out.pen = await page.evaluate((p) => ({ penMode: BMSApp.A.penMode, at: BMSApp.A.st.notes.filter((x) => Math.abs(x.b - p.b) < 1e-6).map((x) => x.lane) }), p);
  // 펜을 쓴 뒤에도 손가락으로 노트를 옮길 수 있어야 함
  const q = await noteXY();
  await T('touchStart', [[q.x, q.y]]); for (let i = 1; i <= 5; i++) await T('touchMove', [[q.x + i * 14, q.y + 1]]); await T('touchEnd', []);
  out.fingerAfterPen = await page.evaluate((q) => BMSApp.A.st.notes.filter((x) => Math.abs(x.b - q.b) < 1e-6).map((x) => x.lane), q);
  out.fingerAfterPenFrom = q.lane;
  // 펜이 닿아 있는 동안 손가락은 무시
  await page.evaluate(() => BMSApp.setBottom(0));
  const r = await noteXY();
  const sig = await page.evaluate(() => BMSApp.A.st.notes.map((n) => n.lane + n.b).join() + '|' + BMSApp.A.view.bottom);
  await P('mousePressed', 700, 300);
  await T('touchStart', [[r.x, r.y]]); for (let i = 1; i <= 5; i++) await T('touchMove', [[r.x + i * 14, r.y + i * 20]]); await T('touchEnd', []);
  await P('mouseReleased', 700, 300);
  await page.waitForTimeout(300);
  out.palmIgnored = sig === await page.evaluate(() => BMSApp.A.st.notes.map((n) => n.lane + n.b).join() + '|' + BMSApp.A.view.bottom);
  // 8. 마우스는 여전히 동작 (빈 곳 클릭 → 선택 해제, 가운데 버튼 팬)
  const b1 = await page.evaluate(() => BMSApp.A.view.bottom);
  await page.mouse.move(500, 300); await page.mouse.down({ button: 'middle' }); await page.mouse.move(500, 380, { steps: 5 }); await page.mouse.up({ button: 'middle' });
  out.mousePan = [b1, await page.evaluate(() => BMSApp.A.view.bottom)];
  await page.screenshot({ path: 'touch.png' });
  out.errs = errs;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
