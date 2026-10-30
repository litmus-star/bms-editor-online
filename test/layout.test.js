// 화면 배치 옵션: SP 스크래치 오른쪽, BGA 영역·BPM/STOP 영역 보이기/숨기기.
// 레인 순서·플레이 영역 폭, 숨긴 레인 선택 해제, 저장 바이트 불변, 숨긴 상태에서 '플레이 영역 끌기는 세로로만'이 맞는지 확인
// 실행: node test/layout.test.js (playwright 필요)
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 700, height: 700 }, hasTouch: true });
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  const b64 = fs.readFileSync(path.join(__dirname, 'sample.bme')).toString('base64');
  await page.evaluate((b64) => { window.__src = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); BMSApp.loadDoc(BMSCore.parse(window.__src), 's.bme'); }, b64);
  const st = () => page.evaluate(() => ({ keys: BMSApp.A.lanes.filter((l) => l.type === 'key').map((l) => l.label).join(','), types: [...new Set(BMSApp.A.lanes.map((l) => l.type))].join(','), fixW: BMSApp.A.fixW }));
  const toggle = (id) => page.evaluate((id) => { const el = document.getElementById(id); el.checked = !el.checked; el.dispatchEvent(new Event('change')); }, id);
  const out = { start: await st() };
  await toggle('oScRight'); out.scRight = await st();
  await page.evaluate(() => { const A = BMSApp.A; A.sel = new Set(A.st.notes.filter((n) => n.lane[0] === 'G' || n.lane === 'BPM').slice(0, 5)); });
  const selBefore = await page.evaluate(() => BMSApp.A.sel.size);
  await toggle('oHideBga'); await toggle('oHideBpm'); out.hidden = await st();
  out.selAfterHide = [selBefore, await page.evaluate(() => BMSApp.A.sel.size)];
  out.identical = await page.evaluate(() => { const s = new Uint8Array(BMSApp.serialize().bytes); return s.length === window.__src.length && s.every((v, i) => v === window.__src[i]); });
  // 숨긴 상태에서 플레이 영역 끌기는 세로로만, BGM 영역 끌기는 가로도
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  const fixW = out.hidden.fixW;
  const diag = async (x) => { await page.evaluate(() => { BMSApp.A.view.left = 0; BMSApp.setBottom(400); }); await T('touchStart', [[x, 300]]); for (let i = 1; i <= 6; i++) { await T('touchMove', [[x - i * 25, 300 + i * 20]]); await page.waitForTimeout(8); } await T('touchEnd', []); await page.waitForTimeout(4500); return page.evaluate(() => BMSApp.A.view.left); };
  const l0 = await page.evaluate(() => Math.max(0, BMSApp.A.sc.scrollWidth - BMSApp.A.sc.clientWidth));
  out.dragLeft = { maxLeft: l0, play: await diag(fixW - 30), bgm: await diag(fixW + 100) }; out.dirty = await page.evaluate(() => BMSApp.A.dirty);
  await toggle('oScRight'); await toggle('oHideBga'); await toggle('oHideBpm'); out.back = await st();
  await page.screenshot({ path: path.join(__dirname, 'layout.png') });
  out.errs = errs;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
