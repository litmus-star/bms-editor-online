const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1300, height: 760 } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  // BGM 레인 B12에 노트가 있는 차트 (긴 BGM 키음 포함)
  await page.evaluate(async () => {
    const wav = (dur, name) => { const sr = 8000, n = sr * dur, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf); const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }; w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true); return new File([buf], name); };
    let lines = ['#BPM 120', '#WAV01 long.wav', '#WAV02 a.wav'];
    for (let k = 0; k < 11; k++) lines.push('#00101:00');
    lines.push('#00101:0002'); lines.push('#00001:01');
    const chart = new File([lines.join('\r\n')], 's.bme');
    await BMSApp.useProvider(BMSApp.makeListProvider([{ path: 's.bme', file: chart }, { path: 'long.wav', file: wav(60, 'long.wav') }, { path: 'a.wav', file: wav(1, 'a.wav') }], 'x'));
  });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => ({ bgm: BMSApp.A.bgmCount, fixW: BMSApp.A.fixW, total: BMSApp.A.totalW, W: BMSApp.A.W }));
  // 가로 스크롤 끝까지 → 키 레인 위치는 그대로인지
  await page.evaluate(() => { const A = BMSApp.A; A.sc.scrollLeft = A.laneMap.get('B11').x - A.fixW - 42; });
  await page.waitForTimeout(100);
  const pos = await page.evaluate(() => { const A = BMSApp.A, r = A.sc.getBoundingClientRect(); const k = A.laneMap.get('K11'), bl = A.laneMap.get('B11'); return { left: A.view.left, k11x: k.x, b11screen: bl.x - A.view.left, r: { x: r.left, y: r.top } }; });
  // 옆으로만: B11(=B12 칼럼) 노트를 K13으로 드래그하면서 위아래로 흔들기
  await page.check('#lockChk');
  const pt = (lane, beat, dy = -3) => page.evaluate(([lane, beat, dy]) => { const A = BMSApp.A, l = A.laneMap.get(lane), r = A.sc.getBoundingClientRect(); const x = l.type === 'bgm' ? l.x - A.view.left : l.x; return { x: r.left + x + l.w / 2, y: r.top + A.H - (beat - A.view.bottom) * A.ppb + dy }; }, [lane, beat, dy]);
  const p = await pt('B11', 6), q = await pt('K13', 6);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y - 70, { steps: 10 }); await page.mouse.up();
  const moved = await page.evaluate(() => ({ k13: BMSApp.A.st.notes.filter((n) => n.lane === 'K13').map((n) => n.b), left: BMSApp.A.view.left }));
  await page.screenshot({ path: path.join(__dirname, 'shot-7-fixed.png') });
  // 재생: 2마디(박 8)부터 → 박 0의 60초짜리 BGM이 4초 지점부터 울려야
  await page.evaluate(() => { BMSApp.play(8); });
  await page.waitForTimeout(600);
  const play = await page.evaluate(() => { const P = BMSApp.Au.play; return { evs: P.evs.map((e) => [e.id, +e.t.toFixed(3)]), playing: P.srcs.size }; });
  await page.evaluate(() => BMSApp.stopPlay());
  console.log(JSON.stringify({ info, pos, moved, play, errs }));
  await b.close();
})();
