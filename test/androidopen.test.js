// 안드로이드처럼 보이는 환경(터치 + Linux UA)에서: 폴더 열기 → '폴더 고르기' 방식으로 열리는지,
// 저장할 때 폴더를 한 번 더 골라 그 폴더에 바로 쓰는지(+ .bak 백업) 확인. 폴더 선택 창은 가짜 핸들로 흉내 낸다.
// 실행: node test/androidopen.test.js  (playwright 필요)
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs'), os = require('os');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 800 }, hasTouch: true, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36' });
  await ctx.addInitScript(() => {
    window.__written = {}; window.__pickName = 'song';
    window.showDirectoryPicker = async () => {
      window.__picked = (window.__picked || 0) + 1;
      const files = { 'a.bme': new File(['x'], 'a.bme') };
      const fh = (n) => ({ kind: 'file', name: n, getFile: async () => files[n], createWritable: async () => { const parts = []; return { write: async (d) => parts.push(d), close: async () => { window.__written[n] = new Blob(parts).size; } }; } });
      return { kind: 'directory', name: window.__pickName,
        async *entries() { for (const n of Object.keys(files)) yield [n, fh(n)]; },
        getFileHandle: async (n) => fh(n), queryPermission: async () => 'granted', requestPermission: async () => 'granted' };
    };
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  const d = path.join(os.tmpdir(), 'bmsedit-ao', 'song'); fs.mkdirSync(d, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'sample.bme'), path.join(d, 'a.bme'));
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#bOpen')]);
  const isDirInput = await fc.element().evaluate((e) => e.id);
  await fc.setFiles(d);
  await page.waitForFunction(() => BMSApp.A.st && BMSApp.A.fileName === 'a.bme', null, { timeout: 10000 });
  const kind = await page.evaluate(() => BMSApp.A.fs.provider.kind);
  // 노트 하나 지우고 저장
  await page.evaluate(() => { const A = BMSApp.A; BMSApp.commit({ del: [A.st.notes.find((n) => n.lane[0] === 'K')], add: [] }); });
  const saveAndPick = async (label) => {
    await page.evaluate(() => { window.__sv = BMSApp.save(false); });
    await page.waitForTimeout(200);
    // 저장 확인 창이 먼저 뜨면 저장 누르기
    for (let i = 0; i < 4; i++) {
      if (await page.$eval('#modal', (e) => e.hidden)) break;
      const t = await page.$eval('#mTitle', (e) => e.textContent);
      const btn = await page.$(`#mBtns button:has-text("${label(t)}")`);
      if (!btn) break;
      await btn.click(); await page.waitForTimeout(200);
      if (await page.$eval('#modal', (e) => e.hidden)) break;
    }
    await page.evaluate(() => window.__sv);
  };
  const lab = (t) => t === '저장할 폴더 고르기' ? '폴더 고르기' : t === '다른 폴더인 것 같습니다' ? '이 폴더에 저장' : '저장';
  await saveAndPick(lab);
  const r1 = await page.evaluate(() => ({ written: window.__written, picked: window.__picked, canWrite: BMSApp.A.fs.provider.canWrite, dirty: BMSApp.A.dirty }));
  // 두 번째 저장은 다시 묻지 않아야 함
  await page.evaluate(() => { const A = BMSApp.A; BMSApp.commit({ del: [A.st.notes.find((n) => n.lane[0] === 'K')], add: [] }); });
  await saveAndPick(lab);
  const r2 = await page.evaluate(() => ({ written: window.__written, picked: window.__picked }));
  console.log(JSON.stringify({ isDirInput, kind, r1, r2, errs }));
  await b.close();
})();
