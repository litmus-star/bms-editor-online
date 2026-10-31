/* ───────── 저장 ───────── */
function suggestName() {
  if (A.fileName) return A.fileName.replace(/(\.[^.]+)$/, '_copy$1');
  const t = (A.st.headers.get('TITLE') || 'new').replace(/[\\/:*?"<>|]/g, '').trim() || 'new';
  return t + (A.pms ? '.pms' : '.bme');
}
async function save(asNew) {
  if (!A.st) return;
  const ae = document.activeElement; // 입력 중이던 헤더·블록 내용을 먼저 반영
  if (ae && ae.matches && ae.matches('#hdrBd input, #hdrBd select, #blkTx, .wr input')) ae.blur();
  stopPlay();
  if (!A.fileName) asNew = true;
  let res;
  try { res = C.serialize(A.doc, A.st, { encoding: A.doc.enc }); }
  catch (e) { await modal(tr('dlg.saveFail.title'), `<p>${esc(msgText(e))}</p>`, [{ label: tr('btn.close'), value: null, primary: true }]); return; }
  let name = asNew ? suggestName() : A.fileName, enc = A.doc.enc;
  const problem = !res.verify.ok || res.badChars.length || res.warnings.length;
  if (asNew || cfg.confirmSave || problem) {
    const r = await saveDialog(res, name, asNew);
    if (!r) return;
    ({ name, enc, res } = r);
  }
  if (!CHART_EXT.test(name)) name += A.pms ? '.pms' : '.bme';
  await writeOut(name, res, enc);
}
function saveDialog(res0, name, asNew) {
  let res = res0, enc = res0.enc;
  const w = document.createElement('div');
  w.className = 'savedlg';
  const render = (keepName) => {
    const v = res.verify, items = [];
    items.push(v.ok ? `<li class="ok">${tr('save.verify.ok')}</li>`
      : `<li class="bad">${tr('save.verify.bad', { n: v.problems.length })}<ul>${v.problems.map((p) => `<li>${esc(msgText(p))}</li>`).join('')}</ul></li>`);
    items.push(res.reencode ? `<li class="warn">${tr('save.reencode', { enc: C.ENC_LABEL[res.enc] })}</li>`
      : `<li class="ok">${tr('save.kept', { n: res.kept })}</li>`);
    if (res.badChars.length) items.push(`<li class="bad">${tr('save.badChars', { enc: C.ENC_LABEL[res.enc], chars: esc(res.badChars.slice(0, 24).join(' ')) })}</li>`);
    for (const x of res.warnings) items.push(`<li class="warn">${esc(msgText(x))}</li>`);
    if (res.newDefs) items.push(`<li class="ok">${tr('save.newDefs', { n: res.newDefs })}</li>`);
    const minus = res.diff.filter((d) => d.op === '-').length, plus = res.diff.length - minus;
    const LIM = 500;
    const diffHtml = res.diff.slice(0, LIM).map((d) => `<div class="${d.op === '-' ? 'dm' : 'dp'}">${d.op === '-' ? '−' : '+'} <span class="ln">${d.n || ''}</span>${esc(trunc(d.t, 200))}</div>`).join('')
      + (res.diff.length > LIM ? `<div class="dim">${tr('save.diffMore', { n: res.diff.length - LIM })}</div>` : '');
    w.innerHTML = (asNew ? `<label class="fl">${tr('save.fileName')} <input id="sdName" type="text" value="${esc(keepName || name)}" spellcheck="false"></label>` : `<div class="fl">${tr('save.file')} <b>${esc(name)}</b></div>`)
      + `<label class="fl">${tr('stb.enc')} <select id="sdEnc">${ENC_LIST.map((e) => `<option value="${e}"${e === enc ? ' selected' : ''}>${C.ENC_LABEL[e]}${e === A.doc.enc ? tr('save.encOriginal') : ''}</option>`).join('')}</select></label>`
      + `<ul class="chk">${items.join('')}</ul>`
      + `<div class="dh">${tr('save.diffHead', { minus, plus })}</div>`
      + `<div class="diff">${diffHtml || `<div class="dim">${tr('save.noDiff')}</div>`}</div>`
      + `<label class="chkl"><input type="checkbox" id="sdBak"${cfg.backup ? ' checked' : ''}> ${tr('pn.view.backup')}</label>`
      + `<label class="chkl"><input type="checkbox" id="sdQuiet"${cfg.confirmSave ? '' : ' checked'}> ${tr('save.quiet')}</label>`;
    w.querySelector('#sdEnc').onchange = (e) => {
      const nm = asNew ? w.querySelector('#sdName').value : '';
      try { res = C.serialize(A.doc, A.st, { encoding: e.target.value }); enc = e.target.value; render(nm); }
      catch (err) { toast(msgText(err), 5000); }
    };
  };
  render();
  return modal(asNew ? tr('save.titleAs') : tr('save.title'), w, [
    { label: tr('btn.cancel'), value: null },
    { label: res0.verify.ok && !res0.badChars.length ? tr('save.ok') : tr('save.anyway'), primary: true, value: () => {
      cfg.backup = w.querySelector('#sdBak').checked; cfg.confirmSave = !w.querySelector('#sdQuiet').checked; saveCfg(); syncOptions();
      const nm = asNew ? w.querySelector('#sdName').value.trim().replace(/[\\/:*?"<>|]/g, '') : name;
      if (!nm) { toast(tr('toast.needFileName')); return undefined; }
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
  if (P && P.kind === 'list' && !P.canWrite && canPickDir()) { try { await attachWriteDir(P); } catch (e) { /* 다운로드로 */ } }
  const isDir = P && (P.kind === 'dir' || !!P.writer);
  if (P && P.canWrite) {
    try {
      if (!(await P.ensureWrite())) throw appError('err.noWritePermission');
      const lower = name.toLowerCase();
      if (cfg.backup && isDir && A.fileName && lower === A.fileName.toLowerCase() && A.doc.bytes.length && !A.backedUp.has(lower)) {
        await P.write(name + '.bak', A.doc.bytes); A.backedUp.add(lower); backup = tr('toast.saved.backup', { name });
      }
      if (isDir && lower !== (A.fileName || '').toLowerCase() && A.fs.files.some((f) => f.toLowerCase() === lower)) {
        const ok = await modal(tr('dlg.overwrite.title'), `<p>${tr('dlg.overwrite.body', { name: esc(name) })}</p>`, [{ label: tr('btn.cancel'), value: false }, { label: tr('dlg.overwrite.ok'), value: true, primary: true }]);
        if (!ok) return;
      }
      await P.write(name, res.bytes); wrote = true;
    } catch (e) { toast(tr('toast.writeFailedDownload', { err: e }), 6000); }
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
  toast(wrote ? tr('toast.saved', { name }) + backup : tr('toast.downloaded', { name }), 4000);
}
