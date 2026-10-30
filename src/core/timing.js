/* ───────────── 타이밍 (BPM 변화 · STOP) ───────────── */
function buildTiming(notes, initBpm) {
  const ev = [];
  for (const n of notes) {
    if (n.lane === 'BPM' && isFinite(n.v) && n.v > 0) ev.push({ b: n.b, bpm: n.v, o: 0 });
    else if (n.lane === 'STOP' && isFinite(n.v) && n.v > 0) ev.push({ b: n.b, stop: n.v, o: 1 });
  }
  ev.sort((x, y) => x.b - y.b || x.o - y.o);
  const segs = [{ b: 0, t: 0, a: 0, bpm: initBpm > 0 ? initBpm : 130 }];
  let cur = segs[0];
  for (const e of ev) {
    const tAt = cur.t + (e.b - cur.b) * 60 / cur.bpm;
    const a = e.b === cur.b ? cur.a : tAt;
    if (e.bpm) cur = { b: e.b, t: tAt, a, bpm: e.bpm };
    else cur = { b: e.b, t: tAt + (e.stop / 48) * 60 / cur.bpm, a, bpm: cur.bpm };
    segs.push(cur);
  }
  function segAtBeat(b) {
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (segs[mid].b <= b) lo = mid; else hi = mid - 1; }
    return segs[lo];
  }
  return {
    segs,
    beatToTime(b) { const s = segAtBeat(b); if (s.b === b) return s.a; return s.t + (b - s.b) * 60 / s.bpm; },
    timeToBeat(t) {
      let lo = 0, hi = segs.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (segs[mid].a <= t) lo = mid; else hi = mid - 1; }
      const s = segs[lo];
      if (t < s.t) return s.b;
      return s.b + (t - s.t) * s.bpm / 60;
    },
    bpmAt(b) { return segAtBeat(b).bpm; },
  };
}

/* 확장 블록 안의 노트 (읽기 전용 표시용) */
function blockGhosts(texts, base, meas) {
  const { S } = measureStarts(meas);
  const Lm = (m) => (meas.get(m) || { r: R1 }).r;
  const out = [];
  for (const t of texts) {
    if (!t) continue;
    for (const line of t.split('\n')) {
      const m = DATA_RE.exec(strip(line));
      if (!m) continue;
      const ch = m[2].toUpperCase();
      const lane = CH2LANE[ch] || (ch === '03' || ch === '08' ? 'BPM' : ch === '09' ? 'STOP' : null);
      if (!lane) continue;
      const mm = +m[1];
      for (const o of parseObjs(m[3], base, ch === '03')) {
        const pos = radd(S[mm], rmul(o.f, rmul(Lm(mm), R4)));
        out.push({ lane, b: rf(pos), vs: o.vs, kind: CH2KIND[ch] });
      }
    }
  }
  return out;
}

const NEW_TEMPLATE = [
  '', '*---------------------- HEADER FIELD', '',
  '#PLAYER 1', '#GENRE ', '#TITLE ', '#ARTIST ', '#BPM 130', '#PLAYLEVEL 1', '#RANK 2', '',
  '#LNTYPE 1', '', '', '*---------------------- MAIN DATA FIELD', '', '',
].join('\r\n');
