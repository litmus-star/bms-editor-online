/* 메시지: 코어는 화면 문구를 만들지 않는다. 경고·문제는 { code, params }로, 오류는 code · params가 붙은 Error로 넘기고
   문구는 앱 쪽(tr · msgText)이 src/i18n 사전의 같은 키(core.…)로 붙인다. */
const msg = (code, params) => ({ code, params: params || {} });
function coreError(code, params, Ctor) { const e = new (Ctor || Error)(code); e.code = code; e.params = params || {}; return e; }
