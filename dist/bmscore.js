/* BMS Web Editor — core (DOM 없음) */
(function (G) {
'use strict';
/* ── core/rational.js ── */

/* ───────────── 유리수 (위치 계산은 전부 정확한 분수로) ───────────── */
const safe = Number.isSafeInteger;
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
function lcm(a, b) { return (a / gcd(a, b)) * b; }
function bgcd(a, b) { if (a < 0n) a = -a; if (b < 0n) b = -b; while (b) { const t = a % b; a = b; b = t; } return a; }
function R(n, d) {
  if (d === undefined) d = 1;
  if (d === 0) throw new RangeError('분모가 0입니다');
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}
function RB(n, d) {
  if (d < 0n) { n = -n; d = -d; }
  const g = bgcd(n, d) || 1n; n /= g; d /= g;
  const a = Number(n), b = Number(d);
  if (!safe(a) || !safe(b)) throw new RangeError('위치 계산 범위를 넘었습니다');
  return { n: a, d: b };
}
const R0 = { n: 0, d: 1 }, R1 = { n: 1, d: 1 }, R4 = { n: 4, d: 1 };
function radd(a, b) {
  const g = gcd(a.d, b.d), l = (a.d / g) * b.d, x = a.n * (l / a.d), y = b.n * (l / b.d);
  if (safe(l) && safe(x) && safe(y) && safe(x + y)) return R(x + y, l);
  return RB(BigInt(a.n) * BigInt(b.d) + BigInt(b.n) * BigInt(a.d), BigInt(a.d) * BigInt(b.d));
}
function rsub(a, b) { return radd(a, { n: -b.n, d: b.d }); }
function rmul(a, b) {
  const g1 = gcd(a.n, b.d) || 1, g2 = gcd(b.n, a.d) || 1;
  const n = (a.n / g1) * (b.n / g2), d = (a.d / g2) * (b.d / g1);
  if (safe(n) && safe(d)) return R(n, d);
  return RB(BigInt(a.n) * BigInt(b.n), BigInt(a.d) * BigInt(b.d));
}
function rdiv(a, b) {
  if (b.n === 0) throw new RangeError('0으로 나눌 수 없습니다');
  return rmul(a, b.n < 0 ? { n: -b.d, d: -b.n } : { n: b.d, d: b.n });
}
function rcmp(a, b) {
  const x = a.n * b.d, y = b.n * a.d;
  if (safe(x) && safe(y)) return x < y ? -1 : x > y ? 1 : 0;
  const X = BigInt(a.n) * BigInt(b.d), Y = BigInt(b.n) * BigInt(a.d);
  return X < Y ? -1 : X > Y ? 1 : 0;
}
function req(a, b) { return a.n === b.n && a.d === b.d; }
function rf(a) { return a.n / a.d; }
function rkey(a) { return a.n + '/' + a.d; }
/* 연분수로 가장 가까운 분수 (분모 maxDen 이하) */
function rApprox(x, maxDen) {
  if (!isFinite(x)) return null;
  const neg = x < 0; x = Math.abs(x);
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0, v = x;
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(v);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > maxDen || !safe(h2)) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    const fr = v - a;
    if (fr < 1e-12) break;
    v = 1 / fr;
  }
  if (k1 === 0) return R(neg ? -Math.round(x) : Math.round(x), 1);
  return R(neg ? -h1 : h1, k1);
}

/* ── core/ids.js ── */
/* ───────────── 번호 (36진수 / #BASE 62) ───────────── */
const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const B62 = B36 + 'abcdefghijklmnopqrstuvwxyz';
function idParse(s, base) {
  if (typeof s !== 'string' || s.length !== 2) return -1;
  if (base === 62) { const a = B62.indexOf(s[0]), b = B62.indexOf(s[1]); return a < 0 || b < 0 ? -1 : a * 62 + b; }
  const a = B36.indexOf(s[0].toUpperCase()), b = B36.indexOf(s[1].toUpperCase());
  return a < 0 || b < 0 ? -1 : a * 36 + b;
}
function idStr(n, base) { const k = base === 62 ? 62 : 36, A = base === 62 ? B62 : B36; return A[Math.floor(n / k)] + A[n % k]; }
function idMax(base) { return base === 62 ? 62 * 62 - 1 : 36 * 36 - 1; }
function idNorm(s, base) { return base === 62 ? s : s.toUpperCase(); }
function hex2(v) { return (v < 16 ? '0' : '') + v.toString(16).toUpperCase(); }
function pad3(m) { return String(m).padStart(3, '0'); }
function fmtNum(v) { return String(+(+v).toFixed(6)); }

/* ── core/encoding.js ── */
/* ───────────── 인코딩 ───────────── */
const ENC_LABEL = { 'shift_jis': 'Shift-JIS', 'utf-8': 'UTF-8', 'euc-kr': 'EUC-KR' };
const encCache = {};
const JP_ALIAS = [
  ['〜', '～'], ['‖', '∥'], ['−', '－'], ['¢', '￠'],
  ['£', '￡'], ['¬', '￢'], ['—', '―'], ['¦', '￤'],
  ['¥', '\\'], ['‾', '~'],
];
const canonJP = (s) => { let r = String(s || '').trim(); for (const [a, b] of JP_ALIAS) r = r.split(a).join(b); return r; };
function buildTable(name) {
  const dec = new TextDecoder(name), map = new Map(), buf = new Uint8Array(2);
  const tryPair = (lead, tr) => {
    buf[0] = lead; buf[1] = tr;
    const s = dec.decode(buf);
    if (s.length === 1 && s !== '�' && !map.has(s)) map.set(s, (lead << 8) | tr);
  };
  if (name === 'shift_jis') {
    for (let b = 0xA1; b <= 0xDF; b++) map.set(String.fromCharCode(0xFF61 + b - 0xA1), b);
    for (let lead = 0x81; lead <= 0xFC; lead++) {
      if (lead >= 0xA0 && lead <= 0xDF) continue;
      if (lead === 0xED || lead === 0xEE) continue; // NEC 선정 IBM 확장(중복) 제외 → cp932와 같은 선택
      for (let tr = 0x40; tr <= 0xFC; tr++) if (tr !== 0x7F) tryPair(lead, tr);
    }
    if (!map.has('¥')) map.set('¥', 0x5C);
    if (!map.has('‾')) map.set('‾', 0x7E);
    map.set('\u0080', 0x80);
    // Windows(cp932) 방식 대체: 맥/웹에서 흔히 들어오는 글자
    for (const [from, to] of JP_ALIAS) if (!map.has(from) && map.has(to)) map.set(from, map.get(to));
  } else {
    for (let lead = 0x81; lead <= 0xFE; lead++)
      for (let tr = 0x41; tr <= 0xFE; tr++) {
        if ((tr > 0x5A && tr < 0x61) || (tr > 0x7A && tr < 0x81)) continue;
        tryPair(lead, tr);
      }
  }
  return map;
}
function getEncoder(name) {
  if (encCache[name]) return encCache[name];
  let fn;
  if (name === 'utf-8') {
    const te = new TextEncoder();
    fn = (s) => ({ bytes: te.encode(s), bad: s.indexOf('\uFFFD') >= 0 ? ['\uFFFD'] : [] });
  } else {
    let table = null;
    fn = (s) => {
      const out = [], bad = [];
      for (const ch of s) {
        const cp = ch.codePointAt(0);
        if (cp < 0x80) { out.push(cp); continue; }
        if (!table) table = buildTable(name);
        const b = table.get(ch);
        if (b === undefined) { out.push(0x3F); bad.push(ch); }
        else if (b > 0xFF) out.push(b >> 8, b & 0xFF);
        else out.push(b);
      }
      return { bytes: Uint8Array.from(out), bad };
    };
  }
  return (encCache[name] = fn);
}
function encodingInfo(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return { enc: 'utf-8', ambiguous: false };
  let high = false;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] >= 0x80) { high = true; break; }
  if (!high) return { enc: 'shift_jis', ambiguous: false };
  let utf8 = false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); utf8 = true; } catch (e) { /* not utf-8 */ }
  if (utf8) {
    // 3바이트 이상 문자(한글·한자·가나)가 있으면 UTF-8로 확정
    for (let i = 0; i < bytes.length; i++) if (bytes[i] >= 0xE0) return { enc: 'utf-8', ambiguous: false };
    // 2바이트 문자만 있으면 Shift-JIS 반각 가나와 구별되지 않음
    if (new TextDecoder('shift_jis').decode(bytes).indexOf('\uFFFD') >= 0) return { enc: 'utf-8', ambiguous: false };
  }
  // Shift-JIS vs EUC-KR: 높은 바이트가 전부 반각 가나 범위(A1~DF)면 구별 불가 → Shift-JIS
  let halfOnly = true, pairs = 0, hangul = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 0x80) continue;
    if (b < 0xA1 || b > 0xDF) halfOnly = false;
    const t = bytes[i + 1];
    if (t !== undefined && t >= 0x80 && (t < 0xA1 || t > 0xDF)) halfOnly = false;
    pairs++;
    if (b >= 0xB0 && b <= 0xC8 && t >= 0xA1 && t <= 0xFE) hangul++;
    i++;
  }
  if (halfOnly) return { enc: 'shift_jis', ambiguous: true };
  if (pairs >= 2 && hangul / pairs >= 0.7) return { enc: 'euc-kr', ambiguous: false };
  return { enc: 'shift_jis', ambiguous: false };
}
function detectEncoding(bytes) { return encodingInfo(bytes).enc; }

/* ── core/lines.js ── */
/* ───────────── 줄 나누기 (원본 바이트 보존용) ───────────── */
function splitLines(bytes, start0) {
  const out = []; let start = start0 || 0;
  if (bytes.indexOf(0x0A) < 0 && bytes.indexOf(0x0D) >= 0) { // 옛 맥 형식(CR만)
    for (let i = start; i < bytes.length; i++) if (bytes[i] === 0x0D) { out.push({ s: start, e: i, eol: '\r' }); start = i + 1; }
    if (start < bytes.length) out.push({ s: start, e: bytes.length, eol: '' });
    return out;
  }
  for (let i = start; i < bytes.length; i++) {
    if (bytes[i] === 0x0A) {
      let e = i, eol = '\n';
      if (e > start && bytes[e - 1] === 0x0D) { e--; eol = '\r\n'; }
      out.push({ s: start, e, eol });
      start = i + 1;
    }
  }
  if (start < bytes.length) out.push({ s: start, e: bytes.length, eol: '' });
  return out;
}

/* ── core/channels.js ── */
/* ───────────── 레인 / 채널 ───────────── */
// 키 레인: 일반(ch) · 롱노트(lnch) · 숨김(hch) · 지뢰(mch) 채널. 화면 순서대로 (1P: SC 1~7, 2P: 1~7 SC)
const keyLane = (p, d, label) => ({ key: 'K' + p + d, p: +p, ch: p + d, lnch: (+p + 4) + d, hch: (+p + 2) + d, mch: (p === '1' ? 'D' : 'E') + d, label });
const KEY_LANES = [
  keyLane('1', '6', 'SC'), keyLane('1', '1', '1'), keyLane('1', '2', '2'), keyLane('1', '3', '3'),
  keyLane('1', '4', '4'), keyLane('1', '5', '5'), keyLane('1', '8', '6'), keyLane('1', '9', '7'),
  keyLane('2', '1', '1'), keyLane('2', '2', '2'), keyLane('2', '3', '3'), keyLane('2', '4', '4'),
  keyLane('2', '5', '5'), keyLane('2', '8', '6'), keyLane('2', '9', '7'), keyLane('2', '6', 'SC'),
];
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
  if (!safe(res) || res > 200000) throw new RangeError(`#${pad3(m)}${ch}: 줄이 너무 길어 저장할 수 없습니다`);
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

/* ── core/parse.js ── */
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

/* ── core/serialize.js ── */
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
    throw new Error('#BPM/#STOP 정의 번호가 부족합니다');
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
  if (lost) warnings.push(`저장할 수 없는 노트 ${lost}개 (마디 999 밖이거나 값이 잘못됨)`);

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

  if (conflicts.length) warnings.push(`같은 자리에 겹친 노트가 있어 ${conflicts.length}개가 저장되지 않습니다 (${[...new Set(conflicts)].slice(0, 4).join(', ')}${conflicts.length > 4 ? ' …' : ''})`);
  let verify;
  try {
    const re = parse(bytes, enc);
    verify = compareStates(st, stateFromDoc(re));
    if (re.bom !== withBom) { verify.problems.push('BOM 위치가 달라졌습니다'); verify.ok = false; }
  } catch (e) { verify = { ok: false, problems: ['저장 결과를 다시 읽지 못했습니다: ' + e.message] }; }
  const det = encodingInfo(bytes);
  if (det.enc !== enc && !det.ambiguous) warnings.push(`이 파일을 나중에 열면 ${ENC_LABEL[det.enc]}(으)로 잘못 알아볼 수 있습니다. 열 때 아래쪽 인코딩을 ${ENC_LABEL[enc]}(으)로 맞춰 주세요.`);
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
    problems.push(`노트 불일치: 저장본에서 빠짐 ${miss.length}종, 예상과 다름 ${extra.length}종` + (miss.length ? ` (예: ${miss[0]})` : ''));
  }
  const ms = new Set([...a.meas.keys(), ...b.meas.keys()]);
  for (const m of ms) {
    const x = a.meas.get(m), y = b.meas.get(m);
    if (!req(x ? x.r : R1, y ? y.r : R1)) problems.push(`마디 ${pad3(m)} 길이 불일치`);
  }
  const hs = new Set([...a.headers.keys(), ...b.headers.keys()]);
  for (const k of hs) if (canonJP(a.headers.get(k)) !== canonJP(b.headers.get(k))) problems.push(`헤더 #${k} 불일치`);
  const ws = new Set([...a.wavs.keys(), ...b.wavs.keys()]);
  let wbad = 0;
  for (const k of ws) if (canonJP(a.wavs.get(k)) !== canonJP(b.wavs.get(k))) wbad++;
  if (wbad) problems.push(`#WAV 정의 ${wbad}개 불일치`);
  const bs = new Set([...(a.bmps || new Map()).keys(), ...(b.bmps || new Map()).keys()]);
  let bbad = 0;
  for (const k of bs) if (canonJP((a.bmps || new Map()).get(k)) !== canonJP((b.bmps || new Map()).get(k))) bbad++;
  if (bbad) problems.push(`#BMP 정의 ${bbad}개 불일치`);
  const flat = (arr) => arr.join('\n').split('\n').map((s) => s.trim()).filter(Boolean).join('\n');
  if (flat(a.blocks) !== flat(b.blocks)) problems.push('확장 블록 내용 불일치');
  return { ok: problems.length === 0, problems };
}

/* ── core/timing.js ── */
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

/* ── core/_export.js ── */
G.BMSCore = {
  R, R0, R1, R4, radd, rsub, rmul, rdiv, rcmp, req, rf, rkey, rApprox, gcd, lcm,
  idParse, idStr, idMax, hex2, pad3, fmtNum, parse, serialize, stateFromDoc, measureStarts,
  buildTiming, blockGhosts, detectEncoding, encodingInfo, getEncoder, splitLines, parseMeasureLen, lenStr, retimeBlockText,
  noteSig, compareStates, finalizeNote, KEY_LANES, BGA_LANES, LANE_BY_KEY, CH2LANE, CH2KIND, ENC_LABEL, NEW_TEMPLATE,
};

})(typeof window !== 'undefined' ? window : globalThis);
