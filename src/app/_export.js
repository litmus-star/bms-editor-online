window.BMSApp = {
  A, cfg, Au, loadDoc, useProvider, makeListProvider, makeDirProvider, commit, undo, redo, save, play, stopPlay, setMode, pasteText, copySel, nudge,
  refresh, setZoom, setBottom, hereBeat, serialize: () => C.serialize(A.doc, A.st, { encoding: A.doc.enc }),
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
