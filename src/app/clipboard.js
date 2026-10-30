/* ───────── 복사 · 붙여넣기 (iBMSC 클립보드 형식) ───────── */
const IB_COL = { BPM: 2, STOP: 3, K16: 5, K11: 6, K12: 7, K13: 8, K14: 9, K15: 10, K18: 11, K19: 12,
  K21: 14, K22: 15, K23: 16, K24: 17, K25: 18, K28: 19, K29: 20, K26: 21, G04: 23, G07: 24, G06: 25 };
const IB_REV = Object.fromEntries(Object.entries(IB_COL).map(([k, v]) => [v, k]));
const colOf = (lane) => (lane[0] === 'B' ? 27 + +lane.slice(1) : IB_COL[lane]);
const laneOfCol = (c) => (c >= 27 ? 'B' + (c - 27) : IB_REV[c] || null);
const fmtVP = (x) => String(+x.toFixed(6));
function copySel() {
  const sel = [...A.sel].sort((a, b) => a.b - b.b);
  if (!sel.length) return null;
  const baseR = A.ms.S[measureAt(sel[0].b)];
  const hasLN = sel.some((n) => n.lb > 0);
  const lines = ['iBMSC Clipboard Data' + (hasLN ? ' xNT' : '')], items = [];
  for (const n of sel) {
    const rel = rsub(n.pos, baseR);
    const val = isFinite(n.v) ? Math.round(n.v * 10000) : 0;
    lines.push(`${colOf(n.lane)} ${fmtVP(rf(rel) * 48)} ${val} ${hasLN ? fmtVP(n.lb * 48) : 0} ${n.kind === 'h' ? -1 : 0} ${n.kind === 'm' ? -1 : 0}`);
    items.push({ n, rel });
  }
  const text = lines.join('\r\n');
  A.clip = { text, items };
  return text;
}
function hereBeat() {
  if (A.playMark != null) return A.playMark;
  const Sf = A.ms.Sf, m = measureAt(A.view.bottom + 1e-6);
  return Sf[m] >= A.view.bottom - 1e-6 ? Sf[m] : Sf[Math.min(999, m + 1)];
}
function pasteBase() {
  const h = A.hover && A.hover.h;
  if (h && h.inArea && !h.head) return A.ms.S[Math.min(999, measureAt(Math.max(0, h.beat)))];
  return A.ms.S[measureAt(hereBeat())];
}
function pasteText(text) {
  if (!A.st) return;
  const base = pasteBase();
  let notes = [], skipped = 0;
  if (A.clip && A.clip.text === text) {
    notes = A.clip.items.map(({ n, rel }) => cloneNote(n, { pos: radd(base, rel) }));
  } else {
    const lines = String(text).split(/\r?\n/);
    const head = (lines[0] || '').trim();
    if (!/^iBMSC Clipboard Data/.test(head)) { toast('붙여넣을 수 있는 노트 데이터(iBMSC 형식)가 아닙니다'); return; }
    const nt = /xNT/.test(head);
    let raw = [];
    for (const ln of lines.slice(1)) {
      const p = ln.trim().split(/\s+/);
      if (p.length < 3) continue;
      const flag = (x) => !!x && x !== '0' && x.toLowerCase() !== 'false';
      const lane = laneOfCol(+p[0]), vp = +p[1], val = +p[2];
      const lnv = nt ? (+p[3] || 0) : (flag(p[3]) ? 1 : 0);
      const kind = flag(p[5]) ? 'm' : flag(p[4]) ? 'h' : null;
      if (!lane || (kind && !isKey(lane)) || !isFinite(vp) || vp < 0) { skipped++; continue; }
      raw.push({ lane, vp, val, lnv: kind ? 0 : lnv, kind });
    }
    if (!nt) { // BMSE 방식: LongNote 표시가 붙은 노트 둘이 한 쌍
      const open = {}, keep = [];
      for (const r of raw.sort((a, b) => a.vp - b.vp)) {
        if (r.lnv && isKey(r.lane)) {
          const o = open[r.lane];
          if (o) { o.lenvp = r.vp - o.vp; open[r.lane] = null; continue; }
          open[r.lane] = r;
        }
        r.lenvp = 0; keep.push(r);
      }
      raw = keep;
    } else raw.forEach((r) => { r.lenvp = r.lnv > 0 ? r.lnv : 0; });
    const toR = (vp) => { const x = vp / 48, a = C.rApprox(x, 3840); return Math.abs(rf(a) - x) < 1e-6 ? a : C.rApprox(x, 1e6); };
    for (const r of raw) {
      const pos = radd(base, toR(r.vp));
      if (r.lane === 'BPM' || r.lane === 'STOP') { const v = r.val / 10000; if (v > 0) notes.push(mkNote({ lane: r.lane, pos, v })); else skipped++; continue; }
      const v = Math.round(r.val / 10000);
      if (!(v > 0 && v <= C.idMax(A.doc.base))) { skipped++; continue; }
      const o = { lane: r.lane, pos, v };
      if (r.kind) o.kind = r.kind;
      else if (r.lenvp > 0 && isKey(r.lane)) Object.assign(o, lnStyle(o, toR(r.lenvp)));
      notes.push(mkNote(o));
    }
  }
  const before = notes.length;
  notes = notes.filter((n) => n.b >= 0 && n.b + n.lb < A.ms.Sf[1000]);
  skipped += before - notes.length;
  if (!notes.length) { toast('붙여넣을 노트가 없습니다'); return; }
  const act = { del: [], add: notes };
  const nd = resolveConflicts(act, 'displace');
  commit(act); A.sel = new Set(notes); draw();
  toast(`노트 ${notes.length}개를 마디 ${C.pad3(measureAt(rf(base)))}에 붙여넣었습니다` + (nd ? ` · 겹친 ${nd}개는 빈 BGM 레인으로` : '') + (skipped ? ` · 건너뜀 ${skipped}개(숨김/지뢰/2P 등)` : ''), 4000);
}
