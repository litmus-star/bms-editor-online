/* ───────── 마우스 ───────── */
function hitAt(e) {
  const r = A.sc.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const inArea = mx >= 0 && my >= 0 && mx < A.sc.clientWidth && my < A.sc.clientHeight;
  let lane = null;
  if (mx < MEAS_W) lane = A.laneMap.get('M');
  else for (const l of A.lanes) { if (l.type === 'meas') continue; if (scrolls(l) && mx < A.fixW) continue; const x = laneX(l); if (mx >= x && mx < x + l.w) { lane = l; break; } }
  return { mx, my, cx: mx, lane, beat: A.view.bottom + (A.H - my) / A.ppb, inArea, head: my < HEAD_H };
}
function noteAt(h) {
  if (!h.lane || h.lane.type === 'meas') return null;
  const arr = A.by.get(h.lane.key); if (!arr) return null;
  const nhb = noteH() / A.ppb, capb = capH() / A.ppb;
  let found = null;
  for (let i = lowerBound(arr, h.beat - (A.maxLen.get(h.lane.key) || 0) - nhb - capb - 0.01); i < arr.length; i++) {
    const n = arr[i];
    if (n.b > h.beat + 1 / A.ppb) break;
    const top = n.lb > 0 ? Math.max(n.b + n.lb + capb, n.b + nhb) : n.b + nhb;
    if (h.beat >= n.b - 1 / A.ppb && h.beat <= top) found = n;
  }
  return found;
}
function onLnHandle(n, h) {
  if (!(n.lb > 0)) return false;
  const e = n.b + n.lb;
  return h.beat >= e - 2 / A.ppb && h.beat <= e + capH() / A.ppb + 1 / A.ppb && n.lb * A.ppb > noteH() + 4;
}
function onDown(e) {
  if (!A.st || !$('#modal').hidden) return;
  const h = hitAt(e);
  if (!h.inArea || h.head) return;
  e.preventDefault();
  A.sc.focus({ preventScroll: true });
  const n = noteAt(h);
  if (e.button === 2) { if (n) commit({ del: [n], add: [] }); return; }
  if (e.button === 1) { // 가운데 버튼 드래그: 화면 잡고 끌기 (애프터이펙트 손 도구처럼)
    A.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, b0: A.view.bottom, l0: A.view.left };
    A.sc.style.cursor = 'grabbing'; return;
  }
  if (e.button !== 0) return;
  if (h.lane && h.lane.type === 'meas') {
    const m = measureAt(Math.max(0, h.beat)), b = A.ms.Sf[m];
    A.playMark = A.playMark === b ? null : b;
    toast(A.playMark == null ? '재생 시작선을 지웠습니다' : `재생 시작선: 마디 ${C.pad3(m)}`);
    draw(); return;
  }
  if (A.mode === 'write') downWrite(e, h, n); else downSelect(e, h, n);
}
function downWrite(e, h, n) {
  if (n) {
    if (n.lane[0] === 'G') { A.curBmp = n.v; markCurBmp(true); return; }
    if (!isSound(n.lane)) { editValue([n]); return; }
    if (n.kind === 'm') { editValue([n]); return; }
    A.curWav = n.v; markCurWav(true); preview(n.v);
    A.drag = isKey(n.lane) && !n.kind ? { kind: 'resize', note: n, preview: null, sx: h.mx, sy: h.my } : null;
    return;
  }
  if (!h.lane || h.lane.type === 'meas') return;
  const pos = snap(h.beat, 'floor', e.shiftKey);
  if (h.lane.type === 'bpm' || h.lane.type === 'stop') { addValueNote(h.lane.key, pos); return; }
  const note = mkNote(newNoteAt(h.lane, pos));
  A.drag = { kind: 'place', base: note, preview: note, sy: h.my };
  if (h.lane.type !== 'bga' && note.kind !== 'm') preview(A.curWav);
  draw();
}
function downSelect(e, h, n) {
  if (n) {
    if (onLnHandle(n, h) && !e.shiftKey && !e.ctrlKey && !e.metaKey) { A.drag = { kind: 'resize', note: n, preview: null, sx: h.mx, sy: h.my }; return; }
    const wasSel = A.sel.has(n), mod = e.ctrlKey || e.metaKey || e.shiftKey;
    if (mod) A.sel.add(n); else if (!wasSel) A.sel = new Set([n]);
    A.drag = { kind: 'move', anchor: n, b0: h.beat, sx: h.mx, sy: h.my, wasSel, toggle: mod, moved: false, preview: [], hide: null, delta: C.R0, dSi: 0 };
    if (isSound(n.lane) && n.kind !== 'm') preview(n.v);
    statusNote(); draw(); return;
  }
  if (!(e.shiftKey || e.ctrlKey || e.metaKey)) A.sel = new Set();
  A.drag = { kind: 'band', x0: h.cx, b0: h.beat, x1: h.cx, b1: h.beat, base: new Set(A.sel) };
  statusNote(); draw();
}
// 쓰기 모드에서 새로 찍을 노트: BGA 레인은 BMP 번호, 키 레인은 고른 종류(일반/숨김/지뢰)
function newNoteAt(l, pos) {
  if (l.type === 'bga') return { lane: l.key, pos, v: A.curBmp };
  if (l.type === 'key' && A.noteKind !== 'n') return { lane: l.key, pos, v: A.noteKind === 'm' ? (A.mineVal || 1) : A.curWav, kind: A.noteKind };
  return { lane: l.key, pos, v: A.curWav };
}
function movedNote(n, delta, dG, grp) {
  let lane = n.lane;
  const l = A.laneMap.get(lane);
  if (dG && l && grpOf(lane) === grp) lane = A.grp[grp][l.gi + dG].key;
  return cloneNote(n, { lane, pos: radd(n.pos, delta) });
}
// 옆으로 옮길 칸 수를 범위 안으로 (숨김·지뢰는 키 레인 밖으로 못 나감)
function clampShift(sel, grp, dG) {
  if (!grp || !dG) return 0;
  const list = A.grp[grp];
  let lo = -Infinity, hi = Infinity;
  for (const n of sel) {
    if (grpOf(n.lane) !== grp) continue;
    const l = A.laneMap.get(n.lane); if (!l) continue;
    const max = (n.kind ? A.keyCount : list.length) - 1;
    lo = Math.max(lo, -l.gi); hi = Math.min(hi, max - l.gi);
  }
  return Math.max(lo, Math.min(hi, dG));
}
function lnStyle(n, len) {
  if (n.len && !n.lnobj) return { len, ev: n.ev || n.v };
  if (n.lnobj || A.doc.lnobj > 0) return { len, ev: A.doc.lnobj > 0 ? A.doc.lnobj : n.v, lnobj: A.doc.lnobj > 0 };
  return { len, ev: n.v };
}
function onMove(e) {
  if (!A.st) return;
  const h = hitAt(e), d = A.drag;
  if (!d) { hoverUpdate(h, e); return; }
  if (d.kind === 'pan') {
    setBottom(d.b0 + (e.clientY - d.sy) / A.ppb);
    const maxL = Math.max(0, A.sc.scrollWidth - A.sc.clientWidth);
    A.view.left = Math.min(maxL, Math.max(0, d.l0 - (e.clientX - d.sx)));
    syncScroll(); draw(); return;
  }
  statusPos(h);
  if (d.kind === 'band') { d.x1 = h.cx; d.b1 = h.beat; bandSelect(d); autoScroll(h); statusNote(); draw(); return; }
  if (d.kind === 'move') {
    if (!d.moved && Math.abs(h.mx - d.sx) < 4 && Math.abs(h.my - d.sy) < 4) return;
    const sel = [...A.sel];
    const st = stepR(e.shiftKey), sf = rf(st);
    let k = cfg.lockH ? 0 : Math.round((h.beat - d.b0) / sf);
    const grp = grpOf(d.anchor.lane), al = A.laneMap.get(d.anchor.lane);
    let dSi = 0;
    if (grp && al && h.lane && grpOf(h.lane.key) === grp) dSi = h.lane.gi - al.gi;
    dSi = clampShift(sel, grp, dSi);
    let minB = Infinity, maxE = -Infinity;
    for (const n of sel) { if (n.b < minB) minB = n.b; if (n.b + n.lb > maxE) maxE = n.b + n.lb; }
    const kMin = Math.ceil(-minB / sf - 1e-9), kMax = Math.floor((A.ms.Sf[1000] - maxE) / sf - 1e-9);
    if (k < kMin) k = kMin;
    if (k > kMax) k = kMax;
    d.delta = rmul(st, R(k)); d.dSi = dSi; d.moved = true; d.copy = e.ctrlKey || e.altKey || e.metaKey;
    d.preview = sel.map((n) => movedNote(n, d.delta, dSi, grp));
    d.hide = d.copy ? null : new Set(sel);
    A.sc.style.cursor = d.copy ? 'copy' : 'move';
    autoScroll(h); draw(); return;
  }
  if (d.kind === 'place') {
    if (isKey(d.base.lane) && !d.base.kind && h.my < d.sy - 3) {
      const end = snap(h.beat, 'round', e.shiftKey);
      const len = rsub(end, d.base.pos);
      d.preview = len.n > 0 ? cloneNote(d.base, lnStyle(d.base, len)) : d.base;
    } else d.preview = d.base;
    autoScroll(h); draw(); return;
  }
  if (d.kind === 'resize') {
    if (!d.preview && Math.abs(h.my - d.sy) < 3) return;
    const end = snap(h.beat, 'round', e.shiftKey);
    const len = rsub(end, d.note.pos);
    d.preview = len.n > 0 ? cloneNote(d.note, lnStyle(d.note, len)) : cloneNote(d.note, { len: null });
    autoScroll(h); draw();
  }
}
function onUp() {
  const d = A.drag; if (!d) return;
  A.drag = null;
  A.sc.style.cursor = A.mode === 'write' ? 'crosshair' : 'default';
  if (d.kind === 'pan') return;
  if (d.kind === 'band') { statusNote(); draw(); return; }
  if (d.kind === 'move') {
    if (!d.moved) { if (d.toggle && d.wasSel) A.sel.delete(d.anchor); statusNote(); draw(); return; }
    if (d.delta.n === 0 && d.dSi === 0) { draw(); return; }
    const act = { del: d.copy ? [] : [...A.sel], add: d.preview };
    const nd = resolveConflicts(act, 'displace');
    commit(act); A.sel = new Set(d.preview); draw();
    if (nd) toast(`겹친 노트 ${nd}개를 빈 BGM 레인으로 옮겼습니다`);
    return;
  }
  if (d.kind === 'place') {
    const act = { del: [], add: [d.preview] };
    resolveConflicts(act, 'replace');
    commit(act); A.sel = new Set([d.preview]); draw(); return;
  }
  if (d.kind === 'resize') {
    if (!d.preview) { draw(); return; }
    commit({ del: [d.note], add: [d.preview] }); A.sel = new Set([d.preview]); draw();
  }
}
function bandSelect(d) {
  const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), b0 = Math.min(d.b0, d.b1), b1 = Math.max(d.b0, d.b1);
  const nhb = noteH() / A.ppb, sel = new Set(d.base);
  for (const l of A.lanes) {
    const lx = laneX(l);
    if (l.type === 'meas' || lx + l.w <= x0 || lx >= x1 || (scrolls(l) && lx + l.w <= A.fixW)) continue;
    const arr = A.by.get(l.key); if (!arr) continue;
    for (let i = lowerBound(arr, b0 - (A.maxLen.get(l.key) || 0) - nhb); i < arr.length; i++) {
      const n = arr[i]; if (n.b > b1) break;
      if (n.b + Math.max(nhb, n.lb) >= b0) sel.add(n);
    }
  }
  A.sel = sel;
}
function autoScroll(h) {
  if (h.my < HEAD_H + 18) setBottom(A.view.bottom + 12 / A.ppb);
  else if (h.my > A.H - 18) setBottom(A.view.bottom - 12 / A.ppb);
}
function hoverUpdate(h, e) {
  const over = h.inArea && !h.head;
  const n = over ? noteAt(h) : null;
  let ghost = null;
  if (A.mode === 'write' && over && !n && h.lane && h.lane.type !== 'meas') {
    const pos = snap(h.beat, 'floor', e.shiftKey);
    ghost = h.lane.type === 'bpm' ? { lane: h.lane.key, pos, v: A.timing.bpmAt(rf(pos)) } : h.lane.type === 'stop' ? { lane: h.lane.key, pos, v: 48 } : newNoteAt(h.lane, pos);
    ghost.b = rf(pos); ghost.lb = 0;
  }
  const prev = A.hover;
  A.hover = { note: n, ghost, h };
  A.sc.style.cursor = A.mode === 'write' ? 'crosshair' : (n && onLnHandle(n, h) ? 'ns-resize' : (n ? 'pointer' : 'default'));
  statusPos(over ? h : null);
  statusNote();
  if (!prev || prev.note !== n || ghost || prev.ghost) draw();
}
function onWheel(e) {
  if (!A.st) return;
  if ((e.ctrlKey || e.metaKey) && e.shiftKey) { // Ctrl+Shift+휠: 가로 확대
    e.preventDefault();
    const d = e.deltaY || e.deltaX;
    setZoomX((cfg.zoomX || 1) * (d < 0 ? 1.15 : 1 / 1.15), hitAt(e).mx);
    return;
  }
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const h = hitAt(e);
    setZoom(cfg.zoom * (e.deltaY < 0 ? 1.25 : 0.8), h.beat, h.my);
  }
}
