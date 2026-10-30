/* ───────── 저장 ───────── */
function suggestName() {
  if (A.fileName) return A.fileName.replace(/(\.[^.]+)$/, '_copy$1');
  const t = (A.st.headers.get('TITLE') || 'new').replace(/[\\/:*?"<>|]/g, '').trim() || 'new';
  return t + '.bme';
}
async function save(asNew) {
  if (!A.st) return;
  const ae = document.activeElement; // 입력 중이던 헤더·블록 내용을 먼저 반영
  if (ae && ae.matches && ae.matches('#hdrBd input, #hdrBd select, #blkTx, .wr input')) ae.blur();
  stopPlay();
  if (!A.fileName) asNew = true;
  let res;
  try { res = C.serialize(A.doc, A.st, { encoding: A.doc.enc }); }
  catch (e) { await modal('저장할 수 없습니다', `<p>${esc(e.message)}</p>`, [{ label: '닫기', value: null, primary: true }]); return; }
  let name = asNew ? suggestName() : A.fileName, enc = A.doc.enc;
  const problem = !res.verify.ok || res.badChars.length || res.warnings.length;
  if (asNew || cfg.confirmSave || problem) {
    const r = await saveDialog(res, name, asNew);
    if (!r) return;
    ({ name, enc, res } = r);
  }
  if (!CHART_EXT.test(name)) name += '.bme';
  await writeOut(name, res, enc);
}
function saveDialog(res0, name, asNew) {
  let res = res0, enc = res0.enc;
  const w = document.createElement('div');
  w.className = 'savedlg';
  const render = (keepName) => {
    const v = res.verify, items = [];
    items.push(v.ok ? '<li class="ok">다시 읽어서 확인: 편집한 내용과 정확히 일치합니다</li>'
      : `<li class="bad">다시 읽어서 확인: 문제 ${v.problems.length}건<ul>${v.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></li>`);
    items.push(res.reencode ? `<li class="warn">인코딩을 ${C.ENC_LABEL[res.enc]}(으)로 바꿔 모든 줄을 다시 씁니다</li>`
      : `<li class="ok">편집하지 않은 줄 ${res.kept}개는 원본 바이트 그대로입니다</li>`);
    if (res.badChars.length) items.push(`<li class="bad">${C.ENC_LABEL[res.enc]}로 쓸 수 없는 글자: ${esc(res.badChars.slice(0, 24).join(' '))} — '?'로 바뀝니다. 인코딩을 UTF-8로 바꾸거나 글자를 고쳐 주세요.</li>`);
    for (const x of res.warnings) items.push(`<li class="warn">${esc(x)}</li>`);
    if (res.newDefs) items.push(`<li class="ok">새 #BPM/#STOP 정의 ${res.newDefs}개를 추가합니다</li>`);
    const minus = res.diff.filter((d) => d.op === '-').length, plus = res.diff.length - minus;
    const LIM = 500;
    const diffHtml = res.diff.slice(0, LIM).map((d) => `<div class="${d.op === '-' ? 'dm' : 'dp'}">${d.op === '-' ? '−' : '+'} <span class="ln">${d.n || ''}</span>${esc(trunc(d.t, 200))}</div>`).join('')
      + (res.diff.length > LIM ? `<div class="dim">… ${res.diff.length - LIM}줄 더</div>` : '');
    w.innerHTML = (asNew ? `<label class="fl">파일 이름 <input id="sdName" type="text" value="${esc(keepName || name)}" spellcheck="false"></label>` : `<div class="fl">파일: <b>${esc(name)}</b></div>`)
      + `<label class="fl">인코딩 <select id="sdEnc">${ENC_LIST.map((e) => `<option value="${e}"${e === enc ? ' selected' : ''}>${C.ENC_LABEL[e]}${e === A.doc.enc ? ' (원본)' : ''}</option>`).join('')}</select></label>`
      + `<ul class="chk">${items.join('')}</ul>`
      + `<div class="dh">바뀐 줄 — 지움 ${minus} · 새로 씀 ${plus}</div>`
      + `<div class="diff">${diffHtml || '<div class="dim">바뀐 줄이 없습니다</div>'}</div>`
      + `<label class="chkl"><input type="checkbox" id="sdBak"${cfg.backup ? ' checked' : ''}> 처음 덮어쓸 때 원본을 .bak으로 백업</label>`
      + `<label class="chkl"><input type="checkbox" id="sdQuiet"${cfg.confirmSave ? '' : ' checked'}> 다음부터 이 창 없이 바로 저장 (문제가 있을 때만 표시)</label>`;
    w.querySelector('#sdEnc').onchange = (e) => {
      const nm = asNew ? w.querySelector('#sdName').value : '';
      try { res = C.serialize(A.doc, A.st, { encoding: e.target.value }); enc = e.target.value; render(nm); }
      catch (err) { toast(err.message, 5000); }
    };
  };
  render();
  return modal(asNew ? '다른 이름으로 저장' : '저장 확인', w, [
    { label: '취소', value: null },
    { label: res0.verify.ok && !res0.badChars.length ? '저장' : '그래도 저장', primary: true, value: () => {
      cfg.backup = w.querySelector('#sdBak').checked; cfg.confirmSave = !w.querySelector('#sdQuiet').checked; saveCfg(); syncOptions();
      const nm = asNew ? w.querySelector('#sdName').value.trim().replace(/[\\/:*?"<>|]/g, '') : name;
      if (!nm) { toast('파일 이름을 넣어 주세요'); return undefined; }
      return { name: nm, enc, res };
    } },
  ]);
}
function download(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function writeOut(name, res, enc) {
  const P = A.fs.provider;
  let wrote = false, backup = '';
  if (P && P.canWrite) {
    try {
      if (!(await P.ensureWrite())) throw new Error('쓰기 권한을 받지 못했습니다');
      const lower = name.toLowerCase();
      if (cfg.backup && P.kind === 'dir' && A.fileName && lower === A.fileName.toLowerCase() && A.doc.bytes.length && !A.backedUp.has(lower)) {
        await P.write(name + '.bak', A.doc.bytes); A.backedUp.add(lower); backup = ` (원본은 ${name}.bak)`;
      }
      if (P.kind === 'dir' && lower !== (A.fileName || '').toLowerCase() && A.fs.files.some((f) => f.toLowerCase() === lower)) {
        const ok = await modal('덮어쓰기', `<p>폴더에 <b>${esc(name)}</b> 파일이 이미 있습니다. 덮어쓸까요?</p>`, [{ label: '취소', value: false }, { label: '덮어쓰기', value: true, primary: true }]);
        if (!ok) return;
      }
      await P.write(name, res.bytes); wrote = true;
    } catch (e) { toast('폴더에 쓰지 못해 다운로드로 저장합니다: ' + e.message, 6000); }
  }
  if (!wrote) download(name, res.bytes);
  // 저장한 내용을 새 기준으로 (실행 취소 기록은 유지)
  const nd = C.parse(res.bytes, enc);
  const blocksBefore = A.st.blocks.length;
  A.doc = nd; A.fileName = name;
  A.st.blocks = nd.blocks.map((b) => b.text);
  if (A.st.blocks.length !== blocksBefore) { A.undo = A.undo.filter((a) => !actTypes(a).has('blk')); A.redo = []; }
  setDirty(false);
  await refreshFileList(name);
  renderBlocks(); renderInfo();
  $('#encSel').value = enc;
  toast(wrote ? `저장했습니다: ${name}${backup}` : `다운로드했습니다: ${name}`, 4000);
}
