/* ───────── 스크롤 · 확대 ───────── */
function updateScroller() {
  if (!A.ms || !A.H) return;
  A.sp.style.height = Math.ceil(A.ms.Sf[A.extentM] * A.ppb + A.H) + 'px';
  A.sp.style.width = Math.ceil(A.totalW) + 'px';
  syncScroll();
}
function syncScroll() {
  const max = A.sc.scrollHeight - A.sc.clientHeight;
  const want = Math.max(0, Math.round(max - A.view.bottom * A.ppb));
  if (Math.abs(A.sc.scrollTop - want) >= 1) A.sc.scrollTop = want;
  if (Math.abs(A.sc.scrollLeft - A.view.left) >= 1) A.sc.scrollLeft = A.view.left;
}
function onScroll() {
  const max = A.sc.scrollHeight - A.sc.clientHeight;
  const b = Math.max(0, (max - A.sc.scrollTop) / A.ppb);
  if (Math.abs(b - A.view.bottom) * A.ppb >= 1) A.view.bottom = b;
  A.view.left = A.sc.scrollLeft;
  draw();
}
function setBottom(b) { A.view.bottom = Math.max(0, b); syncScroll(); draw(); }
// 가로 확대: 마우스 아래 레인이 제자리에 있도록 BGA·BGM 스크롤 위치를 맞춤
function setZoomX(z, anchorX) {
  z = Math.min(4, Math.max(0.4, z));
  const old = cfg.zoomX || 1;
  cfg.zoomX = z; saveCfg(); $('#zoomXR').value = z;
  if (anchorX === undefined) anchorX = A.fixW;
  const ox = anchorX >= A.fixW ? anchorX + A.view.left : anchorX;
  layout();
  if (anchorX >= A.fixW) {
    const nx = MEAS_W + (ox - MEAS_W) * (z / old);
    A.view.left = Math.max(0, nx - anchorX);
  }
  updateScroller(); draw();
}
function setZoom(z, anchorBeat, anchorY) {
  z = Math.min(8, Math.max(0.25, z));
  if (anchorBeat === undefined) { anchorY = A.H; anchorBeat = A.view.bottom; }
  cfg.zoom = z; saveCfg(); A.ppb = PPB * z;
  A.view.bottom = Math.max(0, anchorBeat - (A.H - anchorY) / A.ppb);
  $('#zoomR').value = z;
  updateScroller(); draw();
}
function resize() {
  const W = A.sc.clientWidth, H = A.sc.clientHeight, dpr = window.devicePixelRatio || 1;
  A.W = W; A.H = H; A.dpr = dpr;
  A.cv.width = Math.round(W * dpr); A.cv.height = Math.round(H * dpr);
  A.cv.style.width = W + 'px'; A.cv.style.height = H + 'px';
  updateScroller(); draw();
}

/* ───────── 그리기 ───────── */
let rafPending = false;
function draw() { if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; paint(); }); } }
function noteLabel(n, w) {
  if (n.lane === 'BPM') return isFinite(n.v) ? fmtV(n.v) : '?' + idS(n.bid);
  if (n.lane === 'STOP') return isFinite(n.v) ? fmtV(n.v) : '?' + idS(n.sid);
  if (n.lane[0] === 'G') { const nm = cfg.showName && A.st.bmps.get(n.v); return nm ? trunc(baseName(nm), Math.max(2, Math.floor((w - 4) / 6))) : idS(n.v); }
  if (cfg.showName && !n.kind) { const nm = A.st.wavs.get(n.v); if (nm) return trunc(baseName(nm), Math.max(2, Math.floor((w - 4) / 6))); }
  return idS(n.v);
}
function drawNote(ctx, n, l, x, yOf, nh, alpha, pv) {
  const mine = n.kind === 'm', hid = n.kind === 'h';
  const col = mine ? '#8a1426' : NOTE_COL[l.col], y = yOf(n.b), xx = x + 2, w = l.w - 4;
  if (hid) alpha *= 0.4;
  ctx.globalAlpha = alpha;
  let topY = y - nh;
  if (n.lb > 0) {
    const ye = yOf(n.b + n.lb), cap = capH();
    ctx.fillStyle = col; ctx.globalAlpha = alpha * 0.38; ctx.fillRect(xx + 5, ye, w - 10, y - ye);
    ctx.globalAlpha = alpha; ctx.fillRect(xx, ye - cap, w, cap);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(xx, ye - 1, w, 1);
    topY = Math.min(topY, ye - cap);
  } else if (n.dangling) {
    ctx.fillStyle = '#ff3030'; ctx.fillRect(xx + 6, y - nh - 12, w - 12, 12); topY = y - nh - 12;
  }
  ctx.fillStyle = col; ctx.fillRect(xx, y - nh, w, nh);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(xx, y - nh, w, 1);
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(xx, y - 1, w, 1);
  if (nh >= 8) { ctx.fillStyle = mine ? '#ffd6dc' : NOTE_TXT[l.col]; ctx.fillText((mine ? '✕' : '') + noteLabel(n, w), xx + w / 2, y - nh / 2 + 0.5); }
  if (hid || mine) { // 숨김: 흐리게 + 점선, 지뢰: 진한 빨강 + 점선
    ctx.globalAlpha = 1; ctx.setLineDash([3, 2]); ctx.lineWidth = 1;
    ctx.strokeStyle = mine ? '#ff6b7f' : col; ctx.strokeRect(xx + 0.5, y - nh + 0.5, w - 1, nh - 1); ctx.setLineDash([]);
  }
  if (!pv) {
    if (n._m && !n._c) { ctx.strokeStyle = '#ff9a1f'; ctx.lineWidth = 2; ctx.setLineDash([4, 2]); ctx.strokeRect(xx - 1, topY - 1, w + 2, y - topY + 2); ctx.setLineDash([]); }
    if (n._c) { ctx.strokeStyle = '#ff2b2b'; ctx.lineWidth = 2; ctx.strokeRect(xx - 1, topY - 1, w + 2, y - topY + 2); }
    if (A.sel.has(n)) { ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2; ctx.strokeRect(xx - 1, topY - 1, w + 2, y - topY + 2); }
    else if (A.hover && A.hover.note === n) { ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1; ctx.strokeRect(xx - 0.5, topY - 0.5, w + 1, y - topY + 1); }
  }
  ctx.globalAlpha = 1;
}
function paint() {
  const ctx = A.ctx, W = A.W, H = A.H;
  if (!W || !H) return;
  ctx.setTransform(A.dpr, 0, 0, A.dpr, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (!A.st) return;
  const ppb = A.ppb, bot = A.view.bottom, left = A.view.left, Sf = A.ms.Sf, nh = noteH();
  const yOf = (b) => H - (b - bot) * ppb;
  const top = bot + (H - HEAD_H) / ppb;
  const vis = (l) => { const x = laneX(l); return scrolls(l) ? x + l.w > A.fixW && x < W : x < W; };
  const clipB = (l) => { ctx.save(); if (scrolls(l)) { ctx.beginPath(); ctx.rect(A.fixW, 0, W - A.fixW, H); ctx.clip(); } };

  for (const l of A.lanes) {
    if (l.type === 'meas' || !vis(l)) continue;
    const x = laneX(l); clipB(l);
    ctx.fillStyle = LANE_BG[l.col]; ctx.fillRect(x, HEAD_H, l.w, H - HEAD_H);
    ctx.fillStyle = '#232323'; ctx.fillRect(x + l.w - 1, HEAD_H, 1, H - HEAD_H);
    ctx.restore();
  }
  const gx0 = MEAS_W;
  const lastL = A.lanes[A.lanes.length - 1];
  const gx1 = Math.min(W, Math.max(A.fixW, laneX(lastL) + lastL.w));
  const m0 = measureAt(Math.max(0, bot)), m1 = Math.min(999, measureAt(top));
  const step = 4 / cfg.grid;
  for (let m = m0; m <= m1; m++) {
    const sb = Sf[m], eb = Sf[m + 1];
    for (let k = Math.max(1, Math.floor((bot - sb) / step)); ; k++) {
      const b = sb + k * step;
      if (b >= eb - 1e-9 || b > top + step) break;
      const off = k * step;
      ctx.fillStyle = Math.abs(off - Math.round(off)) < 1e-6 ? '#3a3a3a' : '#1f1f1f';
      ctx.fillRect(gx0, Math.round(yOf(b)), gx1 - gx0, 1);
    }
    ctx.fillStyle = '#8c8c8c'; ctx.fillRect(gx0, Math.round(yOf(sb)), gx1 - gx0, 1);
  }

  ctx.font = 'bold 10px Consolas, Menlo, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (A.ghosts.length) {
    ctx.setLineDash([3, 2]); ctx.lineWidth = 1;
    for (const g of A.ghosts) {
      if (g.b < bot - 1 || g.b > top + 1) continue;
      const l = A.laneMap.get(g.lane); if (!l || !vis(l)) continue;
      const x = laneX(l), y = yOf(g.b);
      ctx.fillStyle = 'rgba(150,150,150,.25)'; ctx.fillRect(x + 2, y - nh, l.w - 4, nh);
      ctx.strokeStyle = 'rgba(200,200,200,.65)'; ctx.strokeRect(x + 2.5, y - nh + 0.5, l.w - 5, nh - 1);
      if (nh >= 8) { ctx.fillStyle = '#c8c8c8'; ctx.fillText(g.vs, x + l.w / 2, y - nh / 2 + 0.5); }
    }
    ctx.setLineDash([]);
  }
  const d = A.drag, hide = d && d.hide;
  for (const l of A.lanes) {
    if (l.type === 'meas' || !vis(l)) continue;
    const arr = A.by.get(l.key); if (!arr) continue;
    const x = laneX(l); clipB(l);
    for (let i = lowerBound(arr, bot - (A.maxLen.get(l.key) || 0) - (nh + 14) / ppb); i < arr.length; i++) {
      const n = arr[i];
      if (n.b > top + 0.01) break;
      drawNote(ctx, n, l, x, yOf, nh, hide && hide.has(n) ? 0.22 : 1, false);
    }
    ctx.restore();
  }
  const pv = (p) => { const l = A.laneMap.get(p.lane); if (l && vis(l)) { const ga = ctx.globalAlpha; clipB(l); ctx.globalAlpha = ga; drawNote(ctx, p, l, laneX(l), yOf, nh, 0.82 * ga, true); ctx.restore(); } };
  if (d && d.kind === 'move' && d.moved) d.preview.forEach(pv);
  if (d && (d.kind === 'place' || d.kind === 'resize') && d.preview) pv(d.preview);
  if (!d && A.mode === 'write' && A.hover && A.hover.ghost) { ctx.globalAlpha = 0.5; pv(A.hover.ghost); ctx.globalAlpha = 1; }

  if (d && d.kind === 'band') {
    const xa = Math.min(d.x0, d.x1), xb = Math.max(d.x0, d.x1);
    const ya = yOf(Math.max(d.b0, d.b1)), yb = yOf(Math.min(d.b0, d.b1));
    ctx.fillStyle = 'rgba(90,170,255,.12)'; ctx.fillRect(xa, ya, xb - xa, yb - ya);
    ctx.strokeStyle = '#5aaaff'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(xa + 0.5, ya + 0.5, xb - xa, yb - ya); ctx.setLineDash([]);
  }

  if (A.view.left > 0) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(A.fixW - 8, HEAD_H, 8, H - HEAD_H); }
  // 마디 번호 칸 (가로 스크롤해도 고정)
  ctx.fillStyle = '#060606'; ctx.fillRect(0, HEAD_H, MEAS_W, H - HEAD_H);
  ctx.fillStyle = '#2c2c2c'; ctx.fillRect(MEAS_W - 1, HEAD_H, 1, H - HEAD_H);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (let m = m0; m <= Math.min(999, m1 + 1); m++) {
    const y = Math.round(yOf(Sf[m]));
    if (y < HEAD_H || y > H + 24) continue;
    ctx.fillStyle = '#8c8c8c'; ctx.fillRect(0, y, MEAS_W, 1);
    ctx.fillStyle = '#e2e2e2'; ctx.font = 'bold 12px Consolas, Menlo, monospace'; ctx.fillText(C.pad3(m), 6, y - 4);
    const g = A.st.meas.get(m);
    if (g) { ctx.fillStyle = '#7fb0ff'; ctx.font = '10px Consolas, Menlo, monospace'; ctx.fillText(beatLabel(g.r), 6, y - 17); }
  }
  if (A.playBeat != null) { const y = Math.round(yOf(A.playBeat)); ctx.fillStyle = '#ff3355'; ctx.fillRect(0, y - 1, W, 2); }

  ctx.fillStyle = '#1a1b1f'; ctx.fillRect(0, 0, W, HEAD_H);
  ctx.fillStyle = '#34373e'; ctx.fillRect(0, HEAD_H - 1, W, 1);
  ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const l of A.lanes) {
    if (l.type === 'meas' || !vis(l)) continue;
    ctx.fillStyle = l.type === 'bgm' ? '#8f96a1' : NOTE_COL[l.col];
    clipB(l); ctx.fillText(l.label, laneX(l) + l.w / 2, HEAD_H / 2); ctx.restore();
  }
  ctx.fillStyle = '#1a1b1f'; ctx.fillRect(0, 0, MEAS_W, HEAD_H - 1);
  ctx.fillStyle = '#9a9a9a'; ctx.fillText('마디', MEAS_W / 2, HEAD_H / 2);
}
