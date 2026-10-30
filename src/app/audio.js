/* ───────── 소리 ───────── */
const Au = {
  ctx: null, master: null, gen: 0, prom: new Map(), state: new Map(), buf: new Map(), preview: null, play: null, active: 0, queue: [],
  stat: null,
  reset() { this.gen++; this.prom.clear(); this.state.clear(); this.buf.clear(); this.queue = []; this.stat = newStat(); },
};
const wavKey = (name) => normPath(name).toLowerCase();
// 키음 로딩 측정: 단계별 시간(ms)의 합계. 여러 개가 동시에 돌기 때문에 합계는 실제 걸린 시간보다 클 수 있다.
function newStat() { return { t0: 0, t1: 0, n: 0, wait: 0, find: 0, read: 0, decode: 0, bytes: 0, pcm: 0, dur: 0, peak: 0, ext: {}, slow: [] }; }
Au.stat = newStat();
const nowMs = () => performance.now();
function ensureCtx(resume) {
  if (!Au.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    Au.ctx = new AC({ latencyHint: 'interactive' });
    Au.master = Au.ctx.createGain(); Au.master.gain.value = cfg.volume; Au.master.connect(Au.ctx.destination);
  }
  if (resume && Au.ctx.state === 'suspended') Au.ctx.resume();
  return Au.ctx;
}
function limited(fn) {
  return new Promise((res) => {
    const run = async () => {
      Au.active++;
      try { res(await fn()); } catch (e) { res(null); }
      finally { Au.active--; const nx = Au.queue.shift(); if (nx) nx(); }
    };
    if (Au.active < 6) run(); else Au.queue.push(run);
    if (Au.stat && Au.active > Au.stat.peak) Au.stat.peak = Au.active;
  });
}
function loadWav(name) {
  const k = wavKey(name);
  if (Au.prom.has(k)) return Au.prom.get(k);
  const gen = Au.gen, S = Au.stat, tq = nowMs();
  if (!S.t0) S.t0 = tq;
  Au.state.set(k, 'loading');
  const p = limited(async () => {
    const P = A.fs.provider;
    if (gen !== Au.gen) return null;
    if (!P) { Au.state.set(k, 'missing'); return null; }
    const ta = nowMs(); S.wait += ta - tq;
    let h = await P.find(name);
    if (!h) {
      const stem = normPath(name).replace(/\.[^./]*$/, '');
      for (const ext of ['.wav', '.ogg', '.flac', '.mp3']) { h = await P.find(stem + ext); if (h) break; }
    }
    if (gen !== Au.gen) return null;
    const tb = nowMs(); S.find += tb - ta;
    if (!h) { Au.state.set(k, 'missing'); return null; }
    try {
      const ab = await (await h.getFile()).arrayBuffer();
      const tc = nowMs(), size = ab.byteLength;
      const ctx = ensureCtx(false); if (!ctx) return null;
      const buf = await ctx.decodeAudioData(ab);
      const td = nowMs();
      if (gen !== Au.gen) return null;
      S.read += tc - tb; S.decode += td - tc; S.n++; S.bytes += size; S.t1 = td;
      S.pcm += buf.length * buf.numberOfChannels * 4; S.dur += buf.duration;
      const ext = (h.name.match(/\.([^.]+)$/) || [, '?'])[1].toLowerCase();
      const ex = S.ext[ext] || (S.ext[ext] = { n: 0, read: 0, decode: 0, bytes: 0 });
      ex.n++; ex.read += tc - tb; ex.decode += td - tc; ex.bytes += size;
      S.slow.push({ name: h.name, read: tc - tb, decode: td - tc, size }); if (S.slow.length > 40) { S.slow.sort((a, b) => b.read + b.decode - a.read - a.decode); S.slow.length = 5; }
      Au.buf.set(k, buf); Au.state.set(k, 'ok');
      return buf;
    } catch (e) { if (gen === Au.gen) Au.state.set(k, 'fail'); return null; }
  });
  Au.prom.set(k, p);
  p.then(() => scheduleLoadStatus());
  return p;
}
function bufOf(id) { const n = A.st && A.st.wavs.get(id); return n ? Au.buf.get(wavKey(n)) || null : null; }
function startPreload() {
  if (!A.st || !A.fs.provider) { scheduleLoadStatus(); return; }
  for (const n of new Set(A.st.wavs.values())) if (n) loadWav(n);
  scheduleLoadStatus();
}
function loadCounts() {
  const c = { total: 0, ok: 0, missing: 0, fail: 0, loading: 0 };
  if (!A.st || !A.fs.provider) return c;
  for (const n of new Set(A.st.wavs.values())) {
    if (!n) continue;
    c.total++;
    const s = Au.state.get(wavKey(n));
    if (s === 'ok') c.ok++; else if (s === 'missing') c.missing++; else if (s === 'fail') c.fail++; else c.loading++;
  }
  return c;
}
let loadT = 0;
function scheduleLoadStatus() {
  if (loadT) return;
  loadT = setTimeout(() => {
    loadT = 0;
    const c = loadCounts();
    $('#sLoad').textContent = !c.total ? '' : c.loading ? `키음 불러오는 중 ${c.ok + c.missing + c.fail}/${c.total}` : `키음 ${c.ok}/${c.total}` + (c.missing + c.fail ? ` · 문제 ${c.missing + c.fail}` : '');
    if (!c.loading) { renderWavList(); renderInfo(); }
    renderDiag();
  }, 250);
}
function preview(id) {
  if (!A.st) return;
  const name = A.st.wavs.get(id); if (!name || !A.fs.provider) return;
  const ctx = ensureCtx(true); if (!ctx) return;
  loadWav(name).then((buf) => {
    if (!buf) return;
    if (Au.preview) { try { Au.preview.stop(); } catch (e) { /* 이미 멈춤 */ } }
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(Au.master); s.start(); Au.preview = s;
  });
}
async function play(fromBeat) {
  if (!A.st) return;
  stopPlay();
  const ctx = ensureCtx(true);
  if (!ctx) { toast('이 브라우저는 오디오 재생을 지원하지 않습니다'); return; }
  if (!A.fs.provider) toast('키음 폴더 없이 연 파일이라 소리가 나지 않습니다', 3500);
  const T = A.timing, t0 = T.beatToTime(fromBeat);
  let evs = [];
  for (const n of A.st.notes) {
    if (!isSound(n.lane) || n.kind) continue; // 숨김·지뢰 노트는 자동 재생 소리 없음
    if (n.lane[0] === 'B' ? !cfg.playBgm : !cfg.playKeys) continue;
    evs.push({ t: T.beatToTime(n.b) - t0, id: n.v });
  }
  evs.sort((a, b) => a.t - b.t);
  // 시작점 이전 노트: 같은 키음은 마지막 것만 남기고(앞 소리는 끊겼으므로), 아직 울리고 있으면 중간부터 재생
  const lastPre = new Map();
  for (const e of evs) if (e.t < -1e-9) lastPre.set(e.id, e);
  evs = evs.filter((e) => e.t >= -1e-9 || lastPre.get(e.id) === e);
  const token = {}; A.playToken = token; setPlayButtons(true);
  const pending = [];
  for (const id of new Set(evs.map((e) => e.id))) {
    const nm = A.st.wavs.get(id); if (!nm) continue;
    const s = Au.state.get(wavKey(nm));
    if (s !== 'ok' && s !== 'missing' && s !== 'fail') pending.push(loadWav(nm));
  }
  if (pending.length) { $('#sLoad').textContent = `재생 준비: 키음 ${pending.length}개 불러오는 중…`; await Promise.all(pending); scheduleLoadStatus(); }
  if (A.playToken !== token) return;
  const P = { evs, i: 0, start: ctx.currentTime + 0.12, t0, fromBeat, last: new Map(), srcs: new Set(), endT: evs.length ? Math.max(0, evs[evs.length - 1].t) : 0 };
  Au.play = P;
  P.timer = setInterval(sched, 25); sched();
  P.raf = requestAnimationFrame(tick);
}
function sched() {
  const P = Au.play; if (!P) return;
  const ctx = Au.ctx, now = ctx.currentTime, horizon = now + 0.3;
  while (P.i < P.evs.length) {
    const e = P.evs[P.i], when = P.start + e.t;
    if (when > horizon) break;
    P.i++;
    const buf = bufOf(e.id); if (!buf) continue;
    const at = Math.max(when, P.start, now), off = at - when;
    if (off >= buf.duration) continue;
    const prev = P.last.get(e.id);
    if (prev) { try { prev.stop(at); } catch (err) { /* 이미 멈춤 */ } } // 같은 키음이 다시 울리면 앞 소리를 끊는다
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(Au.master); s.start(at, off);
    P.last.set(e.id, s); P.srcs.add(s); s.onended = () => P.srcs.delete(s);
  }
  if (P.i >= P.evs.length && P.srcs.size === 0 && now > P.start + P.endT + 0.3) stopPlay();
}
function tick() {
  const P = Au.play; if (!P) return;
  const t = Au.ctx.currentTime - P.start + P.t0;
  A.playBeat = t <= P.t0 ? P.fromBeat : A.timing.timeToBeat(t);
  if (cfg.follow && !A.drag && !A.userScroll) setBottom(A.playBeat - (A.H - HEAD_H) * 0.2 / A.ppb); else draw();
  P.raf = requestAnimationFrame(tick);
}
function stopPlay() {
  A.playToken = null;
  const P = Au.play;
  if (P) {
    Au.play = null; clearInterval(P.timer); cancelAnimationFrame(P.raf);
    for (const s of P.srcs) { try { s.stop(); } catch (e) { /* 이미 멈춤 */ } }
  }
  if (A.playBeat != null) { A.playBeat = null; draw(); }
  setPlayButtons(false);
}
function setPlayButtons(on) { $('#pStop').classList.toggle('on', !!on); }
