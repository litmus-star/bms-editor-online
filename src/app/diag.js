/* ───────── 키음 로딩 측정 (병목 찾기) ───────── */
const fmtMs = (ms) => ms >= 10000 ? (ms / 1000).toFixed(1) + '초' : Math.round(ms) + 'ms';
const fmtMB = (b) => (b / 1048576).toFixed(1) + 'MB';
A.diagCmp = null;
function diagText() {
  const S = Au.stat, P = A.fs.provider, lines = [];
  const ctx = Au.ctx;
  lines.push(`기기: 코어 ${navigator.hardwareConcurrency || '?'}개 · 메모리 ${navigator.deviceMemory ? navigator.deviceMemory + 'GB급' : '?'} · 오디오 ${ctx ? ctx.sampleRate + 'Hz' : '아직 안 만듦'}`);
  lines.push(`폴더 방식: ${P ? ({ dir: '폴더 직접 접근', list: '파일 목록(폴더 선택 대체 방식)', single: '파일 하나' })[P.kind] || P.kind : '없음'}`);
  lines.push(`브라우저: ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 140)}`);
  if (!S || !S.n) { lines.push('아직 측정한 키음이 없습니다.'); return lines.join('\n'); }
  const wall = (S.t1 || nowMs()) - S.t0, work = S.read + S.decode + S.find;
  lines.push('');
  lines.push(`불러온 키음 ${S.n}개 · 파일 ${fmtMB(S.bytes)} → 푼 소리 ${fmtMB(S.pcm)} (총 ${Math.round(S.dur)}초 분량)`);
  lines.push(`전체 걸린 시간: ${fmtMs(wall)} (동시 처리 최대 ${S.peak}개)`);
  lines.push(`단계별 합계: 찾기 ${fmtMs(S.find)} · 파일 읽기 ${fmtMs(S.read)} · 디코딩 ${fmtMs(S.decode)}`);
  lines.push(`키음 하나 평균: 읽기 ${(S.read / S.n).toFixed(1)}ms · 디코딩 ${(S.decode / S.n).toFixed(1)}ms`);
  lines.push(`비율: 읽기 ${Math.round(S.read / work * 100)}% · 디코딩 ${Math.round(S.decode / work * 100)}% · 찾기 ${Math.round(S.find / work * 100)}%`);
  for (const [e, x] of Object.entries(S.ext)) lines.push(`  .${e}: ${x.n}개 · 평균 읽기 ${(x.read / x.n).toFixed(1)}ms · 평균 디코딩 ${(x.decode / x.n).toFixed(1)}ms · 평균 ${(x.bytes / x.n / 1024).toFixed(0)}KB`);
  const slow = [...S.slow].sort((a, b) => b.read + b.decode - a.read - a.decode).slice(0, 3);
  if (slow.length) lines.push('가장 오래 걸린 것: ' + slow.map((s) => `${s.name}(읽기 ${Math.round(s.read)} / 디코딩 ${Math.round(s.decode)}ms, ${(s.size / 1024).toFixed(0)}KB)`).join(', '));
  if (A.diagCmp) { lines.push(''); lines.push(...A.diagCmp); }
  return lines.join('\n');
}
function renderDiag() {
  const bd = $('#diagBd'); if (!bd) return;
  bd.textContent = diagText();
  const c = loadCounts();
  $('#diagRun').disabled = !A.fs.provider || !A.st || c.loading > 0 || !!A.diagBusy;
}
// 동시 처리 개수를 바꿔 가며 같은 키음들을 다시 읽고 디코딩해서 걸린 시간을 비교한다
async function runDiagCompare() {
  if (A.diagBusy || !A.fs.provider || !A.st) return;
  A.diagBusy = true; renderDiag();
  const out = ['[동시 처리 비교 테스트]'];
  try {
    const ctx = ensureCtx(false), P = A.fs.provider;
    const names = [...new Set(A.st.wavs.values())].filter((n) => n && Au.state.get(wavKey(n)) === 'ok');
    // 앞에서부터 고르면 비슷한 소리만 몰릴 수 있어 고르게 뽑는다
    const pick = (cnt, off) => { const r = []; const step = Math.max(1, Math.floor(names.length / cnt)); for (let i = off; i < names.length && r.length < cnt; i += step) r.push(names[i]); return r; };
    const sample = pick(Math.min(40, names.length), 0);
    const files = [];
    for (const n of sample) { let h = await P.find(n); if (!h) { const st = normPath(n).replace(/\.[^./]*$/, ''); for (const e of ['.wav', '.ogg', '.flac', '.mp3']) { h = await P.find(st + e); if (h) break; } } if (h) files.push(h); }
    const pool = async (items, conc, fn) => { let i = 0; const t0 = nowMs(); await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } })); return nowMs() - t0; };
    const levels = [1, 2, 4, 8, 16];
    $('#diagBd').textContent = diagText() + '\n\n테스트 중… (파일 읽기)';
    // 1) 파일 읽기만: 같은 파일을 여러 번 읽으면 캐시 때문에 빨라지므로 모든 단계에서 똑같이 한 번 미리 읽어 둔다
    for (const h of files) await (await h.getFile()).arrayBuffer();
    const bufs = [];
    out.push(''); // 표본 정보는 아래에서 채움
    for (const c of levels) {
      const ms = await pool(files, c, async (h) => { await (await h.getFile()).arrayBuffer(); });
      out.push(`  파일 읽기 · 동시 ${String(c).padStart(2)}개: ${fmtMs(ms)} (${(files.length / ms * 1000).toFixed(0)}개/초)`);
      $('#diagBd').textContent = diagText() + '\n\n' + out.join('\n') + '\n테스트 중…';
    }
    for (const h of files) bufs.push(await (await h.getFile()).arrayBuffer());
    const total = bufs.reduce((a, b) => a + b.byteLength, 0);
    out[1] = `표본 ${files.length}개 · ${fmtMB(total)}`;
    // 2) 디코딩만: 메모리에 올려 둔 데이터를 복사해서 디코딩 (decodeAudioData는 넘긴 데이터를 비워 버림)
    for (const c of levels) {
      const ms = await pool(bufs, c, async (b) => { try { await ctx.decodeAudioData(b.slice(0)); } catch (e) { /* 무시 */ } });
      out.push(`  디코딩 · 동시 ${String(c).padStart(2)}개: ${fmtMs(ms)} (${(bufs.length / ms * 1000).toFixed(0)}개/초)`);
      $('#diagBd').textContent = diagText() + '\n\n' + out.join('\n') + '\n테스트 중…';
    }
    out.push('  ※ 개/초가 동시 개수에 따라 늘면 병렬 처리가 효과 있음, 그대로면 효과 없음');
  } catch (e) {
    out.push('테스트 실패: ' + (e && e.message || e));
  }
  A.diagCmp = out; A.diagBusy = false; renderDiag();
}
function bindDiag() {
  $('#diagRun').addEventListener('click', runDiagCompare);
  $('#diagCopy').addEventListener('click', async () => {
    const t = diagText();
    try { await navigator.clipboard.writeText(t); toast('측정 결과를 복사했습니다'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('측정 결과를 복사했습니다'); } catch (e2) { toast('복사하지 못했습니다'); } ta.remove(); }
  });
  renderDiag();
}
