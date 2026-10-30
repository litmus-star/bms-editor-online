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
