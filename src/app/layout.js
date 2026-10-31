/* ───────── 레인 배치 ───────── */
function layout() {
  const L = []; let x = 0;
  const zx = cfg.zoomX || 1, W = (w) => Math.max(14, Math.round(w * zx)); // 가로 확대
  const add = (o) => { if (o.type !== 'meas') o.w = W(o.w); o.x = x; x += o.w; L.push(o); };
  add({ key: 'M', type: 'meas', w: MEAS_W, label: '#' });
  if (!cfg.hideBpm) { // BPM·STOP 영역 숨기기 (보기만, 노트와 박자 계산은 그대로)
    add({ key: 'BPM', type: 'bpm', col: 'bpm', w: 56, label: 'BPM' });
    add({ key: 'STOP', type: 'stop', col: 'stop', w: 48, label: 'STOP' });
  }
  A.sepX = [x + 4]; // 영역 구분선(틈 한가운데): BPM·STOP | 플레이 영역
  x += 8;
  if (A.pms) C.PMS_LANES.forEach((k) => add({ key: k.key, type: 'key', p: 0, col: k.col, w: 42, label: k.label }));
  else {
    const p1 = C.KEY_LANES.filter((k) => k.p === 1).map((k, i) => ({ key: k.key, type: 'key', p: 1, col: i === 0 ? 'sc' : (i % 2 ? 'w' : 'b'), w: i === 0 ? 54 : 42, label: k.label }));
    if (cfg.scRight && !A.dp) p1.push(p1.shift()); // SP: 스크래치를 오른쪽에 (보이는 순서만, 채널은 그대로)
    p1.forEach(add);
  }
  if (A.dp && !A.pms) {
    x += 8;
    C.KEY_LANES.filter((k) => k.p === 2).forEach((k, i) => add({ key: k.key, type: 'key', p: 2, col: i === 7 ? 'sc' : (i % 2 ? 'b' : 'w'), w: i === 7 ? 54 : 42, label: k.label }));
  }
  A.sepX.push(x + 4); // 플레이 영역 | BGA·BGM 영역
  x += 8;
  A.fixW = x; // 여기까지(플레이 영역)는 가로 스크롤해도 고정, 이후 BGA+BGM이 함께 스크롤
  if (!cfg.hideBga) { // BGA·LAYER·POOR 영역 숨기기 (보기만)
    C.BGA_LANES.forEach((g) => add({ key: g.key, type: 'bga', col: 'bga', w: 50, label: g.label }));
    x += 8;
  }
  for (let k = 0; k < A.bgmCount; k++) add({ key: 'B' + k, type: 'bgm', col: 'bgm', w: 42, label: 'B' + (k + 1) });
  A.lanes = L; A.laneMap = new Map(L.map((l) => [l.key, l])); A.totalW = x + 30;
  A.grp = { snd: L.filter((l) => l.type === 'key' || l.type === 'bgm'), bga: L.filter((l) => l.type === 'bga') };
  for (const g of Object.values(A.grp)) g.forEach((l, i) => { l.gi = i; });
  A.keyCount = L.filter((l) => l.type === 'key').length;
}

/* ───────── 위치 · 스냅 ───────── */
function measureAt(beat) {
  const Sf = A.ms.Sf;
  if (beat <= 0) return 0;
  let lo = 0, hi = 999;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (Sf[mid] <= beat + 1e-9) lo = mid; else hi = mid - 1; }
  return lo;
}
function stepR(noSnap) { return (noSnap || !cfg.snap) ? R(1, 48) : R(4, cfg.grid); }
function snap(beat, mode, noSnap) {
  beat = Math.max(0, beat);
  const S = A.ms.S, Sf = A.ms.Sf, m = Math.min(999, measureAt(beat));
  const st = stepR(noSnap), sf = rf(st);
  let k = mode === 'floor' ? Math.floor((beat - Sf[m]) / sf + 1e-7) : Math.round((beat - Sf[m]) / sf);
  if (k < 0) k = 0;
  let p = radd(S[m], rmul(st, R(k)));
  if (rcmp(p, S[m + 1]) >= 0) {
    if (mode === 'floor') {
      const q = rdiv(rsub(S[m + 1], S[m]), st);
      const kmax = q.n % q.d === 0 ? q.n / q.d - 1 : Math.floor(q.n / q.d);
      p = radd(S[m], rmul(st, R(Math.max(0, kmax))));
    } else p = m + 1 <= 999 ? S[m + 1] : S[m];
  }
  return p;
}
function lowerBound(arr, b) { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid].b < b) lo = mid + 1; else hi = mid; } return lo; }

/* ───────── 상태 갱신 ───────── */
function reindex() {
  const by = new Map(); let maxB = -1;
  for (const n of A.st.notes) {
    let a = by.get(n.lane); if (!a) by.set(n.lane, a = []); a.push(n);
    if (n.lane[0] === 'B') { const k = +n.lane.slice(1); if (k > maxB) maxB = k; }
  }
  let conf = 0;
  A.maxLen = new Map();
  for (const [k, a] of by) {
    a.sort((x, y) => x.b - y.b || x.uid - y.uid);
    if (k[0] === 'X') continue; // 화면에 없는 채널(BGA·2P 등)은 겹침 검사 안 함
    let ml = 0;
    for (const n of a) { n._c = false; if (n.lb > ml) ml = n.lb; }
    A.maxLen.set(k, ml);
    for (let i = 0; i < a.length; i++) { // 같은 종류(일반/숨김/지뢰)끼리만 겹침 검사
      const n = a[i], kn = n.kind || 'n';
      for (let j = i + 1; j < a.length && a[j].b - n.b < 1e-9; j++) if ((a[j].kind || 'n') === kn) n._c = a[j]._c = true;
      if (n.lb > 0) for (let j = i + 1; j < a.length && a[j].b <= n.b + n.lb + 1e-9; j++) if (!a[j].kind) { n._c = a[j]._c = true; }
    }
    for (const n of a) if (n._c) conf++;
  }
  A.by = by; A.conflicts = conf;
  checkMuri();
  const need = Math.max(8, maxB + 5);
  if (need !== A.bgmCount) { A.bgmCount = need; layout(); }
}
/* PMS 무리배치: 같은 타이밍에 눌러야 하는 버튼(그 순간 누르고 있는 롱노트 포함)을
   왼손·오른손 두 묶음으로 나눴을 때, 각 묶음이 연속된 버튼 3개 범위 안에 들어가는 방법이 하나도 없으면 무리.
   예: 1-5-9 → 무리, 2-4-6-8 → 가능. 숨김 노트·지뢰는 제외. */
const PMS_BTN = { K11: 1, K12: 2, K13: 3, K14: 4, K15: 5, K22: 6, K23: 7, K24: 8, K25: 9 };
function handsOk(btns) {
  const s = [...new Set(btns)].sort((a, b) => a - b);
  for (let i = 0; i <= s.length; i++) {
    const L = s.slice(0, i), Rr = s.slice(i);
    if ((!L.length || L[L.length - 1] - L[0] <= 2) && (!Rr.length || Rr[Rr.length - 1] - Rr[0] <= 2)) return true;
  }
  return false;
}
function checkMuri() {
  for (const n of A.st.notes) n._m = false;
  A.muri = [];
  if (!A.pms) return;
  const ns = A.st.notes.filter((n) => PMS_BTN[n.lane] && !n.kind).sort((a, b) => a.b - b.b);
  const lns = ns.filter((n) => n.lb > 0);
  let li = 0; const held = [];
  for (let i = 0; i < ns.length;) {
    let j = i; while (j < ns.length && ns[j].b - ns[i].b < 1e-9) j++;
    const t = ns[i].b, chord = ns.slice(i, j);
    while (li < lns.length && lns[li].b < t - 1e-9) held.push(lns[li++]); // 이 시점 전에 시작한 롱노트
    for (let k = held.length - 1; k >= 0; k--) if (held[k].b + held[k].lb <= t + 1e-9) held.splice(k, 1); // 이미 끝난 것은 빼기
    const all = chord.concat(held);
    if (all.length >= 2 && !handsOk(all.map((n) => PMS_BTN[n.lane]))) {
      for (const n of all) n._m = true;
      A.muri.push({ b: t, notes: all, btns: [...new Set(all.map((n) => PMS_BTN[n.lane]))].sort((a, b) => a - b), held: held.length });
    }
    i = j;
  }
}
function muriLabel(m) {
  const mm = measureAt(m.b + 1e-9), off = m.b - A.ms.Sf[mm], len = rf(lenOf(mm)) * 4;
  const g = [4, 8, 12, 16, 24, 32, 48, 64, 96, 192].find((d) => Math.abs(off / len * d - Math.round(off / len * d)) < 1e-6) || 192;
  return tr('info.muri.item', { m: C.pad3(mm), pos: `${Math.round(off / len * g)}/${g}`, btns: m.btns.join('-') }) + (m.held ? tr('info.muri.held') : '');
}
function refresh() {
  if (!A.st) return;
  A.ms = C.measureStarts(A.st.meas);
  reindex();
  A.timing = C.buildTiming(A.st.notes, parseFloat(A.st.headers.get('BPM')) || 130);
  A.ghosts = A.st.blocks.some((t) => t) ? C.blockGhosts(A.st.blocks, A.doc.base, A.st.meas) : [];
  let last = 0;
  for (const n of A.st.notes) { const e = n.b + (n.lb || 0); if (e > last) last = e; }
  for (const g of A.ghosts) if (g.b > last) last = g.b;
  A.lastBeat = last;
  A.extentM = Math.min(1000, Math.max(64, measureAt(last) + 33));
  updateScroller();
  scheduleInfo();
  draw();
}
