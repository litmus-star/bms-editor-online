/* ───────── 끌어다 놓기 ───────── */
function bindDrop() {
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; $('#drop').hidden = false; } });
  window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; $('#drop').hidden = true; } });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; $('#drop').hidden = true;
    const it = [...(e.dataTransfer.items || [])].find((i) => i.kind === 'file');
    if (!it) return;
    const hp = it.getAsFileSystemHandle ? it.getAsFileSystemHandle() : null;
    const entry = !hp && it.webkitGetAsEntry ? it.webkitGetAsEntry() : null;
    const file = it.getAsFile();
    if (!(await confirmDiscard())) return;
    try {
      if (hp) {
        const h = await hp;
        if (h && h.kind === 'directory') { await useProvider(makeDirProvider(h)); return; }
        if (h && h.kind === 'file' && CHART_EXT.test(h.name)) { await useProvider(makeSingleProvider(await h.getFile(), h)); toast(tr('toast.drop.fileOnly'), 4500); return; }
      }
      if (entry && entry.isDirectory) { await useProvider(await makeEntryProvider(entry)); toast(tr('toast.saveWillDownload'), 4500); return; }
      if (file && CHART_EXT.test(file.name)) { await useProvider(makeSingleProvider(file, null)); return; }
      toast(tr('toast.drop.what'));
    } catch (err) { toast(tr('toast.openFailed', { err }), 5000); }
  });
}

/* ───────── 알림 ───────── */
let toastT = 0;
function toast(msg, ms) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms || 2600);
}
