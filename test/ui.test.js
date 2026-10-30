const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const out = (f) => path.join(__dirname, f);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  const env = await page.evaluate(async () => {
    let blocked = false; try { await fetch('https://example.com/'); } catch (e) { blocked = true; }
    return { showDirectoryPicker: typeof window.showDirectoryPicker, secure: window.isSecureContext, fetchBlocked: blocked };
  });
  console.log('env', JSON.stringify(env));
  await page.screenshot({ path: out('shot-0-empty.png') });

  const chart = fs.readFileSync(out('sample.bme')).toString('base64');
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const wav = (freq, dur, name) => {
      const sr = 44100, n = Math.floor(sr * dur), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
      const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
      v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      w(36, 'data'); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * freq * i / sr) * 8000 * (1 - i / n), true);
      return new File([buf], name);
    };
    const names = ['kick', 'snare', 'hat', 'bass_c', 'bass_e', 'lead_a', 'lead_b'];  // pad.wav 일부러 없음
    const entries = [{ path: 'song_7a.bme', file: new File([bytes], 'song_7a.bme') }, { path: 'song_7h.bme', file: new File([bytes], 'song_7h.bme') }];
    names.forEach((n, i) => entries.push({ path: n + (i === 2 ? '.ogg' : '.wav'), file: wav(200 + i * 60, 0.25, n + '.wav') }));
    await BMSApp.useProvider(BMSApp.makeListProvider(entries, 'song'));
  }, chart);
  await page.waitForTimeout(1200);
  const s1 = await page.evaluate(() => ({ notes: BMSApp.A.st.notes.length, file: BMSApp.A.fileName, load: document.querySelector('#sLoad').textContent, files: BMSApp.A.fs.files }));
  console.log('loaded', JSON.stringify(s1));
  await page.screenshot({ path: out('shot-1-loaded.png') });

  // 좌표 계산 도우미
  const pt = async (lane, beat, dy = -3) => page.evaluate(([lane, beat, dy]) => {
    const A = BMSApp.A, l = A.laneMap.get(lane), r = A.sc.getBoundingClientRect();
    return { x: r.left + l.x - A.view.left + l.w / 2, y: r.top + A.H - (beat - A.view.bottom) * A.ppb + dy };
  }, [lane, beat, dy]);

  // 1) 쓰기 모드: K13 레인 4박(마디1 시작)에 노트 찍기
  await page.keyboard.press('F3');
  let p = await pt('K13', 4.0);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up();
  // 2) 쓰기 모드: K12 레인에 롱노트 (5박 → 6.5박)
  p = await pt('K12', 5.0); let q = await pt('K12', 6.5, 0);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 6 }); await page.mouse.up();
  const s2 = await page.evaluate(() => BMSApp.A.st.notes.filter((n) => n.lane === 'K13' || n.lane === 'K12').map((n) => [n.lane, n.b, n.lb, n.v]));
  console.log('write', JSON.stringify(s2));

  // 3) 선택 모드: BGM B3(hat, 마디2 0.5박 = 박 8.5)을 K15로 드래그
  await page.keyboard.press('F1');
  p = await pt('B2', 8.5); q = await pt('K15', 8.5);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 8 }); await page.mouse.up();
  const s3 = await page.evaluate(() => ({ k15: BMSApp.A.st.notes.filter((n) => n.lane === 'K15').map((n) => [n.b, n.v]), b2: BMSApp.A.st.notes.filter((n) => n.lane === 'B2' && n.b >= 8 && n.b < 12).map((n) => n.b) }));
  console.log('move', JSON.stringify(s3));

  // 4) 겹침: K11의 4박(06 lead_a)에 B0 kick(4박)을 끌어오면 lead_a는 빈 BGM 레인으로
  p = await pt('B0', 4.0); q = await pt('K11', 4.0);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 8 }); await page.mouse.up();
  const s4 = await page.evaluate(() => ({ k11at4: BMSApp.A.st.notes.filter((n) => n.lane === 'K11' && n.b === 4).map((n) => n.v), displaced: BMSApp.A.st.notes.filter((n) => n.lane[0] === 'B' && n.b === 4 && n.v === 6).map((n) => n.lane) }));
  console.log('displace', JSON.stringify(s4));

  // 5) 실행 취소 / 다시 실행
  await page.keyboard.press('Control+z');
  const u1 = await page.evaluate(() => BMSApp.A.st.notes.filter((n) => n.lane === 'K11' && n.b === 4).map((n) => n.v));
  await page.keyboard.press('Control+y');
  const u2 = await page.evaluate(() => BMSApp.A.st.notes.filter((n) => n.lane === 'K11' && n.b === 4).map((n) => n.v));
  console.log('undo/redo', JSON.stringify({ u1, u2 }));

  // 6) 화살표로 이동 + 오른쪽 클릭 삭제
  await page.keyboard.press('ArrowUp');
  const s6 = await page.evaluate(() => [...BMSApp.A.sel].map((n) => [n.lane, n.b]));
  p = await pt('K13', 4.0);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  const s6b = await page.evaluate(() => BMSApp.A.st.notes.filter((n) => n.lane === 'K13' && n.b === 4).length);
  console.log('nudge', JSON.stringify(s6), 'rightclick-left', s6b);

  // 7) 붙여넣기 (iBMSC 형식, ibmsc_clip.py 출력과 같은 꼴)
  await page.evaluate(() => { BMSApp.A.hover = null; BMSApp.setBottom(16); });
  await page.evaluate(() => BMSApp.pasteText('iBMSC Clipboard Data\r\n27 0 10000 0 0 0\r\n28 48 20000 0 0 0\r\n6 96 30000 0 0 0'));
  const s7 = await page.evaluate(() => [...BMSApp.A.sel].map((n) => [n.lane, n.b, n.v]));
  console.log('paste', JSON.stringify(s7));

  // 8) 헤더 · 박자 패널
  await page.fill('#h_TITLE', 'テスト曲 〜edited〜');
  await page.press('#h_TITLE', 'Enter');
  await page.click('#pnBeat summary');
  await page.click('#beatList .br[data-m="7"]');
  await page.fill('#bN', '7'); await page.fill('#bD', '8');
  await page.click('#bApply');
  const s8 = await page.evaluate(() => ({ title: BMSApp.A.st.headers.get('TITLE'), m7: BMSApp.A.st.meas.get(7) }));
  console.log('panels', JSON.stringify(s8));

  // 9) 저장 (이 방식은 폴더 쓰기 불가 → 다운로드)
  const ser = await page.evaluate(() => { const r = BMSApp.serialize(); return { ok: r.verify.ok, problems: r.verify.problems, bad: r.badChars, changed: r.changed, kept: r.kept, warn: r.warnings, diff: r.diff.slice(0, 40) }; });
  console.log('serialize', JSON.stringify({ ok: ser.ok, problems: ser.problems, bad: ser.bad, changed: ser.changed, kept: ser.kept, warn: ser.warn }));
  console.log(ser.diff.map((d) => (d.op === '-' ? '- ' : '+ ') + d.t).join('\n'));
  await page.keyboard.press('Control+s');
  await page.waitForSelector('#modal:not([hidden])');
  await page.screenshot({ path: out('shot-2-save.png') });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#mBtns .pri')]);
  const dpath = await dl.path();
  const saved = fs.readFileSync(dpath);
  fs.writeFileSync(out('saved.bme'), saved);
  console.log('download', dl.suggestedFilename(), saved.length, 'bytes; dirty=', await page.evaluate(() => BMSApp.A.dirty));

  // 10) 재생
  await page.evaluate(() => BMSApp.setBottom(0));
  await page.keyboard.press('F5');
  await page.waitForTimeout(1500);
  const s10 = await page.evaluate(() => ({ playBeat: BMSApp.A.playBeat, scheduled: BMSApp.Au.play && BMSApp.Au.play.i, total: BMSApp.Au.play && BMSApp.Au.play.evs.length, ctx: BMSApp.Au.ctx && BMSApp.Au.ctx.state }));
  console.log('play', JSON.stringify(s10));
  await page.screenshot({ path: out('shot-3-play.png') });
  await page.keyboard.press('F7');

  // 11) 도움말
  await page.click('#bHelp');
  await page.screenshot({ path: out('shot-4-help.png') });
  await page.keyboard.press('Escape');

  console.log('errors', JSON.stringify(errors, null, 1));
  await browser.close();
})();
