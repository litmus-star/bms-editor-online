/* ───────── 레인 배치 ───────── */
function layout() {
  const L = []; let x = 0;
  const zx = cfg.zoomX || 1, W = (w) => Math.max(14, Math.round(w * zx)); // 가로 확대
  const add = (o) => { if (o.type !== 'meas') o.w = W(o.w); o.x = x; x += o.w; L.push(o); };
  add({ key: 'M', type: 'meas', w: MEAS_W, label: '#' });
  add({ key: 'BPM', type: 'bpm', col: 'bpm', w: 56, label: 'BPM' });
  add({ key: 'STOP', type: 'stop', col: 'stop', w: 48, label: 'STOP' });
  x += 8;
  C.KEY_LANES.filter((k) => k.p === 1).forEach((k, i) => add({ key: k.key, type: 'key', p: 1, col: i === 0 ? 'sc' : (i % 2 ? 'w' : 'b'), w: i === 0 ? 54 : 42, label: k.label }));
  if (A.dp) {
    x += 8;
    C.KEY_LANES.filter((k) => k.p === 2).forEach((k, i) => add({ key: k.key, type: 'key', p: 2, col: i === 7 ? 'sc' : (i % 2 ? 'b' : 'w'), w: i === 7 ? 54 : 42, label: k.label }));
  }
  x += 8;
  A.fixW = x; // 여기까지(플레이 영역)는 가로 스크롤해도 고정, 이후 BGA+BGM이 함께 스크롤
  C.BGA_LANES.forEach((g) => add({ key: g.key, type: 'bga', col: 'bga', w: 50, label: g.label }));
  x += 8;
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
function stepR(noSnap) { return (noSnap || A.noSnap || !cfg.snap) ? R(1, 48) : R(4, cfg.grid); }
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
  const need = Math.max(8, maxB + 5);
  if (need !== A.bgmCount) { A.bgmCount = need; layout(); }
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
