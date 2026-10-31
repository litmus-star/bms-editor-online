/* ───────── 편집 동작 ───────── */
function deleteSel() { const s = [...A.sel]; if (!s.length) return; commit({ del: s, add: [] }); A.sel = new Set(); draw(); }
function selectAll() { A.sel = new Set(A.st.notes.filter((n) => A.laneMap.has(n.lane))); statusNote(); draw(); }
function nudge(dk, dSi, fine) {
  const sel = [...A.sel]; if (!sel.length) return false;
  const delta = rmul(stepR(fine), R(dk)), df = rf(delta);
  for (const n of sel) if (n.b + df < -1e-9 || n.b + n.lb + df >= A.ms.Sf[1000]) return true;
  const g0 = sel.find((n) => grpOf(n.lane)), grp = g0 ? grpOf(g0.lane) : null;
  if (dSi && clampShift(sel, grp, dSi) !== dSi) return true;
  const add = sel.map((n) => movedNote(n, delta, dSi, grp));
  const act = { del: sel, add };
  const nd = resolveConflicts(act, 'displace');
  commit(act); A.sel = new Set(add); draw();
  if (nd) toast(tr('toast.overlapMoved', { n: nd }));
  return true;
}
async function editValue(notes) {
  const n0 = notes[0]; if (!n0) return;
  if (!isSound(n0.lane)) {
    const isB = n0.lane === 'BPM';
    const v = await promptText(isB ? tr('dlg.bpm.change') : tr('dlg.stop.change'), isB ? 'BPM' : tr('dlg.stop.label'), isFinite(n0.v) ? String(n0.v) : '', isB ? '' : tr('dlg.stop.hint'));
    if (v === null) return;
    const x = parseFloat(v); if (!(x > 0)) { toast(tr('toast.needPositive')); return; }
    const targets = notes.filter((n) => n.lane === n0.lane);
    const add = targets.map((n) => cloneNote(n, { v: x, bch: undefined, bid: undefined, sid: undefined }));
    commit({ del: targets, add }); A.sel = new Set(add); draw(); return;
  }
  const maxS = idS(C.idMax(A.doc.base));
  const what = n0.lane[0] === 'G' ? [tr('dlg.bmpNo.title'), tr('dlg.bmpNo.label')] : n0.kind === 'm' ? [tr('dlg.mine.title'), tr('dlg.mine.label')] : [tr('dlg.wavNo.title'), tr('dlg.wavNo.label')];
  const v = await promptText(what[0], `${what[1]} (01~${maxS})`, idS(n0.v), notes.length > 1 ? tr('dlg.applyToSel', { n: notes.length }) : '');
  if (v === null) return;
  const id = C.idParse(v.trim(), A.doc.base);
  if (!(id > 0)) { toast(tr('toast.badNumber')); return; }
  const same = (n) => (n.lane[0] === 'G') === (n0.lane[0] === 'G') && (n.kind === 'm') === (n0.kind === 'm');
  const targets = notes.filter((n) => (isSound(n.lane) || n.lane[0] === 'G') && same(n));
  const add = targets.map((n) => cloneNote(n, { v: id, ev: n.len && !n.lnobj && n.ev === n.v ? id : n.ev }));
  commit({ del: targets, add }); A.sel = new Set(add); draw();
}
async function addValueNote(lane, pos) {
  const isB = lane === 'BPM';
  const def = isB ? fmtV(A.timing.bpmAt(rf(pos))) : '48';
  const v = await promptText(isB ? tr('dlg.bpm.change') : tr('dlg.stop.insert'), isB ? tr('dlg.bpm.new') : tr('dlg.stop.label'), def, isB ? '' : tr('dlg.stop.hint'));
  if (v === null) return;
  const x = parseFloat(v); if (!(x > 0)) { toast(tr('toast.needPositive')); return; }
  const n = mkNote({ lane, pos, v: x });
  const act = { del: [], add: [n] };
  resolveConflicts(act, 'replace');
  commit(act); A.sel = new Set([n]); draw();
}
