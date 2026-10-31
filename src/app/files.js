/* ───────── 파일 (폴더 접근) ───────── */
function makeDirProvider(dir) {
  const ls = new Map();
  async function dirAt(path) {
    if (!path) return dir;
    let h = dir, p = '';
    for (const seg of path.split('/')) {
      if (!seg) continue;
      const lst = await listing(p);
      const e = lst.get(seg.toLowerCase());
      if (!e || e.kind !== 'directory') return null;
      h = e; p = p ? p + '/' + seg : seg;
    }
    return h;
  }
  function listing(path) {
    const key = path.toLowerCase();
    if (!ls.has(key)) {
      ls.set(key, (async () => {
        const m = new Map(), h = await dirAt(path);
        if (h) for await (const [n, e] of h.entries()) m.set(n.toLowerCase(), e);
        return m;
      })());
    }
    return ls.get(key);
  }
  return {
    kind: 'dir', name: dir.name, canWrite: true,
    async list() { const m = await listing(''); return [...m.values()].filter((e) => e.kind === 'file').map((e) => e.name); },
    async find(rel) {
      const p = normPath(rel), i = p.lastIndexOf('/');
      const lst = await listing(i >= 0 ? p.slice(0, i) : '');
      const e = lst.get((i >= 0 ? p.slice(i + 1) : p).toLowerCase());
      return e && e.kind === 'file' ? e : null;
    },
    async read(rel) { const h = await this.find(rel); return h ? new Uint8Array(await (await h.getFile()).arrayBuffer()) : null; },
    async ensureWrite() {
      try {
        if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
        return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
      } catch (e) { return false; }
    },
    async write(name, bytes) {
      const h = await dir.getFileHandle(name, { create: true });
      const w = await h.createWritable(); await w.write(bytes); await w.close();
      ls.delete('');
    },
  };
}
function makeListProvider(entries, name) {
  const map = new Map();
  for (const e of entries) map.set(normPath(e.path).toLowerCase(), e);
  return {
    kind: 'list', name, canWrite: false,
    async list() { return [...map.values()].map((e) => normPath(e.path)).filter((p) => !p.includes('/')); },
    async find(rel) { const e = map.get(normPath(rel).toLowerCase()); return e ? { name: e.file.name, getFile: async () => e.file } : null; },
    async read(rel) { const h = await this.find(rel); return h ? new Uint8Array(await (await h.getFile()).arrayBuffer()) : null; },
    async ensureWrite() { return false; },
    async write() { throw appError('err.readOnlyFolder'); },
  };
}
function makeSingleProvider(file, handle) {
  return {
    kind: 'single', name: '', canWrite: !!(handle && handle.createWritable),
    async list() { return [file.name]; },
    async find(rel) { return normPath(rel).toLowerCase() === file.name.toLowerCase() ? { name: file.name, getFile: async () => file } : null; },
    async read(rel) { return (await this.find(rel)) ? new Uint8Array(await file.arrayBuffer()) : null; },
    async ensureWrite() {
      try {
        if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
        return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
      } catch (e) { return false; }
    },
    async write(name, bytes) {
      if (name !== file.name) throw appError('err.singleFileRename');
      const w = await handle.createWritable(); await w.write(bytes); await w.close();
    },
  };
}
async function makeEntryProvider(root) {
  const entries = [];
  async function walk(dirEntry, prefix, depth) {
    const reader = dirEntry.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const en of batch) {
        if (en.isFile) entries.push({ path: prefix + en.name, file: await new Promise((res, rej) => en.file(res, rej)) });
        else if (en.isDirectory && depth < 4) await walk(en, prefix + en.name + '/', depth + 1);
      }
    }
  }
  await walk(root, '', 0);
  return makeListProvider(entries, root.name);
}

// 안드로이드 크롬의 '폴더 직접 접근'은 파일 하나 여는 데 0.2~0.3초씩 한 줄로 걸려서 키음 1000개면 3~4분이 걸린다.
// '폴더 고르기'(파일 목록) 방식은 같은 폴더를 10여 초에 읽으므로 안드로이드에서는 이쪽으로 열고,
// 저장할 때만 같은 폴더를 직접 접근으로 한 번 더 골라 받아서 그 폴더에 쓴다.
// (태블릿의 '데스크톱 사이트 보기'는 UA가 Linux로 바뀌므로 터치 가능한 Linux도 안드로이드로 본다)
function isAndroidLike() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return true;
  if (navigator.userAgentData && navigator.userAgentData.platform === 'Android') return true;
  return /Linux/.test(ua) && !/CrOS/.test(ua) && navigator.maxTouchPoints > 0;
}
function inIframe() { try { return window.self !== window.top; } catch (e) { return true; } }
function openMode() { return cfg.openMode === 'direct' || cfg.openMode === 'pick' ? cfg.openMode : (isAndroidLike() ? 'pick' : 'direct'); }
const canPickDir = () => !!window.showDirectoryPicker && !inIframe();
async function openFolder() {
  if (!(await confirmDiscard())) return;
  if (canPickDir() && openMode() === 'pick') { $('#dirIn').click(); return; }
  if (canPickDir()) {
    let dir;
    try { dir = await window.showDirectoryPicker({ id: 'bms-folder', mode: 'readwrite' }); }
    catch (e) { if (e.name === 'AbortError') return; fallbackPick(e.message); return; }
    await useProvider(makeDirProvider(dir));
  } else fallbackPick();
}
// 파일 목록 방식으로 연 폴더에 저장할 수 있게, 같은 폴더를 직접 접근으로 한 번 골라 받는다
async function attachWriteDir(P) {
  const pick = await modal(tr('dlg.pickSave.title'), `<p>${tr('dlg.pickSave.body', { name: esc(P.name || tr('dlg.pickSave.thisSong')) })}</p><p class="dim">${tr('dlg.pickSave.note')}</p>`, [
    { label: tr('dlg.pickSave.download'), value: null },
    { label: tr('dlg.pickFolder'), primary: true, value: () => window.showDirectoryPicker({ id: 'bms-folder', mode: 'readwrite' }).catch(() => null) },
  ]);
  if (!pick) return false;
  const D = makeDirProvider(pick);
  const same = pick.name === P.name && (!A.fileName || !!(await D.find(A.fileName)));
  if (!same) {
    const go = await modal(tr('dlg.otherFolder.title'), `<p>${tr('dlg.otherFolder.body', { picked: esc(pick.name), opened: esc(P.name || ''), file: esc(A.fileName || '') })}</p><p>${tr('dlg.otherFolder.ask')}</p>`, [
      { label: tr('btn.cancel'), value: false, primary: true }, { label: tr('dlg.otherFolder.save'), value: true }]);
    if (!go) return false;
  }
  P.writer = D; P.canWrite = true;
  P.ensureWrite = () => D.ensureWrite();
  P.write = (name, bytes) => D.write(name, bytes);
  return true;
}
// 폴더 선택 창을 쓸 수 없는 환경(다른 페이지 안에 띄워진 경우, 모바일 등): 일반 파일 선택으로 대신
function fallbackPick(why) {
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  modal(tr('dlg.openFiles.title'), `<p>${tr('dlg.openFiles.body')}</p>`
    + `<p class="dim">${tr('dlg.openFiles.note')}${mobile ? tr('dlg.openFiles.android') : ''}</p>`
    + (why ? `<p class="dim" style="font-size:11px">${esc(why)}</p>` : ''), [
    { label: tr('btn.cancel'), value: null },
    { label: tr('dlg.openFiles.pickFiles'), value: () => { $('#filesIn').click(); return null; }, primary: mobile },
    { label: tr('dlg.pickFolder'), value: () => { $('#dirIn').click(); return null; }, primary: !mobile },
  ]);
}
async function useProvider(P, prefer) {
  stopPlay();
  A.fs.provider = P; A.backedUp = new Set();
  Au.reset();
  await refreshFileList();
  const files = A.fs.files;
  if (!files.length) { toast(tr('toast.noChartInFolder'), 4500); newChart(true); return; }
  await openChart(prefer && files.includes(prefer) ? prefer : files[0]);
}
async function refreshFileList(select) {
  const P = A.fs.provider, sel = $('#fileSel');
  if (!P) { sel.innerHTML = `<option>${esc(tr('file.noFolder'))}</option>`; sel.disabled = true; return; }
  const all = await P.list();
  const names = all.filter((n) => CHART_EXT.test(n)).sort((a, b) => a.localeCompare(b));
  A.fs.files = names;
  const opts = names.slice();
  if (select && !opts.includes(select)) opts.push(select);
  sel.innerHTML = opts.length ? opts.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('') : `<option>${esc(tr('file.noCharts'))}</option>`;
  if (!A.fileName && A.st) sel.insertAdjacentHTML('afterbegin', `<option value="">${esc(tr('file.newOption'))}</option>`);
  sel.disabled = !opts.length;
  sel.value = select !== undefined ? select : (A.fileName || '');
  $('#audioList').innerHTML = all.filter((n) => AUDIO_EXT.test(n)).sort().map((n) => `<option value="${esc(n)}">`).join('');
  $('#imgList').innerHTML = all.filter((n) => /\.(bmp|png|jpe?g|gif|mpe?g|mp4|wmv|avi|webm|m4v)$/i.test(n)).sort().map((n) => `<option value="${esc(n)}">`).join('');
}
async function openChart(name, enc) {
  const P = A.fs.provider;
  const bytes = P && await P.read(name);
  if (!bytes) { toast(tr('toast.cantRead', { name }), 4000); return; }
  let doc;
  try { doc = C.parse(bytes, enc); } catch (e) { toast(tr('toast.readFailed', { err: e }), 5000); return; }
  loadDoc(doc, name);
}
function loadDoc(doc, name) {
  stopPlay();
  A.doc = doc; A.st = C.stateFromDoc(doc); A.fileName = name;
  A.undo = []; A.redo = []; A.sel = new Set(); A.blkIdx = 0; A.beatSel = new Set(); A.drag = null; A.hover = null;
  A.curWav = A.st.wavs.size ? Math.min(...A.st.wavs.keys()) : 1;
  A.curBmp = [...A.st.bmps.keys()].filter((k) => k > 0).sort((a, b) => a - b)[0] || 1;
  A.view.bottom = 0; A.view.left = 0;
  setPlayMode(guessPlayMode(doc, name, A.st), true); // 자동 판단
  $('#empty').hidden = true;
  setDirty(false);
  refresh();
  renderAllPanels();
  syncScroll();
  refreshFileList(name);
  $('#encSel').value = doc.enc;
  startPreload(); checkBmps();
  const notes = [];
  if (A.dp) notes.push(tr('open.note.dp'));
  if (A.pms) notes.push(tr('open.note.pms'));
  if (doc.lntype === 2) notes.push(tr('open.note.lntype2'));
  if (doc.encAmbiguous) notes.push(tr('open.note.encGuess'));
  if (notes.length) toast(notes.join(' · '), 5000);
}
function newChart(skipConfirm) {
  const go = () => { loadDoc(C.parse(new TextEncoder().encode(C.NEW_TEMPLATE), 'shift_jis'), ''); refreshFileList(''); };
  if (skipConfirm) { go(); return; }
  confirmDiscard().then((ok) => { if (ok) go(); });
}
