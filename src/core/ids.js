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
