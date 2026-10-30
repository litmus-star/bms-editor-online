// PMS(팝픈 9버튼): .pms를 열면 PMS 화면(9레인, 팝픈 색)인지, 손대지 않고 저장하면 바이트가 같은지,
// 버튼 5 → 6으로 옮기면 채널 15 → 22로 저장되는지, SP/DP/PMS 버튼 순환, 무리배치 검사를 확인
// 실행: node test/pms.test.js (playwright 필요)
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1200, height: 760 } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  const pms = ['#PLAYER 1', '#GENRE TEST', '#TITLE pms test', '#BPM 150', '#WAV01 a.wav', '#WAV02 b.wav', '',
    '#00111:01000000', '#00112:00010000', '#00113:00000100', '#00114:00000001', '#00115:01010101',
    '#00122:01000000', '#00123:00010000', '#00124:00000100', '#00125:00000001',
    '#00262:01000000', '#00362:01000000', '#00231:02000000', '#002D1:0A000000',
    // 무리배치: 마디 4 첫 박 1-5-9 (무리), 둘째 박 2-4-6-8 (가능), 마디 5: 버튼 1 롱노트를 누른 채 4+9 (무리), 마디 6: 숨김 노트는 제외
    '#00411:01000000', '#00415:01000000', '#00425:01000000',
    '#00412:00010000', '#00414:00010000', '#00422:00010000', '#00424:00010000',
    '#00551:0101', '#00514:00010000', '#00525:00010000',
    '#00611:01', '#00615:01', '#00645:01', ''].join('\r\n');
  const out = await page.evaluate(async (txt) => {
    const bytes = new TextEncoder().encode(txt);
    BMSApp.loadDoc(BMSCore.parse(bytes), 'test.pms');
    const A = BMSApp.A;
    const r = { mode: A.pms ? 'pms' : A.dp ? 'dp' : 'sp', lanes: A.lanes.filter((l) => l.type === 'key').map((l) => l.label + ':' + l.key + ':' + l.col).join(' ') };
    const s0 = new Uint8Array(BMSApp.serialize().bytes);
    r.identical = s0.length === bytes.length && s0.every((v, i) => v === bytes[i]);
    r.info = document.getElementById('infoBd').textContent.match(/노트[^숨]*/)?.[0];
    r.muri = A.muri.map((m) => m.btns.join('-') + (m.held ? '+LN' : '')).join(' ');
    await new Promise((ok) => setTimeout(ok, 250));
    r.muriInfo = [...document.querySelectorAll('#infoBd .muri button')].map((x) => x.textContent).join(' | ');
    // 버튼 5(K15)의 첫 노트를 버튼 6(K22)으로
    const n = A.st.notes.filter((x) => x.lane === 'K15').sort((p, q) => p.b - q.b)[1]; // 둘째 노트(겹치지 않는 자리)
    BMSApp.commit({ del: [n], add: [Object.assign({}, n, { lane: 'K22' })] });
    const txt2 = new TextDecoder().decode(BMSApp.serialize().bytes);
    r.ch15 = (txt2.match(/#00115:[0-9A-Z]+/) || [])[0]; r.ch22 = (txt2.match(/#00122:[0-9A-Z]+/) || [])[0];
    const seq = [];
    for (let i = 0; i < 3; i++) { document.getElementById('bDP').click(); seq.push(document.getElementById('bDP').textContent + '/' + A.lanes.filter((l) => l.type === 'key').length); }
    r.cycle = seq.join(' ');
    // 확장자가 .bme면 PMS로 보지 않음 (2P 노트가 있으니 DP)
    BMSApp.loadDoc(BMSCore.parse(bytes), 'x.bme'); r.bmeGuess = A.pms ? 'pms' : A.dp ? 'dp' : 'sp';
    BMSApp.loadDoc(BMSCore.parse(new TextEncoder().encode(txt + '#00121:01000000\r\n')), 'y.bme'); r.dpGuess = A.pms ? 'pms' : A.dp ? 'dp' : 'sp';
    BMSApp.loadDoc(BMSCore.parse(bytes), 'test.pms');
    return r;
  }, pms);
  await page.screenshot({ path: path.join(__dirname, 'pms.png') });
  console.log(JSON.stringify({ ...out, errs }, null, 1));
  await b.close();
})();
