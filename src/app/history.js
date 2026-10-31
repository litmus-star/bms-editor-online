/* ───────── 실행 취소 ───────── */
function commit(act) {
  applyAct(act, false);
  A.undo.push(act); if (A.undo.length > 1000) A.undo.shift();
  A.redo = [];
  setDirty(true);
  afterChange(act);
}
function applyAct(act, rev) {
  if (act.list) { (rev ? act.list.slice().reverse() : act.list).forEach((a) => applyAct(a, rev)); return; }
  if (act.type === 'meas') { const v = rev ? act.before : act.after; for (const [m, g] of v) { if (g) A.st.meas.set(m, g); else A.st.meas.delete(m); } return; }
  if (act.type === 'hdr') { A.st.headers.set(act.key, rev ? act.before : act.after); return; }
  if (act.type === 'bmp') { const v = rev ? act.before : act.after; if (v) A.st.bmps.set(act.id, v); else A.st.bmps.delete(act.id); return; }
  if (act.type === 'wav') { const v = rev ? act.before : act.after; if (v) A.st.wavs.set(act.id, v); else A.st.wavs.delete(act.id); return; }
  if (act.type === 'blk') {
    const v = rev ? act.before : act.after;
    if (v === undefined && act.i === A.st.blocks.length - 1) A.st.blocks.pop(); else A.st.blocks[act.i] = v;
    return;
  }
  const del = rev ? act.add : act.del, add = rev ? act.del : act.add;
  if (del.length) { const s = new Set(del); A.st.notes = A.st.notes.filter((n) => !s.has(n)); for (const n of del) A.sel.delete(n); }
  for (const n of add) A.st.notes.push(n);
}
function actTypes(act) { const s = new Set(); (function w(x) { if (x.list) x.list.forEach(w); else s.add(x.type || 'notes'); })(act); return s; }
function afterChange(act) {
  refresh();
  const t = actTypes(act);
  if (t.has('hdr')) renderHeader();
  if (t.has('wav')) { renderWavList(); startPreload(); }
  if (t.has('bmp')) { renderBmpList(); checkBmps(); }
  if (t.has('meas')) renderBeatList();
  if (t.has('blk')) renderBlocks();
}
function pickNotes(act, which) { const out = []; (function w(x) { if (x.list) x.list.forEach(w); else if (!x.type) out.push(...x[which]); })(act); return out; }
function undo() {
  const a = A.undo.pop(); if (!a) return;
  applyAct(a, true); A.redo.push(a); setDirty(true);
  const n = pickNotes(a, 'del'); if (n.length) A.sel = new Set(n);
  afterChange(a); toast(tr('toast.undo'));
}
function redo() {
  const a = A.redo.pop(); if (!a) return;
  applyAct(a, false); A.undo.push(a); setDirty(true);
  const n = pickNotes(a, 'add'); if (n.length) A.sel = new Set(n);
  afterChange(a); toast(tr('toast.redo'));
}
function setDirty(v) {
  A.dirty = v;
  const el = $('#sFile');
  el.textContent = !A.st ? '' : (v ? tr('stb.unsaved') : tr('stb.saved'));
  el.classList.toggle('dirty', !!v);
  document.title = (v ? '● ' : '') + (A.fileName || (A.st ? tr('file.new') : tr('app.name'))) + (A.st ? ' — ' + tr('app.name') : '');
}

/* 같은 자리 충돌 처리: 이동·붙여넣기는 밀려난 노트를 빈 BGM 레인으로, 쓰기는 덮어쓰기 */
function resolveConflicts(act, mode) {
  const delSet = new Set(act.del);
  // 같은 레인·같은 자리·같은 종류(일반/숨김/지뢰)끼리만 충돌
  const keyOf = (lane, pos, kind) => lane + '|' + C.rkey(pos) + '|' + (kind || 'n');
  const occ = new Map();
  for (const n of A.st.notes) if (!delSet.has(n)) occ.set(keyOf(n.lane, n.pos, n.kind), n);
  const addK = new Map(act.add.map((a) => [keyOf(a.lane, a.pos, a.kind), a]));
  const extraDel = [], extraAdd = [];
  for (const [k, a] of addK) {
    const ex = occ.get(k);
    if (!ex || ex === a) continue;
    extraDel.push(ex); occ.delete(k);
    if (mode === 'displace' && isSound(ex.lane) && !ex.kind) {
      for (let j = 0; j < 4000; j++) {
        const kk = keyOf('B' + j, ex.pos);
        if (!occ.has(kk) && !addK.has(kk)) { const dn = cloneNote(ex, { lane: 'B' + j }); extraAdd.push(dn); occ.set(kk, dn); break; }
      }
    }
  }
  act.del = act.del.concat(extraDel);
  act.add = act.add.concat(extraAdd);
  return extraAdd.length || (mode === 'replace' ? 0 : extraDel.length);
}
