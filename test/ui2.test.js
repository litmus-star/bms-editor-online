const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 860 }, acceptDownloads: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  // ── 큰 차트 반응 속도 ──
  const perf = await page.evaluate(() => {
    const C = BMSCore, L = ['#TITLE big', '#BPM 175'];
    for (let i = 1; i <= 1295; i++) L.push('#WAV' + C.idStr(i, 36) + ' k' + i + '.wav');
    let id = 1;
    for (let m = 1; m <= 400; m++) {
      for (let lane = 0; lane < 24; lane++) { let s = ''; for (let k = 0; k < 16; k++) s += (k + lane) % 3 === 0 ? C.idStr((id++ % 1295) + 1, 36) : '00'; L.push(`#${C.pad3(m)}01:${s}`); }
      for (const ch of ['11', '12', '13', '14', '15', '16', '18', '19']) { let s = ''; for (let k = 0; k < 16; k++) s += (k % 4 === +ch[1] % 4) ? C.idStr((id++ % 1295) + 1, 36) : '00'; L.push(`#${C.pad3(m)}${ch}:${s}`); }
    }
    const bytes = new TextEncoder().encode(L.join('\r\n'));
    let t = performance.now(); BMSApp.loadDoc(C.parse(bytes), 'big.bme'); const load = performance.now() - t;
    BMSApp.setBottom(400);
    t = performance.now(); const A = BMSApp.A; const n = A.st.notes.find((x) => x.lane === 'B3' && x.b > 400);
    BMSApp.commit({ del: [n], add: [C.finalizeNote({ lane: 'K12', pos: n.pos, v: n.v })] }); const commit = performance.now() - t;
    return { notes: A.st.notes.length, load: Math.round(load), commit: Math.round(commit) };
  });
  const frame = await page.evaluate(() => new Promise((res) => { const t = performance.now(); let k = 0; const f = () => { BMSApp.setBottom(400 + k); if (++k < 30) requestAnimationFrame(f); else res(Math.round((performance.now() - t) / 30)); }; requestAnimationFrame(f); }));
  console.log('big chart', JSON.stringify(perf), 'avg frame while scrolling', frame + 'ms');

  // ── 새 파일 → 노트 찍기 → BPM 입력 → 다른 이름으로 저장 ──
  await page.click('#bNew');
  if (await page.isVisible('#modal')) await page.click('#mBtns button:last-child'); // 버리고 계속
  const pt = async (lane, beat, dy = -3) => page.evaluate(([lane, beat, dy]) => {
    const A = BMSApp.A, l = A.laneMap.get(lane), r = A.sc.getBoundingClientRect();
    return { x: r.left + l.x - A.view.left + l.w / 2, y: r.top + A.H - (beat - A.view.bottom) * A.ppb + dy };
  }, [lane, beat, dy]);
  await page.evaluate(() => { BMSApp.A.st.wavs.set(1, 'a.wav'); BMSApp.setBottom(0); });
  await page.keyboard.press('F3');
  for (const [lane, b] of [['K11', 4], ['K13', 4.5], ['K15', 5], ['K16', 6]]) { const p = await pt(lane, b); await page.mouse.click(p.x, p.y); }
  let p = await pt('BPM', 8);
  await page.mouse.click(p.x, p.y);
  await page.waitForSelector('#modal:not([hidden])');
  await page.fill('#ptIn', '200.5'); await page.keyboard.press('Enter');
  p = await pt('STOP', 9); await page.mouse.click(p.x, p.y);
  await page.waitForSelector('#modal:not([hidden])'); await page.keyboard.press('Enter');
  // ── 선택 모드: Ctrl+드래그 복사, LN 손잡이로 길이 바꾸기, 더블클릭으로 값 바꾸기 ──
  await page.keyboard.press('F1');
  p = await pt('K11', 4); let q = await pt('K11', 12);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.keyboard.down('Control'); await page.mouse.move(q.x, q.y, { steps: 6 }); await page.mouse.up(); await page.keyboard.up('Control');
  await page.keyboard.press('F3');
  p = await pt('K13', 4.5); q = await pt('K13', 6.5, 0);   // 기존 노트 집어서 위로 → 롱노트
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 6 }); await page.mouse.up();
  await page.keyboard.press('F1');
  p = await pt('K13', 6.5, -3); q = await pt('K13', 7.5, -3); // 롱노트 윗끝 손잡이
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 6 }); await page.mouse.up();
  p = await pt('K15', 5);
  await page.mouse.dblclick(p.x, p.y);
  await page.waitForSelector('#modal:not([hidden])'); await page.fill('#ptIn', '0z'); await page.keyboard.press('Enter');
  const st = await page.evaluate(() => BMSApp.A.st.notes.map((n) => [n.lane, n.b, n.lb, n.lane === 'BPM' || n.lane === 'STOP' ? n.v : BMSCore.idStr(n.v, 36)]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)));
  console.log('new chart notes', JSON.stringify(st));
  // ── 확장 블록 → 회색 노트 ──
  await page.click('#pnExp summary');
  await page.click('#blkNew');
  await page.fill('#blkTx', '#RANDOM 2\n#IF 1\n#00314:0101\n#ENDIF\n#IF 2\n#00318:0101\n#ENDIF\n#ENDRANDOM');
  await page.click('#blkApply');
  console.log('ghosts', await page.evaluate(() => BMSApp.A.ghosts.map((g) => [g.lane, g.b])));
  await page.fill('#h_TITLE', 'テスト'); await page.press('#h_TITLE', 'Enter');
  await page.screenshot({ path: path.join(__dirname, 'shot-5-new.png') });
  await page.keyboard.press('Control+s');
  await page.waitForSelector('#modal:not([hidden])');
  await page.fill('#sdName', 'test_new');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#mBtns .pri')]);
  const txt = new TextDecoder('shift_jis').decode(fs.readFileSync(await dl.path()));
  console.log('saved as', dl.suggestedFilename());
  console.log(txt.replace(/\r\n/g, '⏎\n'));
  console.log('errors', errors);
  await browser.close();
})();
