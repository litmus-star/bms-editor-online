/* ───────────── 레인 / 채널 ───────────── */
// 키 레인: 일반(ch) · 롱노트(lnch) · 숨김(hch) · 지뢰(mch) 채널. 화면 순서대로 (1P: SC 1~7, 2P: 1~7 SC)
const keyLane = (p, d, label) => ({ key: 'K' + p + d, p: +p, ch: p + d, lnch: (+p + 4) + d, hch: (+p + 2) + d, mch: (p === '1' ? 'D' : 'E') + d, label });
const KEY_LANES = [
  keyLane('1', '6', 'SC'), keyLane('1', '1', '1'), keyLane('1', '2', '2'), keyLane('1', '3', '3'),
  keyLane('1', '4', '4'), keyLane('1', '5', '5'), keyLane('1', '8', '6'), keyLane('1', '9', '7'),
  keyLane('2', '1', '1'), keyLane('2', '2', '2'), keyLane('2', '3', '3'), keyLane('2', '4', '4'),
  keyLane('2', '5', '5'), keyLane('2', '8', '6'), keyLane('2', '9', '7'), keyLane('2', '6', 'SC'),
];
// PMS(팝픈뮤직 9버튼): 1~5 = 1P 1~5키(11~15), 6~9 = 2P 2~5키(22~25). 색은 팝픈 버튼 색(흰·노·초·파·빨·파·초·노·흰)
const PMS_LANES = [
  ['K11', '1', 'pw'], ['K12', '2', 'py'], ['K13', '3', 'pg'], ['K14', '4', 'pb'], ['K15', '5', 'pr'],
  ['K22', '6', 'pb'], ['K23', '7', 'pg'], ['K24', '8', 'py'], ['K25', '9', 'pw'],
].map(([key, label, col]) => ({ key, label, col }));
const BGA_LANES = [{ key: 'G04', ch: '04', label: 'BGA' }, { key: 'G07', ch: '07', label: 'LAYER' }, { key: 'G06', ch: '06', label: 'POOR' }];
const LANE_BY_KEY = {}, CH2LANE = {}, CH2KIND = {};
KEY_LANES.forEach((l) => {
  LANE_BY_KEY[l.key] = l;
  for (const [c, k] of [[l.ch, 'n'], [l.lnch, 'l'], [l.hch, 'h'], [l.mch, 'm']]) { CH2LANE[c] = l.key; CH2KIND[c] = k; }
});
BGA_LANES.forEach((l) => { LANE_BY_KEY[l.key] = l; CH2LANE[l.ch] = l.key; CH2KIND[l.ch] = 'g'; });
const MANAGED = new Set(['01', '02', '03', '08', '09'].concat(Object.keys(CH2LANE)));

const CTRL_RE = /^#(SETRANDOM|RANDOM|RONDAM|IFEND|IF|ELSEIF|ELSE|ENDIF|ENDRANDOM|SETSWITCH|SWITCH|CASE|SKIP|DEF|ENDSW)(?![0-9A-Za-z_])/i;
const DATA_RE = /^#(\d{3})([0-9A-Za-z]{2}):(.*)$/;
const HDR_RE = /^#(\S+)(?:[ \t　]+(.*))?$/;
const lstrip = (s) => s.replace(/^[\s　]+/, '');
const strip = (s) => s.replace(/^[\s　]+/, '').replace(/[\s　]+$/, '');

function parseMeasureLen(s) {
  const t = String(s).trim();
  const m = /^\+?(\d*)(?:\.(\d*))?$/.exec(t);
  let r = null;
  if (m && (m[1] || m[2])) {
    const ip = m[1] || '0', fp = m[2] || '';
    if (fp.length <= 6) {
      const d = Math.pow(10, fp.length);
      r = R(parseInt(ip, 10) * d + (fp ? parseInt(fp, 10) : 0), d);
    } else {
      const x = parseFloat(t);
      const a = rApprox(x, 10000);
      r = (a && Math.abs(rf(a) - x) <= 1e-9 * Math.max(1, x)) ? a : R(Math.round(x * 1e9), 1e9);
    }
  } else {
    const x = parseFloat(t);
    if (isFinite(x) && x > 0) r = rApprox(x, 10000);
  }
  if (!r || r.n <= 0) return null;
  return r;
}
function lenStr(r) {
  for (let p = 0, pow = 1; p <= 10; p++, pow *= 10) {
    const x = r.n * pow;
    if (safe(x) && x % r.d === 0) {
      const v = x / r.d;
      if (p === 0) return String(v);
      const s = String(v).padStart(p + 1, '0');
      return s.slice(0, s.length - p) + '.' + s.slice(s.length - p);
    }
  }
  return (r.n / r.d).toFixed(9).replace(/0+$/, '');
}

function parseObjs(data, base, hex) {
  const s = data.replace(/[\s　]+/g, '');
  const n = Math.floor(s.length / 2), out = [];
  for (let i = 0; i < n; i++) {
    const vs = s.substr(i * 2, 2);
    if (vs === '00') continue;
    let v;
    if (hex) { if (!/^[0-9A-Fa-f]{2}$/.test(vs)) continue; v = parseInt(vs, 16); }
    else v = idParse(vs, base);
    if (!(v > 0)) continue;
    out.push({ f: R(i, n), v, vs: hex ? vs.toUpperCase() : idNorm(vs, base) });
  }
  return out;
}

function parseRaw(data) {
  const s = data.replace(/[\s\u3000]+/g, '');
  const n = Math.floor(s.length / 2), out = [];
  for (let i = 0; i < n; i++) { const vs = s.substr(i * 2, 2); if (vs !== '00') out.push({ f: R(i, n), vs }); }
  return out;
}
function makeLine(m, ch, entries, conflicts) {
  let res = 1;
  for (const e of entries) res = lcm(res, e.f.d);
  if (!safe(res) || res > 200000) throw coreError('core.lineTooLong', { line: `#${pad3(m)}${ch}` }, RangeError);
  const arr = new Array(res).fill('00');
  for (const e of entries) {
    const i = e.f.n * (res / e.f.d);
    if (arr[i] !== '00' && conflicts) conflicts.push(`#${pad3(m)}${ch}`);
    arr[i] = e.vs;
  }
  return '#' + pad3(m) + ch + ':' + arr.join('');
}
function locateIn(S, Lm, pos) {
  if (rcmp(pos, R0) < 0 || rcmp(pos, S[1000]) >= 0) return null;
  let lo = 0, hi = 1000;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rcmp(S[mid], pos) <= 0) lo = mid; else hi = mid; }
  return { m: lo, f: rdiv(rsub(pos, S[lo]), rmul(Lm(lo), R4)) };
}
function measFn(meas) { return (m) => { const g = meas.get(m); return g && g.r ? g.r : R1; }; }
/* 마디 길이를 바꿀 때 확장 블록 안 데이터 줄도 같은 박 위치를 유지하도록 다시 나눔 */
function retimeBlockText(text, oldMeas, newMeas) {
  if (!text) return text;
  const So = measureStarts(oldMeas).S, Sn = measureStarts(newMeas).S, Lo = measFn(oldMeas), Ln = measFn(newMeas);
  let changed = false;
  const out = [];
  for (const line of text.split('\n')) {
    const m = DATA_RE.exec(strip(line));
    if (!m || m[2] === '02') { out.push(line); continue; }
    const mm = +m[1], objs = parseRaw(m[3]);
    const groups = new Map();
    let same = true, fail = false;
    for (const o of objs) {
      const loc = locateIn(Sn, Ln, radd(So[mm], rmul(o.f, rmul(Lo(mm), R4))));
      if (!loc) { fail = true; break; }
      if (loc.m !== mm || !req(loc.f, o.f)) same = false;
      if (!groups.has(loc.m)) groups.set(loc.m, []);
      groups.get(loc.m).push({ f: loc.f, vs: o.vs });
    }
    if (fail || same) { out.push(line); continue; }
    changed = true;
    for (const nm of [...groups.keys()].sort((a, b) => a - b)) out.push(makeLine(nm, m[2], groups.get(nm)));
  }
  return changed ? out.join('\n') : text;
}

function measureStarts(meas) {
  const S = new Array(1001), Sf = new Float64Array(1001);
  let acc = R0;
  for (let m = 0; m <= 1000; m++) {
    S[m] = acc; Sf[m] = rf(acc);
    const g = meas.get(m);
    acc = radd(acc, rmul(g && g.r ? g.r : R1, R4));
  }
  return { S, Sf };
}

/* RANDOM / IF / SWITCH 블록 찾기 */
function detectBlocks(lines) {
  const blocks = [];
  let inB = false, start = -1, last = -1, rd = 0, idp = 0, sw = 0;
  const close = (endIdx) => {
    blocks.push({ start, end: endIdx });
    for (let j = start; j <= endIdx; j++) lines[j].block = blocks.length - 1;
    inB = false;
  };
  for (let i = 0; i < lines.length; i++) {
    const t = lstrip(lines[i].text);
    const cm = CTRL_RE.exec(t);
    const c = cm ? cm[1].toUpperCase() : null;
    if (!inB) {
      if (!c) continue;
      inB = true; start = i; last = i; rd = 0; idp = 0; sw = 0;
      if (['IF', 'ELSEIF', 'ELSE', 'ENDIF', 'IFEND', 'ENDRANDOM'].includes(c)) rd = 1;
      if (c === 'ELSEIF' || c === 'ELSE') idp = 1;
      if (['CASE', 'SKIP', 'DEF', 'ENDSW'].includes(c)) sw = 1;
    }
    if (c) {
      switch (c) {
        case 'RANDOM': case 'RONDAM': case 'SETRANDOM': rd++; break;
        case 'ENDRANDOM': rd--; break;
        case 'IF': idp++; break;
        case 'ENDIF': case 'IFEND': if (idp > 0) idp--; break;
        case 'SWITCH': case 'SETSWITCH': sw++; break;
        case 'ENDSW': if (sw > 0) sw--; break;
        default: break;
      }
      last = i;
      if (rd <= 0 && idp <= 0 && sw <= 0) close(i);
      continue;
    }
    if (strip(t) === '' || t[0] !== '#') { if (idp > 0 || sw > 0) last = i; continue; }
    if (idp > 0 || sw > 0) { last = i; continue; }
    close(last); // IF 밖의 일반 줄 → 블록 끝 (이 줄은 일반 줄로 처리)
  }
  if (inB) close(last);
  return blocks;
}

let UID = 0;
function finalizeNote(n) {
  n.uid = ++UID;
  n.b = rf(n.pos);
  n.lb = n.len ? rf(n.len) : 0;
  return n;
}
