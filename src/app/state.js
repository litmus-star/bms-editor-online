const C = window.BMSCore;
const { R, R1, R4, radd, rsub, rmul, rdiv, rcmp, rf } = C;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trunc = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

/* ───────── 설정 (브라우저에 저장, 실패해도 동작) ───────── */
const CFG_KEY = 'bmsweb.cfg.v1';
const cfg = Object.assign(
  { zoom: 1, grid: 16, snap: true, showName: false, follow: true, playBgm: true, playKeys: true, backup: true, confirmSave: true, volume: 0.8, panels: {} },
  (() => { try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; } catch (e) { return {}; } })()
);
function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* 저장 불가 환경 */ } }

/* ───────── 상수 ───────── */
const HEAD_H = 22, MEAS_W = 50, PPB = 48; // 확대 1 → 한 박 48px, 4/4 한 마디 192px
// pw·py·pg·pb·pr: PMS(팝픈) 버튼 색 — 흰·노랑·초록·파랑·빨강
const NOTE_COL = { bga: '#c08cff', sc: '#ff5b5b', w: '#e8e8e8', b: '#5c88ff', bgm: '#a9afba', bpm: '#62d872', stop: '#ffa04a',
  pw: '#ececec', py: '#ffd83a', pg: '#45d65f', pb: '#4a8cff', pr: '#ff4646' };
const NOTE_TXT = { bga: '#1d0a33', sc: '#fff', w: '#111', b: '#fff', bgm: '#111', bpm: '#06200c', stop: '#2a1300',
  pw: '#111', py: '#2a2000', pg: '#03200a', pb: '#fff', pr: '#fff' };
const LANE_BG = { bga: '#120c1a', bpm: '#08130b', stop: '#150c06', sc: '#1b0808', w: '#111111', b: '#0b0e1d', bgm: '#0d0d0d',
  pw: '#141414', py: '#17140a', pg: '#0a160c', pb: '#0b0f1d', pr: '#1b0909' };
const GRIDS = [4, 8, 12, 16, 24, 32, 48, 64, 96, 192];
const AUDIO_EXT = /\.(wav|ogg|flac|mp3|m4a|aac|opus)$/i;
const CHART_EXT = /\.(bms|bme|bml|pms)$/i;
const ENC_LIST = ['shift_jis', 'utf-8', 'euc-kr'];

/* ───────── 상태 ───────── */
const A = {
  doc: null, st: null, fileName: '', dirty: false,
  undo: [], redo: [], sel: new Set(),
  mode: 'select', curWav: 1, curBmp: 1, noteKind: 'n', dp: false,
  view: { bottom: 0, left: 0 }, ppb: PPB * cfg.zoom, W: 0, H: 0, dpr: 1,
  lanes: [], laneMap: new Map(), sound: [], totalW: 0, bgmCount: 8,
  by: new Map(), maxLen: new Map(), ms: null, timing: null, ghosts: [], extentM: 64, usage: new Map(), conflicts: 0, muri: [],
  drag: null, hover: null, playBeat: null, playMark: null, playToken: null,
  fs: { provider: null, files: [] }, backedUp: new Set(), clip: null,
  blkIdx: 0, beatSel: new Set(), beatAnchor: -1,
};
let UID = 1e9;
function mkNote(o) { o.uid = ++UID; o.b = rf(o.pos); o.lb = o.len ? rf(o.len) : 0; return o; }
const NOTE_PROPS = ['len', 'ev', 'lnobj', 'dangling', 'bch', 'bid', 'sid', 'kind'];
function cloneNote(n, over) {
  const o = { lane: n.lane, pos: n.pos, v: n.v };
  for (const p of NOTE_PROPS) if (n[p] !== undefined) o[p] = n[p];
  Object.assign(o, over || {});
  if (o.lane[0] === 'B' || o.len === null || (o.len && o.len.n <= 0)) { delete o.len; delete o.ev; delete o.lnobj; }
  if (o.lane[0] === 'B') delete o.dangling;
  if (o.len) delete o.dangling;
  if (o.lane[0] !== 'K') delete o.kind;
  if (o.kind) { delete o.len; delete o.ev; delete o.lnobj; delete o.dangling; }
  return mkNote(o);
}
const scrolls = (l) => l.type === 'bgm' || l.type === 'bga'; // 가로 스크롤되는 레인 (BGA + BGM)
const laneX = (l) => (scrolls(l) ? l.x - A.view.left : l.x);
// 같은 그룹 안에서만 옆으로 옮길 수 있음: 키음(키+BGM), BGA
const grpOf = (lane) => (lane[0] === 'K' || lane[0] === 'B' ? 'snd' : lane[0] === 'G' ? 'bga' : null);
const KIND_NAME = { n: '일반', h: '숨김', m: '지뢰' };
const isSound = (lane) => lane[0] === 'K' || lane[0] === 'B';
const isKey = (lane) => lane[0] === 'K';
const lenOf = (m) => { const g = A.st && A.st.meas.get(m); return g ? g.r : R1; };
const idS = (v) => C.idStr(v, A.doc ? A.doc.base : 36);
const noteH = () => Math.max(5, Math.min(11, Math.round(A.ppb / 5)));
const capH = () => Math.max(3, Math.round(noteH() * 0.55));
function fmtTime(t) { if (!isFinite(t)) return '-'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3); }
function fmtV(v) { return isFinite(v) ? String(+(+v).toFixed(3)) : '?'; }
function beatLabel(r) { if (64 % r.d === 0) { const d = Math.max(4, r.d); return (r.n * d / r.d) + '/' + d; } return C.lenStr(r); }
function baseName(s) { return String(s).replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, ''); }
function normPath(p) { return String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, ''); }
