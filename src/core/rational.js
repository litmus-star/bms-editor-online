
/* ───────────── 유리수 (위치 계산은 전부 정확한 분수로) ───────────── */
const safe = Number.isSafeInteger;
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
function lcm(a, b) { return (a / gcd(a, b)) * b; }
function bgcd(a, b) { if (a < 0n) a = -a; if (b < 0n) b = -b; while (b) { const t = a % b; a = b; b = t; } return a; }
function R(n, d) {
  if (d === undefined) d = 1;
  if (d === 0) throw coreError('core.zeroDenominator', null, RangeError);
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}
function RB(n, d) {
  if (d < 0n) { n = -n; d = -d; }
  const g = bgcd(n, d) || 1n; n /= g; d /= g;
  const a = Number(n), b = Number(d);
  if (!safe(a) || !safe(b)) throw coreError('core.overflow', null, RangeError);
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
  if (b.n === 0) throw coreError('core.divByZero', null, RangeError);
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
