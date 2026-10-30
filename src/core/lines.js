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
