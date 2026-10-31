// node build.js → index.html (배포용 단일 파일, 저장소 루트), dist/index.html · dist/bmscore.js (테스트용)
const fs = require('fs'), path = require('path');
const rd = (...p) => fs.readFileSync(path.join(__dirname, 'src', ...p), 'utf8');
const CORE = ['rational', 'ids', 'encoding', 'lines', 'channels', 'parse', 'serialize', 'timing', '_export'];
const APP = ['state', 'layout', 'view', 'history', 'mouse', 'edit', 'clipboard', 'keyboard', 'status', 'panels', 'dialogs', 'files', 'save', 'audio', 'drop', 'touch', 'ctxmenu', 'diag', 'main', '_export'];
const join = (dir, list) => list.map((f) => `/* ── ${dir}/${f}.js ── */\n` + rd(dir, f + '.js')).join('\n');
const core = `/* BMS Web Editor — core (DOM 없음) */\n(function (G) {\n'use strict';\n${join('core', CORE)}\n})(typeof window !== 'undefined' ? window : globalThis);\n`;
const app = `/* BMS Web Editor — UI */\n(function () {\n'use strict';\n${join('app', APP)}\n})();\n`;
if (/<\/script/i.test(core + app)) throw new Error('JS 안에 </script 문자열이 있습니다');
let html = rd('index.html');
html = html.replace('/*__CSS__*/', () => rd('style.css')).replace('/*__CORE__*/', () => core).replace('/*__APP__*/', () => app);
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html);
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
fs.writeFileSync(path.join(__dirname, 'dist', 'bmscore.js'), core);
console.log('built index.html', (html.length / 1024).toFixed(1) + ' KB');
