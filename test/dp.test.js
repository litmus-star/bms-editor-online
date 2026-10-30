const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1500, height: 820 } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  await page.evaluate(() => {
    const L = ['#PLAYER 3', '#BPM 150', '#LNTYPE 1', '#WAV01 a.wav', '#WAV02 b.wav', '#BMP01 bg.png', '#BMP02 layer.png',
      '#00111:0102', '#00121:01', '#00126:01', '#00161:0100', '#00261:0100', '#00131:0001', '#001D2:00ZZ', '#00104:01', '#00107:0002', '#00106:01', '#00101:00000202'];
    BMSApp.loadDoc(BMSCore.parse(new TextEncoder().encode(L.join('\r\n') + '\r\n')), 'dp.bme');
  });
  const lay = await page.evaluate(() => ({ dp: BMSApp.A.dp, fixW: BMSApp.A.fixW, keys: BMSApp.A.keyCount, lanes: BMSApp.A.lanes.map((l) => l.key).join(' ') }));
  const pt = (lane, beat, dy = -3) => page.evaluate(([lane, beat, dy]) => { const A = BMSApp.A, l = A.laneMap.get(lane), r = A.sc.getBoundingClientRect(); const x = (l.type === 'bgm' || l.type === 'bga') ? l.x - A.view.left : l.x; return { x: r.left + x + l.w / 2, y: r.top + A.H - (beat - A.view.bottom) * A.ppb + dy }; }, [lane, beat, dy]);
  const drag = async (a, c) => { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(c.x, c.y, { steps: 8 }); await page.mouse.up(); };
  const notes = () => page.evaluate(() => BMSApp.A.st.notes.filter((n) => n.lane[0] !== 'X').map((n) => n.lane + '@' + n.b + (n.kind ? n.kind : '') + (n.lb ? 'L' + n.lb : '') + '=' + n.v).sort());
  // 1P 노트(K11@4)를 2P 3번 레인으로
  await drag(await pt('K11', 4), await pt('K23', 4));
  // BGA 노트를 BGM 레인으로 끌어도 BGA 그룹 안에 머묾 → LAYER로
  await drag(await pt('G04', 4), await pt('B0', 4));
  // 숨김 노트(K11@6 h)를 BGM으로 끌어도 키 레인 안에 머묾
  await drag(await pt('K11', 6), await pt('B2', 6));
  // 쓰기: 숨김, 지뢰, BGA
  await page.keyboard.press('F3');
  await page.selectOption('#kindSel', 'h'); let p = await pt('K24', 8); await page.mouse.click(p.x, p.y);
  await page.selectOption('#kindSel', 'm'); await page.fill('#mineVal', 'Z0'); await page.press('#mineVal', 'Enter'); p = await pt('K26', 8); await page.mouse.click(p.x, p.y);
  await page.selectOption('#kindSel', 'n');
  await page.click('#pnBmp summary'); await page.click('#bmpList .wr[data-id="2"]');
  p = await pt('G06', 9); await page.mouse.click(p.x, p.y);
  await page.keyboard.press('F1');
  const after = await notes();
  const ser = await page.evaluate(() => { const r = BMSApp.serialize(); return { ok: r.verify.ok, p: r.verify.problems, diff: r.diff.map((d) => d.op + d.t) }; });
  await page.evaluate(() => BMSApp.setBottom(3));
  await page.screenshot({ path: path.join(__dirname, 'shot-8-dp.png') });
  await page.click('#bDP');
  const sp = await page.evaluate(() => ({ dp: BMSApp.A.dp, info: document.querySelector('#infoBd').textContent.includes('2P 노트가 있지만') }));
  console.log(JSON.stringify({ lay, after, ser, sp, errs }, null, 0));
  await b.close();
})();
