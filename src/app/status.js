/* ───────── 상태 표시줄 ───────── */
function statusPos(h) {
  const el = $('#sPos');
  if (!h || !A.ms) { el.textContent = ''; return; }
  const b = Math.max(0, h.beat), m = measureAt(b), pos = snap(b, 'floor', false);
  const f = rdiv(rsub(pos, A.ms.S[m]), rmul(lenOf(m), R4));
  el.textContent = tr('stb.pos', { m: C.pad3(m), pos: `${f.n}/${f.d}`, time: fmtTime(A.timing.beatToTime(rf(pos))) }) + (h.lane && h.lane.type !== 'meas' ? ` · ${h.lane.label}` : '');
}
function noteDesc(n) {
  if (n.lane === 'BPM') return `BPM ${fmtV(n.v)}` + (n.bch === '08' ? ` (#BPM${idS(n.bid)})` : '');
  if (n.lane === 'STOP') return `STOP ${fmtV(n.v)}` + (n.sid ? ` (#STOP${idS(n.sid)})` : '');
  const lane = A.laneMap.get(n.lane), ln = lane ? (lane.p === 2 ? '2P ' : lane.p === 1 && A.dp ? '1P ' : '') + (A.pms && lane.type === 'key' ? tr('note.button') : '') + lane.label : n.lane;
  if (n.lane[0] === 'G') return `${ln} · #BMP${idS(n.v)} ${A.st.bmps.get(n.v) || tr('note.undefined')}`;
  if (n.kind === 'm') return tr('note.mine', { lane: ln, v: idS(n.v) });
  const nm = A.st.wavs.get(n.v) || tr('note.undefined');
  return `${ln}${n.kind === 'h' ? tr('note.hidden') : ''} · #WAV${idS(n.v)} ${nm}` + (n.lb > 0 ? tr('note.ln', { beats: fmtV(n.lb) }) + (n.lnobj ? ' (LNOBJ)' : '') : '') + (n.dangling ? tr('note.lnDangling') : '');
}
function statusNote() {
  const n = A.hover && A.hover.note;
  $('#sNote').textContent = n ? noteDesc(n) : (A.sel.size ? tr('stb.selected', { n: A.sel.size }) : '');
}
