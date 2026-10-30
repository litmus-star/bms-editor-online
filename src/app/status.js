/* ───────── 상태 표시줄 ───────── */
function statusPos(h) {
  const el = $('#sPos');
  if (!h || !A.ms) { el.textContent = ''; return; }
  const b = Math.max(0, h.beat), m = measureAt(b), pos = snap(b, 'floor', false);
  const f = rdiv(rsub(pos, A.ms.S[m]), rmul(lenOf(m), R4));
  el.textContent = `마디 ${C.pad3(m)} · ${f.n}/${f.d} · ${fmtTime(A.timing.beatToTime(rf(pos)))}` + (h.lane && h.lane.type !== 'meas' ? ` · ${h.lane.label}` : '');
}
function noteDesc(n) {
  if (n.lane === 'BPM') return `BPM ${fmtV(n.v)}` + (n.bch === '08' ? ` (#BPM${idS(n.bid)})` : '');
  if (n.lane === 'STOP') return `STOP ${fmtV(n.v)}` + (n.sid ? ` (#STOP${idS(n.sid)})` : '');
  const lane = A.laneMap.get(n.lane), ln = lane ? (lane.p === 2 ? '2P ' : lane.p === 1 && A.dp ? '1P ' : '') + lane.label : n.lane;
  if (n.lane[0] === 'G') return `${ln} · #BMP${idS(n.v)} ${A.st.bmps.get(n.v) || '(정의 없음)'}`;
  if (n.kind === 'm') return `${ln} · 지뢰 · 값 ${idS(n.v)}`;
  const nm = A.st.wavs.get(n.v) || '(정의 없음)';
  return `${ln}${n.kind === 'h' ? ' · 숨김' : ''} · #WAV${idS(n.v)} ${nm}` + (n.lb > 0 ? ` · 롱노트 ${fmtV(n.lb)}박${n.lnobj ? ' (LNOBJ)' : ''}` : '') + (n.dangling ? ' · 끝이 없는 롱노트' : '');
}
function statusNote() {
  const n = A.hover && A.hover.note;
  $('#sNote').textContent = n ? noteDesc(n) : (A.sel.size ? `선택 ${A.sel.size}개` : '');
}
