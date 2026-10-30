/* ───────────── 읽기 ───────────── */
function parse(bytes, encHint) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  const info = encHint ? { enc: encHint, ambiguous: false } : encodingInfo(bytes);
  const enc = info.enc;
  const dec = new TextDecoder(enc, { ignoreBOM: true });
  const bom = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
  const lines = splitLines(bytes, bom ? 3 : 0).map((r) => ({
    s: r.s, e: r.e, eol: r.eol, text: dec.decode(bytes.subarray(r.s, r.e)), block: -1, kind: '',
  }));
  let crlf = 0, lf = 0, cr = 0;
  for (const L of lines) { if (L.eol === '\r\n') crlf++; else if (L.eol === '\n') lf++; else if (L.eol === '\r') cr++; }
  const eol = cr > crlf && cr > lf ? '\r' : lf > crlf ? '\n' : '\r\n';
  const lastEol = lines.length === 0 ? true : lines[lines.length - 1].eol !== '';

  const blocks = detectBlocks(lines).map((b) => ({
    start: b.start, end: b.end, text: lines.slice(b.start, b.end + 1).map((l) => l.text).join('\n'),
  }));

  let base = 36;
  for (const L of lines) {
    if (L.block >= 0) continue;
    const m = /^#BASE[ \t]+(\d+)/i.exec(strip(L.text));
    if (m) base = +m[1] === 62 ? 62 : 36;
  }

  const headers = new Map(), wavs = new Map(), bmps = new Map(), bpmDefs = new Map(), stopDefs = new Map();
  const usedBpm = new Set(), usedStop = new Set();
  let firstData = -1;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const t = strip(L.text);
    if (!t.startsWith('#')) { L.kind = t === '' ? 'blank' : 'comment'; continue; }
    let m = DATA_RE.exec(t);
    if (m) {
      L.kind = 'data'; L.m = +m[1]; L.ch = m[2].toUpperCase(); L.data = m[3].trim();
      if (L.block < 0 && firstData < 0) firstData = i;
      continue;
    }
    m = HDR_RE.exec(t);
    if (!m) { L.kind = 'comment'; continue; }
    L.kind = 'hdr'; L.keyRaw = m[1]; L.key = m[1].toUpperCase(); L.value = (m[2] || '').trim();
    let mm;
    if ((mm = /^WAV(.{2})$/i.exec(L.keyRaw))) { L.kind = 'wav'; L.idRaw = mm[1]; }
    else if ((mm = /^BMP(.{2})$/i.exec(L.keyRaw))) { L.kind = 'bmp'; L.idRaw = mm[1]; }
    else if (L.key !== 'BPM' && (mm = /^(?:EX)?BPM(.{2})$/i.exec(L.keyRaw))) { L.kind = 'bpmdef'; L.idRaw = mm[1]; }
    else if ((mm = /^STOP(.{2})$/i.exec(L.keyRaw))) { L.kind = 'stopdef'; L.idRaw = mm[1]; }
    if (L.kind === 'bpmdef' || L.kind === 'stopdef') {
      const id = idParse(L.idRaw, base);
      if (id > 0) (L.kind === 'bpmdef' ? usedBpm : usedStop).add(id);
    }
    if (L.block >= 0) continue;
    if (L.kind === 'hdr') { const o = headers.get(L.key); headers.set(L.key, { value: L.value, idx: i, keyRaw: L.keyRaw, all: (o ? o.all : []).concat(i) }); }
    else if (L.kind === 'bmp') { const id = idParse(L.idRaw, base); if (id >= 0) { const o = bmps.get(id); bmps.set(id, { name: L.value, idx: i, keyRaw: L.keyRaw, all: (o ? o.all : []).concat(i) }); } }
    else if (L.kind === 'wav') { const id = idParse(L.idRaw, base); if (id > 0) { const o = wavs.get(id); wavs.set(id, { name: L.value, idx: i, keyRaw: L.keyRaw, all: (o ? o.all : []).concat(i) }); } }
    else if (L.kind === 'bpmdef') { const id = idParse(L.idRaw, base); if (id > 0) bpmDefs.set(id, { str: L.value, v: parseFloat(L.value), idx: i }); }
    else if (L.kind === 'stopdef') { const id = idParse(L.idRaw, base); if (id > 0) stopDefs.set(id, { str: L.value, v: parseFloat(L.value), idx: i }); }
  }

  for (const L of lines) { // 08/09가 가리키는 번호는 정의가 없어도 새 정의에 쓰지 않음
    if (L.kind !== 'data' || (L.ch !== '08' && L.ch !== '09')) continue;
    for (const o of parseRaw(L.data)) { const id = idParse(o.vs, base); if (id > 0) (L.ch === '08' ? usedBpm : usedStop).add(id); }
  }
  let lastBmp = -1;
  let hdrAnchor = -1, lastWav = -1, lastBpmDef = -1, lastStopDef = -1, lastHdrAny = -1;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (L.block >= 0) continue;
    if (L.kind === 'hdr') { lastHdrAny = i; if (firstData < 0 || i < firstData) hdrAnchor = i; }
    else if (L.kind === 'wav') lastWav = i;
    else if (L.kind === 'bmp') lastBmp = i;
    else if (L.kind === 'bpmdef') lastBpmDef = i;
    else if (L.kind === 'stopdef') lastStopDef = i;
  }
  if (hdrAnchor < 0) hdrAnchor = lastHdrAny;

  const lnobjH = headers.get('LNOBJ');
  const lnobj = lnobjH ? idParse(lnobjH.value.trim().slice(0, 2), base) : -1;
  const lntypeH = headers.get('LNTYPE');
  const lntype = lntypeH ? (parseInt(lntypeH.value, 10) || 1) : 1;
  const isManaged = (ch) => MANAGED.has(ch) && !(lntype === 2 && CH2KIND[ch] === 'l');

  const groups = new Map(), bgm = new Map(), meas = new Map(), dataByMeasure = new Map();
  let unmanagedData = 0, hasP2 = false;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (L.kind !== 'data' || L.block >= 0) continue;
    let dm = dataByMeasure.get(L.m);
    if (!dm) dataByMeasure.set(L.m, dm = []);
    dm.push({ idx: i, order: parseInt(L.ch, 36) });
    if (/^[26][1-9]$/.test(L.ch) && L.data.replace(/0/g, '') !== '') hasP2 = true;
    if (!isManaged(L.ch)) { // 편집하지 않는 채널도 절대 위치로 보관 (마디 길이를 바꿔도 함께 유지)
      L.managed = false; unmanagedData++;
      const key = L.m + '|' + L.ch;
      let g = groups.get(key);
      if (!g) groups.set(key, g = { m: L.m, ch: L.ch, lines: [], map: new Map(), raw: true });
      g.lines.push(i);
      for (const o of parseRaw(L.data)) g.map.set(rkey(o.f), o);
      continue;
    }
    L.managed = true;
    if (L.ch === '02') {
      let g = meas.get(L.m);
      if (!g) meas.set(L.m, g = { idx: [], r: null, str: null });
      g.idx.push(i);
      const r = parseMeasureLen(L.data);
      if (r) { g.r = r; g.str = L.data; }
      continue;
    }
    const objs = parseObjs(L.data, base, L.ch === '03');
    if (L.ch === '01') {
      let a = bgm.get(L.m);
      if (!a) bgm.set(L.m, a = []);
      a.push({ idx: i, entries: objs });
      continue;
    }
    const key = L.m + '|' + L.ch;
    let g = groups.get(key);
    if (!g) groups.set(key, g = { m: L.m, ch: L.ch, lines: [], map: new Map() });
    g.lines.push(i);
    for (const o of objs) g.map.set(rkey(o.f), o); // 같은 자리는 나중 줄 우선
  }

  // 노트 만들기
  const st0meas = new Map();
  for (const [m, g] of meas) if (g.r) st0meas.set(m, { str: g.str, r: g.r });
  const { S } = measureStarts(st0meas);
  const Lm = (m) => (st0meas.get(m) || { r: R1 }).r;
  const posOf = (m, f) => radd(S[m], rmul(f, rmul(Lm(m), R4)));
  const notes = [], keyN = {}, keyL = {};
  for (const g of groups.values()) {
    for (const o of g.map.values()) {
      const pos = posOf(g.m, o.f);
      if (g.raw) notes.push({ lane: 'X' + g.ch, pos, v: 0, vs: o.vs });
      else if (g.ch === '03') notes.push({ lane: 'BPM', pos, v: o.v, bch: '03' });
      else if (g.ch === '08') { const d = bpmDefs.get(o.v); notes.push({ lane: 'BPM', pos, v: d ? d.v : NaN, bch: '08', bid: o.v }); }
      else if (g.ch === '09') { const d = stopDefs.get(o.v); notes.push({ lane: 'STOP', pos, v: d ? d.v : NaN, sid: o.v }); }
      else {
        const lane = CH2LANE[g.ch], kd = CH2KIND[g.ch];
        if (kd === 'g') notes.push({ lane, pos, v: o.v });
        else if (kd === 'h' || kd === 'm') notes.push({ lane, pos, v: o.v, kind: kd });
        else { const tgt = kd === 'n' ? keyN : keyL; (tgt[lane] || (tgt[lane] = [])).push({ pos, v: o.v }); }
      }
    }
  }
  const byPos = (a, b) => rcmp(a.pos, b.pos);
  for (const lane in keyN) {
    const arr = keyN[lane].sort(byPos);
    let prev = null;
    for (const o of arr) {
      if (lnobj > 0 && o.v === lnobj && prev) {
        prev.len = rsub(o.pos, prev.pos); prev.ev = o.v; prev.lnobj = true; prev = null; continue;
      }
      const n = { lane, pos: o.pos, v: o.v };
      notes.push(n);
      prev = (lnobj > 0 && o.v !== lnobj) ? n : null;
    }
  }
  for (const lane in keyL) {
    const arr = keyL[lane].sort(byPos);
    for (let i = 0; i < arr.length; i += 2) {
      const a = arr[i], b = arr[i + 1];
      if (b) notes.push({ lane, pos: a.pos, v: a.v, len: rsub(b.pos, a.pos), ev: b.v });
      else notes.push({ lane, pos: a.pos, v: a.v, dangling: true });
    }
  }
  for (const [m, arr] of bgm) {
    arr.forEach((ln, k) => { for (const o of ln.entries) notes.push({ lane: 'B' + k, pos: posOf(m, o.f), v: o.v }); });
  }
  notes.forEach(finalizeNote);
  if (notes.some((n) => LANE_BY_KEY[n.lane] && LANE_BY_KEY[n.lane].p === 2)) hasP2 = true;

  return {
    bytes, enc, encAmbiguous: info.ambiguous, bom, eol, lastEol, lines, base, headers, wavs, bmps, bpmDefs, stopDefs, usedBpm, usedStop,
    groups, bgm, meas, blocks, notes, lnobj, lntype, firstData, hdrAnchor, lastWav, lastBmp, lastBpmDef, lastStopDef,
    dataByMeasure, unmanagedData, hasP2,
  };
}

function stateFromDoc(doc) {
  const meas = new Map();
  for (const [m, g] of doc.meas) if (g.r) meas.set(m, { str: g.str, r: g.r });
  return {
    notes: doc.notes.slice(),
    meas,
    headers: new Map([...doc.headers].map(([k, h]) => [k, h.value])),
    wavs: new Map([...doc.wavs].map(([id, w]) => [id, w.name])),
    bmps: new Map([...doc.bmps].map(([id, w]) => [id, w.name])),
    blocks: doc.blocks.map((b) => b.text),
  };
}
