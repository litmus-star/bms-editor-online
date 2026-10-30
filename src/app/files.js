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
    async write() { throw new Error('이 방식으로 연 폴더에는 쓸 수 없습니다'); },
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
      if (name !== file.name) throw new Error('파일 하나만 연 상태라 다른 이름으로는 쓸 수 없습니다');
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

async function openFolder() {
  if (!(await confirmDiscard())) return;
  let inFrame = false;
  try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
  if (window.showDirectoryPicker && !inFrame) {
    let dir;
    try { dir = await window.showDirectoryPicker({ id: 'bms-folder', mode: 'readwrite' }); }
    catch (e) { if (e.name === 'AbortError') return; fallbackPick(e.message); return; }
    await useProvider(makeDirProvider(dir));
  } else fallbackPick();
}
// 폴더 선택 창을 쓸 수 없는 환경(다른 페이지 안에 띄워진 경우, 모바일 등): 일반 파일 선택으로 대신
function fallbackPick(why) {
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  modal('폴더 열기', `<p>이 화면에서는 폴더를 직접 열 수 없어 파일 선택 창으로 불러옵니다. 이 방식으로 연 파일은 <b>저장할 때 다운로드</b>됩니다.</p>`
    + `<p class="dim">폴더에 바로 저장하려면 HTML 파일을 내려받아 크롬·엣지에서 직접 열거나, 폴더를 이 창에 끌어다 놓으세요.${mobile ? ' 안드로이드에서는 패턴 파일과 키음 파일을 한꺼번에 여러 개 고르면 됩니다.' : ''}</p>`
    + (why ? `<p class="dim" style="font-size:11px">${esc(why)}</p>` : ''), [
    { label: '취소', value: null },
    { label: '파일 여러 개 고르기', value: () => { $('#filesIn').click(); return null; }, primary: mobile },
    { label: '폴더 고르기', value: () => { $('#dirIn').click(); return null; }, primary: !mobile },
  ]);
}
async function useProvider(P, prefer) {
  stopPlay();
  A.fs.provider = P; A.backedUp = new Set();
  Au.reset();
  await refreshFileList();
  const files = A.fs.files;
  if (!files.length) { toast('폴더에 BMS 파일(.bms .bme .bml .pms)이 없어 새 파일을 만들었습니다', 4500); newChart(true); return; }
  await openChart(prefer && files.includes(prefer) ? prefer : files[0]);
}
async function refreshFileList(select) {
  const P = A.fs.provider, sel = $('#fileSel');
  if (!P) { sel.innerHTML = '<option>(폴더 없음)</option>'; sel.disabled = true; return; }
  const all = await P.list();
  const names = all.filter((n) => CHART_EXT.test(n)).sort((a, b) => a.localeCompare(b));
  A.fs.files = names;
  const opts = names.slice();
  if (select && !opts.includes(select)) opts.push(select);
  sel.innerHTML = opts.length ? opts.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('') : '<option>(패턴 파일 없음)</option>';
  if (!A.fileName && A.st) sel.insertAdjacentHTML('afterbegin', '<option value="">(새 파일)</option>');
  sel.disabled = !opts.length;
  sel.value = select !== undefined ? select : (A.fileName || '');
  $('#audioList').innerHTML = all.filter((n) => AUDIO_EXT.test(n)).sort().map((n) => `<option value="${esc(n)}">`).join('');
  $('#imgList').innerHTML = all.filter((n) => /\.(bmp|png|jpe?g|gif|mpe?g|mp4|wmv|avi|webm|m4v)$/i.test(n)).sort().map((n) => `<option value="${esc(n)}">`).join('');
}
async function openChart(name, enc) {
  const P = A.fs.provider;
  const bytes = P && await P.read(name);
  if (!bytes) { toast('파일을 읽을 수 없습니다: ' + name, 4000); return; }
  let doc;
  try { doc = C.parse(bytes, enc); } catch (e) { toast('읽기 실패: ' + e.message, 5000); return; }
  loadDoc(doc, name);
}
function loadDoc(doc, name) {
  stopPlay();
  A.doc = doc; A.st = C.stateFromDoc(doc); A.fileName = name;
  A.undo = []; A.redo = []; A.sel = new Set(); A.blkIdx = 0; A.beatSel = new Set(); A.playMark = null; A.drag = null; A.hover = null;
  A.curWav = A.st.wavs.size ? Math.min(...A.st.wavs.keys()) : 1;
  A.curBmp = [...A.st.bmps.keys()].filter((k) => k > 0).sort((a, b) => a - b)[0] || 1;
  A.view.bottom = 0; A.view.left = 0;
  setDP((A.st.headers.get('PLAYER') || '').trim() === '3' || doc.hasP2, true); // 자동 판단
  $('#empty').hidden = true;
  setDirty(false);
  refresh();
  renderAllPanels();
  syncScroll();
  refreshFileList(name);
  $('#encSel').value = doc.enc;
  startPreload(); checkBmps();
  const notes = [];
  if (A.dp) notes.push('DP 패턴으로 열었습니다');
  if (doc.lntype === 2) notes.push('LNTYPE 2 롱노트는 편집하지 않고 보존합니다');
  if (/\.pms$/i.test(name)) notes.push('PMS 파일은 7키 레인으로 표시됩니다');
  if (doc.encAmbiguous) notes.push('인코딩을 Shift-JIS로 추정했습니다. 글자가 깨져 보이면 아래쪽 인코딩을 바꿔 보세요');
  if (notes.length) toast(notes.join(' · '), 5000);
}
function newChart(skipConfirm) {
  const go = () => { loadDoc(C.parse(new TextEncoder().encode(C.NEW_TEMPLATE), 'shift_jis'), ''); refreshFileList(''); };
  if (skipConfirm) { go(); return; }
  confirmDiscard().then((ok) => { if (ok) go(); });
}
