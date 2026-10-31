/* ───────── 터치 · 펜 (Pointer Events) ─────────
   마우스·S펜: 기존 마우스 동작 그대로 (펜 옆 버튼 = 오른쪽 클릭 = 삭제)
   손가락: 노트 끌기 = 이동, 빈 곳 끌기 = 화면 이동, 두 손가락 = 확대/축소,
           탭 = 선택(쓰기 모드는 찍기), 길게 누르기 = 빈 곳: 범위 선택 / 노트: 메뉴
   펜과 손가락은 따로 모드가 없다: 손가락은 늘 위의 동작, 펜은 그 위에 마우스처럼 얹힌다.
   펜이 화면에 닿아 있는 동안만 새로 닿는 손가락을 무시한다(펜 쥔 손바닥 오작동 방지). */
const T = { pts: new Map(), st: null, pinch: null, lp: 0, mousePid: null };
const TAP_MOVE = 12, LONG_MS = 450; // 안드로이드 기본 터치 흔들림 허용치(약 8dp)보다 넉넉하게, 길게 누르기는 크롬 자체 길게 누르기(약 500ms)보다 먼저

/* 관성 스크롤: 손가락으로 빈 곳을 끌다 놓으면 그 속도로 미끄러지다 서서히 멈춘다.
   FLING_FRICTION: 1ms마다 속도에 곱하는 값. 1에 가까울수록 오래 미끄러짐 (0.9985 ≈ 0.67초마다 속도가 1/e로, 1이면 영영 안 멈춤) */
const FLING_FRICTION = 0.9985, FLING_MIN_START = 0.25, FLING_MIN_STOP = 0.02, FLING_MAX = 8, FLING_WINDOW = 100;
const F = { on: false, vx: 0, vy: 0, t: 0, raf: 0 };
// 플레이 영역(고정 구역)에서 시작한 끌기·관성은 세로로만: BGA·BGM 영역의 가로 스크롤이 같이 움직이지 않게
function stopFling() { if (!F.on) return false; F.on = false; cancelAnimationFrame(F.raf); A.userScroll = false; return true; }
function panBy(dx, dy) { // 손가락 기준 이동량(px): 아래로 끌면 앞(곡 시작 쪽)으로
  const maxL = Math.max(0, A.sc.scrollWidth - A.sc.clientWidth);
  A.view.bottom = Math.max(0, A.view.bottom + dy / A.ppb);
  A.view.left = Math.min(maxL, Math.max(0, A.view.left - dx));
  syncScroll(); draw();
  return { atBottom: A.view.bottom <= 0, atEdgeX: A.view.left <= 0 || A.view.left >= maxL };
}
function startFling(s, tUp) {
  const hs = s.hist; if (!hs || hs.length < 2) return;
  const last = hs[hs.length - 1];
  if (tUp - last.t > 60) return; // 멈췄다가 뗐으면 미끄러지지 않음
  let first = last;
  for (let i = hs.length - 1; i >= 0 && last.t - hs[i].t <= FLING_WINDOW; i--) first = hs[i];
  const dt = last.t - first.t; if (dt < 8) return;
  const clamp = (v) => Math.max(-FLING_MAX, Math.min(FLING_MAX, v));
  F.vx = s.lockX ? 0 : clamp((last.x - first.x) / dt); F.vy = clamp((last.y - first.y) / dt);
  if (Math.hypot(F.vx, F.vy) < FLING_MIN_START) return;
  F.on = true; F.t = performance.now(); A.userScroll = true;
  const step = (now) => {
    if (!F.on) return;
    const dt2 = Math.min(50, Math.max(0, now - F.t)); F.t = now;
    const r = panBy(F.vx * dt2, F.vy * dt2);
    if (r.atBottom && F.vy < 0) F.vy = 0;
    if (r.atEdgeX) F.vx = 0;
    const k = Math.pow(FLING_FRICTION, dt2); F.vx *= k; F.vy *= k;
    if (Math.hypot(F.vx, F.vy) < FLING_MIN_STOP) { stopFling(); return; }
    F.raf = requestAnimationFrame(step);
  };
  F.raf = requestAnimationFrame(step);
}

function onPointerDown(e) {
  A.lastPtr = e.pointerType;
  if (e.pointerType !== 'touch') stopFling();
  if (e.pointerType === 'touch') { touchDown(e); return; }
  if (e.pointerType === 'pen') setTouchUI(true);
  if (T.mousePid !== null) return;
  T.mousePid = e.pointerId;
  if (e.pointerType === 'pen') { // 펜이 닿으면 진행 중이던 손가락 동작은 끝냄
    A.penDown = true; clearTimeout(T.lp); hideCtx();
    if (T.st && (T.st.phase === 'note' || T.st.phase === 'band')) { A.drag = null; }
    if (T.st && T.st.phase === 'pan') A.userScroll = false;
    T.st = null; T.pinch = null; T.pts.clear();
  }
  try { A.sc.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
  A.slop = e.pointerType === 'pen' ? 4 : 0;
  onDown(e);
  A.slop = 0;
}
function onPointerMove(e) {
  if (e.pointerType === 'touch') { touchMove(e); return; }
  if (T.mousePid !== null && e.pointerId !== T.mousePid) return;
  onMove(e);
}
function onPointerUp(e) {
  if (e.pointerType === 'touch') { touchUp(e); return; }
  if (e.pointerId !== T.mousePid) return;
  T.mousePid = null; A.penDown = false;
  onUp(e);
}

/* 손가락 */
function touchDown(e) {
  e.preventDefault();
  dbg('down ' + e.pointerId + ' ' + Math.round(e.clientX) + ',' + Math.round(e.clientY));
  if (A.penDown) return; // 펜으로 편집하는 중에 닿은 손가락(손바닥)은 무시
  setTouchUI(true);
  T.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { A.sc.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
  const wasFling = stopFling(); // 미끄러지는 중에 닿으면 멈추기만 (탭으로 선택·찍기 안 함)
  if (T.pts.size === 2) { startPinch(); return; }
  if (T.pts.size > 2 || T.pinch) return;
  hideCtx();
  const h = hitAt(e);
  if (!A.st || !h.inArea || h.head) { T.st = null; return; }
  A.slop = 12; const n = wasFling ? null : noteAt(h); A.slop = 0;
  A.hover = { note: null, ghost: null, h }; // 붙여넣기 위치 기준
  const t0 = e.timeStamp || performance.now();
  T.st = { x: e.clientX, y: e.clientY, ev: e, h, note: n, phase: 'pending', b0: A.view.bottom, l0: A.view.left, stopTap: wasFling,
    px: e.clientX, py: e.clientY, hist: [{ t: t0, x: e.clientX, y: e.clientY }], lockX: h.mx < A.fixW };
  clearTimeout(T.lp);
  if (!wasFling) T.lp = setTimeout(longPress, LONG_MS);
  if (n && !(h.lane && h.lane.type === 'meas')) { // 노트를 잡으면 바로 선택·이동 준비 (마우스와 같은 경로)
    T.st.phase = 'note';
    A.slop = 12; onDown(fakeMouse(e)); A.slop = 0;
  }
}
function touchMove(e) {
  if (!T.pts.has(e.pointerId)) return;
  e.preventDefault();
  T.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (T.pinch) { movePinch(); return; }
  const s = T.st; if (!s) return;
  const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y) > TAP_MOVE;
  if (moved) clearTimeout(T.lp);
  // 노트를 누른 손가락은 TAP_MOVE 넘게 움직여야 이동 시작 (실제 손가락은 가만히 있어도 몇 px씩 흔들려서, 그대로 두면 길게 누르기 메뉴가 안 뜸)
  if (s.phase === 'note' && !s.dragging) { if (!moved) return; s.dragging = true; }
  if (s.phase === 'note' || s.phase === 'band') { onMove(fakeMouse(e)); return; }
  if (s.phase === 'pending' && moved) { s.phase = 'pan'; A.userScroll = true; }
  if (s.phase === 'pan') {
    panBy(s.lockX ? 0 : e.clientX - s.px, e.clientY - s.py);
    s.px = e.clientX; s.py = e.clientY;
    const t = e.timeStamp || performance.now();
    s.hist.push({ t, x: e.clientX, y: e.clientY });
    while (s.hist.length > 2 && t - s.hist[0].t > FLING_WINDOW * 2) s.hist.shift();
  }
}
function touchUp(e) {
  dbg(e.type + ' ' + e.pointerId + (T.st ? ' ' + T.st.phase : ''));
  if (!T.pts.has(e.pointerId)) return;
  T.pts.delete(e.pointerId);
  clearTimeout(T.lp);
  if (T.pinch) { if (T.pts.size === 0) T.pinch = null; return; } // 핀치가 끝나도 남은 손가락은 무시
  const s = T.st; T.st = null;
  if (!s) return;
  if (s.phase === 'note' || s.phase === 'band') { onUp(fakeMouse(e)); return; }
  if (s.phase === 'pan') { A.userScroll = false; if (e.type !== 'pointercancel') startFling(s, e.timeStamp || performance.now()); return; }
  if (s.phase === 'pending' && !s.stopTap) { // 빈 곳 탭: 선택 해제 / 쓰기 모드는 노트 찍기
    onDown(fakeMouse(s.ev)); onUp(fakeMouse(s.ev));
  }
}
function longPress() {
  clearTimeout(T.lp);
  const s = T.st; if (!s) return;
  dbg('longPress ' + s.phase);
  if (s.phase === 'note') { // 노트 길게 누르기: 이동을 취소하고 메뉴
    if (A.drag && A.drag.moved) return;
    A.drag = null; s.phase = 'menu'; draw();
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (err) { /* 무시 */ }
    showCtx(s.note, s.x, s.y, true);
    return;
  }
  if (s.phase === 'pending' && A.mode === 'select') { // 빈 곳 길게 누르기: 범위 선택 시작
    s.phase = 'band';
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (err) { /* 무시 */ }
    onDown(fakeMouse(s.ev));
  }
}
function startPinch() {
  clearTimeout(T.lp); hideCtx(); stopFling(); A.userScroll = false;
  if (T.st && (T.st.phase === 'note' || T.st.phase === 'band')) { A.drag = null; draw(); } // 편집 중이던 끌기는 취소
  T.st = null;
  const [a, b] = [...T.pts.values()];
  const r = A.sc.getBoundingClientRect();
  const cy = (a.y + b.y) / 2 - r.top, cx = (a.x + b.x) / 2 - r.left;
  T.pinch = { dx: Math.abs(a.x - b.x), dy: Math.abs(a.y - b.y), z: cfg.zoom, zx: cfg.zoomX || 1, cx, cy,
    beat: A.view.bottom + (A.H - cy) / A.ppb, l0: A.view.left };
}
function movePinch() {
  const p = T.pinch; if (!p || T.pts.size < 2) return;
  const [a, b] = [...T.pts.values()];
  const r = A.sc.getBoundingClientRect();
  const cy = (a.y + b.y) / 2 - r.top, cx = (a.x + b.x) / 2 - r.left;
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  // 손가락을 벌린 방향대로: 세로로 벌리면 세로 확대, 가로로 벌리면 가로 확대
  if (p.dy > 40) setZoom(p.z * dy / p.dy, p.beat, cy); else setBottom(p.beat - (A.H - cy) / A.ppb);
  if (p.dx > 40) setZoomX(p.zx * dx / p.dx, cx);
}
function fakeMouse(e) {
  return { clientX: e.clientX, clientY: e.clientY, button: 0, buttons: 1, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, preventDefault() {} };
}


/* 터치·펜을 쓰면 툴바 버튼을 크게 */
function setTouchUI(on) {
  if (A.touchUI === on) return;
  A.touchUI = on;
  document.body.classList.toggle('touch', on);
}
// 크롬이 손가락 길게 누르기를 먼저 알아채면 contextmenu 이벤트가 온다: 그때도 같은 길게 누르기 처리
function onTouchContextMenu(e) {
  e.preventDefault();
  dbg('contextmenu ' + (T.st ? T.st.phase : '-'));
  if (A.lastPtr === 'touch' && T.st && (T.st.phase === 'note' || T.st.phase === 'pending')) longPress();
}
// 터치 문제 진단용: 주소 끝에 ?debug=touch 를 붙이면 화면 왼쪽 위에 최근 터치 이벤트를 표시
const DBG = /[?&]debug=touch/.test(location.search) ? [] : null;
function dbg(msg) {
  if (!DBG) return;
  DBG.push(Math.round(performance.now()) % 100000 + ' ' + msg); if (DBG.length > 14) DBG.shift();
  let el = document.getElementById('touchDbg');
  if (!el) { el = document.createElement('pre'); el.id = 'touchDbg'; el.style.cssText = 'position:fixed;left:4px;top:4px;z-index:99;margin:0;padding:4px 6px;background:rgba(0,0,0,.8);color:#9f9;font:11px monospace;pointer-events:none'; document.body.appendChild(el); }
  el.textContent = DBG.join('\n');
}
function bindTouch() {
  const sc = A.sc;
  sc.addEventListener('pointerdown', onPointerDown);
  sc.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointermove', (e) => { if (e.target !== sc && e.pointerType !== 'touch') onPointerMove(e); });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  sc.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && !A.drag && A.hover) { A.hover = null; statusPos(null); statusNote(); draw(); } });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ctxMenu')) hideCtx(); }, true);
}
