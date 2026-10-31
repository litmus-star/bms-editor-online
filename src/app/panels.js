/* ───────── 오른쪽 패널 ───────── */
const HDR_FIELDS = [
  ['TITLE', 'hdr.TITLE'], ['SUBTITLE', 'hdr.SUBTITLE'], ['ARTIST', 'hdr.ARTIST'], ['SUBARTIST', 'hdr.SUBARTIST'], ['GENRE', 'hdr.GENRE'],
  ['BPM', 'hdr.BPM'], ['PLAYLEVEL', 'hdr.PLAYLEVEL'],
  ['PLAYER', 'hdr.PLAYER', [['1', '1 · SP'], ['2', '2 · Couple'], ['3', '3 · DP'], ['4', '4 · Battle']]],
  ['RANK', 'hdr.RANK', [['0', '0 · VERY HARD'], ['1', '1 · HARD'], ['2', '2 · NORMAL'], ['3', '3 · EASY'], ['4', '4 · VERY EASY']]],
  ['DIFFICULTY', 'hdr.DIFFICULTY', [['1', '1 · BEGINNER'], ['2', '2 · NORMAL'], ['3', '3 · HYPER'], ['4', '4 · ANOTHER'], ['5', '5 · INSANE']]],
  ['TOTAL', null], ['STAGEFILE', null], ['BANNER', null], ['BACKBMP', null], ['PREVIEW', null], ['COMMENT', null], // 이름표 null: 헤더 이름 그대로
];
function renderHeader() {
  const bd = $('#hdrBd');
  if (!A.st) { bd.innerHTML = `<div class="dim">${tr('pn.openToShow')}</div>`; return; }
  let h = '<div class="form">';
  for (const [k, label, opts] of HDR_FIELDS) {
    const v = A.st.headers.get(k) || '';
    h += `<label for="h_${k}">${esc(label ? tr(label) : k)}</label>`;
    if (opts) {
      const o = [['', tr('hdr.none')], ...opts]; // 맨 앞: 헤더 없음
      if (v !== '' && !o.some((x) => x[0] === v)) o.push([v, v]);
      h += `<select id="h_${k}" data-k="${k}">${o.map(([ov, ol]) => `<option value="${esc(ov)}"${ov === v ? ' selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
    } else h += `<input id="h_${k}" type="text" data-k="${k}" value="${esc(v)}" spellcheck="false">`;
  }
  h += '</div>';
  const ro = [];
  for (const k of ['LNTYPE', 'LNOBJ', 'BASE']) if (A.st.headers.get(k)) ro.push(`#${k} ${A.st.headers.get(k)}`);
  bd.innerHTML = h + (ro.length ? `<div class="hint">${esc(ro.join(' · '))}${tr('hdr.readOnly')}</div>` : '');
}
function onHeaderChange(e) {
  const k = e.target.dataset.k;
  if (!k || !A.st) return;
  const v = e.target.value.trim(), before = A.st.headers.get(k);
  if ((before || '') === v) return;
  commit({ type: 'hdr', key: k, before, after: v });
}

let wavRenderT = 0;
function renderWavList() {
  const el = $('#wavList');
  if (!A.st) { el.innerHTML = ''; $('#wavCnt').textContent = ''; return; }
  const qRaw = $('#wavQ').value.trim(), q = qRaw.toLowerCase(), defOnly = $('#wavDef').checked; // 62진수는 번호의 대소문자를 구분
  const max = C.idMax(A.doc.base), parts = [];
  for (let id = 1; id <= max; id++) {
    const name = A.st.wavs.get(id) || '';
    if (defOnly && !name) continue;
    const s = idS(id);
    if (q && !((A.doc.base === 62 ? s.includes(qRaw) : s.toLowerCase().includes(q)) || name.toLowerCase().includes(q))) continue;
    const use = A.usage.get(id) || 0;
    const stt = name ? Au.state.get(wavKey(name)) : '';
    const cls = (id === A.curWav ? ' cur' : '') + (!name ? ' empty' : '') + (stt === 'missing' || stt === 'fail' ? ' miss' : '');
    const tip = stt === 'missing' ? tr('list.missing') : stt === 'fail' ? tr('list.failed') : '';
    parts.push(`<div class="wr${cls}" data-id="${id}"><b>${s}</b><span title="${esc(name + tip)}">${esc(name) || '—'}</span><i>${use || ''}</i></div>`);
  }
  const top = el.scrollTop;
  el.innerHTML = parts.join('');
  el.scrollTop = top;
  $('#wavCnt').textContent = tr('list.defined', { n: A.st.wavs.size });
}
function markCurWav(scroll) {
  const el = $('#wavList');
  el.querySelectorAll('.wr.cur').forEach((r) => r.classList.remove('cur'));
  const row = el.querySelector(`.wr[data-id="${A.curWav}"]`);
  if (row) { row.classList.add('cur'); if (scroll) row.scrollIntoView({ block: 'nearest' }); }
  if (A.hover) A.hover.ghost = null;
}
function editWavName(id, row) {
  const span = row.querySelector('span'), before = A.st.wavs.get(id) || '';
  const inp = document.createElement('input');
  inp.type = 'text'; inp.value = before; inp.setAttribute('list', 'audioList'); inp.spellcheck = false;
  span.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const finish = (ok) => {
    if (done) return; done = true;
    const v = inp.value.trim();
    if (ok && v !== before) commit({ type: 'wav', id, before: before || undefined, after: v || undefined });
    else renderWavList();
  };
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
}

function renderBeatList() {
  const el = $('#beatList');
  if (!A.st) { el.innerHTML = ''; return; }
  const parts = [];
  for (let m = 0; m < 1000; m++) {
    const g = A.st.meas.get(m);
    parts.push(`<div class="br${A.beatSel.has(m) ? ' cur' : ''}${g ? ' mod' : ''}" data-m="${m}"><b>${C.pad3(m)}</b><span>${g ? beatLabel(g.r) : '4/4'}</span><i>${g ? esc(g.str) : ''}</i></div>`);
  }
  const top = el.scrollTop;
  el.innerHTML = parts.join('');
  el.scrollTop = top;
}
function onBeatClick(e) {
  const row = e.target.closest('.br'); if (!row || !A.st) return;
  const m = +row.dataset.m;
  if (e.shiftKey && A.beatAnchor >= 0) { const [a, b] = [Math.min(A.beatAnchor, m), Math.max(A.beatAnchor, m)]; for (let i = a; i <= b; i++) A.beatSel.add(i); }
  else if (e.ctrlKey || e.metaKey) { if (A.beatSel.has(m)) A.beatSel.delete(m); else A.beatSel.add(m); A.beatAnchor = m; }
  else { A.beatSel = new Set([m]); A.beatAnchor = m; }
  renderBeatList();
  setBottom(Math.max(0, A.ms.Sf[m] - 0.5));
}
function setMeasureLen(r) {
  const ms = [...A.beatSel];
  if (!ms.length) { toast(tr('toast.beat.pickFirst')); return; }
  const str = C.lenStr(r), rr = C.parseMeasureLen(str);
  const before = new Map(), after = new Map();
  for (const m of ms) { before.set(m, A.st.meas.get(m) || null); after.set(m, C.req(rr, R1) ? null : { str, r: rr }); }
  const newMeas = new Map(A.st.meas);
  for (const [m, g] of after) { if (g) newMeas.set(m, g); else newMeas.delete(m); }
  // 확장 블록 안 데이터도 같은 박 위치를 유지하도록 함께 고침 (한 번에 실행 취소)
  const list = [{ type: 'meas', before, after }];
  A.st.blocks.forEach((t, i) => { const nt = C.retimeBlockText(t, A.st.meas, newMeas); if (nt !== t) list.push({ type: 'blk', i, before: t, after: nt }); });
  commit(list.length > 1 ? { list } : list[0]);
  toast(tr('toast.beat.applied', { n: ms.length, beat: beatLabel(rr) }));
}

function renderBlocks() {
  const tabs = $('#blkTabs'), tx = $('#blkTx');
  const n = A.st ? A.st.blocks.length : 0;
  if (A.blkIdx >= n) A.blkIdx = Math.max(0, n - 1);
  tabs.innerHTML = n ? A.st.blocks.map((tx, i) => `<button data-i="${i}" class="${i === A.blkIdx ? 'on' : ''}">${tr('blk.tab', { n: i + 1 })}${tx && tx.trim() ? '' : tr('blk.emptyMark')}</button>`).join('') : `<span class="dim">${tr('blk.none')}</span>`;
  tx.value = n ? (A.st.blocks[A.blkIdx] || '') : '';
  tx.disabled = !n;
  $('#blkApply').disabled = $('#blkDel').disabled = !n;
  $('#blkNew').disabled = !A.st;
  const live = A.st ? A.st.blocks.filter((t) => t && t.trim()).length : 0;
  $('#expCnt').textContent = live ? tr('blk.count', { n: live }) : '';
}

let infoT = 0;
function scheduleInfo() { clearTimeout(infoT); infoT = setTimeout(() => { renderInfo(); renderWavList(); renderBmpList(); }, 120); }
function renderInfo() {
  const bd = $('#infoBd');
  if (!A.st) { bd.innerHTML = `<div class="dim">${tr('pn.openToShow')}</div>`; return; }
  let notes = 0, ln = 0, sc = 0, bgm = 0, hid = 0, mine = 0, p2 = 0, bga = 0, k1 = 0, s1 = 0, k2 = 0, s2 = 0, bpmMin = Infinity, bpmMax = -Infinity;
  const usage = new Map(), usageB = new Map();
  for (const n of A.st.notes) {
    if (isKey(n.lane)) {
      if (n.kind === 'h') hid++; else if (n.kind === 'm') mine++;
      else { notes++; if (n.lb > 0) ln++; if (n.lane === 'K16' || n.lane === 'K26') sc++; if (n.lane[1] === '2') p2++; const isSc = n.lane === 'K16' || n.lane === 'K26'; if (n.lane[1] === '2') { if (isSc) s2++; else k2++; } else if (isSc) s1++; else k1++; }
    } else if (n.lane[0] === 'B') bgm++;
    else if (n.lane[0] === 'G') { bga++; usageB.set(n.v, (usageB.get(n.v) || 0) + 1); }
    if (isSound(n.lane) && n.kind !== 'm') usage.set(n.v, (usage.get(n.v) || 0) + 1);
  }
  A.usageB = usageB;
  for (const s of A.timing.segs) { if (s.bpm < bpmMin) bpmMin = s.bpm; if (s.bpm > bpmMax) bpmMax = s.bpm; }
  A.usage = usage;
  const ld = loadCounts();
  const rows = [
    [tr('info.file'), esc(A.fileName || tr('info.file.new'))],
    [tr('info.enc'), `${C.ENC_LABEL[A.doc.enc]} · ${A.doc.eol === '\r\n' ? 'CRLF' : 'LF'}`],
    [tr('info.notes'), A.pms ? tr('info.notes.pms', { n: notes, ln }) : A.dp || p2 ? tr('info.notes.dp', { n: notes, ln, k1, s1, k2, s2 }) : tr('info.notes.sp', { n: notes, ln, sc })],
    [tr('info.hidMine'), tr('info.hidMine.v', { hid, mine })],
    ['BGM · BGA', tr('info.bgmBga.v', { bgm, bga })],
    [tr('info.length'), fmtTime(A.timing.beatToTime(A.lastBeat || 0))],
    ['BPM', bpmMin === bpmMax ? fmtV(bpmMin) : `${fmtV(bpmMin)} ~ ${fmtV(bpmMax)}`],
    [tr('info.keys'), tr('list.defined', { n: A.st.wavs.size }) + (ld.total ? tr('info.keys.loaded', { ok: ld.ok, total: ld.total }) : '') + (ld.missing ? ` · <span style="color:var(--bad)">${tr('info.keys.missing', { n: ld.missing })}</span>` : '') + (ld.fail ? ` · <span style="color:var(--bad)">${tr('info.keys.failed', { n: ld.fail })}</span>` : '')],
    [tr('info.preserved'), tr('info.preserved.v', { lines: A.doc.unmanagedData, blocks: A.st.blocks.filter((x) => x && x.trim()).length })],
  ];
  const warn = [];
  if (A.conflicts) warn.push(tr('warn.conflicts', { n: A.conflicts }));
  if (A.pms && A.muri.length) warn.push(tr('warn.muri', { n: A.muri.length }));
  if (A.pms) {
    const off = A.st.notes.filter((n) => n.lane[0] === 'K' && !PMS_KEYS.has(n.lane)).length;
    if (off) warn.push(tr('warn.pmsOffLanes', { n: off }));
  } else if (!A.dp && A.st.notes.some((n) => n.lane[0] === 'K' && n.lane[1] === '2')) warn.push(tr('warn.p2InSp'));
  if (A.doc.lntype === 2) warn.push(tr('warn.lntype2'));
  if (!A.fs.provider) warn.push(tr('warn.noFolder'));
  bd.innerHTML = `<table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>` + warn.map((w) => `<div class="w">! ${esc(w)}</div>`).join('')
    + (A.pms && A.muri.length ? `<div class="muri">${A.muri.slice(0, 50).map((m, i) => `<button data-mi="${i}">${esc(muriLabel(m))}</button>`).join('')}${A.muri.length > 50 ? `<span class="dim">${tr('info.muri.more', { n: A.muri.length - 50 })}</span>` : ''}</div>` : '');
  for (const el of bd.querySelectorAll('[data-mi]')) el.addEventListener('click', () => { const m = A.muri[+el.dataset.mi]; if (m) { setBottom(m.b - (A.H - HEAD_H) * 0.3 / A.ppb); A.sel = new Set(m.notes); statusNote(); draw(); } });
}
function syncOptions() {
  $('#oName').checked = cfg.showName; $('#oFollow').checked = cfg.follow; $('#oBgm').checked = cfg.playBgm;
  $('#oScRight').checked = !!cfg.scRight; $('#oHideBga').checked = !cfg.hideBga; $('#oHideBpm').checked = !cfg.hideBpm;
  $('#oKeys').checked = cfg.playKeys; $('#oBackup').checked = cfg.backup; $('#oConfirm').checked = cfg.confirmSave; $('#oOpenMode').value = cfg.openMode || 'auto';
  $('#snapChk').checked = cfg.snap; $('#lockChk').checked = !!cfg.lockH; $('#gridSel').value = String(cfg.grid); $('#zoomR').value = cfg.zoom; $('#zoomXR').value = cfg.zoomX || 1; $('#volR').value = cfg.volume;
}
function renderAllPanels() { renderHeader(); renderWavList(); renderBmpList(); renderBeatList(); renderBlocks(); renderInfo(); }

/* BMP 목록 (BGA/LAYER/POOR 레인에서 쓰는 #BMPxx) */
function renderBmpList() {
  const el = $('#bmpList');
  if (!A.st) { el.innerHTML = ''; $('#bmpCnt').textContent = ''; return; }
  const qRaw = $('#bmpQ').value.trim(), q = qRaw.toLowerCase(), defOnly = $('#bmpDef').checked;
  const max = C.idMax(A.doc.base), parts = [], use = A.usageB || new Map();
  for (let id = 0; id <= max; id++) {
    const name = A.st.bmps.get(id) || '';
    if ((defOnly || id === 0) && !name) continue;
    const s = idS(id);
    if (q && !((A.doc.base === 62 ? s.includes(qRaw) : s.toLowerCase().includes(q)) || name.toLowerCase().includes(q))) continue;
    const miss = name && A.bmpMiss && A.bmpMiss.has(normPath(name).toLowerCase());
    const cls = (id === A.curBmp ? ' cur' : '') + (!name ? ' empty' : '') + (miss ? ' miss' : '');
    parts.push(`<div class="wr${cls}" data-id="${id}"><b>${s}</b><span title="${esc(name + (miss ? tr('list.missing') : ''))}">${esc(name) || '—'}</span><i>${use.get(id) || ''}</i></div>`);
  }
  const top = el.scrollTop;
  el.innerHTML = parts.join('');
  el.scrollTop = top;
  $('#bmpCnt').textContent = tr('list.defined', { n: A.st.bmps.size });
}
function markCurBmp(scroll) {
  const el = $('#bmpList');
  el.querySelectorAll('.wr.cur').forEach((r) => r.classList.remove('cur'));
  const row = el.querySelector(`.wr[data-id="${A.curBmp}"]`);
  if (row) { row.classList.add('cur'); if (scroll) row.scrollIntoView({ block: 'nearest' }); }
  if (A.hover) A.hover.ghost = null;
}
function editBmpName(id, row) {
  const span = row.querySelector('span'), before = A.st.bmps.get(id) || '';
  const inp = document.createElement('input');
  inp.type = 'text'; inp.value = before; inp.setAttribute('list', 'imgList'); inp.spellcheck = false;
  span.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const finish = (ok) => {
    if (done) return; done = true;
    const v = inp.value.trim();
    if (ok && v !== before) commit({ type: 'bmp', id, before: before || undefined, after: v || undefined });
    else renderBmpList();
  };
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
}
// 폴더에 BMP 파일이 있는지만 확인 (이미지는 읽지 않음)
async function checkBmps() {
  const P = A.fs.provider; A.bmpMiss = new Set();
  if (!P || !A.st) { renderBmpList(); return; }
  for (const name of new Set(A.st.bmps.values())) {
    if (!name) continue;
    let h = await P.find(name);
    if (!h) { const stem = normPath(name).replace(/\.[^./]*$/, ''); for (const ext of ['.bmp', '.png', '.jpg', '.jpeg', '.gif', '.mpg', '.mpeg', '.mp4', '.wmv', '.avi', '.webm', '.m4v']) { h = await P.find(stem + ext); if (h) break; } }
    if (!h) A.bmpMiss.add(normPath(name).toLowerCase());
  }
  renderBmpList();
}
// SP / DP / PMS 화면 전환 (파일 내용은 바꾸지 않음)
const PMS_KEYS = new Set(C.PMS_LANES.map((l) => l.key));
const PLAY_MODES = ['sp', 'dp', 'pms'];
function playMode() { return A.pms ? 'pms' : A.dp ? 'dp' : 'sp'; }
function setPlayMode(m, quiet) {
  A.dp = m === 'dp'; A.pms = m === 'pms';
  const b = $('#bDP'); b.classList.toggle('on', m !== 'sp'); b.textContent = m.toUpperCase();
  layout();
  for (const n of [...A.sel]) if (!A.laneMap.has(n.lane)) A.sel.delete(n); // 화면에서 사라진 레인의 선택은 해제
  if (A.st) {
    refresh();
    const hiddenKeys = A.st.notes.filter((n) => n.lane[0] === 'K' && !A.laneMap.has(n.lane)).length;
    const tail = hiddenKeys ? tr('toast.mode.hidden', { n: hiddenKeys }) : '';
    if (!quiet) toast((m === 'dp' ? tr('toast.mode.dp') + (A.st.headers.get('PLAYER') !== '3' ? tr('toast.mode.dpPlayer') : '')
      : m === 'pms' ? tr('toast.mode.pms') : tr('toast.mode.sp')) + tail, 4000);
  }
}
function setDP(on, quiet) { setPlayMode(on ? 'dp' : 'sp', quiet); }
// 파일을 열 때 자동 판단: 확장자 .pms면 PMS / #PLAYER 3이거나 2P 노트가 있으면 DP / 그 외 SP
function guessPlayMode(doc, name, st) {
  if (/\.pms$/i.test(name || '')) return 'pms';
  return (st.headers.get('PLAYER') || '').trim() === '3' || doc.hasP2 ? 'dp' : 'sp';
}
