/* ───────── 화면 문구 (i18n) ─────────
   화면에 보이는 문구는 src/i18n/<언어>.json에 키로 모아 두고, build.js가 아래 I18N.dicts 자리에 묶어 넣는다.
   tr(키, { 이름: 값 }) → 문구 안의 {이름}을 값으로 바꾼 글자. 지금 언어에 없는 키는 한국어, 그것도 없으면 키 그대로.
     값으로 코어 메시지({ code, params })나 오류 객체를 넘기면 그것도 문구로 바꿔 넣는다(msgText).
   HTML: data-i18n(글자) · data-i18n-html(태그 포함) · data-i18n-title · data-i18n-placeholder 속성에 키를 적는다.
     빌드할 때 한국어로 채워 두고, applyI18n()이 지금 언어로 다시 채운다.
   주의: 문구 값에 태그가 들어 있으면(<b> 등) innerHTML 자리에서만 쓴다. 값에 넣는 사용자 글자(파일명 등)는 부르는 쪽에서 esc(). */
const I18N = { dicts: /*__I18N__*/{}, lang: 'ko' };
function tr(key, p) {
  const d = I18N.dicts[I18N.lang], s = (d && d[key]) ?? I18N.dicts.ko[key] ?? key;
  return p ? s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? msgText(p[k]) : m)) : s;
}
function msgText(x) { // 코어 메시지 · 오류 · 그 밖의 값 → 화면 문구
  if (x && typeof x === 'object') {
    if (x.code && I18N.dicts.ko[x.code] !== undefined) return tr(x.code, x.params);
    if (x.message !== undefined) return String(x.message);
  }
  return String(x);
}
function appError(code, params) { const e = new Error(tr(code, params)); e.code = code; e.params = params; return e; }
function applyI18n(root) {
  const r = root || document;
  for (const el of r.querySelectorAll('[data-i18n]')) el.textContent = tr(el.dataset.i18n);
  for (const el of r.querySelectorAll('[data-i18n-html]')) el.innerHTML = tr(el.dataset.i18nHtml);
  for (const el of r.querySelectorAll('[data-i18n-title]')) el.title = tr(el.dataset.i18nTitle);
  for (const el of r.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = tr(el.dataset.i18nPlaceholder);
  if (r === document) document.documentElement.lang = I18N.lang;
}
