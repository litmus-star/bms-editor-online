/* ───────── 키보드 ───────── */
function isTyping(el) {
  if (!el) return false;
  const t = el.tagName;
  if (t === 'TEXTAREA' || t === 'SELECT') return true;
  if (t === 'INPUT') return !['checkbox', 'radio', 'range', 'button'].includes(el.type);
  return !!el.isContentEditable;
}
function onKey(e) {
  const k = e.key, ctrl = e.ctrlKey || e.metaKey;
  if (k === 'F5' || (ctrl && (k === 's' || k === 'S'))) e.preventDefault();
  if (!$('#modal').hidden) return;
  if (ctrl && (k === 's' || k === 'S')) { save(e.shiftKey); return; }
  if (ctrl && (k === 'o' || k === 'O')) { e.preventDefault(); openFolder(); return; }
  if (/^F[1-7]$/.test(k)) {
    e.preventDefault();
    if (k === 'F1') setMode('select');
    else if (k === 'F3') setMode('write');
    else if (k === 'F2') toast('시간 선택 모드는 아직 없습니다');
    else if (k === 'F5') play(0);
    else if (k === 'F6') play(A.st ? hereBeat() : 0);
    else if (k === 'F7') stopPlay();
    return;
  }
  if (isTyping(e.target) || !A.st) return;
  const lk = k.length === 1 ? k.toLowerCase() : k;
  if (ctrl && lk === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (ctrl && lk === 'y') { e.preventDefault(); redo(); return; }
  if (ctrl && lk === 'a') { e.preventDefault(); selectAll(); return; }
  if (ctrl) return;
  switch (k) {
    case 'Delete': case 'Backspace': e.preventDefault(); deleteSel(); return;
    case 'Escape': if (!$('#ctxMenu').hidden) { hideCtx(); return; } if (A.drag) { A.drag = null; } else A.sel = new Set(); statusNote(); draw(); return;
    case ' ': e.preventDefault(); if (Au.play || A.playToken) stopPlay(); else play(hereBeat()); return;
    case 'ArrowUp': case 'ArrowDown': {
      e.preventDefault();
      const dir = k === 'ArrowUp' ? 1 : -1;
      if (!nudge(dir, 0, e.shiftKey)) setBottom(A.view.bottom + dir * rf(stepR(false)) * 2);
      return;
    }
    case 'ArrowLeft': case 'ArrowRight': e.preventDefault(); nudge(0, k === 'ArrowRight' ? 1 : -1, false); return;
    case 'PageUp': case 'PageDown': {
      e.preventDefault();
      const m = measureAt(A.view.bottom + 1e-6);
      setBottom(A.ms.Sf[Math.max(0, Math.min(999, m + (k === 'PageUp' ? 1 : -1)))]);
      return;
    }
    case 'Home': e.preventDefault(); setBottom(0); return;
    case 'End': e.preventDefault(); setBottom(Math.max(0, A.lastBeat - (A.H - HEAD_H) * 0.6 / A.ppb)); return;
    case '[': setZoomX((cfg.zoomX || 1) / 1.15); return;
    case ']': setZoomX((cfg.zoomX || 1) * 1.15); return;
    case '+': case '=': setZoom(cfg.zoom * 1.25); return;
    case '-': case '_': setZoom(cfg.zoom * 0.8); return;
    default: break;
  }
  if (k === '\\') { A.toggleSide(); return; }
  if (lk === 'n') { const order = ['n', 'h', 'm'], nk = order[(order.indexOf(A.noteKind) + 1) % 3]; A.setKind(nk); toast(`쓰기 노트 종류: ${KIND_NAME[nk]}`); return; }
  if (lk === 'h') { cfg.lockH = !cfg.lockH; saveCfg(); $('#lockChk').checked = cfg.lockH; toast(cfg.lockH ? '노트 이동: 옆으로만' : '노트 이동: 위아래·옆 모두'); return; }
  if (lk === 'g') { cfg.snap = !cfg.snap; saveCfg(); $('#snapChk').checked = cfg.snap; toast(cfg.snap ? '스냅 켬' : '스냅 끔 (1/192 단위)'); }
}
function setMode(m) {
  A.mode = m;
  $('#mSel').classList.toggle('on', m === 'select');
  $('#mWrite').classList.toggle('on', m === 'write');
  A.sc.style.cursor = m === 'write' ? 'crosshair' : 'default';
  if (A.hover) A.hover.ghost = null;
  draw();
}
