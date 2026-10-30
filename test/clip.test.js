const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  await page.evaluate(() => {
    const C = BMSCore; BMSApp.loadDoc(C.parse(new TextEncoder().encode('#TITLE x\r\n#WAV01 a.wav\r\n#00111:0101\r\n#00113:00000001\r\n#00101:0001\r\n')), 'x.bme');
  });
  const pt = async (lane, beat, dy = -3) => page.evaluate(([lane, beat, dy]) => {
    const A = BMSApp.A, l = A.laneMap.get(lane), r = A.sc.getBoundingClientRect();
    return { x: r.left + l.x - A.view.left + l.w / 2, y: r.top + A.H - (beat - A.view.bottom) * A.ppb + dy };
  }, [lane, beat, dy]);
  // 범위 선택 → Ctrl+C → 마디 3 위에서 Ctrl+V
  let a = await pt('K11', 8.5, 0), b = await pt('B0', 3.8, 0);
  await page.mouse.move(a.x - 30, a.y); await page.mouse.down(); await page.mouse.move(b.x + 10, b.y, { steps: 5 }); await page.mouse.up();
  const sel = await page.evaluate(() => BMSApp.A.sel.size);
  await page.keyboard.press('Control+c');
  const clip = await page.evaluate(() => BMSApp.A.clip && BMSApp.A.clip.text);
  const p = await pt('K15', 13.0); await page.mouse.move(p.x, p.y);
  await page.keyboard.press('Control+v');
  const res = await page.evaluate(() => BMSApp.A.st.notes.map((n) => [n.lane, n.b]).sort((x, y) => x[1] - y[1]));
  // 헤더 입력 중 Ctrl+S → 입력값이 먼저 반영되는지
  await page.fill('#h_TITLE', 'typed-but-not-entered');
  await page.evaluate(() => { BMSApp.cfg.confirmSave = true; });
  await page.keyboard.press('Control+s');
  await page.waitForSelector('#modal:not([hidden])');
  const dlgHasTitle = await page.evaluate(() => document.querySelector('.diff').textContent.includes('typed-but-not-entered'));
  await page.keyboard.press('Escape');
  // BMSE 방식(LongNote 플래그 True/False) 붙여넣기
  await page.evaluate(() => { BMSApp.A.hover = null; BMSApp.setBottom(20); BMSApp.pasteText('iBMSC Clipboard Data\r\n6 0 10000 True False False\r\n6 96 10000 True False False\r\n7 48 10000 False True False'); });
  const ln = await page.evaluate(() => [...BMSApp.A.sel].map((n) => [n.lane, n.b, n.lb]));
  console.log(JSON.stringify({ sel, clip, afterPaste: res, dlgHasTitle, bmseLN: ln, errors }));
  await browser.close();
})();
