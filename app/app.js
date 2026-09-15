const $ = (selector) => document.querySelector(selector);

const SESSION_KEY = "study-orbit-session-v052-webdb";
const today = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();
const fmtMin = (min) => `${Math.floor(Number(min || 0) / 60)}시간 ${Number(min || 0) % 60}분`;

let config = null;
let session = readSession();
let profile = null;
let currentScreen = "today";
let timer = null;
let timerTick = null;
let data = { goals: [], books: [], sessions: [], mistakes: [] };

window.addEventListener("error", (event) => {
  renderFatal(`JS 오류: ${event.message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  renderFatal(`비동기 오류: ${event.reason?.message || event.reason || "알 수 없는 오류"}`);
});

main();

async function main() {
  bindTabs();
  showTabs(false);
  setHeader("ORBIT 로딩", "환경설정을 확인합니다.");
  setScreen(`<section class="panel light"><h2>잠시만요</h2><p class="muted">앱을 준비하고 있습니다.</p></section>`);

  try {
    config = await fetchLocalJson("/api/config");
    if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
      renderSetup("SUPABASE_URL 또는 SUPABASE_ANON_KEY가 비어 있습니다. 서버 콘솔의 loaded/missing 상태를 확인하세요.");
      return;
    }

    if (!session?.access_token) {
      renderAuth("signup");
      return;
    }

    const ok = await loadUser();
    if (!ok) {
      clearSession();
      renderAuth("signin");
      return;
    }

    await ensureProfile();
    await loadData();
    renderApp();
  } catch (error) {
    renderSetup(error.message);
  }
}

function bindTabs() {
  document.querySelectorAll(".tabbar button").forEach((button) => {
    button.onclick = async () => {
      currentScreen = button.dataset.screen;
      try {
        if (session?.access_token) await loadData();
        renderApp();
      } catch (error) {
        renderFatal(error.message);
      }
    };
  });
}

function setHeader(title, subtitle) {
  $("#screenTitle").textContent = title;
  $("#screenSub").textContent = subtitle || "기록은 짧게, 학습은 깊게.";
}

function setScreen(html) {
  $("#screen").innerHTML = html;
}

function showTabs(show) {
  const tabbar = document.querySelector(".tabbar");
  if (tabbar) tabbar.style.display = show ? "grid" : "none";
}

function renderSetup(message) {
  showTabs(false);
  setHeader("설정 필요", "Supabase 환경변수를 확인하세요.");
  setScreen(`
    <section class="panel light">
      <h2>설정 오류</h2>
      <p class="muted">${esc(message)}</p>
      <p class="muted">PowerShell에서 <b>npm run dev</b>를 실행한 콘솔에 Kakao/Supabase가 loaded로 뜨는지 확인하세요.</p>
    </section>
  `);
}

function renderFatal(message) {
  showTabs(false);
  setHeader("앱 오류", "원인을 화면에 표시합니다.");
  setScreen(`
    <section class="panel light">
      <h2>앱 초기화 실패</h2>
      <p class="muted">${esc(message)}</p>
      <button class="primary" onclick="location.reload()">다시 시도</button>
    </section>
  `);
}

function renderAuth(mode = "signup") {
  showTabs(false);
  setHeader("ORBIT 로그인", "웹 DB에 나의 학습 기록을 저장합니다.");
  setScreen(`
    <section class="panel">
      <h2>학습 궤도 입장</h2>
      <p class="muted">Supabase Auth 계정으로 로그인하거나 새 사용자를 등록합니다.</p>
      <form id="authForm">
        <div class="field"><label class="label">이메일</label><input id="email" type="email" required placeholder="student@example.com"></div>
        <div class="field"><label class="label">비밀번호</label><input id="password" type="password" required minlength="6"></div>
        <div class="signup-only">
          <div class="field"><label class="label">이름 또는 별명</label><input id="displayName" placeholder="예: Orbit-01"></div>
          <div class="grid2">
            <div class="field"><label class="label">학년</label><select id="grade"><option>초6</option><option>중1</option><option>중2</option><option>중3</option><option>고1</option><option>기타</option></select></div>
            <div class="field"><label class="label">목표</label><select id="target"><option>과학고 준비</option><option>한국과학영재학교 준비</option><option>특목고 준비</option><option>수학·과학 심화</option><option>나의 학습 기록</option></select></div>
          </div>
        </div>
        <button class="primary big" id="authSubmit">회원가입</button>
      </form>
      <button class="secondary" id="authToggle" style="margin-top:10px">이미 계정이 있어요</button>
    </section>
  `);

  const apply = () => {
    document.querySelectorAll(".signup-only").forEach((el) => el.style.display = mode === "signup" ? "block" : "none");
    $("#authSubmit").textContent = mode === "signup" ? "회원가입" : "로그인";
    $("#authToggle").textContent = mode === "signup" ? "이미 계정이 있어요" : "새 계정 만들기";
  };

  $("#authToggle").onclick = () => {
    mode = mode === "signup" ? "signin" : "signup";
    apply();
  };

  $("#authForm").onsubmit = async (event) => {
    event.preventDefault();
    const email = $("#email").value.trim();
    const password = $("#password").value;
    try {
      if (mode === "signup") {
        await signUp(email, password, {
          display_name: $("#displayName").value.trim() || email,
          grade: $("#grade").value,
          target_school_type: $("#target").value
        });
      } else {
        await signIn(email, password);
      }
    } catch (error) {
      alert("인증 실패: " + error.message);
    }
  };

  apply();
}

async function signUp(email, password, metadata) {
  const result = await supabaseFetch("/auth/v1/signup", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email, password, data: metadata })
  });

  if (result?.access_token) {
    saveSession(result);
    await ensureProfile(metadata);
    await loadData();
    currentScreen = "today";
    renderApp();
    return;
  }

  if (result?.user && !result?.access_token) {
    alert("회원가입은 되었지만 이메일 확인이 필요합니다. Supabase Auth에서 Confirm email을 끄거나 확인 메일을 누른 뒤 로그인하세요.");
    renderAuth("signin");
    return;
  }

  throw new Error("회원가입 응답을 해석할 수 없습니다.");
}

async function signIn(email, password) {
  const result = await supabaseFetch("/auth/v1/token?grant_type=password", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email, password })
  });

  if (!result?.access_token) throw new Error("로그인 토큰을 받지 못했습니다.");

  saveSession(result);
  await ensureProfile();
  await loadData();
  currentScreen = "today";
  renderApp();
}

async function loadUser() {
  try {
    const user = await supabaseFetch("/auth/v1/user");
    if (!user?.id) return false;
    session.user = user;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

async function ensureProfile(metadata = {}) {
  if (!session?.user?.id) {
    const ok = await loadUser();
    if (!ok) throw new Error("로그인 사용자 정보를 확인할 수 없습니다.");
  }

  const uid = encodeURIComponent(session.user.id);
  const rows = await supabaseFetch(`/rest/v1/profiles?select=*&id=eq.${uid}`);
  if (Array.isArray(rows) && rows.length) {
    profile = rows[0];
    return;
  }

  const body = {
    id: session.user.id,
    display_name: metadata.display_name || session.user.user_metadata?.display_name || session.user.email || "ORBIT 사용자",
    grade: metadata.grade || session.user.user_metadata?.grade || "미지정",
    target_school_type: metadata.target_school_type || session.user.user_metadata?.target_school_type || "나의 학습 기록"
  };

  const inserted = await supabaseFetch("/rest/v1/profiles", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body)
  });
  profile = Array.isArray(inserted) ? inserted[0] : inserted;
}

async function loadData() {
  if (!session?.user?.id) return;
  const [profiles, books, goals, sessions, mistakes] = await Promise.all([
    supabaseFetch(`/rest/v1/profiles?select=*&id=eq.${encodeURIComponent(session.user.id)}`),
    supabaseFetch("/rest/v1/books?select=*&order=created_at.desc"),
    supabaseFetch(`/rest/v1/daily_goals?select=*&goal_date=eq.${today()}&order=created_at.asc`),
    supabaseFetch("/rest/v1/study_sessions?select=*&order=created_at.desc&limit=80"),
    supabaseFetch("/rest/v1/memorable_mistakes?select=*&order=created_at.desc&limit=80")
  ]);
  profile = Array.isArray(profiles) && profiles[0] ? profiles[0] : profile;
  data.books = Array.isArray(books) ? books : [];
  data.goals = Array.isArray(goals) ? goals : [];
  data.sessions = Array.isArray(sessions) ? sessions : [];
  data.mistakes = Array.isArray(mistakes) ? mistakes : [];
}

function renderApp() {
  if (!session?.access_token) {
    renderAuth("signin");
    return;
  }
  showTabs(true);
  document.querySelectorAll(".tabbar button").forEach((button) => button.classList.toggle("active", button.dataset.screen === currentScreen));

  if (currentScreen === "today") renderToday();
  if (currentScreen === "study") renderStudy();
  if (currentScreen === "books") renderBooks();
  if (currentScreen === "report") renderReport();
  if (currentScreen === "archive") renderArchive();
}

function renderToday() {
  setHeader("오늘의 궤도", "공부 전 5초, 공부 후 20초.");
  const todayItems = data.sessions.filter((s) => String(s.started_at || s.created_at || "").slice(0, 10) === today());
  const selfMinutes = todayItems.filter((s) => s.mode === "self").reduce((sum, s) => sum + Number(s.minutes || 0), 0);
  setScreen(`${userStrip()}<section class="panel"><div class="row"><div><div class="muted">${new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date())}</div><h2 style="margin:5px 0 0">오늘 지나갈 행성</h2></div><span class="pill">${data.goals.filter((g) => g.is_done).length}/${data.goals.length}</span></div><div class="stack" style="margin-top:14px">${data.goals.length ? data.goals.map(goalCard).join("") : `<p class="muted">오늘 목표가 없습니다. 바로 공부를 시작해도 됩니다.</p>`}</div><button class="secondary" id="addGoalBtn" style="margin-top:14px">+ 오늘 목표 추가</button></section><section class="panel light"><div class="row"><div><div class="muted">오늘 개인공부</div><div style="font-size:30px;font-weight:950">${fmtMin(selfMinutes)}</div></div><span class="pill">${todayItems.length}회 기록</span></div></section><button class="primary big" id="startStudyBtn">학습 궤도 진입</button>`);
  bindLogout();
  $("#addGoalBtn").onclick = openGoalModal;
  $("#startStudyBtn").onclick = openStartModal;
  document.querySelectorAll("[data-goal]").forEach((el) => {
    el.onclick = async () => {
      const goal = data.goals.find((g) => g.id === el.dataset.goal);
      if (!goal) return;
      await supabaseFetch(`/rest/v1/daily_goals?id=eq.${goal.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ is_done: !goal.is_done }) });
      await loadData();
      renderToday();
    };
  });
}

function renderStudy() {
  setHeader("학습", "타이머를 켜고 화면은 닫아도 됩니다.");
  if (timer) {
    renderTimer();
    return;
  }
  setScreen(`${userStrip()}<section class="panel"><h2>개인공부</h2><p class="muted">시작 시간만 저장합니다.</p><button class="primary" id="timerStartBtn">타이머 시작</button></section><section class="panel light"><h2>학원 숙제</h2><p class="muted">끝난 뒤 시간과 학습량만 남깁니다.</p><button class="secondary" id="academyBtn">숙제 기록</button></section>`);
  bindLogout();
  $("#timerStartBtn").onclick = openStartModal;
  $("#academyBtn").onclick = openAcademyModal;
}

function renderBooks() {
  setHeader("문제집 행성", "Supabase DB에 저장됩니다.");
  const active = data.books.filter((b) => b.status !== "archived");
  setScreen(`${userStrip()}<div class="stack">${active.length ? active.map(bookCard).join("") : `<section class="panel light empty"><h2>등록된 문제집이 없습니다.</h2><p class="muted">도서 API 검색으로 첫 문제집을 추가하세요.</p></section>`}</div><button class="primary" id="addBookBtn" style="margin-top:14px">+ 문제집 검색 추가</button>`);
  bindLogout();
  document.querySelectorAll("[data-book]").forEach((el) => el.onclick = () => openBookDetail(el.dataset.book));
  $("#addBookBtn").onclick = openBookSearch;
}

function renderReport() {
  setHeader("리포트", "웹 DB 기준으로 계산합니다.");
  const total = data.sessions.reduce((sum, s) => sum + Number(s.minutes || 0), 0);
  const self = data.sessions.filter((s) => s.mode === "self").reduce((sum, s) => sum + Number(s.minutes || 0), 0);
  const solved = data.sessions.reduce((sum, s) => sum + Number(s.solved_count || 0), 0);
  const wrong = data.sessions.reduce((sum, s) => sum + Number(s.wrong_count || 0), 0);
  setScreen(`${userStrip()}<section class="panel light"><div class="statgrid"><div class="stat"><b>${fmtMin(total)}</b><small>총 학습</small></div><div class="stat"><b>${total ? Math.round((self / total) * 100) : 0}%</b><small>자기주도</small></div><div class="stat"><b>${solved}</b><small>풀이 문제</small></div><div class="stat"><b>${solved ? (((solved - wrong) / solved) * 100).toFixed(1) : "0.0"}%</b><small>정답률</small></div></div></section>`);
  bindLogout();
}

function renderArchive() {
  setHeader("기록관", "끝낸 문제집은 웹 DB에 남습니다.");
  const archived = data.books.filter((b) => b.status === "archived");
  setScreen(`${userStrip()}${archived.length ? archived.map((b) => `<section class="panel light book">${coverHTML(b)}<div><h3>${esc(b.title)}</h3><p class="muted">${Number(b.total_problems || 0).toLocaleString()}문제 · 정답률 ${accuracy(b)}%</p></div></section>`).join("") : `<section class="panel empty"><h2>아직 완주한 행성이 없습니다.</h2><p class="muted">한 권을 끝내면 이곳에 보관됩니다.</p></section>`}`);
  bindLogout();
}

function userStrip() {
  return `<section class="panel" style="padding:12px 14px"><div class="row"><div><strong>${esc(profile?.display_name || session?.user?.email || "ORBIT 사용자")}</strong><div class="muted" style="font-size:12px">${esc(profile?.grade || "미지정")} · ${esc(profile?.target_school_type || "나의 학습 기록")}</div></div><button class="secondary" id="logoutBtn" style="width:auto;padding:10px 12px">로그아웃</button></div></section>`;
}

function bindLogout() {
  const button = $("#logoutBtn");
  if (button) button.onclick = () => {
    clearSession();
    renderAuth("signin");
  };
}

function goalCard(goal) {
  return `<div class="orbit-card" data-goal="${goal.id}"><div class="planet ${subjectClass(goal.subject)}"></div><div><strong>${esc(goal.subject)} · ${esc(goal.title)}</strong><small>${esc(goal.target_amount || "")}</small></div><div class="check ${goal.is_done ? "done" : ""}">${goal.is_done ? "✓" : ""}</div></div>`;
}

function bookCard(book) {
  return `<section class="panel light book" data-book="${book.id}">${coverHTML(book)}<div><div class="row"><div class="book-title">${esc(book.title)}</div><span class="pill">${progress(book)}%</span></div><div class="book-meta">${esc(book.publisher || "")} · ${esc(book.subject || "기타")}</div><div class="progress"><span style="width:${progress(book)}%"></span></div><div class="row book-meta"><span>${Number(book.solved_count || 0).toLocaleString()} / ${Number(book.total_problems || 0).toLocaleString()}문제</span><span>정답률 ${accuracy(book)}%</span></div></div></section>`;
}

function openGoalModal() {
  const modal = $("#modal");
  modal.innerHTML = `<form class="modal-body" id="goalForm"><h3>오늘 목표 추가</h3><div class="field"><label class="label">과목</label><select id="goalSubject"><option>국어</option><option>영어</option><option selected>수학</option><option>과학</option><option>사회</option><option>기타</option></select></div><div class="field"><label class="label">내용</label><input id="goalTitle" placeholder="예: 쎈 중등 수학 1-1"></div><div class="field"><label class="label">목표량</label><input id="goalAmount" placeholder="예: 30문제"></div><div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">저장</button></div></form>`;
  modal.showModal();
  $("#goalForm").onsubmit = async (event) => {
    event.preventDefault();
    const title = $("#goalTitle").value.trim();
    if (!title) return;
    await supabaseFetch("/rest/v1/daily_goals", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: session.user.id, goal_date: today(), subject: $("#goalSubject").value, title, target_amount: $("#goalAmount").value.trim(), is_done: false }) });
    await loadData();
    modal.close();
    renderToday();
  };
}

function openStartModal() {
  const modal = $("#modal");
  const options = data.books.filter((b) => b.status !== "archived").map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join("");
  modal.innerHTML = `<form class="modal-body" id="startForm"><h3>무엇을 공부할까요?</h3><div class="field"><label class="label">과목</label><select id="studySubject"><option>국어</option><option>영어</option><option selected>수학</option><option>과학</option><option>사회</option><option>기타</option></select></div><div class="field"><label class="label">문제집</label><select id="studyBook"><option value="">문제집 없이 공부</option>${options}</select></div><div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">시작</button></div></form>`;
  modal.showModal();
  $("#startForm").onsubmit = (event) => {
    event.preventDefault();
    timer = { start: Date.now(), subject: $("#studySubject").value, bookId: $("#studyBook").value || null };
    modal.close();
    currentScreen = "study";
    renderStudy();
  };
}

function renderTimer() {
  const book = timer.bookId ? data.books.find((b) => b.id === timer.bookId) : null;
  setScreen(`${userStrip()}<section class="panel timer"><div class="muted">${esc(timer.subject)}</div><h2>${book ? esc(book.title) : "문제집 없이 공부"}</h2><div class="timer-ring"><div class="time" id="timerTime">00:00:00</div></div><button class="danger" id="finishBtn">학습 종료</button></section>`);
  bindLogout();
  $("#finishBtn").onclick = openFinishModal;
  clearInterval(timerTick);
  timerTick = setInterval(() => {
    if (!timer) return;
    const sec = Math.floor((Date.now() - timer.start) / 1000);
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    const el = $("#timerTime");
    if (el) el.textContent = `${h}:${m}:${s}`;
  }, 500);
}

function openFinishModal() {
  const modal = $("#modal");
  const minutes = Math.max(1, Math.round((Date.now() - timer.start) / 60000));
  modal.innerHTML = `<form class="modal-body" id="finishForm"><h3>학습 종료</h3><p class="muted">${esc(timer.subject)} · ${minutes}분</p><div class="grid2"><div class="field"><label class="label">푼 문제</label><input id="solved" type="number" min="0" value="0"></div><div class="field"><label class="label">틀린 문제</label><input id="wrong" type="number" min="0" value="0"></div></div><div class="field"><label class="label">기억할 문제</label><input id="memory" placeholder="예: 148번, 조건 누락"></div><div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">저장</button></div></form>`;
  modal.showModal();
  $("#finishForm").onsubmit = async (event) => {
    event.preventDefault();
    const solved = Number($("#solved").value || 0);
    const wrong = Math.min(solved, Number($("#wrong").value || 0));
    const startedAt = new Date(timer.start).toISOString();
    const inserted = await supabaseFetch("/rest/v1/study_sessions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: session.user.id, book_id: timer.bookId, subject: timer.subject, mode: "self", started_at: startedAt, ended_at: nowISO(), minutes, solved_count: solved, wrong_count: wrong }) });
    if (timer.bookId) {
      await updateBook(timer.bookId, solved, wrong, minutes);
      const memo = $("#memory").value.trim();
      if (memo) await supabaseFetch("/rest/v1/memorable_mistakes", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: session.user.id, book_id: timer.bookId, study_session_id: Array.isArray(inserted) ? inserted[0]?.id : null, problem_label: memo, reason: "기억할 문제", memo, review_status: "needs_review" }) });
    }
    timer = null;
    clearInterval(timerTick);
    await loadData();
    modal.close();
    renderStudy();
  };
}

function openAcademyModal() {
  const modal = $("#modal");
  const options = data.books.filter((b) => b.status !== "archived").map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join("");
  modal.innerHTML = `<form class="modal-body" id="academyForm"><h3>학원 숙제 기록</h3><div class="field"><label class="label">과목</label><select id="academySubject"><option>국어</option><option>영어</option><option selected>수학</option><option>과학</option><option>사회</option><option>기타</option></select></div><div class="field"><label class="label">문제집</label><select id="academyBook"><option value="">문제집 없음</option>${options}</select></div><div class="grid2"><div class="field"><label class="label">시간</label><input id="academyMinutes" type="number" min="0" value="50"></div><div class="field"><label class="label">푼 문제</label><input id="academySolved" type="number" min="0" value="0"></div></div><div class="field"><label class="label">틀린 문제</label><input id="academyWrong" type="number" min="0" value="0"></div><div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">저장</button></div></form>`;
  modal.showModal();
  $("#academyForm").onsubmit = async (event) => {
    event.preventDefault();
    const bookId = $("#academyBook").value || null;
    const minutes = Number($("#academyMinutes").value || 0);
    const solved = Number($("#academySolved").value || 0);
    const wrong = Math.min(solved, Number($("#academyWrong").value || 0));
    await supabaseFetch("/rest/v1/study_sessions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: session.user.id, book_id: bookId, subject: $("#academySubject").value, mode: "academy", started_at: nowISO(), ended_at: nowISO(), minutes, solved_count: solved, wrong_count: wrong }) });
    if (bookId) await updateBook(bookId, solved, wrong, minutes);
    await loadData();
    modal.close();
    renderStudy();
  };
}

async function updateBook(bookId, solved, wrong, minutes) {
  const book = data.books.find((b) => b.id === bookId);
  if (!book) return;
  const total = Number(book.total_problems || 0);
  const nextSolved = Math.min(total || Number.MAX_SAFE_INTEGER, Number(book.solved_count || 0) + solved);
  const nextWrong = Number(book.wrong_count || 0) + wrong;
  const nextMinutes = Number(book.total_minutes || 0) + minutes;
  const nextStatus = total > 0 && nextSolved >= total ? "archived" : book.status || "active";
  await supabaseFetch(`/rest/v1/books?id=eq.${bookId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ solved_count: nextSolved, wrong_count: nextWrong, total_minutes: nextMinutes, status: nextStatus, archived_at: nextStatus === "archived" ? nowISO() : book.archived_at }) });
}

function openBookSearch() {
  const modal = $("#modal");
  modal.innerHTML = `<div class="modal-body"><h3>문제집 검색</h3><div class="field"><label class="label">검색어</label><input id="bookQuery" value="최상위 수학 6-2"></div><button class="primary" id="searchBtn">도서 검색</button><div id="searchResults"></div><button class="secondary" style="margin-top:10px" onclick="document.querySelector('#modal').close()">닫기</button></div>`;
  modal.showModal();
  const doSearch = async () => {
    const query = $("#bookQuery").value.trim();
    if (!query) return;
    $("#searchResults").innerHTML = `<p class="muted">도서를 찾는 중입니다...</p>`;
    try {
      const response = await fetch(`/api/book-search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      if (!result.items?.length) {
        $("#searchResults").innerHTML = `<p class="muted">검색 결과가 없습니다.</p>`;
        return;
      }
      $("#searchResults").innerHTML = result.items.map((book, index) => `<div class="search-result" data-result="${index}">${coverHTML(book)}<div><strong>${esc(book.title)}</strong><br><small>${esc(book.publisher || "출판사 정보 없음")} · ${esc((book.authors || []).join(", ") || "저자 정보 없음")}</small></div></div>`).join("");
      document.querySelectorAll("[data-result]").forEach((el) => el.onclick = () => openRegisterBook(result.items[Number(el.dataset.result)]));
    } catch (error) {
      $("#searchResults").innerHTML = `<p class="muted" style="color:#64748b">검색 실패: ${esc(error.message)}</p>`;
    }
  };
  $("#searchBtn").onclick = doSearch;
  doSearch();
}

function openRegisterBook(book) {
  const modal = $("#modal");
  modal.innerHTML = `<form class="modal-body" id="registerBookForm"><h3>문제집 등록</h3><div class="book" style="margin-bottom:14px">${coverHTML(book)}<div><strong>${esc(book.title)}</strong><p class="muted">${esc(book.publisher || "출판사 정보 없음")}<br>${esc(book.isbn || "ISBN 정보 없음")}</p></div></div><div class="field"><label class="label">과목</label><select id="bookSubject">${["국어", "영어", "수학", "과학", "사회", "기타"].map((s) => `<option ${s === book.subject ? "selected" : ""}>${s}</option>`).join("")}</select></div><div class="field"><label class="label">전체 문제 수</label><input id="bookTotal" type="number" min="1" value="500"></div><div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">내 ORBIT에 추가</button></div></form>`;
  modal.showModal();
  $("#registerBookForm").onsubmit = async (event) => {
    event.preventDefault();
    await supabaseFetch("/rest/v1/books", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: session.user.id, title: book.title, authors: book.authors || [], publisher: book.publisher || "", isbn: book.isbn || "", thumbnail_url: book.thumbnail || book.cover || "", source_url: book.url || "", subject: $("#bookSubject").value, total_problems: Number($("#bookTotal").value || 1), solved_count: 0, wrong_count: 0, total_minutes: 0, status: "active" }) });
    await loadData();
    modal.close();
    renderBooks();
  };
}

function openBookDetail(id) {
  const book = data.books.find((b) => b.id === id);
  if (!book) return;
  const memoryCount = data.mistakes.filter((m) => m.book_id === id).length;
  const modal = $("#modal");
  modal.innerHTML = `<div class="modal-body"><div class="book">${coverHTML(book)}<div><h3 style="margin:0">${esc(book.title)}</h3><p class="muted">${esc(book.publisher || "")} · ${esc(book.subject || "기타")}<br>${esc(book.isbn || "")}</p></div></div><div class="progress"><span style="width:${progress(book)}%"></span></div><div class="statgrid"><div class="stat"><b>${Number(book.solved_count || 0).toLocaleString()}</b><small>풀이 문제</small></div><div class="stat"><b>${accuracy(book)}%</b><small>누적 정답률</small></div><div class="stat"><b>${Number(book.wrong_count || 0).toLocaleString()}</b><small>누적 오답</small></div><div class="stat"><b>${memoryCount}</b><small>기억할 문제</small></div></div><div class="modal-actions"><button class="secondary" onclick="document.querySelector('#modal').close()">닫기</button><button class="danger" id="deleteBookBtn">문제집 삭제</button></div></div>`;
  modal.showModal();
  $("#deleteBookBtn").onclick = async () => {
    if (!confirm(`"${book.title}" 문제집과 연결 기록을 삭제할까요?`)) return;
    await supabaseFetch(`/rest/v1/books?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await loadData();
    modal.close();
    renderBooks();
  };
}

function progress(book) {
  const total = Number(book.total_problems || 0);
  const solved = Number(book.solved_count || 0);
  return total ? Math.min(100, Math.round((solved / total) * 100)) : 0;
}

function accuracy(book) {
  const solved = Number(book.solved_count || 0);
  const wrong = Number(book.wrong_count || 0);
  return solved ? (((solved - wrong) / solved) * 100).toFixed(1) : "0.0";
}

function coverHTML(book) {
  const url = book.thumbnail_url || book.thumbnail || book.cover || "";
  if (String(url).startsWith("http")) return `<div class="cover"><img src="${esc(url)}" alt="${esc(book.title || "문제집")} 표지"></div>`;
  return `<div class="cover">${esc(book.subject || "기타")}<br>${esc(book.title || "")}</div>`;
}

function subjectClass(subject) {
  if (subject === "수학") return "math";
  if (subject === "과학") return "science";
  if (subject === "영어") return "eng";
  return "etc";
}

function saveSession(value) {
  session = value;
  localStorage.setItem(SESSION_KEY, JSON.stringify(value));
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function clearSession() {
  session = null;
  profile = null;
  localStorage.removeItem(SESSION_KEY);
}

async function fetchLocalJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
  return text ? JSON.parse(text) : null;
}

async function supabaseFetch(path, options = {}) {
  const headers = {
    apikey: config.supabaseAnonKey,
    ...(options.json === false ? {} : { "Content-Type": "application/json" }),
    ...(options.auth === false || !session?.access_token ? {} : { Authorization: `Bearer ${session.access_token}` }),
    ...(options.headers || {})
  };

  const response = await fetch(`${config.supabaseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body
  });

  const text = await response.text();
  if (!response.ok) {
    let message = text || `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text);
      message = parsed.message || parsed.msg || parsed.error_description || parsed.error || message;
    } catch {}
    throw new Error(message);
  }
  return text ? JSON.parse(text) : null;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
