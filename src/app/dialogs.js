/* ───────── 대화 상자 ───────── */
function modal(title, body, buttons) {
  return new Promise((resolve) => {
    $('#mTitle').textContent = title;
    const mb = $('#mBody'); mb.innerHTML = '';
    if (typeof body === 'string') mb.innerHTML = body; else mb.appendChild(body);
    const bt = $('#mBtns'); bt.innerHTML = '';
    const close = (v) => { $('#modal').hidden = true; document.removeEventListener('keydown', onk, true); resolve(v); };
    const fire = (b) => { const v = typeof b.value === 'function' ? b.value() : b.value; if (v !== undefined) close(v); };
    for (const b of buttons) {
      const el = document.createElement('button');
      el.textContent = b.label; if (b.primary) el.className = 'pri';
      el.addEventListener('click', () => fire(b));
      bt.appendChild(el);
    }
    const onk = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
      else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
        const p = buttons.find((b) => b.primary);
        if (p) { e.preventDefault(); e.stopPropagation(); fire(p); }
      }
    };
    document.addEventListener('keydown', onk, true);
    $('#modal').hidden = false;
    const first = mb.querySelector('input[type=text], textarea');
    if (first) { first.focus(); first.select && first.select(); } else (bt.querySelector('.pri') || bt.lastChild).focus();
  });
}
function promptText(title, label, value, hint) {
  const w = document.createElement('div');
  w.innerHTML = `<label class="fl">${esc(label)} <input type="text" id="ptIn" value="${esc(value || '')}" spellcheck="false" autocomplete="off"></label>${hint ? `<div class="hint">${esc(hint)}</div>` : ''}`;
  return modal(title, w, [{ label: '취소', value: null }, { label: '확인', primary: true, value: () => w.querySelector('#ptIn').value }]);
}
async function confirmDiscard() {
  if (!A.dirty) return true;
  const r = await modal('저장하지 않은 변경 사항', '<p>지금 패턴에 저장하지 않은 변경 사항이 있습니다. 버리고 계속할까요?</p>', [
    { label: '취소', value: false, primary: true }, { label: '버리고 계속', value: true }]);
  return !!r;
}
function showHelp() {
  modal('도움말', `<div class="help">
<h4>모드</h4><ul>
<li><b>선택 (F1)</b> — 클릭: 선택 · 빈 곳 드래그: 범위 선택 · 노트 드래그: 이동 (좌우로 끌면 레인 이동, BGM ↔ 키 레인 포함) · Ctrl+드래그: 복사 · 롱노트 윗끝 드래그: 길이 조절 · 더블클릭: 값 바꾸기</li>
<li><b>쓰기 (F3)</b> — 클릭: WAV 목록에서 고른 키음으로 노트 찍기 · 키 레인에서 위로 끌기: 롱노트 · 기존 노트 클릭: 그 키음을 집어오기 (위로 끌면 롱노트로) · BPM/STOP 레인 클릭: 값 입력</li>
<li>가운데 버튼 드래그: 화면을 잡고 위아래·옆으로 끌기 (BGM 칼럼 가로 스크롤 포함)</li>
<li>오른쪽 클릭: 노트 지우기 · Shift를 누른 채 조작: 그리드 무시 (1/192 단위)</li>
<li>이동하다 같은 자리에 노트가 겹치면, 원래 있던 노트는 지워지지 않고 빈 BGM 레인으로 옮겨집니다.</li></ul>
<h4>키보드</h4><table>
<tr><td>Ctrl+O / Ctrl+S</td><td>폴더 열기 / 저장 (Ctrl+Shift+S: 다른 이름으로)</td></tr>
<tr><td>Ctrl+Z / Ctrl+Y</td><td>실행 취소 / 다시 실행</td></tr>
<tr><td>Ctrl+X C V · Ctrl+A</td><td>잘라내기 · 복사 · 붙여넣기 · 전체 선택</td></tr>
<tr><td>Delete</td><td>선택한 노트 지우기</td></tr>
<tr><td>↑ ↓ / ← →</td><td>선택한 노트를 그리드 한 칸 위아래로 (Shift: 1/192) / 옆 레인으로</td></tr>
<tr><td>PageUp · PageDown · Home · End</td><td>한 마디씩 · 처음 · 끝으로 스크롤</td></tr>
<tr><td>F5 / F6, Space / F7</td><td>처음부터 재생 / 시작선부터 재생 / 정지</td></tr>
<tr><td>\\</td><td>오른쪽 패널 접기/펼치기 (패널 왼쪽 경계를 끌면 너비 조절)</td></tr>
<tr><td>G · H · N</td><td>스냅 켜고 끄기 · 옆으로만 이동 · 쓸 노트 종류(일반→숨김→지뢰)</td></tr>
<tr><td>+ − · Ctrl+휠</td><td>세로 확대 축소</td></tr>
<tr><td>[ ] · Ctrl+Shift+휠</td><td>가로 확대 축소</td></tr></table>
<h4>DP · BGA · 숨김 · 지뢰</h4><p>#PLAYER 3이거나 2P 노트가 있으면 DP 화면으로 엽니다. 툴바의 SP/DP 버튼으로 바꿀 수 있습니다. 가로 스크롤하면 플레이 영역은 고정되고 BGA·LAYER·POOR와 BGM 칼럼이 함께 움직입니다. BGA 레인에는 BMP 목록에서 고른 번호가 찍히고, BGA 노트는 BGA 레인끼리만 옮겨집니다. 숨김 노트는 흐리게, 지뢰는 진한 빨강(✕)으로 보이며 키 레인 안에서만 옮길 수 있습니다.</p>
<h4>태블릿 (손가락 · S펜)</h4><ul><li>손가락: 노트를 끌면 이동, 빈 곳을 끌면 화면 이동(빠르게 쓸고 놓으면 관성으로 미끄러지고, 그때 탭하면 멈춤), 두 손가락을 벌리고 오므리면 확대·축소(세로로 벌리면 세로, 가로로 벌리면 가로)</li><li>탭: 노트 선택 · 빈 곳은 선택 해제 · 쓰기 모드에서는 노트 찍기</li><li>길게 누르기: 빈 곳은 범위 선택 시작, 노트는 메뉴(삭제 · 값 바꾸기 · 복사)</li><li>안드로이드에서는 폴더를 빠른 방식(폴더 고르기)으로 엽니다. 처음 저장할 때 같은 폴더를 한 번 더 골라 주면 그 뒤로는 그 폴더에 바로 저장합니다. '보기 · 재생 · 저장' 칸에서 방식을 바꿀 수 있습니다.</li><li>S펜: 마우스와 똑같이 편집합니다(펜 옆 버튼 = 오른쪽 클릭 = 삭제). 펜을 한 번 쓰면 그 뒤로 손가락은 화면 이동·확대만 합니다(손바닥 오작동 방지).</li><li>아래 도구 막대: 실행 취소 · ▲▼◀▶ 한 칸 옮기기 · 복사 · 붙여넣기 · 삭제 · 복사 모드(끌면 복사, Ctrl 대신) · 그리드 무시(Shift 대신)</li></ul><h4>재생</h4><p>마디 번호 칸을 클릭하면 재생 시작선(초록)이 생깁니다. F6·Space는 시작선부터, 시작선이 없으면 화면 맨 아래 마디부터 재생합니다. 같은 키음이 다시 울리면 앞 소리는 끊깁니다(BMS 플레이어와 같은 방식). BPM 변화와 STOP도 반영합니다.</p>
<h4>저장</h4><p>편집한 채널(BGM · BPM · STOP · 1P 키 · 롱노트 · 마디 길이)과 고친 헤더 · WAV 줄만 다시 쓰고, 나머지 줄(BGA, 2P, 숨김 노트, 지뢰, 주석, 모르는 명령, #RANDOM 블록)은 원본 바이트 그대로 둡니다. 저장 직전에 결과를 다시 읽어 편집 내용과 일치하는지 확인하고, 바뀐 줄을 보여 줍니다. 기본 인코딩은 Shift-JIS입니다.</p>
<h4>복사 · 붙여넣기</h4><p>iBMSC 클립보드 형식("iBMSC Clipboard Data")을 씁니다. iBMSC에서 복사한 노트나 ibmsc_clip.py가 만든 텍스트를 붙여넣을 수 있고, 여기서 복사한 노트를 iBMSC에 붙여넣을 수도 있습니다. 위치는 마우스가 있는 마디의 시작점 기준입니다.</p>
<h4>로컬 전용</h4><p>이 페이지는 파일 하나로 동작하며 서버가 없습니다. 패턴과 키음은 브라우저 안에서만 읽고 쓰고, 외부로 나가는 통신은 페이지의 보안 정책(CSP)으로 막혀 있습니다. 폴더에 바로 저장하려면 크롬이나 엣지를 쓰세요. 다른 브라우저에서는 저장할 때 파일이 다운로드됩니다.</p>
</div>`, [{ label: '닫기', value: null, primary: true }]);
}
