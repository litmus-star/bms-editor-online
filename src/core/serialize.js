/* ───────────── 저장 ───────────── */
function serialize(doc, st, opt) {
  opt = opt || {};
  const enc = opt.encoding || doc.enc;
  const reencode = enc !== doc.enc;
  const encode = getEncoder(enc);
  const base = doc.base;
  const ids = (v) => idStr(v, base);
  const warnings = [];
  const { S } = measureStarts(st.meas);
  const locate = (pos) => locateIn(S, measFn(st.meas), pos);

  // 1) 현재 상태 → 채널 데이터
  const cur = new Map(), curBgm = new Map();
  const put = (m, ch, f, vs) => { const k = m + '|' + ch; let a = cur.get(k); if (!a) cur.set(k, a = []); a.push({ f, vs }); };
  const bpmVal = new Map(), stopVal = new Map();
  for (const [id, d] of doc.bpmDefs) if (isFinite(d.v) && !bpmVal.has(d.v)) bpmVal.set(d.v, id);
  for (const [id, d] of doc.stopDefs) if (isFinite(d.v) && !stopVal.has(d.v)) stopVal.set(d.v, id);
  const usedB = new Set(doc.usedBpm), usedS = new Set(doc.usedStop);
  const newBpm = new Map(), newStop = new Map();
  const alloc = (used) => {
    for (let i = 1; i <= idMax(base); i++) if (!used.has(i)) { used.add(i); return i; }
    throw coreError('core.save.noFreeDefId');
  };
  let lost = 0;
  for (const n of st.notes) {
    const L = locate(n.pos);
    if (!L) { lost++; continue; }
    if (n.lane[0] === 'X') { put(L.m, n.lane.slice(1), L.f, n.vs); continue; }
    if (n.lane === 'BPM') {
      const v = n.v, def = n.bid > 0 ? doc.bpmDefs.get(n.bid) : null;
      if (n.bch === '08' && n.bid > 0 && (!isFinite(v) || (def && def.v === v))) { put(L.m, '08', L.f, ids(n.bid)); continue; }
      if (!isFinite(v) || v <= 0) { lost++; continue; }
      if (n.bch !== '08' && Number.isInteger(v) && v >= 1 && v <= 255) { put(L.m, '03', L.f, hex2(v)); continue; }
      let id = bpmVal.get(v);
      if (id === undefined) { id = alloc(usedB); bpmVal.set(v, id); newBpm.set(id, fmtNum(v)); }
      put(L.m, '08', L.f, ids(id));
    } else if (n.lane === 'STOP') {
      const v = n.v, def = n.sid > 0 ? doc.stopDefs.get(n.sid) : null;
      if (n.sid > 0 && (!isFinite(v) || (def && def.v === v))) { put(L.m, '09', L.f, ids(n.sid)); continue; }
      if (!isFinite(v) || v <= 0) { lost++; continue; }
      let id = stopVal.get(v);
      if (id === undefined) { id = alloc(usedS); stopVal.set(v, id); newStop.set(id, fmtNum(v)); }
      put(L.m, '09', L.f, ids(id));
    } else if (n.lane[0] === 'G') { put(L.m, n.lane.slice(1), L.f, ids(n.v));
    } else if (n.lane[0] === 'B') {
      const k = +n.lane.slice(1);
      let mm = curBgm.get(L.m);
      if (!mm) curBgm.set(L.m, mm = new Map());
      let a = mm.get(k);
      if (!a) mm.set(k, a = []);
      a.push({ f: L.f, vs: ids(n.v) });
    } else {
      const ld = LANE_BY_KEY[n.lane];
      if (!ld) { lost++; continue; }
      if (n.kind === 'h' || n.kind === 'm') put(L.m, n.kind === 'h' ? ld.hch : ld.mch, L.f, ids(n.v));
      else if (n.len && n.len.n > 0) {
        const E = locate(radd(n.pos, n.len));
        if (!E) { lost++; continue; }
        if (n.lnobj && doc.lnobj > 0) { put(L.m, ld.ch, L.f, ids(n.v)); put(E.m, ld.ch, E.f, ids(doc.lnobj)); }
        else { put(L.m, ld.lnch, L.f, ids(n.v)); put(E.m, ld.lnch, E.f, ids(n.ev || n.v)); }
      } else if (n.dangling) put(L.m, ld.lnch, L.f, ids(n.v));
      else put(L.m, ld.ch, L.f, ids(n.v));
    }
  }
  if (lost) warnings.push(msg('core.save.lost', { n: lost }));

  // 2) 원본과 비교해서 바뀐 부분만 다시 쓰기
  const rep = new Map(), insA = new Map(), insB = new Map(), tail = [];
  const add = (map, idx, it) => { let a = map.get(idx); if (!a) map.set(idx, a = []); a.push(it); };
  const sig = (arr) => arr.map((e) => rkey(e.f) + '=' + e.vs).sort().join(',');
  const same = (a, b) => a.length === b.length && sig(a) === sig(b);
  const conflicts = [];
  const lineFor = (m, ch, entries) => makeLine(m, ch, entries, conflicts);
  const dms = [...doc.dataByMeasure.keys()].sort((a, b) => a - b);
  function placeNew(m, ch, texts) {
    const order = parseInt(ch, 36);
    const items = texts.map((t, i) => ({ t, k: [m, order, i] }));
    const inM = doc.dataByMeasure.get(m);
    if (inM && inM.length) {
      let anchor = -1;
      for (const d of inM) if (d.order <= order) anchor = d.idx;
      if (anchor >= 0) items.forEach((it) => add(insA, anchor, it));
      else items.forEach((it) => add(insB, inM[0].idx, it));
      return;
    }
    let pm = -1;
    for (const x of dms) { if (x < m) pm = x; else break; }
    if (pm >= 0) { const a = doc.dataByMeasure.get(pm); items.forEach((it) => add(insA, a[a.length - 1].idx, it)); return; }
    const nm = dms.find((x) => x > m);
    if (nm !== undefined) { const a = doc.dataByMeasure.get(nm); items.forEach((it) => add(insB, a[0].idx, it)); return; }
    items.forEach((it) => tail.push(it));
  }

  // 일반 채널
  const gkeys = new Set([...doc.groups.keys(), ...cur.keys()]);
  for (const key of gkeys) {
    const g = doc.groups.get(key), c = cur.get(key) || [];
    const o = g ? [...g.map.values()] : [];
    if (same(o, c)) continue;
    const bar = key.indexOf('|');
    const m = +key.slice(0, bar), ch = key.slice(bar + 1);
    const nl = c.length ? [lineFor(m, ch, c)] : [];
    if (g) { rep.set(g.lines[0], nl); for (let j = 1; j < g.lines.length; j++) rep.set(g.lines[j], []); }
    else if (nl.length) placeNew(m, ch, nl);
  }
  // BGM (01) — 레인 순서 = 줄 순서. 바뀐 레인의 줄만 다시 쓰고, 빈 레인은 "00" 줄로 자리 유지
  const bms = new Set([...doc.bgm.keys(), ...curBgm.keys()]);
  for (const m of bms) {
    const orig = doc.bgm.get(m) || [];
    const cl = curBgm.get(m) || new Map();
    const maxCur = cl.size ? Math.max(...cl.keys()) + 1 : 0;
    const laneLine = (k) => { const e = cl.get(k) || []; return e.length ? lineFor(m, '01', e) : '#' + pad3(m) + '01:00'; };
    for (let k = 0; k < orig.length; k++) {
      if (!same(orig[k].entries, cl.get(k) || [])) rep.set(orig[k].idx, [laneLine(k)]);
    }
    if (maxCur > orig.length) {
      const extra = [];
      for (let k = orig.length; k < maxCur; k++) extra.push(laneLine(k));
      if (orig.length) {
        const lastIdx = orig[orig.length - 1].idx;
        extra.forEach((t, i) => add(insA, lastIdx, { t, k: [m, 1, -1, i] }));
      } else placeNew(m, '01', extra);
    }
  }
  // 마디 길이 (02)
  const mkeys = new Set([...doc.meas.keys(), ...st.meas.keys()]);
  for (const m of mkeys) {
    const og = doc.meas.get(m), c = st.meas.get(m);
    const o = og && og.r ? og.r : R1, cr = c ? c.r : R1;
    if (req(o, cr)) continue;
    const line = req(cr, R1) ? null : '#' + pad3(m) + '02:' + c.str;
    if (og) {
      const lastIdx = og.idx[og.idx.length - 1];
      for (const j of og.idx) rep.set(j, []);
      rep.set(lastIdx, line ? [line] : []);
    } else if (line) placeNew(m, '02', [line]);
  }

  // 헤더
  const hdrPlace = (it) => {
    if (doc.hdrAnchor >= 0) add(insA, doc.hdrAnchor, it);
    else if (doc.lines.length) add(insB, 0, it);
    else tail.push(it);
  };
  let hi = 0;
  const hk = new Set([...doc.headers.keys(), ...st.headers.keys()]);
  for (const k of hk) {
    const o = doc.headers.get(k), ov = o ? o.value : '';
    const cv = st.headers.has(k) ? (st.headers.get(k) || '') : ov;
    if (ov === cv) continue;
    const text = '#' + (o ? o.keyRaw : k) + ' ' + cv;
    if (o) { if (cv === '') o.all.forEach((j) => rep.set(j, [])); else rep.set(o.idx, [text]); } // 비우면 줄을 지움 (#RANK만 남으면 0으로 읽힘)
    else if (cv !== '') hdrPlace({ t: text, k: [-3, hi++] });
  }
  // WAV
  const wk = [...new Set([...doc.wavs.keys(), ...st.wavs.keys()])].sort((a, b) => a - b);
  for (const id of wk) {
    const o = doc.wavs.get(id), ov = o ? o.name : '', cv = st.wavs.get(id) || '';
    if (ov === cv) continue;
    if (o) { if (cv) rep.set(o.idx, ['#' + o.keyRaw + ' ' + cv]); else o.all.forEach((j) => rep.set(j, [])); }
    else if (cv) {
      const it = { t: '#WAV' + ids(id) + ' ' + cv, k: [-2, id] };
      if (doc.lastWav >= 0) add(insA, doc.lastWav, it); else hdrPlace(it);
    }
  }
  // BMP (BGA 이미지)
  const bmpSt = st.bmps || new Map();
  const bk = [...new Set([...doc.bmps.keys(), ...bmpSt.keys()])].sort((a, b) => a - b);
  for (const id of bk) {
    const o = doc.bmps.get(id), ov = o ? o.name : '', cv = bmpSt.get(id) || '';
    if (ov === cv) continue;
    if (o) { if (cv) rep.set(o.idx, ['#' + o.keyRaw + ' ' + cv]); else o.all.forEach((j) => rep.set(j, [])); }
    else if (cv) {
      const it = { t: '#BMP' + ids(id) + ' ' + cv, k: [-2, 2000 + id] };
      const a = doc.lastBmp >= 0 ? doc.lastBmp : doc.lastWav;
      if (a >= 0) add(insA, a, it); else hdrPlace(it);
    }
  }
  // 새 #BPMxx / #STOPxx 정의
  for (const [id, s] of newBpm) {
    const it = { t: '#BPM' + ids(id) + ' ' + s, k: [-1, 0, id] };
    const a = doc.lastBpmDef >= 0 ? doc.lastBpmDef : doc.lastWav;
    if (a >= 0) add(insA, a, it); else hdrPlace(it);
  }
  for (const [id, s] of newStop) {
    const it = { t: '#STOP' + ids(id) + ' ' + s, k: [-1, 1, id] };
    const a = doc.lastStopDef >= 0 ? doc.lastStopDef : doc.lastBpmDef >= 0 ? doc.lastBpmDef : doc.lastWav;
    if (a >= 0) add(insA, a, it); else hdrPlace(it);
  }
  // 확장 블록 (RANDOM 등) — 원래 자리에 그대로
  const nb = Math.max(doc.blocks.length, st.blocks.length);
  for (let k = 0; k < nb; k++) {
    const b = doc.blocks[k];
    const t = k < st.blocks.length && st.blocks[k] !== undefined ? st.blocks[k] : '';
    if (b && t === b.text) continue;
    const s2 = t.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    const arr = s2.trim() === '' ? [] : s2.split('\n');
    if (!b) { arr.forEach((x, i) => tail.push({ t: x, k: [1e9, k, i] })); continue; }
    // 바뀐 줄만 고치도록 원래 줄과 새 줄을 맞춰 봄 (같은 줄은 원본 바이트 유지)
    const old = []; for (let j = b.start; j <= b.end; j++) old.push(doc.lines[j].text);
    const n1 = old.length, n2 = arr.length;
    if (n1 * n2 > 4e6) { rep.set(b.start, arr); for (let j = b.start + 1; j <= b.end; j++) rep.set(j, []); continue; }
    const T = Array.from({ length: n1 + 1 }, () => new Uint32Array(n2 + 1));
    for (let i = n1 - 1; i >= 0; i--) for (let j = n2 - 1; j >= 0; j--) T[i][j] = old[i] === arr[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
    let i = 0, j = 0, seq = 0;
    while (i < n1 || j < n2) {
      if (i < n1 && j < n2 && old[i] === arr[j]) { i++; j++; continue; }
      if (j < n2 && (i >= n1 || T[i][j + 1] >= T[i + 1][j])) {
        const it = { t: arr[j], k: [1e9 - 1, k, seq++] };
        if (i < n1) add(insB, b.start + i, it); else add(insA, b.end, it);
        j++;
      } else { rep.set(b.start + i, []); i++; }
    }
  }

  // 3) 출력 조립
  const cmpK = (x, y) => {
    const n = Math.max(x.k.length, y.k.length);
    for (let i = 0; i < n; i++) {
      const p = x.k[i] === undefined ? -Infinity : x.k[i], q = y.k[i] === undefined ? -Infinity : y.k[i];
      if (p !== q) return p < q ? -1 : 1;
    }
    return 0;
  };
  const out = [], diff = [];
  const N = doc.lines.length;
  const pushNew = (t) => { out.push({ t }); diff.push({ op: '+', t }); };
  for (let i = 0; i < N; i++) {
    const b = insB.get(i);
    if (b) b.sort(cmpK).forEach((it) => pushNew(it.t));
    const r = rep.get(i);
    if (r === undefined || (r.length === 1 && r[0] === doc.lines[i].text)) out.push({ i });
    else { diff.push({ op: '-', n: i + 1, t: doc.lines[i].text }); r.forEach(pushNew); }
    const a = insA.get(i);
    if (a) a.sort(cmpK).forEach((it) => pushNew(it.t));
  }
  tail.sort(cmpK).forEach((it) => pushNew(it.t));

  const EOLB = { '\r\n': Uint8Array.of(13, 10), '\n': Uint8Array.of(10), '\r': Uint8Array.of(13), '': new Uint8Array(0) };
  const chunks = [], bad = new Set();
  const withBom = doc.bom && enc === 'utf-8';
  if (withBom) chunks.push(Uint8Array.of(0xEF, 0xBB, 0xBF));
  let total = withBom ? 3 : 0;
  for (let j = 0; j < out.length; j++) {
    const p = out[j], last = j === out.length - 1;
    let body, eol;
    if (p.i !== undefined && !reencode) {
      const L = doc.lines[p.i]; body = doc.bytes.subarray(L.s, L.e); eol = L.eol;
    } else {
      const text = p.i !== undefined ? doc.lines[p.i].text : p.t;
      const r = encode(text); r.bad.forEach((c) => bad.add(c)); body = r.bytes;
      eol = p.i !== undefined ? doc.lines[p.i].eol : doc.eol;
    }
    if (last) eol = doc.lastEol ? (eol || doc.eol) : '';
    else if (!eol) eol = doc.eol;
    chunks.push(body, EOLB[eol]);
    total += body.length + EOLB[eol].length;
  }
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { bytes.set(c, off); off += c.length; }

  if (conflicts.length) warnings.push(msg('core.save.conflicts', { n: conflicts.length, list: [...new Set(conflicts)].slice(0, 4).join(', ') + (conflicts.length > 4 ? ' …' : '') }));
  let verify;
  try {
    const re = parse(bytes, enc);
    verify = compareStates(st, stateFromDoc(re));
    if (re.bom !== withBom) { verify.problems.push(msg('core.verify.bom')); verify.ok = false; }
  } catch (e) { verify = { ok: false, problems: [msg('core.verify.reread', { err: e })] }; }
  const det = encodingInfo(bytes);
  if (det.enc !== enc && !det.ambiguous) warnings.push(msg('core.save.encMisdetect', { detected: ENC_LABEL[det.enc], enc: ENC_LABEL[enc] }));
  let kept = 0;
  for (const p of out) if (p.i !== undefined) kept++;
  return {
    bytes, diff, warnings, verify, badChars: [...bad], reencode, enc,
    kept, changed: diff.length, newDefs: newBpm.size + newStop.size,
  };
}

function noteSig(n) {
  const p = rkey(n.pos);
  if (n.lane[0] === 'X') return n.lane + '|' + p + '|' + n.vs;
  if (n.kind) return n.lane + '|' + p + '|' + n.v + '|' + n.kind;
  if (n.lane === 'BPM') return 'BPM|' + p + '|' + (isFinite(n.v) ? +n.v : 'x' + n.bid);
  if (n.lane === 'STOP') return 'STOP|' + p + '|' + (isFinite(n.v) ? +n.v : 'x' + n.sid);
  let s = n.lane + '|' + p + '|' + n.v;
  if (n.len && n.len.n > 0) s += '|L' + rkey(n.len) + '|' + (n.lnobj ? 'o' : (n.ev || n.v));
  else if (n.dangling) s += '|D';
  return s;
}
function compareStates(a, b) {
  const problems = [];
  const sa = a.notes.map(noteSig).sort(), sb = b.notes.map(noteSig).sort();
  if (sa.join('\n') !== sb.join('\n')) {
    const ca = new Map(), cb = new Map();
    sa.forEach((k) => ca.set(k, (ca.get(k) || 0) + 1));
    sb.forEach((k) => cb.set(k, (cb.get(k) || 0) + 1));
    const miss = [], extra = [];
    for (const [k, c] of ca) if (c > (cb.get(k) || 0)) miss.push(k);
    for (const [k, c] of cb) if (c > (ca.get(k) || 0)) extra.push(k);
    problems.push(miss.length ? msg('core.verify.notesEx', { miss: miss.length, extra: extra.length, ex: miss[0] }) : msg('core.verify.notes', { miss: miss.length, extra: extra.length }));
  }
  const ms = new Set([...a.meas.keys(), ...b.meas.keys()]);
  for (const m of ms) {
    const x = a.meas.get(m), y = b.meas.get(m);
    if (!req(x ? x.r : R1, y ? y.r : R1)) problems.push(msg('core.verify.measLen', { m: pad3(m) }));
  }
  const hs = new Set([...a.headers.keys(), ...b.headers.keys()]);
  for (const k of hs) if (canonJP(a.headers.get(k)) !== canonJP(b.headers.get(k))) problems.push(msg('core.verify.header', { k }));
  const ws = new Set([...a.wavs.keys(), ...b.wavs.keys()]);
  let wbad = 0;
  for (const k of ws) if (canonJP(a.wavs.get(k)) !== canonJP(b.wavs.get(k))) wbad++;
  if (wbad) problems.push(msg('core.verify.wav', { n: wbad }));
  const bs = new Set([...(a.bmps || new Map()).keys(), ...(b.bmps || new Map()).keys()]);
  let bbad = 0;
  for (const k of bs) if (canonJP((a.bmps || new Map()).get(k)) !== canonJP((b.bmps || new Map()).get(k))) bbad++;
  if (bbad) problems.push(msg('core.verify.bmp', { n: bbad }));
  const flat = (arr) => arr.join('\n').split('\n').map((s) => s.trim()).filter(Boolean).join('\n');
  if (flat(a.blocks) !== flat(b.blocks)) problems.push(msg('core.verify.blocks'));
  return { ok: problems.length === 0, problems };
}
