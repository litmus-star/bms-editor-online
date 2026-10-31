// node build.js → index.html (배포용 단일 파일, 저장소 루트), dist/index.html · dist/bmscore.js (테스트용)
const fs = require('fs'), path = require('path');
const rd = (...p) => fs.readFileSync(path.join(__dirname, 'src', ...p), 'utf8');
const CORE = ['msg', 'rational', 'ids', 'encoding', 'lines', 'channels', 'parse', 'serialize', 'timing', '_export'];
const APP = ['i18n', 'state', 'layout', 'view', 'history', 'mouse', 'edit', 'clipboard', 'keyboard', 'status', 'panels', 'dialogs', 'files', 'save', 'audio', 'drop', 'touch', 'ctxmenu', 'diag', 'main', '_export'];
const join = (dir, list) => list.map((f) => `/* ── ${dir}/${f}.js ── */\n` + rd(dir, f + '.js')).join('\n');
const core = `/* BMS Web Editor — core (DOM 없음) */\n(function (G) {\n'use strict';\n${join('core', CORE)}\n})(typeof window !== 'undefined' ? window : globalThis);\n`;
const app = `/* BMS Web Editor — UI */\n(function () {\n'use strict';\n${join('app', APP)}\n})();\n`;

// 화면 문구 사전: src/i18n/<언어>.json → app의 I18N.dicts 자리에. ko가 기준(다른 언어에 없는 키는 ko로 대신 보임)
const I18N_DIR = path.join(__dirname, 'src', 'i18n');
const dicts = {};
for (const f of fs.readdirSync(I18N_DIR).filter((f) => f.endsWith('.json')).sort()) dicts[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, f), 'utf8'));
const ko = dicts.ko;
if (!ko) throw new Error('src/i18n/ko.json이 없습니다');
const need = (k, where) => { if (typeof ko[k] !== 'string') throw new Error(`ko.json에 없는 키: ${k} (${where})`); return ko[k]; };
for (const m of (core + app).matchAll(/\btr\(\s*'([^']+)'\s*[,)]/g)) need(m[1], "tr('…')"); // 글자 그대로 쓴 키만 (이어 붙여 만든 키는 못 봄)
for (const [lang, d] of Object.entries(dicts)) {
  if (lang === 'ko') continue;
  const extra = Object.keys(d).filter((k) => !(k in ko));
  if (extra.length) console.warn(`${lang}.json: ko.json에 없는 키 ${extra.length}개 (쓰이지 않음): ${extra.slice(0, 5).join(', ')}`);
  const lack = Object.keys(ko).filter((k) => !(k in d));
  if (lack.length) console.log(`${lang}.json: 번역 안 된 키 ${lack.length}개 (한국어로 보임)`);
}
const appI = app.replace('/*__I18N__*/{}', () => JSON.stringify(dicts));
if (appI === app) throw new Error('i18n.js의 /*__I18N__*/{} 자리를 찾지 못했습니다');
if (/<\/script/i.test(core + appI)) throw new Error('JS 안에 </script 문자열이 있습니다');

// HTML의 data-i18n* 속성을 한국어로 미리 채움 (자바스크립트가 돌기 전에도 글자가 보이게)
const escH = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = (s) => escH(s).replace(/"/g, '&quot;');
let html = rd('index.html');
html = html.replace(/<(\w+)((?:\s[^<>]*?)?)>/g, (tag, name, attrs) => {
  let add = '';
  attrs.replace(/\sdata-i18n-(title|placeholder)="([^"]+)"/g, (_, a, k) => { add += ` ${a}="${escA(need(k, 'data-i18n-' + a))}"`; });
  return add ? `<${name}${attrs}${add}>` : tag;
});
let filled = 0;
html = html.replace(/(<(\w+)[^<>]*?\sdata-i18n(-html)?="([^"]+)"[^<>]*>)(<\/\2>)/g, (_, open, name, isHtml, k, close) => { filled++; return open + (isHtml ? need(k, 'data-i18n-html') : escH(need(k, 'data-i18n'))) + close; });
const marked = (html.match(/\sdata-i18n(-html)?="/g) || []).length;
if (filled !== marked) throw new Error(`data-i18n 요소 ${marked}개 중 ${filled}개만 채움 — 키를 단 요소는 비워 두세요(<span data-i18n="키"></span>)`);
html = html.replace('/*__CSS__*/', () => rd('style.css')).replace('/*__CORE__*/', () => core).replace('/*__APP__*/', () => appI);
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html);
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
fs.writeFileSync(path.join(__dirname, 'dist', 'bmscore.js'), core);
console.log('built index.html', (html.length / 1024).toFixed(1) + ' KB');
