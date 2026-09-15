
const $ = (s) => document.querySelector(s);
const sessionKey = "study-orbit-session-v05-webdb";
const today = () => new Date().toISOString().slice(0, 10);
const fmtMin = (min) => `${Math.floor(min / 60)}시간 ${min % 60}분`;

let config = null;
let session = JSON.parse(localStorage.getItem(sessionKey) || "null");
let profile = null;
let state = { goals: [], books: [], sessions: [], mistakes: [], timer: null };
let screen = "today";
let tick = null;

init();

async function init(){
  config = await fetch("/api/config").then(r => r.json());
  if(!config.supabaseUrl || !config.supabaseAnonKey){
    renderConfigError();
    return;
  }
  if(session?.access_token) {
    try {
      await loadAll();
      render();
      return;
    } catch {
      logout(false);
    }
  }
  renderAuth();
}

function headers(auth=true){
  const h = {
    "apikey": config.supabaseAnonKey,
    "Content-Type": "application/json"
  };
  if(auth && session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
  return h;
}

async function sb(path, options={}){
  const res = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers: { ...headers(options.auth !== false), ...(options.headers || {}) }
  });
  if(!res.ok){
    const text = await res.text();
    throw new Error(text || `Supabase error ${res.status}`);
  }
  if(res.status === 204) return null;
  return res.json();
}

async function signUp(email, password, meta){
  const data = await sb("/auth/v1/signup", {
    method:"POST",
    auth:false,
    body: JSON.stringify({ email, password, data: meta })
  });
  if(data.access_token){
    session = data;
    localStorage.setItem(sessionKey, JSON.stringify(session));
    await ensureProfile(meta);
    await loadAll();
    render();
  } else {
    alert("가입 확인 메일이 필요할 수 있습니다. Supabase Auth 설정에서 email confirmation 여부를 확인하세요.");
  }
}

async function signIn(email, password){
  const data = await sb("/auth/v1/token?grant_type=password", {
    method:"POST",
    auth:false,
    body: JSON.stringify({ email, password })
  });
  session = data;
  localStorage.setItem(sessionKey, JSON.stringify(session));
  await loadAll();
  render();
}

function logout(shouldRender=true){
  session = null;
  profile = null;
  localStorage.removeItem(sessionKey);
  state = { goals: [], books: [], sessions: [], mistakes: [], timer: null };
  if(shouldRender) renderAuth();
}

async function ensureProfile(meta){
  const user = session.user;
  const body = {
    id: user.id,
    display_name: meta.display_name || user.email,
    grade: meta.grade || "미지정",
    target_school_type: meta.target_school_type || "나의 학습 기록"
  };
  await sb("/rest/v1/profiles", {
    method:"POST",
    headers:{ Prefer:"resolution=merge-duplicates" },
    body: JSON.stringify(body)
  });
}

async function loadAll(){
  const uid = session.user.id;
  const [profiles, books, goals, sessions, mistakes] = await Promise.all([
    sb(`/rest/v1/profiles?select=*&id=eq.${uid}`),
    sb("/rest/v1/books?select=*&order=created_at.desc"),
    sb(`/rest/v1/daily_goals?select=*&goal_date=eq.${today()}&order=created_at.asc`),
    sb("/rest/v1/study_sessions?select=*&order=created_at.desc&limit=50"),
    sb("/rest/v1/memorable_mistakes?select=*&order=created_at.desc&limit=50")
  ]);
  profile = profiles[0] || null;
  state = { books, goals, sessions, mistakes, timer: state.timer || null };
}

async function createProfileIfMissing(){
  if(profile) return;
  await ensureProfile({ display_name: session.user.email, grade:"미지정", target_school_type:"나의 학습 기록" });
  await loadAll();
}

function setHeader(title, sub="기록은 짧게, 학습은 깊게."){
  $("#screenTitle").textContent = title;
  $("#screenSub").textContent = sub;
}
function showTabs(show){ document.querySelector(".tabbar").style.display = show ? "grid" : "none"; }
function activeBooks(){ return state.books.filter(b => b.status !== "archived"); }
function archivedBooks(){ return state.books.filter(b => b.status === "archived"); }
function bookById(id){ return state.books.find(b => b.id === id); }
function progress(b){ return b.total_problems ? Math.min(100, Math.round((b.solved_count / b.total_problems) * 100)) : 0; }
function accuracy(b){ return b.solved_count ? (((b.solved_count - b.wrong_count) / b.solved_count) * 100).toFixed(1) : "0.0"; }
function todaySessions(){ return state.sessions.filter(s => (s.started_at || s.created_at || "").slice(0,10) === today()); }
function subjectClass(subject){ if(subject==="수학")return"math"; if(subject==="과학")return"science"; if(subject==="영어")return"eng"; return"etc"; }
function coverHTML(b){
  const url = b.thumbnail_url || b.thumbnail || b.cover || "";
  if(url.startsWith("http")) return `<div class="cover"><img src="${url}" alt="${b.title} 표지"></div>`;
  return `<div class="cover">${b.subject || "기타"}<br>${b.title || ""}</div>`;
}

function renderConfigError(){
  showTabs(false);
  setHeader("설정 필요", "Supabase URL과 anon key가 필요합니다.");
  $("#screen").innerHTML = `<section class="panel light"><h2>.env 확인</h2><p class="muted">SUPABASE_URL, SUPABASE_ANON_KEY가 서버에 설정되어야 합니다.</p></section>`;
}

function renderAuth(){
  showTabs(false);
  setHeader("ORBIT 로그인", "웹 DB에 나의 학습 기록을 저장합니다.");
  $("#screen").innerHTML = `
    <section class="panel">
      <h2>학습 궤도 입장</h2>
      <p class="muted">Supabase Auth 계정으로 로그인하거나 새 사용자를 등록합니다.</p>
      <form id="authForm">
        <div class="field"><label class="label">이메일</label><input id="email" type="email" placeholder="student@example.com" required></div>
        <div class="field"><label class="label">비밀번호</label><input id="password" type="password" minlength="6" required></div>
        <div class="field signup-only"><label class="label">이름 또는 별명</label><input id="displayName" placeholder="예: Orbit-01"></div>
        <div class="grid2 signup-only">
          <div class="field"><label class="label">학년</label><select id="grade"><option>초6</option><option>중1</option><option>중2</option><option>중3</option><option>고1</option><option>기타</option></select></div>
          <div class="field"><label class="label">목표</label><select id="target"><option>과학고 준비</option><option>한국과학영재학교 준비</option><option>특목고 준비</option><option>수학·과학 심화</option></select></div>
        </div>
        <button class="primary big" id="submitAuth">회원가입</button>
      </form>
      <button class="secondary" id="toggleAuth" style="margin-top:10px">이미 계정이 있어요</button>
    </section>
    <p class="note">키는 프론트 코드에 저장하지 않습니다. Supabase anon key만 서버 환경변수에서 받아 사용하고, 데이터 접근은 RLS 정책으로 제한합니다.</p>
  `;
  let mode = "signup";
  const applyMode = () => {
    document.querySelectorAll(".signup-only").forEach(el => el.style.display = mode === "signup" ? "block" : "none");
    $("#submitAuth").textContent = mode === "signup" ? "회원가입" : "로그인";
    $("#toggleAuth").textContent = mode === "signup" ? "이미 계정이 있어요" : "새 계정 만들기";
  };
  $("#toggleAuth").onclick = () => { mode = mode === "signup" ? "signin" : "signup"; applyMode(); };
  $("#authForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      if(mode === "signup") {
        await signUp($("#email").value.trim(), $("#password").value, {
          display_name: $("#displayName").value.trim() || $("#email").value.trim(),
          grade: $("#grade").value,
          target_school_type: $("#target").value
        });
      } else {
        await signIn($("#email").value.trim(), $("#password").value);
      }
    } catch(error) {
      alert("인증 실패: " + error.message);
    }
  };
  applyMode();
}

function userStrip(){
  return `<section class="panel" style="padding:12px 14px"><div class="row"><div><strong>${profile?.display_name || session.user.email}</strong><div class="muted" style="font-size:12px">${profile?.grade || ""} · ${profile?.target_school_type || ""}</div></div><button class="secondary" id="logoutBtn" style="width:auto;padding:10px 12px">로그아웃</button></div></section>`;
}

async function render(){
  await createProfileIfMissing();
  showTabs(true);
  document.querySelectorAll(".tabbar button").forEach(b => b.classList.toggle("active", b.dataset.screen === screen));
  if(screen==="today") renderToday();
  if(screen==="study") renderStudy();
  if(screen==="books") renderBooks();
  if(screen==="report") renderReport();
  if(screen==="archive") renderArchive();
}

function bindLogout(){ $("#logoutBtn").onclick = () => logout(true); }

function renderToday(){
  setHeader("오늘의 궤도", "공부 전 5초, 공부 후 20초.");
  const selfMin = todaySessions().filter(s=>s.mode==="self").reduce((a,s)=>a+s.minutes,0);
  $("#screen").innerHTML = `
    ${userStrip()}
    <section class="panel">
      <div class="row"><div><div class="muted">${new Intl.DateTimeFormat("ko-KR",{month:"long",day:"numeric",weekday:"long"}).format(new Date())}</div><h2 style="margin:5px 0 0">오늘 지나갈 행성</h2></div><span class="pill">${state.goals.filter(g=>g.is_done).length}/${state.goals.length}</span></div>
      <div class="stack" style="margin-top:14px">${state.goals.length ? state.goals.map(g=>`<div class="orbit-card" data-goal="${g.id}"><div class="planet ${subjectClass(g.subject)}"></div><div><strong>${g.subject} · ${g.title}</strong><small>${g.target_amount || ""}</small></div><div class="check ${g.is_done ? "done" : ""}">${g.is_done ? "✓" : ""}</div></div>`).join("") : `<p class="muted">오늘 목표가 없습니다. 바로 공부를 시작해도 됩니다.</p>`}</div>
      <button class="secondary" id="addGoalBtn" style="margin-top:14px">+ 오늘 목표 추가</button>
    </section>
    <section class="panel light"><div class="row"><div><div class="muted">오늘 개인공부</div><div style="font-size:30px;font-weight:950">${fmtMin(selfMin)}</div></div><span class="pill">${todaySessions().length}회 기록</span></div></section>
    <button class="primary big" id="startBtn">학습 궤도 진입</button>
  `;
  bindLogout();
  $("#addGoalBtn").onclick = openGoalModal;
  $("#startBtn").onclick = openStartModal;
  document.querySelectorAll("[data-goal]").forEach(el => {
    el.onclick = async () => {
      const g = state.goals.find(x => x.id === el.dataset.goal);
      await sb(`/rest/v1/daily_goals?id=eq.${g.id}`, { method:"PATCH", headers:{ Prefer:"return=representation" }, body: JSON.stringify({ is_done: !g.is_done }) });
      await loadAll(); renderToday();
    };
  });
}

function openGoalModal(){
  const modal = $("#modal");
  modal.innerHTML = `<form class="modal-body" id="goalForm"><h3>오늘 목표 추가</h3><div class="field"><label class="label">과목</label><select id="goalSubject"><option>국어</option><option>영어</option><option selected>수학</option><option>과학</option><option>사회</option><option>기타</option></select></div><div class="field"><label class="label">내용</label><input id="goalTitle" placeholder="예: 쎈 중등 수학 1-1"></div><div class="field"><label class="label">목표량</label><input id="goalAmount" placeholder="예: 30문제"></div><div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">저장</button></div></form>`;
  modal.showModal();
  $("#goalForm").onsubmit = async e => {
    e.preventDefault();
    const title = $("#goalTitle").value.trim();
    if(!title) return;
    await sb("/rest/v1/daily_goals", { method:"POST", body: JSON.stringify({ user_id:session.user.id, goal_date:today(), subject:$("#goalSubject").value, title, target_amount:$("#goalAmount").value.trim(), is_done:false }) });
    await loadAll(); modal.close(); renderToday();
  };
}

function renderStudy(){
  setHeader("학습", "타이머를 켜고 화면은 닫아도 됩니다.");
  if(state.timer) return renderTimer();
  $("#screen").innerHTML = `${userStrip()}<section class="panel"><h2>개인공부</h2><p class="muted">시작 시간만 남기고, 공부는 책 위에서 계속됩니다.</p><button class="primary" id="selfBtn">타이머 시작</button></section><section class="panel light"><h2>학원 숙제</h2><p class="muted">이미 끝낸 숙제는 시간과 학습량만 남깁니다.</p><button class="secondary" id="academyBtn">숙제 기록</button></section>`;
  bindLogout();
  $("#selfBtn").onclick = openStartModal;
  $("#academyBtn").onclick = openAcademyModal;
}

function openStartModal(){
  const modal = $("#modal");
  modal.innerHTML = `<form class="modal-body" id="startForm"><h3>무엇을 공부할까요?</h3><div class="field"><label class="label">과목</label><select id="startSubject"><option>국어</option><option>영어</option><option selected>수학</option><option>과학</option><option>사회</option><option>기타</option></select></div><div class="field"><label class="label">문제집</label><select id="startBook"><option value="">문제집 없이 공부</option>${activeBooks().map(b=>`<option value="${b.id}">${b.title}</option>`).join("")}</select></div><div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">시작</button></div></form>`;
  modal.showModal();
  $("#startForm").onsubmit = e => {
    e.preventDefault();
    state.timer = { start: Date.now(), subject: $("#startSubject").value, bookId: $("#startBook").value || null };
    modal.close(); screen="study"; render();
  };
}

function renderTimer(){
  const t = state.timer;
  const book = t.bookId ? bookById(t.bookId) : null;
  $("#screen").innerHTML = `${userStrip()}<section class="panel timer"><div class="muted">${t.subject}</div><h2>${book ? book.title : "문제집 없이 공부"}</h2><div class="timer-ring"><div class="time" id="timerTime">00:00:00</div></div><button class="danger" id="finishBtn">학습 종료</button></section>`;
  bindLogout();
  $("#finishBtn").onclick = openFinishModal;
  startTick();
}
function startTick(){
  clearInterval(tick);
  tick = setInterval(() => {
    if(!state?.timer) return;
    const sec = Math.floor((Date.now() - state.timer.start) / 1000);
    $("#timerTime").textContent = `${String(Math.floor(sec/3600)).padStart(2,"0")}:${String(Math.floor((sec%3600)/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;
  }, 500);
}

function openFinishModal(){
  const t = state.timer;
  const started = new Date(t.start).toISOString();
  const ended = new Date().toISOString();
  const min = Math.max(1, Math.round((Date.now() - t.start) / 60000));
  const modal = $("#modal");
  modal.innerHTML = `<form class="modal-body" id="finishForm"><h3>학습 종료</h3><p class="muted">${t.subject} · ${min}분</p><div class="grid2"><div class="field"><label class="label">푼 문제</label><input id="solved" type="number" min="0" value="0"></div><div class="field"><label class="label">틀린 문제</label><input id="wrong" type="number" min="0" value="0"></div></div><div class="field"><label class="label">기억할 문제</label><input id="memory" placeholder="예: 148번, 조건 누락"></div><div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">저장</button></div></form>`;
  modal.showModal();
  $("#finishForm").onsubmit = async e => {
    e.preventDefault();
    const solved = Number($("#solved").value || 0);
    const wrong = Math.min(solved, Number($("#wrong").value || 0));
    const inserted = await sb("/rest/v1/study_sessions", { method:"POST", headers:{ Prefer:"return=representation" }, body: JSON.stringify({ user_id:session.user.id, book_id:t.bookId, subject:t.subject, mode:"self", started_at:started, ended_at:ended, minutes:min, solved_count:solved, wrong_count:wrong }) });
    if(t.bookId){
      const b = bookById(t.bookId);
      await sb(`/rest/v1/books?id=eq.${t.bookId}`, { method:"PATCH", body: JSON.stringify({ solved_count: Math.min(b.total_problems, b.solved_count + solved), wrong_count: b.wrong_count + wrong, total_minutes: b.total_minutes + min }) });
      const memo = $("#memory").value.trim();
      if(memo) await sb("/rest/v1/memorable_mistakes", { method:"POST", body: JSON.stringify({ user_id:session.user.id, book_id:t.bookId, study_session_id:inserted[0].id, problem_label:memo, reason:"기억할 문제", memo, review_status:"needs_review" }) });
    }
    state.timer = null; clearInterval(tick); await loadAll(); modal.close(); render();
  };
}

function openAcademyModal(){
  const modal = $("#modal");
  modal.innerHTML = `<form class="modal-body" id="academyForm"><h3>학원 숙제 기록</h3><div class="field"><label class="label">과목</label><select id="aSubject"><option>국어</option><option>영어</option><option selected>수학</option><option>과학</option><option>사회</option><option>기타</option></select></div><div class="field"><label class="label">문제집</label><select id="aBook"><option value="">문제집 없음</option>${activeBooks().map(b=>`<option value="${b.id}">${b.title}</option>`).join("")}</select></div><div class="grid2"><div class="field"><label class="label">시간</label><input id="aMin" type="number" min="0" value="50"></div><div class="field"><label class="label">푼 문제</label><input id="aSolved" type="number" min="0" value="0"></div></div><div class="field"><label class="label">틀린 문제</label><input id="aWrong" type="number" min="0" value="0"></div><div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">저장</button></div></form>`;
  modal.showModal();
  $("#academyForm").onsubmit = async e => {
    e.preventDefault();
    const bookId = $("#aBook").value || null;
    const minutes = Number($("#aMin").value || 0);
    const solved = Number($("#aSolved").value || 0);
    const wrong = Math.min(solved, Number($("#aWrong").value || 0));
    const now = new Date().toISOString();
    await sb("/rest/v1/study_sessions", { method:"POST", body: JSON.stringify({ user_id:session.user.id, book_id:bookId, subject:$("#aSubject").value, mode:"academy", started_at:now, ended_at:now, minutes, solved_count:solved, wrong_count:wrong }) });
    if(bookId){
      const b = bookById(bookId);
      await sb(`/rest/v1/books?id=eq.${bookId}`, { method:"PATCH", body: JSON.stringify({ solved_count: Math.min(b.total_problems, b.solved_count + solved), wrong_count: b.wrong_count + wrong, total_minutes: b.total_minutes + minutes }) });
    }
    await loadAll(); modal.close(); render();
  };
}

function renderBooks(){
  setHeader("문제집 행성", "Supabase DB에 저장됩니다.");
  const books = activeBooks();
  $("#screen").innerHTML = `${userStrip()}<div class="stack">${books.length ? books.map(b=>`<section class="panel light book" data-book="${b.id}">${coverHTML(b)}<div><div class="row"><div class="book-title">${b.title}</div><span class="pill">${progress(b)}%</span></div><div class="book-meta">${b.publisher || ""} · ${b.subject}</div><div class="progress"><span style="width:${progress(b)}%"></span></div><div class="row book-meta"><span>${b.solved_count || 0} / ${b.total_problems || 0}문제</span><span>정답률 ${accuracy(b)}%</span></div></div></section>`).join("") : `<section class="panel light empty"><h2>등록된 문제집이 없습니다.</h2><p class="muted">도서 API 검색으로 첫 문제집을 추가하세요.</p></section>`}</div><button class="primary" id="addBookBtn" style="margin-top:14px">+ 문제집 검색 추가</button>`;
  bindLogout();
  document.querySelectorAll("[data-book]").forEach(el => el.onclick = () => openBookDetail(el.dataset.book));
  $("#addBookBtn").onclick = openBookSearch;
}

function openBookSearch(){
  const modal = $("#modal");
  modal.innerHTML = `<div class="modal-body"><h3>문제집 검색</h3><div class="field"><label class="label">검색어</label><input id="bookQuery" value="최상위 수학 6-2"></div><button class="primary" id="searchBtn">도서 검색</button><div id="searchResults"></div><button class="secondary" style="margin-top:10px" onclick="document.querySelector('#modal').close()">닫기</button></div>`;
  modal.showModal();
  const doSearch = async () => {
    const q = $("#bookQuery").value.trim();
    $("#searchResults").innerHTML = `<p class="muted">도서를 찾는 중입니다...</p>`;
    try{
      const data = await fetch(`/api/book-search?q=${encodeURIComponent(q)}`).then(r => r.json());
      if(!data.items?.length) throw new Error("검색 결과 없음");
      $("#searchResults").innerHTML = data.items.map((b,i)=>`<div class="search-result" data-api-result="${i}">${coverHTML(b)}<div><strong>${b.title}</strong><br><small>${b.publisher || "출판사 정보 없음"} · ${b.authors?.join(", ") || "저자 정보 없음"}</small></div></div>`).join("");
      document.querySelectorAll("[data-api-result]").forEach(el => el.onclick = () => openRegisterBookModal(data.items[Number(el.dataset.apiResult)]));
    }catch(error){
      $("#searchResults").innerHTML = `<p class="muted" style="color:#64748b">검색 실패: ${error.message}</p>`;
    }
  };
  $("#searchBtn").onclick = doSearch;
  doSearch();
}

function openRegisterBookModal(book){
  const modal = $("#modal");
  modal.innerHTML = `<form class="modal-body" id="registerBookForm"><h3>문제집 등록</h3><div class="book" style="margin-bottom:14px">${coverHTML(book)}<div><strong>${book.title}</strong><p class="muted">${book.publisher || "출판사 정보 없음"}<br>${book.isbn || "ISBN 정보 없음"}</p></div></div><div class="field"><label class="label">과목</label><select id="registerSubject">${["국어","영어","수학","과학","사회","기타"].map(s=>`<option ${s===book.subject ? "selected" : ""}>${s}</option>`).join("")}</select></div><div class="field"><label class="label">전체 문제 수</label><input id="registerTotal" type="number" min="1" value="500"></div><div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">내 ORBIT에 추가</button></div></form>`;
  modal.showModal();
  $("#registerBookForm").onsubmit = async e => {
    e.preventDefault();
    await sb("/rest/v1/books", { method:"POST", body: JSON.stringify({ user_id:session.user.id, title:book.title, authors:book.authors || [], publisher:book.publisher || "", isbn:book.isbn || "", thumbnail_url:book.thumbnail || book.cover || "", source_url:book.url || "", subject:$("#registerSubject").value, total_problems:Number($("#registerTotal").value || 1), solved_count:0, wrong_count:0, total_minutes:0, status:"active" }) });
    await loadAll(); modal.close(); renderBooks();
  };
}

function openBookDetail(id){
  const b = bookById(id);
  const recent = state.sessions.filter(s => s.book_id === id).slice(0,5);
  const modal = $("#modal");
  modal.innerHTML = `<div class="modal-body"><div class="book">${coverHTML(b)}<div><h3 style="margin:0">${b.title}</h3><p class="muted">${b.publisher || ""} · ${b.subject}<br>${b.isbn || ""}</p></div></div><div class="progress"><span style="width:${progress(b)}%"></span></div><div class="statgrid"><div class="stat"><b>${b.solved_count}</b><small>풀이 문제</small></div><div class="stat"><b>${accuracy(b)}%</b><small>누적 정답률</small></div><div class="stat"><b>${b.wrong_count}</b><small>누적 오답</small></div><div class="stat"><b>${state.mistakes.filter(m=>m.book_id===id).length}</b><small>기억할 문제</small></div></div><h4>최근 기록</h4>${recent.map(s=>`<p>${(s.started_at||"").slice(5,10)} · ${s.solved_count}문제 · ${s.wrong_count}오답 · ${s.minutes}분</p>`).join("") || "<p class='muted'>아직 기록이 없습니다.</p>"}<div class="modal-actions"><button class="secondary" onclick="document.querySelector('#modal').close()">닫기</button><button class="danger" id="deleteBookBtn">문제집 삭제</button></div></div>`;
  modal.showModal();
  $("#deleteBookBtn").onclick = async () => {
    if(!confirm(`"${b.title}" 문제집과 연결 기록을 삭제할까요?`)) return;
    await sb(`/rest/v1/books?id=eq.${id}`, { method:"DELETE" });
    await loadAll(); modal.close(); renderBooks();
  };
}

function renderReport(){
  setHeader("리포트", "웹 DB 기준으로 계산합니다.");
  const data = state.sessions;
  const total = data.reduce((a,s)=>a+(s.minutes||0),0);
  const self = data.filter(s=>s.mode==="self").reduce((a,s)=>a+(s.minutes||0),0);
  const solved = data.reduce((a,s)=>a+(s.solved_count||0),0);
  const wrong = data.reduce((a,s)=>a+(s.wrong_count||0),0);
  $("#screen").innerHTML = `${userStrip()}<section class="panel light"><div class="statgrid"><div class="stat"><b>${fmtMin(total)}</b><small>총 학습</small></div><div class="stat"><b>${total ? Math.round(self/total*100) : 0}%</b><small>자기주도</small></div><div class="stat"><b>${solved}</b><small>풀이 문제</small></div><div class="stat"><b>${solved ? (((solved-wrong)/solved)*100).toFixed(1) : 0}%</b><small>정답률</small></div></div></section><p class="note">현재 로그인 사용자의 Supabase 데이터만 계산합니다.</p>`;
  bindLogout();
}

function renderArchive(){
  setHeader("기록관", "끝낸 문제집은 웹 DB에 남습니다.");
  const books = archivedBooks();
  $("#screen").innerHTML = `${userStrip()}${books.length ? books.map(b=>`<section class="panel light book">${coverHTML(b)}<div><h3>${b.title}</h3><p class="muted">${b.total_problems}문제 · 정답률 ${accuracy(b)}%</p></div></section>`).join("") : `<section class="panel empty"><h2>아직 완주한 행성이 없습니다.</h2><p class="muted">한 권을 끝내면 이곳에 보관됩니다.</p></section>`}`;
  bindLogout();
}

document.querySelectorAll(".tabbar button").forEach(btn => {
  btn.onclick = () => { screen = btn.dataset.screen; render(); };
});
