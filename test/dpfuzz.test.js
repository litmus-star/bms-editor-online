// 무작위 DP/숨김/지뢰/BGA 편집 → 저장 → 다시 읽기 일치 확인
require('../dist/bmscore.js'); const C = globalThis.BMSCore;
let seed = 1; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const lanes = C.KEY_LANES.map((l) => l.key), bga = C.BGA_LANES.map((l) => l.key);
let ok = 0, bad = 0;
for (let it = 0; it < 3000; it++) {
  const L = ['#PLAYER 3', '#LNTYPE 1'];
  if (rnd() < 0.3) L.push('#LNOBJ ZZ');
  if (rnd() < 0.5) L.push('#00104:0102', '#00221:0101', '#003E1:0001', '#00102:0.75');
  const d = C.parse(new TextEncoder().encode(L.join('\r\n') + '\r\n')), st = C.stateFromDoc(d);
  const used = new Set();
  for (let k = 0; k < 25; k++) {
    const r = rnd(), lane = r < 0.75 ? pick(lanes) : r < 0.9 ? pick(bga) : 'B' + Math.floor(rnd() * 4);
    const kind = lane[0] === 'K' ? pick([null, null, 'h', 'm']) : null;
    const pos = C.R(Math.floor(rnd() * 64), pick([1, 2, 3, 4, 8]));
    const key = lane + C.rkey(pos) + (kind || '');
    if (used.has(key)) continue; used.add(key);
    const n = { lane, pos, v: 1 + Math.floor(rnd() * 1000) };
    if (kind) n.kind = kind;
    st.notes.push(C.finalizeNote(n));
  }
  if (rnd() < 0.3) st.meas.set(Math.floor(rnd() * 8), { str: '0.5', r: C.R(1, 2) });
  // 같은 레인·종류에서 겹치는 자리/롱노트 없이만 시험 (편집기가 막는 상황)
  const r1 = C.serialize(d, st);
  if (r1.warnings.some((w) => w.includes('겹친'))) continue;
  if (r1.verify.ok) ok++; else { bad++; if (bad < 4) console.log(r1.verify.problems); }
}
console.log('ok', ok, 'bad', bad);
