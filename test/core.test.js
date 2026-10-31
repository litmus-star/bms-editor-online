// node test/core.test.js
require('../dist/bmscore.js');
const C = globalThis.BMSCore;
const assert = require('assert');
let pass = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok  -', name); } catch (e) { console.log('FAIL-', name, '\n', e.stack); process.exitCode = 1; } }
const sjis = (s) => C.getEncoder('shift_jis')(s).bytes;
const hex = (u8) => Buffer.from(u8).toString('hex');

const A_TEXT = [
  '',
  '*---------------------- HEADER FIELD',
  '',
  '#PLAYER 1',
  '#GENRE テクノ',
  '#TITLE 漢字テスト ～とても～',
  '#ARTIST litmus*',
  '#BPM 150',
  '#PLAYLEVEL 12',
  '#RANK 2',
  '#LNTYPE 1',
  '#BMP01 bga.bmp',
  '#WAV01 kick.wav',
  '#WAV02 snare.wav',
  '#wav0a hat.ogg',
  '#BPM01 175.5',
  '#STOP01 96',
  '',
  '*---------------------- MAIN DATA FIELD',
  '#00001:01000000',
  '#00001:00',
  '#00001:0000000A',
  '#00011:01020000',
  '#00016:0a',
  '#00102:0.75',
  '#00104:010000',
  '#00103:96',
  '#00108:0001',
  '#00109:000100',
  '#00151:0200',
  '#00251:0002',
  '#00211:01000000',
  '#00211:00000200',
  '#RANDOM 2',
  '#IF 1',
  '#00313:0102',
  '#ENDIF',
  '#IF 2',
  '#00314:0102',
  '#ENDIF',
  '#ENDRANDOM',
  '#00401:0101',
  '#00017:01',
  '#XYZ unknown command',
  '',
].join('\r\n');
const A = sjis(A_TEXT);

t('SJIS 인코더가 Python cp932와 같음', () => {
  assert.strictEqual(hex(sjis('漢字テスト')), '8abf8e9a836583588367');
  assert.strictEqual(hex(sjis('〜')), '8160'); // wave dash → cp932 방식
});
t('SJIS: 물결표/특수문자', () => {
  assert.strictEqual(hex(sjis('～')), '8160');   // U+FF5E → 81 60 (cp932)
  assert.strictEqual(hex(sjis('①')), '8740');
  assert.strictEqual(hex(sjis('Ⅰ')), '8754');   // NEC row 13 우선
  assert.strictEqual(hex(sjis('ⅰ')), 'fa40');   // IBM 확장
  assert.strictEqual(hex(sjis('¬')), '81ca');
  assert.strictEqual(hex(sjis('ｱ')), 'b1');
  const r = C.getEncoder('shift_jis')('한글');
  assert.deepStrictEqual(r.bad, ['한', '글']);
});

t('A: 인코딩 자동 감지 = shift_jis', () => assert.strictEqual(C.detectEncoding(A), 'shift_jis'));
const docA = C.parse(A);
t('A: 헤더/WAV/정의 읽기', () => {
  assert.strictEqual(docA.headers.get('TITLE').value, '漢字テスト ～とても～');
  assert.strictEqual(docA.wavs.get(10).name, 'hat.ogg');
  assert.strictEqual(docA.bpmDefs.get(1).v, 175.5);
  assert.strictEqual(docA.blocks.length, 1);
  assert.strictEqual(docA.eol, '\r\n');
});
t('A: 노트 해석', () => {
  const by = (lane) => docA.notes.filter((n) => n.lane === lane).sort((a, b) => a.b - b.b).map((n) => [n.b, n.v, n.lb]);
  assert.deepStrictEqual(by('B0'), [[0, 1, 0], [15, 1, 0], [17, 1, 0]]);
  assert.deepStrictEqual(by('B1'), []);
  assert.deepStrictEqual(by('B2'), [[3, 10, 0]]);
  assert.deepStrictEqual(by('K11'), [[0, 1, 0], [1, 2, 0], [4, 2, 5], [7, 1, 0], [9, 2, 0]]);
  assert.deepStrictEqual(by('K16'), [[0, 10, 0]]);
  assert.deepStrictEqual(by('BPM').map((x) => [x[0], x[1]]), [[4, 150], [5.5, 175.5]]);
  assert.deepStrictEqual(by('STOP').map((x) => [x[0], x[1]]), [[5, 96]]);
  assert.deepStrictEqual(by('K13'), [], 'RANDOM 블록 안 노트는 편집 노트가 아님');
});
t('A: 편집 없이 저장 → 바이트 동일', () => {
  const r = C.serialize(docA, C.stateFromDoc(docA));
  assert.strictEqual(hex(r.bytes), hex(A));
  assert.strictEqual(r.changed, 0);
  assert.ok(r.verify.ok, JSON.stringify(r.verify.problems));
});

const B_TEXT = '#TITLE lnobj test\n#LNOBJ ZZ\n#WAV01 a.wav\n#WAVZZ end.wav\n#BPM 120\n#00011:01000000ZZ000000\n#00111:00ZZ\n#00211:ZZ'; // 마지막 줄바꿈 없음 + 짝 없는 끝표시
t('B: LNOBJ / LF / 끝 줄바꿈 없음 왕복', () => {
  const b = new TextEncoder().encode(B_TEXT);
  const d = C.parse(b);
  const k = d.notes.filter((n) => n.lane === 'K11').sort((x, y) => x.b - y.b);
  assert.strictEqual(k[0].lnobj, true); assert.strictEqual(k[0].lb, 2);
  assert.strictEqual(k.length, 3); // LN 1개 + 짝 없는 ZZ 2개 (일반 노트로 보존)
  const r = C.serialize(d, C.stateFromDoc(d));
  assert.strictEqual(hex(r.bytes), hex(b));
  assert.ok(r.verify.ok);
});
t('C: UTF-8 BOM 왕복', () => {
  const b = new Uint8Array([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode('#TITLE 한국어 제목\r\n#00111:01\r\n')]);
  const d = C.parse(b);
  assert.strictEqual(d.enc, 'utf-8');
  assert.strictEqual(d.headers.get('TITLE').value, '한국어 제목');
  const r = C.serialize(d, C.stateFromDoc(d));
  assert.strictEqual(hex(r.bytes), hex(b));
});
t('D: EUC-KR 감지 + 왕복', () => {
  const kr = Buffer.from('b1e8c4a1', 'hex'); // "김치"
  const b = new Uint8Array([...Buffer.from('#TITLE '), ...kr, ...Buffer.from(' \xc5\xd7\xbd\xba\xc6\xae\r\n#00111:01\r\n', 'latin1')]);
  const d = C.parse(b);
  assert.strictEqual(d.enc, 'euc-kr');
  const r = C.serialize(d, C.stateFromDoc(d));
  assert.strictEqual(hex(r.bytes), hex(b));
});
t('빈 파일 / 새 템플릿', () => {
  const d0 = C.parse(new Uint8Array(0));
  assert.strictEqual(C.serialize(d0, C.stateFromDoc(d0)).bytes.length, 0);
  const d = C.parse(new TextEncoder().encode(C.NEW_TEMPLATE));
  const st = C.stateFromDoc(d);
  st.headers.set('TITLE', 'テスト');
  st.wavs.set(1, 'a.wav');
  st.notes.push(C.finalizeNote({ lane: 'K11', pos: C.R(4), v: 1 }));
  const r = C.serialize(d, st);
  assert.ok(r.verify.ok, JSON.stringify(r.verify.problems));
  const txt = new TextDecoder('shift_jis').decode(r.bytes);
  assert.ok(txt.includes('#TITLE テスト\r\n'));
  assert.ok(/#LNTYPE 1\r\n#WAV01 a.wav\r\n/.test(txt), txt);
  assert.ok(txt.endsWith('#00111:01\r\n'), JSON.stringify(txt.slice(-40)));
});

function edit(fn) {
  const d = C.parse(A); const st = C.stateFromDoc(d); fn(st, d);
  const r = C.serialize(d, st);
  return { d, st, r, txt: new TextDecoder('shift_jis').decode(r.bytes) };
}
t('BGM 노트를 키 레인으로 이동 → 바뀐 줄만', () => {
  const { r, txt } = edit((st) => {
    const n = st.notes.find((x) => x.lane === 'B2');
    st.notes.splice(st.notes.indexOf(n), 1);
    st.notes.push(C.finalizeNote({ lane: 'K12', pos: n.pos, v: n.v }));
  });
  assert.ok(r.verify.ok, JSON.stringify(r.verify.problems));
  const minus = r.diff.filter((x) => x.op === '-').map((x) => x.t);
  const plus = r.diff.filter((x) => x.op === '+').map((x) => x.t);
  assert.deepStrictEqual(minus, ['#00001:0000000A']);
  assert.deepStrictEqual(plus, ['#00001:00', '#00012:0000000A']);
  assert.ok(txt.includes('#00011:01020000\r\n#00012:0000000A\r\n#00016:0a'), '채널 순서 자리에 삽입');
});
t('마디 길이 변경: 노트 박 위치 유지', () => {
  const { r, st } = edit((st) => { st.meas.set(0, { str: '0.5', r: C.R(1, 2) }); });
  assert.ok(r.verify.ok, JSON.stringify(r.verify.problems));
  const plus = r.diff.filter((x) => x.op === '+').map((x) => x.t);
  assert.ok(plus.includes('#00002:0.5'));
  assert.ok(plus.length > 3); // 이후 마디의 노트 줄이 다시 계산됨
});
t('BPM 소수 → 새 #BPMxx 정의 / STOP 새 값', () => {
  const { r, txt } = edit((st) => {
    st.notes.push(C.finalizeNote({ lane: 'BPM', pos: C.R(8), v: 200.25 }));
    st.notes.push(C.finalizeNote({ lane: 'BPM', pos: C.R(9), v: 180 }));
    st.notes.push(C.finalizeNote({ lane: 'STOP', pos: C.R(10), v: 48 }));
  });
  assert.ok(r.verify.ok, JSON.stringify(r.verify.problems));
  assert.ok(txt.includes('#BPM01 175.5\r\n#BPM02 200.25\r\n#STOP01 96\r\n#STOP02 48\r\n'), txt.slice(0, 400));
  assert.ok(/#00203:00B4\r\n/.test(txt) || /#00203:00B40000/.test(txt) || txt.includes('#00203:'), '180 → 03 채널');
});
t('헤더 수정 (일본어) → Shift-JIS 바이트', () => {
  const { r } = edit((st) => { st.headers.set('SUBTITLE', '～another～'); st.headers.set('TITLE', '新しい'); });
  assert.ok(r.verify.ok);
  assert.ok(hex(r.bytes).includes(hex(sjis('#TITLE 新しい\r\n'))));
  assert.ok(hex(r.bytes).includes(hex(sjis('#SUBTITLE ～another～\r\n'))));
  assert.strictEqual(r.diff.filter((x) => x.op === '-').length, 1);
});
t('한글 제목 → Shift-JIS 불가 경고, UTF-8 변환 저장', () => {
  const d = C.parse(A); const st = C.stateFromDoc(d); st.headers.set('TITLE', '한글');
  const r = C.serialize(d, st);
  assert.deepStrictEqual(r.badChars, ['한', '글']);
  assert.ok(!r.verify.ok);
  const r2 = C.serialize(d, st, { encoding: 'utf-8' });
  assert.ok(r2.verify.ok, JSON.stringify(r2.verify.problems));
  assert.ok(new TextDecoder().decode(r2.bytes).includes('#GENRE テクノ'));
});
t('확장 블록 수정 / 새 블록', () => {
  const { r, txt } = edit((st) => { st.blocks[0] = st.blocks[0].replace('#00314:0102', '#00315:0102'); st.blocks.push('#RANDOM 2\n#IF 1\n#00516:01\n#ENDIF\n#ENDRANDOM'); });
  assert.ok(r.verify.ok, JSON.stringify(r.verify.problems));
  assert.ok(txt.includes('#IF 2\r\n#00315:0102\r\n#ENDIF'));
  assert.ok(txt.endsWith('#ENDRANDOM\r\n'));
});
t('LN 길이 바꾸기 + LNOBJ 파일에서 새 LN', () => {
  const b = new TextEncoder().encode(B_TEXT);
  const d = C.parse(b); const st = C.stateFromDoc(d);
  const ln = st.notes.find((n) => n.lnobj);
  st.notes.splice(st.notes.indexOf(ln), 1);
  st.notes.push(C.finalizeNote(Object.assign({}, ln, { len: C.R(3) })));
  const r = C.serialize(d, st);
  assert.ok(r.verify.ok, JSON.stringify(r.verify.problems));
  assert.ok(new TextDecoder().decode(r.bytes).includes('#00011:010000ZZ'));
});
t('모든 노트 삭제 → 관리 채널 줄만 사라짐', () => {
  const { r, txt } = edit((st) => { st.notes = st.notes.filter((n) => n.lane[0] === 'X' || n.lane[0] === 'G'); }); // 키음 노트만 지움
  assert.ok(r.verify.ok, JSON.stringify(r.verify.problems));
  for (const keep of ['#00104:010000', '#00017:01', '#XYZ unknown command', '#00313:0102', '#BMP01 bga.bmp']) assert.ok(txt.includes(keep), keep);
  assert.ok(!txt.includes('#00011:'));
  assert.ok(txt.includes('#00001:00\r\n#00001:00\r\n#00001:00\r\n'), 'BGM 자리 채움 줄 유지');
});
t('겹친 노트 → 경고', () => {
  const { r } = edit((st) => { st.notes.push(C.finalizeNote({ lane: 'K11', pos: C.R(0), v: 3 })); });
  assert.ok(r.warnings.some((w) => w.code === 'core.save.conflicts'));
  assert.ok(!r.verify.ok);
});
t('타이밍: BPM 변화와 STOP', () => {
  const d = C.parse(A); const st = C.stateFromDoc(d);
  const T = C.buildTiming(st.notes, 150);
  assert.ok(Math.abs(T.beatToTime(4) - 1.6) < 1e-9);
  // 마디1(박 4~7): 03=0x96=150 at 박4, 08=175.5 at 박 4+1.5=5.5, STOP 96(=2박) at 박 4+1=5
  const t5 = 1.6 + 1 * 60 / 150;
  assert.ok(Math.abs(T.beatToTime(5) - t5) < 1e-9, 'STOP 자리의 노트는 멈추기 전에');
  const stopDur = 2 * 60 / 150;
  assert.ok(Math.abs(T.beatToTime(5.5) - (t5 + stopDur + 0.5 * 60 / 150)) < 1e-9);
  assert.ok(Math.abs(T.timeToBeat(t5 + stopDur / 2) - 5) < 1e-9);
  assert.ok(Math.abs(T.timeToBeat(T.beatToTime(9.25)) - 9.25) < 1e-9);
});
t('유리수: 큰 분모 안전', () => {
  const x = C.radd(C.R(1, 999983), C.R(1, 1000003));
  assert.deepStrictEqual(x, { n: 1999986, d: 999983 * 1000003 });
  const L = C.parseMeasureLen('0.333333333333333');
  assert.deepStrictEqual(L, { n: 1, d: 3 });
  assert.strictEqual(C.lenStr(C.R(3, 4)), '0.75');
  assert.strictEqual(C.lenStr(C.R(5, 4)), '1.25');
  assert.strictEqual(C.lenStr(C.R(1, 3)), '0.333333333');
});
t('CR만 쓰는 옛 파일', () => {
  const b = new TextEncoder().encode('#TITLE old\r#WAV01 a.wav\r#00111:01\r');
  const d = C.parse(b);
  assert.strictEqual(d.notes.length, 1);
  assert.strictEqual(C.serialize(d, C.stateFromDoc(d)).bytes.length, b.length);
  const st = C.stateFromDoc(d); st.notes.push(C.finalizeNote({ lane: 'K12', pos: C.R(4), v: 1 }));
  const r = C.serialize(d, st);
  assert.ok(r.verify.ok); assert.ok(new TextDecoder().decode(r.bytes).endsWith('#00111:01\r#00112:01\r'));
});
// ── 리뷰에서 나온 문제들 ──
const sj = (lines) => sjis(lines.join('\r\n') + '\r\n');
function absObjs(bytes, enc) { // 모든 채널 오브젝트의 절대 박 위치 (독립 계산)
  const d = C.parse(bytes, enc); const S = C.measureStarts(new Map([...d.meas].filter(([, g]) => g.r).map(([m, g]) => [m, g]))).S;
  const out = [];
  const add = (txt) => { for (const line of txt.split(/\r\n|\n/)) { const m = /^#(\d{3})([0-9A-Z]{2}):(.*)$/i.exec(line.trim()); if (!m || m[2] === '02') continue; const mm = +m[1], g = d.meas.get(mm), L = g && g.r ? g.r : C.R1, n = Math.floor(m[3].length / 2); for (let i = 0; i < n; i++) { const v = m[3].substr(2 * i, 2); if (v !== '00') out.push(m[2] + '@' + C.rkey(C.radd(S[mm], C.rmul(C.R(i, n), C.rmul(L, C.R4)))) + '=' + v); } } };
  add(new TextDecoder(enc).decode(bytes));
  return out.sort();
}
t('마디 길이 변경: BGA·2P·지뢰·숨김·RANDOM 블록도 같은 박에 머묾', () => {
  const src = sj(['#BPM 120', '#WAV01 a.wav', '#BMP01 a.bmp', '#00011:01', '#00111:01', '#00104:01', '#00121:01', '#001D1:01', '#00131:01', '#00211:01',
    '#RANDOM 2', '#IF 1', '#00112:01', '#ENDIF', '#IF 2', '#00113:01', '#ENDIF', '#ENDRANDOM']);
  const d = C.parse(src), st = C.stateFromDoc(d);
  const oldMeas = new Map(st.meas); st.meas.set(0, { str: '0.75', r: C.R(3, 4) });
  st.blocks = st.blocks.map((x) => C.retimeBlockText(x, oldMeas, st.meas));
  const r = C.serialize(d, st);
  assert.ok(r.verify.ok, JSON.stringify(r.verify.problems));
  assert.deepStrictEqual(absObjs(r.bytes, 'shift_jis'), absObjs(src, 'shift_jis'));
});
t('짝 없는 #ENDIF가 다음 #IF 분기를 열지 않음', () => {
  const d = C.parse(sj(['#00213:00000002', '#RANDOM 2', '#IF 1', '#00212:01', '#ENDIF', '#ENDIF', '#IF 2', '#00213:01', '#ENDIF', '#ENDRANDOM']));
  assert.strictEqual(d.blocks.length, 1);
  assert.ok(d.blocks[0].text.includes('#00213:01'));
  assert.strictEqual(d.notes.length, 1);
});
t('반각 가나만 있는 Shift-JIS를 UTF-8/EUC-KR로 오인하지 않음', () => {
  assert.strictEqual(C.detectEncoding(sjis('#TITLE ﾐｸ\r\n')), 'shift_jis');
  assert.strictEqual(C.detectEncoding(sjis('#TITLE ｶﾗｵｹ\r\n')), 'shift_jis');
  assert.strictEqual(C.detectEncoding(new TextEncoder().encode('#TITLE 테스트\r\n')), 'utf-8');
  assert.strictEqual(C.detectEncoding(Buffer.from('#TITLE \xb1\xe8\xc4\xa1\r\n#WAV01 \xbd\xba\xb3\xd7\xbe\xee.wav\r\n', 'latin1')), 'euc-kr');
});
t('읽지 못한 바이트가 있는 줄을 UTF-8로 바꾸면 경고', () => {
  const b = new Uint8Array([...sjis('#TITLE x\r\n#WAV01 '), 0xBD, 0xBA, 0xB3, 0xD7, 0xBE, 0xEE, ...sjis('.wav\r\n')]);
  const d = C.parse(b, 'shift_jis');
  const r = C.serialize(d, C.stateFromDoc(d), { encoding: 'utf-8' });
  assert.ok(r.badChars.includes('\uFFFD'), JSON.stringify(r.badChars));
});
t('UTF-8 BOM은 맨 앞에 그대로', () => {
  const bom = [0xEF, 0xBB, 0xBF];
  const b1 = new Uint8Array([...bom, ...new TextEncoder().encode('#WAV01 킥.wav\r\n#00111:01\r\n')]);
  const d1 = C.parse(b1), s1 = C.stateFromDoc(d1); s1.headers.set('TITLE', '새 제목');
  const r1 = C.serialize(d1, s1);
  assert.ok(r1.verify.ok, JSON.stringify(r1.verify.problems));
  assert.deepStrictEqual([...r1.bytes.slice(0, 10)], [...bom, ...new TextEncoder().encode('#TITLE ')]);
  const b2 = new Uint8Array([...bom, ...new TextEncoder().encode('#TITLE 옛 제목\r\n#00111:01\r\n')]);
  const d2 = C.parse(b2), s2 = C.stateFromDoc(d2); s2.headers.set('TITLE', '새 제목');
  const r2 = C.serialize(d2, s2);
  assert.deepStrictEqual([...r2.bytes.slice(0, 3)], bom);
  assert.strictEqual(new TextDecoder().decode(r2.bytes.slice(3)), '#TITLE 새 제목\r\n#00111:01\r\n');
});
t('정의 없이 참조만 있는 #BPMxx 번호는 새 정의에 쓰지 않음', () => {
  const d = C.parse(sj(['#00011:01', '#RANDOM 2', '#IF 1', '#00208:01', '#ENDIF', '#ENDRANDOM']));
  const st = C.stateFromDoc(d); st.notes.push(C.finalizeNote({ lane: 'BPM', pos: C.R(4), v: 145.5 }));
  const txt = new TextDecoder().decode(C.serialize(d, st).bytes);
  assert.ok(txt.includes('#BPM02 145.5') && !txt.includes('#BPM01'), txt);
});
t('헤더를 비우면 줄을 지움 (#RANK만 남지 않게)', () => {
  const d = C.parse(sj(['#TITLE a', '#RANK 2', '#RANK 3', '#00111:01']));
  const st = C.stateFromDoc(d); st.headers.set('RANK', '');
  const r = C.serialize(d, st);
  assert.ok(r.verify.ok, JSON.stringify(r.verify.problems));
  assert.strictEqual(new TextDecoder().decode(r.bytes), '#TITLE a\r\n#00111:01\r\n');
});
t('같은 번호 #WAV가 두 줄이면 지울 때 둘 다', () => {
  const d = C.parse(sj(['#WAV01 a.wav', '#WAV01 b.wav', '#00111:02']));
  const st = C.stateFromDoc(d); st.wavs.delete(1);
  const r = C.serialize(d, st);
  assert.ok(r.verify.ok, JSON.stringify(r.verify.problems));
  assert.strictEqual(new TextDecoder().decode(r.bytes), '#00111:02\r\n');
});
t('저장 후 새 블록을 실행 취소(목록에서 빠짐) → 파일에서도 빠짐', () => {
  const d = C.parse(sj(['#00111:01', '#RANDOM 2', '#IF 1', '#00112:01', '#ENDIF', '#ENDRANDOM']));
  const st = C.stateFromDoc(d); st.blocks.pop();
  const r = C.serialize(d, st);
  assert.ok(r.verify.ok, JSON.stringify(r.verify.problems));
  assert.strictEqual(new TextDecoder().decode(r.bytes), '#00111:01\r\n');
});
t('¥ 입력은 0x5C로 저장되고 확인도 통과', () => {
  const d = C.parse(sj(['#TITLE a', '#00111:01']));
  const st = C.stateFromDoc(d); st.headers.set('TITLE', '¥100');
  const r = C.serialize(d, st);
  assert.ok(r.verify.ok, JSON.stringify(r.verify.problems));
  assert.ok(Buffer.from(r.bytes).includes(Buffer.from('#TITLE \\100')));
});
// ── DP · 숨김 · 지뢰 · BGA ──
const DP = sj(['#PLAYER 3', '#LNTYPE 1', '#WAV01 a.wav', '#WAV02 b.wav', '#BMP01 a.png', '#BMP02 b.mpg', '#BMP00 miss.bmp',
  '#00111:01', '#00121:0102', '#00126:01', '#00128:00000001', '#00161:0100', '#00261:0100',
  '#00131:0001', '#00141:01', '#001D1:0000ZZ00', '#001E6:01',
  '#00104:01000200', '#00106:01', '#00107:0002', '#0010A:01', '#00117:01']);
t('DP/숨김/지뢰/BGA 읽기 + 편집 없이 바이트 동일', () => {
  const d = C.parse(DP); const by = (l) => d.notes.filter((n) => n.lane === l).map((n) => [n.b, n.v, n.lb, n.kind || '']).sort((a, b) => a[0] - b[0] || a[2] - b[2] || (a[3] < b[3] ? -1 : 1));
  assert.deepStrictEqual(by('K21'), [[4, 1, 0, ''], [4, 1, 0, 'h'], [4, 1, 4, ''], [6, 2, 0, '']]);
  assert.deepStrictEqual(by('K26'), [[4, 1, 0, ''], [4, 1, 0, 'm']]);
  assert.deepStrictEqual(by('K11'), [[4, 1, 0, ''], [6, 1, 0, 'h'], [6, 1295, 0, 'm']]);
  assert.deepStrictEqual(by('G04'), [[4, 1, 0, ''], [6, 2, 0, '']]);
  assert.deepStrictEqual(by('G06'), [[4, 1, 0, '']]); assert.deepStrictEqual(by('G07'), [[6, 2, 0, '']]);
  assert.ok(d.notes.some((n) => n.lane === 'X0A') && d.notes.some((n) => n.lane === 'X17'));
  assert.strictEqual(d.bmps.get(0).name, 'miss.bmp'); assert.strictEqual(d.hasP2, true);
  const r = C.serialize(d, C.stateFromDoc(d));
  assert.strictEqual(hex(r.bytes), hex(DP)); assert.ok(r.verify.ok);
});
t('DP 편집: 1P→2P 이동, 숨김·지뢰·BGA 추가, BMP 정의 추가', () => {
  const d = C.parse(DP), st = C.stateFromDoc(d);
  const n = st.notes.find((x) => x.lane === 'K11' && !x.kind);
  st.notes.splice(st.notes.indexOf(n), 1);
  st.notes.push(C.finalizeNote({ lane: 'K29', pos: n.pos, v: n.v }));
  st.notes.push(C.finalizeNote({ lane: 'K23', pos: C.R(8), v: 2, kind: 'h' }));
  st.notes.push(C.finalizeNote({ lane: 'K16', pos: C.R(8), v: 5, kind: 'm' }));
  st.notes.push(C.finalizeNote({ lane: 'G07', pos: C.R(8), v: 3 }));
  st.bmps.set(3, 'c.png');
  const r = C.serialize(d, st);
  assert.ok(r.verify.ok, JSON.stringify(r.verify.problems));
  const txt = new TextDecoder().decode(r.bytes);
  for (const l of ['#00129:01', '#00243:02', '#002D6:05', '#00207:03', '#BMP03 c.png']) assert.ok(txt.includes(l + '\r\n'), l);
  assert.ok(!txt.includes('#00111:'));
});
t('LNOBJ: 2P에서도 동작', () => {
  const b = new TextEncoder().encode('#LNOBJ ZZ\n#00121:0100ZZ00\n');
  const d = C.parse(b); const n = d.notes.find((x) => x.lane === 'K21');
  assert.ok(n.lnobj && n.lb === 2);
  assert.strictEqual(hex(C.serialize(d, C.stateFromDoc(d)).bytes), hex(b));
});
t('#BASE 62: 대소문자 구분 · 1295번 초과 번호 · 원본 그대로 · 새 번호는 62진수로', () => {
  const txt = ['#PLAYER 1', '#BASE 62', '#BPM 150', '#WAV0a lower.wav', '#WAV0A upper.wav', '#WAVzz last.wav', '#WAV10 ten.wav', '',
    '#00111:0a0A', '#00112:zz00', '#00101:10', ''].join('\r\n');
  const b = new TextEncoder().encode(txt);
  const d = C.parse(b), st = C.stateFromDoc(d);
  assert.strictEqual(d.base, 62);
  assert.strictEqual(st.wavs.get(36), 'lower.wav'); assert.strictEqual(st.wavs.get(10), 'upper.wav');
  assert.strictEqual(st.wavs.get(3843), 'last.wav'); assert.strictEqual(st.wavs.get(62), 'ten.wav');
  assert.deepStrictEqual(st.notes.filter((n) => n.lane === 'K11').map((n) => n.v).sort((x, y) => x - y), [10, 36]);
  assert.strictEqual(hex(C.serialize(d, st).bytes), hex(b));
  const n = st.notes.find((x) => x.lane === 'K12'); n.lane = 'K13';
  st.wavs.set(3000, 'new.wav'); st.notes.push(Object.assign({}, n, { lane: 'K14', v: 3000, uid: 99999 }));
  const r = C.serialize(d, st), out = new TextDecoder().decode(r.bytes);
  assert.ok(r.verify.ok);
  assert.ok(out.includes('#WAVmO new.wav') && out.includes('#00114:mO') && out.includes('#00113:zz') && out.includes('#00111:0a0A'));
  assert.strictEqual(C.idStr(3000, 62), 'mO'); assert.strictEqual(C.idParse('mO', 62), 3000);
  assert.strictEqual(C.idParse('mo', 36), C.idParse('MO', 36));
});
console.log(`\n${pass} passed`);
