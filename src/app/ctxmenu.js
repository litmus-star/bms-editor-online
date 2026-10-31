/* ───────── 우클릭 메뉴 (마우스 우클릭 · S펜 옆 버튼 · 손가락 길게 누르기) ─────────
   노트: 값 바꾸기 · 잘라내기 · 복사 · 삭제 · 목록에서 보기 · 노트 종류 · 롱노트 풀기
   빈 곳: 여기에 붙여넣기 · 모두 선택 */
function hideCtx() { const m = $('#ctxMenu'); if (m) m.hidden = true; }
function openMenu(items, x, y, touch) {
  const m = $('#ctxMenu');
  m.innerHTML = ''; m.classList.toggle('touchmenu', !!touch);
  for (const it of items) {
    if (it === '-') { if (m.lastChild && m.lastChild.tagName === 'BUTTON') { const hr = document.createElement('div'); hr.className = 'sep'; m.appendChild(hr); } continue; }
    const b = document.createElement('button');
    b.innerHTML = `<span>${esc(it.label)}</span>${it.key ? `<kbd>${esc(it.key)}</kbd>` : ''}`;
    if (it.on) b.classList.add('on');
    if (it.disabled) b.disabled = true;
    b.addEventListener('click', () => { hideCtx(); it.fn(); A.sc.focus({ preventScroll: true }); });
    m.appendChild(b);
  }
  if (m.lastChild && m.lastChild.className === 'sep') m.lastChild.remove();
  m.hidden = false;
  const r = m.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
  // 마우스: 누른 곳 오른쪽 아래로 / 손가락: 손가락에 가리지 않게 위로
  let left = touch ? x - r.width / 2 : x + 2, top = touch ? y - r.height - 24 : y + 2;
  if (!touch && top + r.height > H - 8) top = y - r.height - 2;
  if (touch && top < 8) top = y + 24;
  m.style.left = Math.min(W - r.width - 8, Math.max(8, left)) + 'px';
  m.style.top = Math.min(H - r.height - 8, Math.max(8, top)) + 'px';
  dbg(`menu ${m.style.left},${m.style.top} ${Math.round(r.width)}x${Math.round(r.height)} 화면 ${W}x${H}`);
}
// 노트를 우클릭: 선택 안 된 노트면 그것만 선택하고, 선택된 노트면 선택 전체에 적용
function showCtx(n, x, y, touch) {
  if (!A.sel.has(n)) A.sel = new Set([n]);
  const sel = [...A.sel], cnt = sel.length > 1 ? ` (${sel.length}개)` : '';
  const items = [];
  items.push({ label: '값 바꾸기…', fn: () => { const kind = (x2) => (isSound(x2.lane) ? 's' : x2.lane); editValue([n, ...sel.filter((x2) => x2 !== n && kind(x2) === kind(n))]); } });
  items.push('-');
  items.push({ label: '잘라내기' + cnt, key: 'Ctrl+X', fn: () => { menuCopy(); const c = A.sel.size; deleteSel(); toast(`노트 ${c}개 잘라냄`); } });
  items.push({ label: '복사' + cnt, key: 'Ctrl+C', fn: () => { menuCopy(); toast(`노트 ${A.sel.size}개 복사`); } });
  items.push({ label: '삭제' + cnt, key: 'Del', fn: deleteSel });
  items.push('-');
  if (n.lane[0] === 'G') items.push({ label: 'BMP 목록에서 보기', fn: () => showInList('bmp', n.v) });
  else if (isSound(n.lane) && n.kind !== 'm') items.push({ label: 'WAV 목록에서 보기', fn: () => showInList('wav', n.v) });
  // 노트 종류: 키 레인의 롱노트가 아닌 노트만 (숨김·지뢰 롱노트 채널은 없음)
  const kindable = sel.filter((x2) => isKey(x2.lane) && !(x2.lb > 0));
  if (kindable.length) {
    items.push('-');
    const cur = new Set(kindable.map((x2) => x2.kind || 'n'));
    for (const [k, label] of [['n', '일반 노트'], ['h', '숨김 노트'], ['m', '지뢰']]) {
      items.push({ label, on: cur.size === 1 && cur.has(k), fn: () => setKindOf(kindable, k) });
    }
  }
  const lns = sel.filter((x2) => x2.lb > 0);
  if (lns.length) { items.push('-'); items.push({ label: '롱노트 풀기' + (lns.length > 1 ? ` (${lns.length}개)` : ''), fn: () => unLN(lns) }); }
  openMenu(items, x, y, touch);
  statusNote(); draw();
}
// 빈 곳을 우클릭: h는 우클릭한 위치(붙여넣기 기준 마디)
function showBlankCtx(h, x, y, touch) {
  A.hover = { note: null, ghost: null, h };
  const canPaste = !!A.clip || !!(navigator.clipboard && navigator.clipboard.readText);
  openMenu([
    { label: '여기에 붙여넣기', key: 'Ctrl+V', disabled: !canPaste, fn: () => pasteHere(h) },
    { label: '모두 선택', key: 'Ctrl+A', fn: selectAll },
  ], x, y, !!touch);
}
async function pasteHere(h) {
  A.hover = { note: null, ghost: null, h };
  let text = null;
  try { if (navigator.clipboard && navigator.clipboard.readText) text = await navigator.clipboard.readText(); } catch (e) { /* 권한 없음: 편집기 안 클립보드 사용 */ }
  if (!text || !/^iBMSC Clipboard Data/.test(text)) text = A.clip ? A.clip.text : text;
  if (!text) { toast('붙여넣을 노트가 없습니다'); return; }
  A.hover = { note: null, ghost: null, h };
  pasteText(text);
}
function menuCopy() {
  const t = copySel(); if (!t) return;
  try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).catch(() => {}); } catch (e) { /* 편집기 안 클립보드만 */ }
}
// 오른쪽 목록에서 그 번호를 보여 주기 (패널이 접혀 있으면 펼침)
function showInList(which, id) {
  if (cfg.sideOff && A.toggleSide) A.toggleSide();
  const pn = $(which === 'wav' ? '#pnWav' : '#pnBmp'); pn.open = true;
  const q = $(which === 'wav' ? '#wavQ' : '#bmpQ'), def = $(which === 'wav' ? '#wavDef' : '#bmpDef');
  if (which === 'wav') { A.curWav = id; if (q.value) q.value = ''; if (def.checked && !A.st.wavs.get(id)) def.checked = false; renderWavList(); markCurWav(true); }
  else { A.curBmp = id; if (q.value) q.value = ''; if (def.checked && !A.st.bmps.get(id)) def.checked = false; renderBmpList(); markCurBmp(true); }
  const row = $(which === 'wav' ? '#wavList' : '#bmpList').querySelector(`.wr[data-id="${id}"]`);
  if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 900); }
}
// 노트 종류 바꾸기: 일반 ↔ 숨김 ↔ 지뢰 (지뢰의 값은 피해량이라, 지뢰로 바꿀 땐 지뢰 값, 지뢰에서 바꿀 땐 지금 고른 키음)
function setKindOf(notes, k) {
  const targets = notes.filter((x) => (x.kind || 'n') !== k);
  if (!targets.length) return;
  const add = targets.map((x) => {
    const v = k === 'm' ? (A.mineVal || 1) : x.kind === 'm' ? A.curWav : x.v;
    const o = cloneNote(x, { v, kind: k === 'n' ? undefined : k });
    if (!o.kind) delete o.kind;
    return o;
  });
  const keep = [...A.sel].filter((x) => !targets.includes(x));
  commit({ del: targets, add }); A.sel = new Set(keep.concat(add)); statusNote(); draw();
  toast(`노트 ${targets.length}개를 ${({ n: '일반 노트', h: '숨김 노트', m: '지뢰' })[k]}(으)로 바꿨습니다`);
}
function unLN(notes) {
  const add = notes.map((x) => cloneNote(x, { len: null }));
  const keep = [...A.sel].filter((x) => !notes.includes(x));
  commit({ del: notes, add }); A.sel = new Set(keep.concat(add)); statusNote(); draw();
}
