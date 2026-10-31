// 우클릭 메뉴: 노트 메뉴 항목 · 삭제 · 선택 전체 적용 · 노트 종류 바꾸기 · 롱노트 풀기 · WAV 목록에서 보기,
// 빈 곳 메뉴(여기에 붙여넣기 · 모두 선택), 더블클릭으로 값 바꾸기 창이 안 뜨는지, 손가락 길게 누르기도 같은 메뉴인지
// 실행: node test/ctxmenu.test.js (playwright 필요)
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 800 }, hasTouch: true });
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  const bms = ['#PLAYER 1', '#BPM 120', '#WAV01 a.wav', '#WAV02 b.wav', '#WAV05 e.wav', '',
    '#00111:01000000', '#00112:00020000', '#00113:00000100', '#00114:00000002', '#00155:0505', ''].join('\r\n');
  await page.evaluate((t) => { BMSApp.loadDoc(BMSCore.parse(new TextEncoder().encode(t)), 'c.bme'); BMSApp.setBottom(0); }, bms);
  const xy = (lane, beat) => page.evaluate(({ lane, beat }) => { const A = BMSApp.A, r = A.sc.getBoundingClientRect(), l = A.laneMap.get(lane);
    return { x: r.left + l.x + l.w / 2, y: r.top + A.H - (beat - A.view.bottom) * A.ppb - 3 }; }, { lane, beat });
  const items = () => page.evaluate(() => document.getElementById('ctxMenu').hidden ? null : [...document.querySelectorAll('#ctxMenu button')].map((x) => x.textContent.replace(/(Ctrl\+.|Del)$/, '') + (x.classList.contains('on') ? '✓' : '') + (x.disabled ? '(off)' : '')));
  const click = (label) => page.evaluate((label) => { const bt = [...document.querySelectorAll('#ctxMenu button')].find((x) => x.textContent.startsWith(label)); bt.click(); }, label);
  const notes = () => page.evaluate(() => BMSApp.A.st.notes.filter((n) => n.lane[0] === 'K').map((n) => n.lane + '@' + n.b + (n.kind || '') + (n.lb ? 'L' + n.lb : '') + ':' + n.v).sort().join(' '));
  const txt = () => page.evaluate(() => new TextDecoder().decode(BMSApp.serialize().bytes));
  const out = {};
  let p = await xy('K11', 4); await page.mouse.click(p.x, p.y, { button: 'right' });
  out.noteMenu = await items(); out.selAfterRight = await page.evaluate(() => BMSApp.A.sel.size);
  await click('WAV 목록에서 보기'); out.wavView = await page.evaluate(() => ({ cur: BMSApp.A.curWav, sideOff: document.body.classList.contains('side-off'), open: document.getElementById('pnWav').open }));
  // Shift+우클릭: 메뉴 없이 키음 목록 이동
  await page.evaluate(() => { BMSApp.A.curWav = 1; });
  p = await xy('K14', 7); await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y, { button: 'right' }); await page.keyboard.up('Shift');
  out.shiftRight = { menu: await items(), cur: await page.evaluate(() => BMSApp.A.curWav), row: await page.evaluate(() => !!document.querySelector('#wavList .wr.cur[data-id="2"]')) };
  // 노트 종류 바꾸기: 버튼 2의 노트를 숨김으로 → 채널 32
  p = await xy('K12', 5); await page.mouse.click(p.x, p.y, { button: 'right' }); await click('숨김 노트');
  out.hidden = (await txt()).match(/#00132:[0-9A-Z]+/)?.[0] + ' / ' + ((await txt()).match(/#00112:[0-9A-Z]+/)?.[0] || '(12 없음)');
  // 롱노트 풀기 (채널 51의 롱노트 → 11)
  p = await xy('K15', 4.5); await page.mouse.click(p.x, p.y, { button: 'right' }); out.lnMenu = await items();
  await click('롱노트 풀기'); out.unLN = (await txt()).match(/#00115:[0-9A-Z]+/)?.[0] + ' / 55: ' + ((await txt()).match(/#00155:[0-9A-Z]+/)?.[0] || '없음');
  // 여러 개 선택 후 선택된 노트를 우클릭 → 개수 표시, 삭제
  await page.evaluate(() => { const A = BMSApp.A; A.sel = new Set(A.st.notes.filter((n) => n.lane === 'K13' || n.lane === 'K14')); });
  p = await xy('K13', 6); await page.mouse.click(p.x, p.y, { button: 'right' }); out.multiMenu = (await items()).slice(1, 4);
  await click('복사'); 
  // 빈 곳 우클릭 → 여기에 붙여넣기 (마디 2)
  p = await xy('K15', 9); await page.mouse.click(p.x, p.y, { button: 'right' }); out.blankMenu = await items();
  await click('여기에 붙여넣기'); await page.waitForTimeout(300);
  out.pasted = await page.evaluate(() => BMSApp.A.st.notes.filter((n) => (n.lane === 'K13' || n.lane === 'K14') && n.b >= 8).map((n) => n.lane + '@' + n.b).join(' '));
  p = await xy('K15', 9); await page.mouse.click(p.x, p.y, { button: 'right' }); await click('모두 선택'); out.selectAll = await page.evaluate(() => BMSApp.A.sel.size);
    // 손가락 길게 누르기 → 같은 메뉴
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  await page.evaluate(() => { BMSApp.A.sel = new Set(); });
  // 실제 손가락처럼 몇 px씩 흔들리면서 길게 눌러도 메뉴가 떠야 하고, 노트는 움직이지 않아야 함
  p = await xy('K11', 4); const before = await notes();
  await T('touchStart', [[p.x, p.y]]);
  for (const [dx, dy] of [[3, 1], [-2, 4], [5, -3], [1, 2], [-4, -1]]) { await page.waitForTimeout(100); await T('touchMove', [[p.x + dx, p.y + dy]]); }
  await page.waitForTimeout(250); out.touchMenu = await items(); await T('touchEnd', []);
  out.touchJitterNoMove = before === await notes();
  await page.evaluate(() => { document.getElementById('ctxMenu').hidden = true; BMSApp.A.sel = new Set(); });
  p = await xy('K13', 6); await page.mouse.click(p.x, p.y, { button: 'right' }); await click('삭제'); out.afterDelete = await notes();
  // 더블클릭: 값 바꾸기 창이 안 떠야 함
  p = await xy('K11', 4); await page.mouse.dblclick(p.x, p.y); out.dblModal = await page.evaluate(() => !document.getElementById('modal').hidden);
  // Esc로 메뉴 닫기
  await page.mouse.click(p.x, p.y, { button: 'right' }); await page.keyboard.press('Escape'); out.escClosed = (await items()) === null;
  out.errs = errs;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
