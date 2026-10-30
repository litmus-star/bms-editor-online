// 실제 File System Access 경로(폴더 핸들) 테스트: OPFS 폴더로 열기 → 편집 → 저장(.bak 백업) → 다른 이름으로 저장
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), http = require('http');
const dist = path.resolve(__dirname, '../dist');
const srv = http.createServer((req, res) => { const f = path.join(dist, decodeURIComponent(req.url.split('?')[0])); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); fs.createReadStream(f).pipe(res); });
srv.listen(0, async () => {
  const port = srv.address().port;
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/index.html`);
  const orig = fs.readFileSync(path.join(__dirname, 'sample.bme'));
  const r = await page.evaluate(async (b64) => {
    const root = await navigator.storage.getDirectory();
    try { await root.removeEntry('song', { recursive: true }); } catch (e) {}
    const dir = await root.getDirectoryHandle('song', { create: true });
    const put = async (name, data) => { const h = await dir.getFileHandle(name, { create: true }); const w = await h.createWritable(); await w.write(data); await w.close(); };
    await put('Song_7A.BME', Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    const sub = await dir.getDirectoryHandle('Sounds', { create: true });
    const h = await sub.getFileHandle('Kick.WAV', { create: true }); const w = await h.createWritable(); await w.write(new Uint8Array(100)); await w.close();
    await BMSApp.useProvider(BMSApp.makeDirProvider(dir));
    const P = BMSApp.A.fs.provider;
    const found = !!(await P.find('sounds\\kick.wav'));            // 하위 폴더 + 역슬래시 + 대소문자 무시
    // 편집: K14에 노트 하나
    const C = BMSCore; const A = BMSApp.A;
    BMSApp.commit({ del: [], add: [C.finalizeNote({ lane: 'K14', pos: C.R(10), v: 2 })] });
    BMSApp.cfg.confirmSave = false;
    await BMSApp.save(false);
    const names = []; for await (const [n] of dir.entries()) names.push(n);
    const read = async (n) => new Uint8Array(await (await (await dir.getFileHandle(n)).getFile()).arrayBuffer());
    const saved = await read('Song_7A.BME'), bak = await read('Song_7A.BME.bak');
    // 두 번째 저장: .bak은 처음 원본 그대로 유지돼야 함
    BMSApp.commit({ del: [], add: [C.finalizeNote({ lane: 'K14', pos: C.R(11), v: 2 })] });
    await BMSApp.save(false);
    const bak2 = await read('Song_7A.BME.bak'), saved2 = await read('Song_7A.BME');
    return { found, names: names.sort(), fileName: A.fileName, dirty: A.dirty, savedLen: saved.length, bak: Array.from(bak), bak2same: bak2.length === bak.length && bak2.every((x, i) => x === bak[i]), saved2: new TextDecoder('shift_jis').decode(saved2), files: A.fs.files };
  }, orig.toString('base64'));
  const bakOk = Buffer.from(r.bak).equals(orig);
  console.log(JSON.stringify({ found: r.found, names: r.names, fileName: r.fileName, dirty: r.dirty, savedLen: r.savedLen, bakEqualsOriginal: bakOk, bakKeptOnSecondSave: r.bak2same, files: r.files }));
  const lines = r.saved2.split('\r\n'); const origLines = orig.toString('latin1').split('\r\n');
  console.log('new lines:', lines.filter((l) => l.startsWith('#00214') || l.startsWith('#00314')), 'line count', origLines.length, '→', lines.length);
  console.log('errors', errors);
  await browser.close(); srv.close();
});
