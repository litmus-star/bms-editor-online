/* ───────── 터치 · 펜 (Pointer Events) ─────────
   마우스·S펜: 기존 마우스 동작 그대로 (펜 옆 버튼 = 오른쪽 클릭 = 삭제)
   손가락: 노트 끌기 = 이동, 빈 곳 끌기 = 화면 이동, 두 손가락 = 확대/축소,
           탭 = 선택(쓰기 모드는 찍기), 길게 누르기 = 빈 곳: 범위 선택 / 노트: 메뉴
   펜을 한 번이라도 쓰면: 펜은 편집, 손가락은 화면 이동·확대만 */
const T = { pts: new Map(), st: null, pinch: null, lp: 0, mousePid: null };
const TAP_MOVE = 8, LONG_MS = 500;

function onPointerDown(e) {
  A.lastPtr = e.pointerType;
  if (e.pointerType === 'touch') { touchDown(e); return; }
  if (e.pointerType === 'pen') { A.penMode = true; setTouchUI(true); }
  if (T.mousePid !== null) return;
  T.mousePid = e.pointerId;
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
  T.mousePid = null;
  onUp(e);
}

/* 손가락 */
function touchDown(e) {
  e.preventDefault();
  setTouchUI(true);
  T.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { A.sc.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
  if (T.pts.size === 2) { startPinch(); return; }
  if (T.pts.size > 2 || T.pinch) return;
  hideCtx();
  const h = hitAt(e);
  if (!A.st || !h.inArea || h.head) { T.st = null; return; }
  A.slop = 12; const n = A.penMode ? null : noteAt(h); A.slop = 0;
  A.hover = { note: null, ghost: null, h }; // 붙여넣기 위치 기준
  T.st = { x: e.clientX, y: e.clientY, ev: e, h, note: n, phase: 'pending', b0: A.view.bottom, l0: A.view.left };
  clearTimeout(T.lp);
  if (!A.penMode) T.lp = setTimeout(longPress, LONG_MS);
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
  if (s.phase === 'note' || s.phase === 'band') { onMove(fakeMouse(e)); return; }
  if (s.phase === 'pending' && moved) s.phase = 'pan';
  if (s.phase === 'pan') {
    setBottom(s.b0 + (e.clientY - s.y) / A.ppb);
    const maxL = Math.max(0, A.sc.scrollWidth - A.sc.clientWidth);
    A.view.left = Math.min(maxL, Math.max(0, s.l0 - (e.clientX - s.x)));
    syncScroll(); draw();
  }
}
function touchUp(e) {
  if (!T.pts.has(e.pointerId)) return;
  T.pts.delete(e.pointerId);
  clearTimeout(T.lp);
  if (T.pinch) { if (T.pts.size === 0) T.pinch = null; return; } // 핀치가 끝나도 남은 손가락은 무시
  const s = T.st; T.st = null;
  if (!s) return;
  if (s.phase === 'note' || s.phase === 'band') { onUp(fakeMouse(e)); return; }
  if (s.phase === 'pending' && !A.penMode) { // 빈 곳 탭: 선택 해제 / 쓰기 모드는 노트 찍기 / 마디 칸은 재생 시작선
    onDown(fakeMouse(s.ev)); onUp(fakeMouse(s.ev));
  }
}
function longPress() {
  const s = T.st; if (!s || A.penMode) return;
  if (s.phase === 'note') { // 노트 길게 누르기: 이동을 취소하고 메뉴
    if (A.drag && A.drag.moved) return;
    A.drag = null; s.phase = 'menu'; draw();
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (err) { /* 무시 */ }
    showCtx(s.note, s.x, s.y);
    return;
  }
  if (s.phase === 'pending' && A.mode === 'select') { // 빈 곳 길게 누르기: 범위 선택 시작
    s.phase = 'band';
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (err) { /* 무시 */ }
    onDown(fakeMouse(s.ev));
  }
}
function startPinch() {
  clearTimeout(T.lp); hideCtx();
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

/* 노트 메뉴 (손가락으로 길게 누르기) */
function showCtx(n, x, y) {
  const m = $('#ctxMenu');
  m.innerHTML = '';
  const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => { hideCtx(); fn(); }); m.appendChild(b); };
  if (!A.sel.has(n)) A.sel = new Set([n]);
  const sel = [...A.sel];
  add(sel.length > 1 ? `삭제 (${sel.length}개)` : '삭제', deleteSel);
  add('값 바꾸기', () => { const kind = (x2) => (isSound(x2.lane) ? 's' : x2.lane); editValue([n, ...sel.filter((x2) => x2 !== n && kind(x2) === kind(n))]); });
  add('복사', () => { copySel(); toast(`노트 ${A.sel.size}개 복사`); });
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2)) + 'px';
  m.style.top = Math.max(8, y - r.height - 24) + 'px';
  statusNote(); draw();
}
function hideCtx() { const m = $('#ctxMenu'); if (m) m.hidden = true; }

/* 선택 도구 막대 (터치·펜을 쓰면 표시) */
function setTouchUI(on) {
  if (A.touchUI === on) return;
  A.touchUI = on;
  document.body.classList.toggle('touch', on);
  updateSelBar();
}
function updateSelBar() {
  const bar = $('#selBar'); if (!bar) return;
  bar.hidden = !(A.touchUI && A.st);
  if (bar.hidden) return;
  const has = A.sel.size > 0;
  for (const b of bar.querySelectorAll('[data-need-sel]')) b.disabled = !has;
  $('#tbPaste').disabled = !A.clip;
  $('#tbCopyMode').classList.toggle('on', !!A.copyMode);
  $('#tbNoSnap').classList.toggle('on', !!A.noSnap);
  $('#tbCount').textContent = has ? `${A.sel.size}개 선택` : '';
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
  const act = (id, fn) => $(id).addEventListener('click', () => { fn(); updateSelBar(); });
  act('#tbDel', deleteSel);
  act('#tbCopy', () => { copySel(); toast(`노트 ${A.sel.size}개 복사`); });
  act('#tbPaste', () => { if (A.clip) pasteText(A.clip.text); });
  act('#tbUndo', undo); act('#tbRedo', redo);
  act('#tbUp', () => nudge(1, 0, false)); act('#tbDown', () => nudge(-1, 0, false));
  act('#tbLeft', () => nudge(0, -1, false)); act('#tbRight', () => nudge(0, 1, false));
  act('#tbCopyMode', () => { A.copyMode = !A.copyMode; toast(A.copyMode ? '복사 모드: 끌면 복사됩니다' : '복사 모드 끔'); });
  act('#tbNoSnap', () => { A.noSnap = !A.noSnap; toast(A.noSnap ? '그리드 무시 (1/192 단위)' : '그리드 맞춤'); });
  act('#tbTouchOff', () => setTouchUI(false));
}
