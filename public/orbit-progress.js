// v0.7.2: shared book inputs, page progress and atomic learning records.
function countInput(value, label, optional = false) {
  if (optional && String(value ?? '').trim() === '') return null;
  const n = Number(value || 0);
  if (!Number.isInteger(n) || n < 0 || n > 2147483647) throw Error(`${label}: 0 이상의 정수를 입력해 주세요.`);
  return n;
}
function bookMetrics(b) {
  const total = Number(b.total_pages || 0), pages = Number(b.completed_pages || 0);
  const solved = Number(b.solved_count || 0), wrong = Number(b.wrong_count || 0);
  const valid = Number(b.total_problems) > 0 && solved > 0 && wrong >= 0 && wrong <= solved;
  return { total, pages, percent: total ? Math.min(100, Math.round(pages / total * 100)) : null,
    correct: valid ? ((solved - wrong) / solved * 100).toFixed(1) : null,
    wrong: valid ? (wrong / solved * 100).toFixed(1) : null };
}
function bookStatistics(b) {
  const x = bookMetrics(b);
  return `<div class="muted small">${x.total ? `페이지 ${x.pages}/${x.total}쪽 · 진행률 ${x.percent}%` : `누적 ${x.pages}쪽 · 전체 페이지 미입력`}</div>
    ${x.percent === null ? '' : `<div class="progress" role="progressbar" aria-label="페이지 진행률" aria-valuenow="${x.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${x.percent}%"></span></div>`}
    <div class="muted small">누적 풀이 ${Number(b.solved_count || 0)}${b.total_problems ? `/${Number(b.total_problems)}` : ''}문항 · 오답 ${Number(b.wrong_count || 0)}문항${b.total_problems ? ` · 문항 진행률 ${Math.min(100,Math.round(Number(b.solved_count||0)/Number(b.total_problems)*100))}%` : ''}</div>
    <div class="muted small">${x.correct === null ? (b.total_problems ? '정답률·오답률: 유효한 풀이 기록이 필요합니다.' : '문항수를 입력하면 정답률·오답률이 표시됩니다.') : `정답률 ${x.correct}% · 오답률 ${x.wrong}%`}</div>`;
}
function pageFields(b) {
  if (!b) return '';
  return `<div class="grid2"><div class="field"><label class="label" for="pageMode">페이지 기록 (선택)</label><select id="pageMode"><option value="add">학습한 페이지 수 누적</option><option value="current">현재 도달 페이지</option></select></div><div class="field"><label class="label" for="pageValue">페이지 수 / 위치</label><input id="pageValue" type="number" min="0" step="1" placeholder="입력하지 않아도 됩니다"></div></div><p class="muted small">누적 ${Number(b.completed_pages || 0)}${b.total_pages ? `/${Number(b.total_pages)}` : ''}쪽. 현재 페이지는 앞으로 도달한 위치만 반영합니다. 복습은 페이지를 비워 두세요.</p>`;
}
function readPages(b) {
  if (!b) return { pages: 0, current: null };
  const value = countInput($('#pageValue').value, '페이지', true);
  const current = $('#pageMode').value === 'current' ? value : null;
  const pages = current === null ? (value || 0) : 0;
  const next = current === null ? Number(b.completed_pages || 0) + pages : Math.max(Number(b.completed_pages || 0), current);
  if (b.total_pages && next > Number(b.total_pages)) throw Error('전체 페이지 수를 초과합니다. 책 정보나 입력값을 확인해 주세요.');
  return { pages, current };
}
function problemFields(solvedId, wrongId) {
  return `<div class="grid2"><div class="field"><label class="label" for="${solvedId}">풀이 문항 (선택)</label><input id="${solvedId}" type="number" min="0" step="1" value="0"></div><div class="field"><label class="label" for="${wrongId}">오답 문항 (선택)</label><input id="${wrongId}" type="number" min="0" step="1" value="0"></div></div>`;
}
function readProblems(solvedId, wrongId) {
  const solved = countInput($(solvedId).value, '풀이'), wrong = countInput($(wrongId).value, '오답');
  if (wrong > solved) throw Error('오답 수는 풀이 수보다 클 수 없습니다.');
  return { solved, wrong };
}
async function saveForm(form, action) {
  if (form.dataset.saving) return;
  form.dataset.saving = 'true';
  const buttons = [...form.querySelectorAll('button')];
  buttons.forEach(b => b.disabled = true);
  try { await action(); } catch (error) {
    const migration = /record_book_progress|update_book_progress|delete_book_progress|total_pages|completed_pages|schema cache|PGRST202/i.test(error.message);
    alert(migration ? 'Supabase에서 v0.7.3 로그 관리 마이그레이션 SQL을 먼저 실행하거나 스키마 캐시를 새로고침해 주세요.\n' + error.message : '저장 실패: ' + error.message);
  } finally { delete form.dataset.saving; buttons.forEach(b => b.disabled = false); }
}
function bookCountFields(b) {
  return `<div class="grid2"><div class="field"><label class="label" for="rbp">전체 페이지 수 (선택)</label><input id="rbp" type="number" min="1" step="1" value="${Number(b.total_pages) > 0 ? Number(b.total_pages) : ''}" placeholder="예: 240"></div><div class="field"><label class="label" for="rbt">전체 문항수 (선택)</label><input id="rbt" type="number" min="1" step="1" value="${Number(b.total_problems) > 0 ? Number(b.total_problems) : ''}" placeholder="모르면 비워 두세요"></div></div><p class="muted small">도서 API가 제공한 수치는 자동 입력됩니다. 없는 수치는 직접 입력하고 나중에 수정할 수 있습니다.</p>`;
}
registerBook = function(b, m) {
  m.innerHTML = `<form class="modal-body" id="rb"><h3>책 등록</h3><p><b>${esc(b.title)}</b></p><div class="field"><label class="label" for="rbs">과목</label><select id="rbs">${subjectOptions(b.subject)}</select></div>${bookCountFields(b)}<div class="modal-actions"><button type="button" class="secondary" onclick="this.closest('dialog').close()">취소</button><button class="primary">등록</button></div></form>`;
  $('#rb').onsubmit = e => { e.preventDefault(); saveForm(e.currentTarget, async () => {
    await sb('/rest/v1/books', { method:'POST', headers:{Prefer:'return=minimal'}, body:JSON.stringify({user_id:session.user.id,title:b.title,authors:b.authors||[],publisher:b.publisher||'',isbn:b.isbn||'',thumbnail_url:b.thumbnail||'',source_url:b.url||'',subject:$('#rbs').value,total_pages:countInput($('#rbp').value,'전체 페이지',true),total_problems:countInput($('#rbt').value,'전체 문항',true)||0,solved_count:0,wrong_count:0,total_minutes:0,status:'active'}) });
    m.close(); await loadData(); renderBooks();
  }); };
};
function editBookCounts(id) {
  const b = bookById(id), m = $('#modal');
  m.innerHTML = `<form class="modal-body" id="editCounts"><h3>책 정보 수정</h3><p>${esc(b.title)}</p>${bookCountFields(b)}<div class="modal-actions"><button type="button" class="secondary" onclick="this.closest('dialog').close()">취소</button><button class="primary">저장</button></div></form>`;
  m.showModal();
  $('#editCounts').onsubmit = e => { e.preventDefault(); saveForm(e.currentTarget, async () => {
    const total = countInput($('#rbp').value,'전체 페이지',true);
    if (total !== null && total < Number(b.completed_pages || 0)) throw Error('전체 페이지는 누적 페이지보다 작을 수 없습니다.');
    await sb(`/rest/v1/books?id=eq.${id}`, {method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({total_pages:total,total_problems:countInput($('#rbt').value,'전체 문항',true)||0,updated_at:new Date().toISOString()})});
    m.close(); await loadData(); b.status === 'archived' ? renderArchiveDetail(id) : renderBooks();
  }); };
}
addBookProgress = async function(id, { date=today(), solved=0, wrong=0, minutes=0, memo='', pages=0, current=null, requestId, startedAt=null, endedAt=null, subject=null }) {
  return sb('/rest/v1/rpc/record_book_progress', {method:'POST',body:JSON.stringify({p_book_id:id,p_request_id:requestId,p_log_date:date,p_solved:solved,p_wrong:wrong,p_minutes:minutes,p_memo:memo,p_pages_added:pages,p_current_page:current,p_timer_started_at:startedAt,p_timer_ended_at:endedAt,p_subject:subject})});
};

const renderStudyWithManual = renderStudy;
renderStudy = function() {
  renderStudyWithManual();
  if (timer || !$('#startTimer')) return;
  $('#startTimer').insertAdjacentHTML('afterend', '<button id="manualStudy" class="secondary big wide" style="margin-top:10px">시간 직접 기록</button>');
  $('#manualStudy').onclick = openManualStudy;
};
function manualIso(date, time) { return time ? new Date(`${date}T${time}:00`).toISOString() : null; }
function openManualStudy() {
  const m = $('#modal'), requestId = crypto.randomUUID();
  m.innerHTML = `<form class="modal-body" id="manualStudyForm"><h3>개인공부 직접 기록</h3><p class="muted small">타이머 없이 공부한 시간도 남길 수 있습니다.</p><div class="field"><label class="label">과목</label><select id="msSubject">${subjectOptions()}</select></div><div class="field"><label class="label">문제집 연결 (선택)</label><select id="msBook"><option value="">연결 안 함</option>${data.books.filter(b=>b.status!=='archived').map(b=>`<option value="${b.id}">${esc(b.title)}</option>`).join('')}</select></div><div class="field"><label class="label">학습 날짜</label><input id="msDate" type="date" required value="${today()}"></div><div class="grid2"><div class="field"><label class="label">시작 시간 (선택)</label><input id="msStart" type="time"></div><div class="field"><label class="label">종료 시간 (선택)</label><input id="msEnd" type="time"></div></div><div class="field"><label class="label">학습 시간(분) <span class="muted">시간대를 입력하면 자동 계산</span></label><input id="msMinutes" type="number" min="1" step="1" placeholder="예: 45"></div><div id="manualBookFields"></div><div class="field"><label class="label">메모 (선택)</label><textarea id="msMemo"></textarea></div><div class="modal-actions"><button type="button" class="secondary" onclick="this.closest('dialog').close()">취소</button><button class="primary">기록 저장</button></div></form>`;
  m.showModal();
  const refreshBookFields = () => { const b = bookById($('#msBook').value); $('#manualBookFields').innerHTML = b ? `${pageFields(b)}${problemFields('mss','msw')}` : problemFields('mss','msw'); };
  $('#msBook').onchange = refreshBookFields;
  $('#msStart').onchange = updateManualMinutes;
  $('#msEnd').onchange = updateManualMinutes;
  refreshBookFields();
  $('#manualStudyForm').onsubmit = e => { e.preventDefault(); saveForm(e.currentTarget, async () => {
    const date = $('#msDate').value, start = $('#msStart').value, end = $('#msEnd').value;
    let minutes = countInput($('#msMinutes').value, '학습 시간', true);
    let startedAt = manualIso(date, start), endedAt = manualIso(date, end);
    if ((start && !end) || (!start && end)) throw Error('시작 시간과 종료 시간을 함께 입력해 주세요.');
    if (startedAt && endedAt) {
      const diff = Math.round((new Date(endedAt) - new Date(startedAt)) / 60000);
      if (diff <= 0) throw Error('종료 시간은 시작 시간보다 늦어야 합니다.');
      minutes = diff;
    } else {
      if (!minutes || minutes < 1) throw Error('시간대 또는 학습 시간(분)을 입력해 주세요.');
      startedAt = new Date(`${date}T12:00:00`).toISOString();
      endedAt = new Date(new Date(startedAt).getTime() + minutes * 60000).toISOString();
    }
    const counts = readProblems('#mss','#msw'), b = bookById($('#msBook').value), pages = b ? readPages(b) : {pages:0,current:null};
    if (b) await addBookProgress(b.id,{date,...counts,...pages,minutes,memo:$('#msMemo').value.trim(),requestId,startedAt,endedAt,subject:$('#msSubject').value});
    else await sb('/rest/v1/study_sessions',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({id:requestId,user_id:session.user.id,book_id:null,subject:$('#msSubject').value,mode:'self',started_at:startedAt,ended_at:endedAt,minutes,solved_count:counts.solved,wrong_count:counts.wrong})});
    m.close(); await loadData(); renderStudy();
  }); };
}
function updateManualMinutes() {
  const date = $('#msDate')?.value, start = $('#msStart')?.value, end = $('#msEnd')?.value;
  if (!date || !start || !end) return;
  const diff = Math.round((new Date(`${date}T${end}:00`) - new Date(`${date}T${start}:00`)) / 60000);
  if (diff > 0) $('#msMinutes').value = diff;
}
openBookLog = function(id) {
  const b = bookById(id), m = $('#modal'), requestId = crypto.randomUUID();
  m.innerHTML = `<form class="modal-body" id="bookLogForm"><h3>학습 기록</h3><p><b>${esc(b.title)}</b></p><div class="field"><label class="label" for="bld">날짜</label><input id="bld" type="date" required value="${today()}"></div>${pageFields(b)}${problemFields('bls','blw')}<div class="field"><label class="label" for="blm">시간(분)</label><input id="blm" type="number" min="0" step="1" value="0"></div><div class="field"><label class="label" for="bln">메모</label><textarea id="bln"></textarea></div><div class="modal-actions"><button type="button" class="secondary" onclick="this.closest('dialog').close()">취소</button><button class="primary">누적 저장</button></div></form>`;
  m.showModal();
  $('#bookLogForm').onsubmit = e => { e.preventDefault(); saveForm(e.currentTarget, async () => {
    await addBookProgress(id,{date:$('#bld').value,...readProblems('#bls','#blw'),...readPages(b),minutes:countInput($('#blm').value,'시간'),memo:$('#bln').value.trim(),requestId});
    m.close(); await loadData(); renderBooks();
  }); };
};
openTimerEnd = function() {
  if (!timer) return;
  const ms = timerElapsed(), minutes = Math.max(1,Math.round(ms/60000));
  const b = bookById(timer.bookId), m = $('#modal');
  timer.requestId ||= crypto.randomUUID();
  const endedAt = new Date().toISOString();
  m.innerHTML = `<form class="modal-body" id="timerEndForm"><h3>학습 종료</h3><p><b>${clock(ms)}</b> 공부했습니다.</p>${pageFields(b)}${problemFields('tes','tew')}<div class="field"><label class="label" for="tem">메모</label><textarea id="tem"></textarea></div><div class="modal-actions"><button type="button" class="secondary" onclick="this.closest('dialog').close()">계속 공부</button><button class="primary">종료 저장</button></div></form>`;
  m.showModal();
  $('#timerEndForm').onsubmit = e => { e.preventDefault(); saveForm(e.currentTarget, async () => {
    const counts = readProblems('#tes','#tew');
    if (b) await addBookProgress(b.id,{...counts,...readPages(b),minutes,memo:$('#tem').value.trim(),requestId:timer.requestId,startedAt:timer.startedAt,endedAt,subject:timer.subject});
    else await sb('/rest/v1/study_sessions',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({id:timer.requestId,user_id:session.user.id,book_id:null,subject:timer.subject,mode:'self',started_at:timer.startedAt,ended_at:endedAt,minutes,solved_count:counts.solved,wrong_count:counts.wrong})});
    timer=null; clearInterval(timerTick); m.close(); await loadData(); renderStudy();
  }); };
};
bookCard = function(b) {
  const logs = data.bookLogs.filter(l=>l.book_id===b.id).slice(0,3);
  return `<section class="panel book-card">${cover(b)}<div><strong>${esc(b.title)}</strong><div class="muted small">${esc(b.publisher||'')} · ${esc(b.subject)}</div>${bookStatistics(b)}<div class="muted small">학습시간 ${fmtShort(b.total_minutes)}</div><div class="book-actions"><button class="primary" data-book-log="${b.id}">+ 학습 기록</button><button class="secondary" data-book-counts="${b.id}">책 정보 수정</button><button class="secondary" data-book-archive="${b.id}">완료 보관</button></div><details class="log-details"><summary>학습 기록 ${logs.length}개 <span>수정·삭제</span></summary><div class="log-stack">${logs.length ? logs.map(l=>`<div class="log-entry"><div class="log-row">${esc(l.log_date)} · +${Number(l.pages_added||0)}쪽${l.current_page == null ? '' : ` (도달 ${Number(l.current_page)}쪽)`} · ${Number(l.solved_count||0)}문항 · 오답 ${Number(l.wrong_count||0)} · ${fmtShort(l.minutes)} ${esc(l.memo||'')}</div><div class="log-actions"><button class="ghost small" data-log-edit="${l.id}">수정</button><button class="ghost small" data-log-delete="${l.id}">삭제</button></div></div>`).join('') : '<div class="muted small">아직 학습 기록이 없습니다.</div>'}</div></details></div></section>`;
};
const renderBooksBeforeProgress = renderBooks;
renderBooks = function() {
  renderBooksBeforeProgress();
  document.querySelectorAll('[data-book-counts]').forEach(b=>b.onclick=()=>editBookCounts(b.dataset.bookCounts));
  document.querySelectorAll('[data-log-edit]').forEach(x=>x.onclick=()=>editBookProgress(x.dataset.logEdit));
  document.querySelectorAll('[data-log-delete]').forEach(x=>x.onclick=()=>deleteBookProgress(x.dataset.logDelete));
};

function progressLogById(id) { return data.bookLogs.find(l=>l.id===id); }
function editBookProgress(id) {
  const l = progressLogById(id), b = bookById(l?.book_id), m = $('#modal');
  if (!l || !b) return;
  m.innerHTML = `<form class="modal-body" id="editLogForm"><h3>학습 기록 수정</h3><p><b>${esc(b.title)}</b></p><div class="field"><label class="label">날짜</label><input id="elDate" type="date" required value="${esc(l.log_date||today())}"></div><div class="grid2"><div class="field"><label class="label">학습한 페이지 수</label><input id="elPages" type="number" min="0" step="1" value="${Number(l.pages_added||0)}"></div><div class="field"><label class="label">현재 도달 페이지 (선택)</label><input id="elCurrent" type="number" min="0" step="1" value="${l.current_page == null ? '' : Number(l.current_page)}"></div></div>${problemFields('elSolved','elWrong')}<div class="field"><label class="label">시간(분)</label><input id="elMinutes" type="number" min="0" step="1" value="${Number(l.minutes||0)}"></div><div class="field"><label class="label">메모</label><textarea id="elMemo">${esc(l.memo||'')}</textarea></div><p class="muted small">수정 후 문제집의 누적 통계도 이 로그들을 기준으로 다시 계산됩니다.</p><div class="modal-actions"><button type="button" class="secondary" onclick="this.closest('dialog').close()">취소</button><button class="primary">수정 저장</button></div></form>`;
  m.showModal();
  $('#editLogForm').onsubmit = e => { e.preventDefault(); saveForm(e.currentTarget, async () => {
    const current = countInput($('#elCurrent').value, '현재 페이지', true);
    await sb('/rest/v1/rpc/update_book_progress', {method:'POST',body:JSON.stringify({p_log_id:id,p_log_date:$('#elDate').value,...readProblems('#elSolved','#elWrong'),p_minutes:countInput($('#elMinutes').value,'시간'),p_memo:$('#elMemo').value.trim(),p_pages_added:countInput($('#elPages').value,'페이지'),p_current_page:current})});
    m.close(); await loadData(); renderBooks();
  }); };
}
async function deleteBookProgress(id) {
  const l = progressLogById(id); if (!l || !confirm('이 학습 기록을 삭제할까요? 책의 누적 통계에서도 함께 제외됩니다.')) return;
  try { await sb('/rest/v1/rpc/delete_book_progress',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({p_log_id:id})}); await loadData(); renderBooks(); }
  catch (error) { console.error('delete_book_progress failed', error); const hint=/function|schema cache|PGRST202|does not exist/i.test(error.message) ? '\nSupabase에서 20260917_orbit_v073_edit_logs.sql을 다시 실행한 뒤 새로고침해 주세요.' : ''; alert('삭제 실패: '+error.message+hint); }
}
