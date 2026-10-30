/* ───────── 시작 ───────── */
function init() {
  A.cv = $('#cv'); A.ctx = A.cv.getContext('2d'); A.sc = $('#sc'); A.sp = $('#sp');
  cfg.lockH = true; // '옆으로만'은 열 때마다 기본으로 켬
  layout();
  $('#gridSel').innerHTML = GRIDS.map((g) => `<option value="${g}">${g}</option>`).join('');
  $('#encSel').innerHTML = ENC_LIST.map((e) => `<option value="${e}">${C.ENC_LABEL[e]}</option>`).join('');
  syncOptions(); setMode('select'); renderAllPanels(); setDirty(false);
  for (const id of ['pnHdr', 'pnWav', 'pnBmp', 'pnBeat', 'pnExp', 'pnView', 'pnInfo', 'pnDiag']) {
    const el = $('#' + id);
    if (cfg.panels && id in cfg.panels) el.open = !!cfg.panels[id];
    el.addEventListener('toggle', () => { cfg.panels = cfg.panels || {}; cfg.panels[id] = el.open; saveCfg(); });
  }
  if (!window.showDirectoryPicker) $('#eNote').textContent = '이 브라우저는 폴더에 바로 저장하는 기능이 없어 저장할 때 파일이 다운로드됩니다. 크롬이나 엣지를 권장합니다.';

  const click = (id, fn) => $(id).addEventListener('click', (e) => { fn(e); if (e.currentTarget.tagName === 'BUTTON' && $('#modal').hidden) A.sc.focus({ preventScroll: true }); });
  click('#bOpen', openFolder); click('#eOpen', openFolder);
  click('#bNew', () => newChart(false)); click('#eNew', () => newChart(false));
  click('#bSave', () => save(false)); click('#bSaveAs', () => save(true));
  click('#bUndo', undo); click('#bRedo', redo);
  click('#mSel', () => setMode('select')); click('#mWrite', () => setMode('write'));
  click('#pStart', () => play(0)); click('#pHere', () => play(A.st ? hereBeat() : 0)); click('#pStop', stopPlay);
  click('#bHelp', showHelp);
  $('#gridSel').addEventListener('change', (e) => { cfg.grid = +e.target.value; saveCfg(); draw(); });
  $('#snapChk').addEventListener('change', (e) => { cfg.snap = e.target.checked; saveCfg(); });
  $('#lockChk').addEventListener('change', (e) => { cfg.lockH = e.target.checked; saveCfg(); });
  $('#zoomR').addEventListener('input', (e) => setZoom(+e.target.value));
  $('#zoomXR').addEventListener('input', (e) => setZoomX(+e.target.value));
  $('#volR').addEventListener('input', (e) => { cfg.volume = +e.target.value; saveCfg(); if (Au.master) Au.master.gain.value = cfg.volume; });
  const opt = (id, key, after) => $(id).addEventListener('change', (e) => { cfg[key] = e.target.checked; saveCfg(); if (after) after(); });
  opt('#oName', 'showName', draw); opt('#oFollow', 'follow'); opt('#oBgm', 'playBgm'); opt('#oKeys', 'playKeys'); opt('#oBackup', 'backup'); opt('#oConfirm', 'confirmSave');
  $('#oOpenMode').addEventListener('change', (e) => { cfg.openMode = e.target.value; saveCfg(); });

  $('#fileSel').addEventListener('change', async (e) => {
    const name = e.target.value;
    if (!name || name === A.fileName) return;
    if (!(await confirmDiscard())) { e.target.value = A.fileName; return; }
    await openChart(name);
  });
  $('#encSel').addEventListener('change', async (e) => {
    const enc = e.target.value;
    if (!A.doc || enc === A.doc.enc) return;
    if (!(await confirmDiscard())) { e.target.value = A.doc.enc; return; }
    loadDoc(C.parse(A.doc.bytes, enc), A.fileName);
    toast(`${C.ENC_LABEL[enc]}(으)로 다시 읽었습니다`);
  });
  $('#dirIn').addEventListener('change', async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    const root = (files[0].webkitRelativePath || '').split('/')[0];
    const entries = files.map((f) => ({ path: (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name, file: f }));
    await useProvider(makeListProvider(entries, root));
    toast(canPickDir() ? '처음 저장할 때 같은 폴더를 한 번 더 고르면 그 폴더에 바로 저장합니다' : '이 브라우저에서는 폴더에 바로 저장할 수 없어 저장 시 다운로드됩니다', 4500);
  });

  $('#filesIn').addEventListener('change', async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    if (!files.some((f) => CHART_EXT.test(f.name))) { toast('BMS 파일(.bms .bme .bml .pms)도 같이 골라 주세요', 4500); return; }
    await useProvider(makeListProvider(files.map((f) => ({ path: f.name, file: f })), ''));
    toast('파일 선택으로 열어서 저장 시 다운로드됩니다', 4500);
  });
  $('#hdrBd').addEventListener('change', onHeaderChange);
  $('#hdrBd').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
  $('#wavList').addEventListener('click', (e) => { const r = e.target.closest('.wr'); if (!r || e.target.tagName === 'INPUT') return; A.curWav = +r.dataset.id; markCurWav(false); preview(A.curWav); });
  $('#wavList').addEventListener('dblclick', (e) => { const r = e.target.closest('.wr'); if (r && A.st && e.target.tagName !== 'INPUT') editWavName(+r.dataset.id, r); });
  // 오른쪽 패널: 너비 조절 · 접기/펼치기
  const side = $('#side'), split = $('#split');
  const applySide = () => { side.style.width = (cfg.sideW || 340) + 'px'; document.body.classList.toggle('side-off', !!cfg.sideOff); $('#sideTgl').textContent = cfg.sideOff ? '◀' : '▶'; };
  const toggleSide = () => { cfg.sideOff = !cfg.sideOff; saveCfg(); applySide(); };
  applySide();
  A.toggleSide = toggleSide;
  $('#sideTgl').addEventListener('click', (e) => { e.stopPropagation(); toggleSide(); A.sc.focus({ preventScroll: true }); });
  $('#sideTgl').addEventListener('pointerdown', (e) => e.stopPropagation());
  split.addEventListener('dblclick', toggleSide);
  split.addEventListener('pointerdown', (e) => {
    if (cfg.sideOff || e.button !== 0) return;
    e.preventDefault(); split.classList.add('drag');
    const x0 = e.clientX, w0 = side.getBoundingClientRect().width;
    const mv = (ev) => { cfg.sideW = Math.round(Math.min(Math.max(220, w0 - (ev.clientX - x0)), Math.max(260, window.innerWidth - 400))); side.style.width = cfg.sideW + 'px'; };
    const up = () => { split.classList.remove('drag'); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); saveCfg(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up, { once: true });
  });
  $('#bmpList').addEventListener('click', (e) => { const r = e.target.closest('.wr'); if (!r || e.target.tagName === 'INPUT') return; A.curBmp = +r.dataset.id; markCurBmp(false); });
  $('#bmpList').addEventListener('dblclick', (e) => { const r = e.target.closest('.wr'); if (r && A.st && e.target.tagName !== 'INPUT') editBmpName(+r.dataset.id, r); });
  $('#bmpQ').addEventListener('input', () => { clearTimeout(wavRenderT); wavRenderT = setTimeout(renderBmpList, 120); });
  $('#bmpDef').addEventListener('change', renderBmpList);
  $('#bDP').addEventListener('click', () => { setPlayMode(PLAY_MODES[(PLAY_MODES.indexOf(playMode()) + 1) % 3]); A.sc.focus({ preventScroll: true }); });
  const setKind = (k) => { A.noteKind = k; $('#kindSel').value = k; $('#mineVal').hidden = k !== 'm'; if (A.hover) A.hover.ghost = null; draw(); };
  $('#kindSel').addEventListener('change', (e) => { setKind(e.target.value); A.sc.focus({ preventScroll: true }); });
  $('#mineVal').addEventListener('change', (e) => { const v = C.idParse(e.target.value.trim(), A.doc ? A.doc.base : 36); if (v > 0) A.mineVal = v; else { e.target.value = idS(A.mineVal || 1); toast('지뢰 값은 01~ZZ로 넣어 주세요'); } });
  A.setKind = setKind;
  $('#wavQ').addEventListener('input', () => { clearTimeout(wavRenderT); wavRenderT = setTimeout(renderWavList, 120); });
  $('#wavDef').addEventListener('change', renderWavList);
  $('#beatList').addEventListener('click', onBeatClick);
  $('#bApply').addEventListener('click', () => {
    const n = Math.round(+$('#bN').value), d = Math.round(+$('#bD').value);
    if (!(n >= 1 && d >= 1 && d <= 64 && n <= 999)) { toast('박자는 1~999 / 1~64 사이로 넣어 주세요'); return; }
    if (A.st) setMeasureLen(R(n, d));
  });
  $('#bReset').addEventListener('click', () => { if (A.st) setMeasureLen(R1); });
  $('#blkTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; A.blkIdx = +b.dataset.i; renderBlocks(); });
  const applyBlock = (quiet) => {
    if (!A.st || !A.st.blocks.length) return;
    const i = A.blkIdx, before = A.st.blocks[i], after = $('#blkTx').value.replace(/\r\n?/g, '\n');
    if (before === after) { if (!quiet) toast('바뀐 내용이 없습니다'); return; }
    commit({ type: 'blk', i, before, after }); toast(`블록 ${i + 1}에 적용했습니다`);
  };
  $('#blkApply').addEventListener('click', () => applyBlock(false));
  $('#blkTx').addEventListener('change', () => applyBlock(true));
  $('#blkNew').addEventListener('click', () => {
    if (!A.st) return;
    const i = A.st.blocks.length;
    commit({ type: 'blk', i, before: undefined, after: '#RANDOM 2\n#IF 1\n\n#ENDIF\n#IF 2\n\n#ENDIF\n#ENDRANDOM' });
    A.blkIdx = i; renderBlocks(); $('#blkTx').focus();
  });
  $('#blkDel').addEventListener('click', () => {
    if (!A.st) return;
    const i = A.blkIdx, before = A.st.blocks[i];
    if (!before) return;
    commit({ type: 'blk', i, before, after: '' }); toast(`블록 ${i + 1}을 비웠습니다 (저장하면 파일에서 사라집니다)`);
  });

  A.sc.addEventListener('scroll', onScroll);
  A.sc.addEventListener('contextmenu', (e) => e.preventDefault());
  A.sc.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
  A.sc.addEventListener('dblclick', (e) => {
    if (A.lastPtr === 'touch') return; // 손가락 두 번 탭은 값 바꾸기 안 함
    if (!A.st || A.mode !== 'select') return;
    const n = noteAt(hitAt(e)); if (!n) return;
    const kind = (x) => (isSound(x.lane) ? 's' : x.lane);
    const targets = A.sel.has(n) ? [n, ...[...A.sel].filter((x) => x !== n && kind(x) === kind(n))] : [n];
    editValue(targets);
  });
  A.sc.addEventListener('wheel', onWheel, { passive: false });
  bindTouch();
  bindDiag();
  if (cfg.sideOff === undefined && window.innerWidth < 1100) { cfg.sideOff = true; applySide(); } // 좁은 화면은 패널을 접고 시작
  document.addEventListener('keydown', onKey);
  document.addEventListener('copy', (e) => {
    if (isTyping(document.activeElement) || !$('#modal').hidden || !A.st || !A.sel.size) return;
    const t = copySel(); if (!t) return;
    e.clipboardData.setData('text/plain', t); e.preventDefault(); toast(`노트 ${A.sel.size}개 복사`);
  });
  document.addEventListener('cut', (e) => {
    if (isTyping(document.activeElement) || !$('#modal').hidden || !A.st || !A.sel.size) return;
    const t = copySel(); if (!t) return;
    e.clipboardData.setData('text/plain', t); e.preventDefault(); const n = A.sel.size; deleteSel(); toast(`노트 ${n}개 잘라냄`);
  });
  document.addEventListener('paste', (e) => {
    if (isTyping(document.activeElement) || !$('#modal').hidden || !A.st) return;
    const t = e.clipboardData.getData('text/plain'); if (!t) return;
    e.preventDefault(); pasteText(t);
  });
  window.addEventListener('beforeunload', (e) => { if (A.dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('error', (e) => toast('오류: ' + (e.message || e), 6000));
  window.addEventListener('unhandledrejection', (e) => toast('오류: ' + ((e.reason && e.reason.message) || e.reason), 6000));
  bindDrop();
  new ResizeObserver(resize).observe($('#ed'));
  resize();
}
