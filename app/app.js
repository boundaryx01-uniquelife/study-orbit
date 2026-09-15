const $ = (selector) => document.querySelector(selector);

const SESSION_KEY = "study-orbit-session-v051-webdb";

const today = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();
const fmtMin = (min) => `${Math.floor((min || 0) / 60)}시간 ${(min || 0) % 60}분`;

let config = null;
let session = null;
let profile = null;
let screen = "today";
let tick = null;
let state = { goals: [], books: [], sessions: [], mistakes: [], timer: null };

window.addEventListener("error", (event) => {
  renderFatalError(event.error?.message || event.message || "알 수 없는 JavaScript 오류");
});

window.addEventListener("unhandledrejection", (event) => {
  renderFatalError(event.reason?.message || String(event.reason) || "알 수 없는 비동기 오류");
});

init();

async function init() {
  try {
    await unregisterOldServiceWorkers();
    bindTabs();

    config = await localJson("/api/config");

    if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
      renderError("SUPABASE_URL 또는 SUPABASE_ANON_KEY가 없습니다. .env를 확인하세요.");
      return;
    }

    session = readSession();

    if (!session?.access_token) {
      renderAuth("signup");
      return;
    }

    const valid = await refreshUser();
    if (!valid) {
      logout(false);
      renderAuth("signin");
      return;
    }

    await ensureProfile();
    await loadAll();
    render();
  } catch (error) {
    console.error(error);
    renderError(error.message || String(error));
  }
}

function bindTabs() {
  document.querySelectorAll(".tabbar button").forEach((btn) => {
    btn.onclick = () => {
      screen = btn.dataset.screen;
      render();
    };
  });
}

async function unregisterOldServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("study-orbit") || key.startsWith("orbit")).map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn("Service worker cleanup skipped", error);
  }
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function saveSession(nextSession) {
  session = nextSession;
  localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
}

function logout(shouldRender = true) {
  session = null;
  profile = null;
  localStorage.removeItem(SESSION_KEY);
  state = { goals: [], books: [], sessions: [], mistakes: [], timer: null };
  if (shouldRender) renderAuth("signin");
}

async function localJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
  return text ? JSON.parse(text) : null;
}

function supabaseHeaders({ auth = true, json = true } = {}) {
  const headers = { apikey: config.supabaseAnonKey };
  if (json) headers["Content-Type"] = "application/json";
  if (auth && session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

async function sb(path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      ...supabaseHeaders({ auth: options.auth !== false, json: options.json !== false }),
      ...(options.headers || {})
    },
    body: options.body
  });

  const text = await response.text();

  if (!response.ok) {
    let message = text || `Supabase error ${response.status}`;
    try {
      const parsed = JSON.parse(text);
      message = parsed.message || parsed.msg || parsed.error_description || parsed.error || message;
    } catch {}
    throw new Error(message);
  }

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON parse failed: ${text.slice(0, 200)}`);
  }
}

async function refreshUser() {
  try {
    const user = await sb("/auth/v1/user");
    if (!user?.id) return false;
    session.user = user;
    saveSession(session);
    return true;
  } catch (error) {
    console.warn("refreshUser failed", error);
    return false;
  }
}

async function signUp(email, password, meta) {
  const data = await sb("/auth/v1/signup", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email, password, data: meta })
  });

  if (data?.access_token) {
    saveSession(data);
    await ensureProfile(meta);
    await loadAll();
    screen = "today";
    render();
    return;
  }

  if (data?.user && !data?.access_token) {
    alert("회원가입은 되었지만 이메일 확인이 필요합니다. 확인 메일을 누른 뒤 로그인하거나, Supabase Auth에서 Confirm email을 꺼주세요.");
    renderAuth("signin");
    return;
  }

  throw new Error("회원가입 응답을 해석할 수 없습니다.");
}

async function signIn(email, password) {
  const data = await sb("/auth/v1/token?grant_type=password", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email, password })
  });

  if (!data?.access_token) throw new Error("로그인 토큰을 받지 못했습니다.");

  saveSession(data);
  await ensureProfile();
  await loadAll();
  screen = "today";
  render();
}

async function ensureProfile(meta = {}) {
  if (!session?.user?.id) {
    const ok = await refreshUser();
    if (!ok) throw new Error("로그인 사용자 정보를 확인할 수 없습니다.");
  }

  const uid = session.user.id;
  const rows = await sb(`/rest/v1/profiles?select=*&id=eq.${encodeURIComponent(uid)}`);

  if (Array.isArray(rows) && rows.length) {
    profile = rows[0];
    return profile;
  }

  const body = {
    id: uid,
    display_name: meta.display_name || session.user.user_metadata?.display_name || session.user.email || "ORBIT 사용자",
    grade: meta.grade || session.user.user_metadata?.grade || "미지정",
    target_school_type: meta.target_school_type || session.user.user_metadata?.target_school_type || "나의 학습 기록"
  };

  const inserted = await sb("/rest/v1/profiles", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body)
  });

  profile = Array.isArray(inserted) ? inserted[0] : inserted;
  return profile;
}

async function loadAll() {
  const [profiles, books, goals, sessions, mistakes] = await Promise.all([
    sb(`/rest/v1/profiles?select=*&id=eq.${encodeURIComponent(session.user.id)}`),
    sb("/rest/v1/books?select=*&order=created_at.desc"),
    sb(`/rest/v1/daily_goals?select=*&goal_date=eq.${today()}&order=created_at.asc`),
    sb("/rest/v1/study_sessions?select=*&order=created_at.desc&limit=80"),
    sb("/rest/v1/memorable_mistakes?select=*&order=created_at.desc&limit=80")
  ]);

  profile = Array.isArray(profiles) ? profiles[0] : profile;
  state.books = Array.isArray(books) ? books : [];
  state.goals = Array.isArray(goals) ? goals : [];
  state.sessions = Array.isArray(sessions) ? sessions : [];
  state.mistakes = Array.isArray(mistakes) ? mistakes : [];
}

function setHeader(title, subtitle = "기록은 짧게, 학습은 깊게.") {
  $("#screenTitle").textContent = title;
  $("#screenSub").textContent = subtitle;
}

function showTabs(show) {
  document.querySelector(".tabbar").style.display = show ? "grid" : "none";
}

function renderError(message) {
  showTabs(false);
  setHeader("설정 또는 연결 확인", "아래 메시지를 확인해 주세요.");
  $("#screen").innerHTML = `
    <section class="panel light">
      <h2>앱 초기화 실패</h2>
      <p class="muted">${escapeHTML(message)}</p>
      <button class="primary" id="retryBtn">다시 시도</button>
      <button class="secondary" id="clearBtn" style="margin-top:10px">세션 초기화</button>
    </section>
  `;
  $("#retryBtn").onclick = () => location.reload();
  $("#clearBtn").onclick = () => {
    localStorage.removeItem(SESSION_KEY);
    location.reload();
  };
}

function renderFatalError(message) {
  const screenEl = $("#screen");
  if (!screenEl) return;
  showTabs(false);
  setHeader("앱 오류", "JavaScript 오류가 잡혔습니다.");
  screenEl.innerHTML = `
    <section class="panel light">
      <h2>먹통 원인 메시지</h2>
      <p class="muted">${escapeHTML(message)}</p>
      <button class="primary" onclick="location.reload()">새로고침</button>
    </section>
  `;
}

function renderAuth(initialMode = "signup") {
  showTabs(false);
  setHeader("ORBIT 로그인", "웹 DB에 나의 학습 기록을 저장합니다.");

  $("#screen").innerHTML = `
    <section class="panel">
      <h2>학습 궤도 입장</h2>
      <p class="muted">Supabase Auth 계정으로 로그인하거나 새 사용자를 등록합니다.</p>
      <form id="authForm">
        <div class="field"><label class="label">이메일</label><input id="email" type="email" required placeholder="student@example.com"></div>
        <div class="field"><label class="label">비밀번호</label><input id="password" type="password" minlength="6" required></div>
        <div class="field signup-only"><label class="label">이름 또는 별명</label><input id="displayName" placeholder="예: Orbit-01"></div>
        <div class="grid2 signup-only">
          <div class="field"><label class="label">학년</label><select id="grade"><option>초6</option><option>중1</option><option>중2</option><option>중3</option><option>고1</option><option>기타</option></select></div>
          <div class="field"><label class="label">목표</label><select id="target"><option>과학고 준비</option><option>한국과학영재학교 준비</option><option>특목고 준비</option><option>수학·과학 심화</option><option>나의 학습 기록</option></select></div>
        </div>
        <button class="primary big" id="submitAuth">회원가입</button>
      </form>
      <button class="secondary" id="toggleAuth" style="margin-top:10px">이미 계정이 있어요</button>
    </section>
    <p class="note">학습 데이터는 Supabase DB에 저장됩니다. 사용자는 RLS 정책으로 자기 데이터만 접근합니다.</p>
  `;

  let mode = initialMode;
  const applyMode = () => {
    document.querySelectorAll(".signup-only").forEach((el) => {
      el.style.display = mode === "signup" ? "block" : "none";
    });
    $("#submitAuth").textContent = mode === "signup" ? "회원가입" : "로그인";
    $("#toggleAuth").textContent = mode === "signup" ? "이미 계정이 있어요" : "새 계정 만들기";
  };

  $("#toggleAuth").onclick = () => {
    mode = mode === "signup" ? "signin" : "signup";
    applyMode();
  };

  $("#authForm").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const email = $("#email").value.trim();
      const password = $("#password").value;
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
      console.error(error);
      alert("인증 실패: " + error.message);
    }
  };

  applyMode();
}

function render() {
  if (!session?.access_token) {
    renderAuth("signin");
    return;
  }

  showTabs(true);
  document.querySelectorAll(".tabbar button").forEach((btn) => btn.classList.toggle("active", btn.dataset.screen === screen));

  if (screen === "today") renderToday();
  if (screen === "study") renderStudy();
  if (screen === "books") renderBooks();
  if (screen === "report") renderReport();
  if (screen === "archive") renderArchive();
}

function userStrip() {
  return `<section class="panel" style="padding:12px 14px"><div class="row"><div><strong>${escapeHTML(profile?.display_name || session?.user?.email || "ORBIT 사용자")}</strong><div class="muted" style="font-size:12px">${escapeHTML(profile?.grade || "미지정")} · ${escapeHTML(profile?.target_school_type || "나의 학습 기록")}</div></div><button class="secondary" id="logoutBtn" style="width:auto;padding:10px 12px">로그아웃</button></div></section>`;
}

function bindLogout() {
  const btn = $("#logoutBtn");
  if (btn) btn.onclick = () => logout(true);
}

function activeBooks() {
  return state.books.filter((book) => book.status !== "archived");
}

function archivedBooks() {
  return state.books.filter((book) => book.status === "archived");
}

function bookById(id) {
  return state.books.find((book) => book.id === id);
}

function progress(book) {
  const total = Number(book.total_problems || 0);
  const solved = Number(book.solved_count || 0);
  if (!total) return 0;
  return Math.min(100, Math.round((solved / total) * 100));
}

function accuracy(book) {
  const solved = Number(book.solved_count || 0);
  const wrong = Number(book.wrong_count || 0);
  if (!solved) return "0.0";
  return (((solved - wrong) / solved) * 100).toFixed(1);
}

function todaySessions() {
  return state.sessions.filter((item) => String(item.started_at || item.created_at || "").slice(0, 10) === today());
}

function subjectClass(subject) {
  if (subject === "수학") return "math";
  if (subject === "과학") return "science";
  if (subject === "영어") return "eng";
  return "etc";
}

function coverHTML(book) {
  const url = book.thumbnail_url || book.thumbnail || book.cover || "";
  if (String(url).startsWith("http")) return `<div class="cover"><img src="${escapeHTML(url)}" alt="${escapeHTML(book.title || "문제집")} 표지"></div>`;
  return `<div class="cover">${escapeHTML(book.subject || "기타")}<br>${escapeHTML(book.title || "")}</div>`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderToday() {
  setHeader("오늘의 궤도", "공부 전 5초, 공부 후 20초.");
  const selfMinutes = todaySessions().filter((item) => item.mode === "self").reduce((sum, item) => sum + Number(item.minutes || 0), 0);

  $("#screen").innerHTML = `
    ${userStrip()}
    <section class="panel">
      <div class="row"><div><div class="muted">${new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date())}</div><h2 style="margin:5px 0 0">오늘 지나갈 행성</h2></div><span class="pill">${state.goals.filter((g) => g.is_done).length}/${state.goals.length}</span></div>
      <div class="stack" style="margin-top:14px">
        ${state.goals.length ? state.goals.map((goal) => `<div class="orbit-card" data-goal="${goal.id}"><div class="planet ${subjectClass(goal.subject)}"></div><div><strong>${escapeHTML(goal.subject)} · ${escapeHTML(goal.title)}</strong><small>${escapeHTML(goal.target_amount || "")}</small></div><div class="check ${goal.is_done ? "done" : ""}">${goal.is_done ? "✓" : ""}</div></div>`).join("") : `<p class="muted">오늘 목표가 없습니다. 바로 공부를 시작해도 됩니다.</p>`}
      </div>
      <button class="secondary" id="addGoalBtn" style="margin-top:14px">+ 오늘 목표 추가</button>
    </section>
    <section class="panel light"><div class="row"><div><div class="muted">오늘 개인공부</div><div style="font-size:30px;font-weight:950">${fmtMin(selfMinutes)}</div></div><span class="pill">${todaySessions().length}회 기록</span></div></section>
    <button class="primary big" id="startBtn">학습 궤도 진입</button>
  `;

  bindLogout();
  $("#addGoalBtn").onclick = openGoalModal;
  $("#startBtn").onclick = openStartModal;

  document.querySelectorAll("[data-goal]").forEach((el) => {
    el.onclick = async () => {
      const goal = state.goals.find((item) => item.id === el.dataset.goal);
      if (!goal) return;
      try {
        await sb(`/rest/v1/daily_goals?id=eq.${goal.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ is_done: !goal.is_done }) });
        await loadAll();
        renderToday();
      } catch (error) {
        alert("목표 수정 실패: " + error.message);
      }
    };
  });
}

function openGoalModal() {
  const modal = $("#modal");
  modal.innerHTML = `<form class="modal-body" id="goalForm"><h3>오늘 목표 추가</h3><div class="field"><label class="label">과목</label><select id="goalSubject"><option>국어</option><option>영어</option><option selected>수학</option><option>과학</option><option>사회</option><option>기타</option></select></div><div class="field"><label class="label">내용</label><input id="goalTitle" placeholder="예: 쎈 중등 수학 1-1"></div><div class="field"><label class="label">목표량</label><input id="goalAmount" placeholder="예: 30문제"></div><div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">저장</button></div></form>`;
  modal.showModal();

  $("#goalForm").onsubmit = async (event) => {
    event.preventDefault();
    const title = $("#goalTitle").value.trim();
    if (!title) return;
    try {
      await sb("/rest/v1/daily_goals", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: session.user.id, goal_date: today(), subject: $("#goalSubject").value, title, target_amount: $("#goalAmount").value.trim(), is_done: false }) });
      await loadAll();
      modal.close();
      renderToday();
    } catch (error) {
      alert("목표 저장 실패: " + error.message);
    }
  };
}

function renderStudy() {
  setHeader("학습", "타이머를 켜고 화면은 닫아도 됩니다.");
  if (state.timer) {
    renderTimer();
    return;
  }
  $("#screen").innerHTML = `${userStrip()}<section class="panel"><h2>개인공부</h2><p class="muted">시작 시간만 남기고, 공부는 책 위에서 계속됩니다.</p><button class="primary" id="selfBtn">타이머 시작</button></section><section class="panel light"><h2>학원 숙제</h2><p class="muted">이미 끝낸 숙제는 시간과 학습량만 남깁니다.</p><button class="secondary" id="academyBtn">숙제 기록</button></section>`;
  bindLogout();
  $("#selfBtn").onclick = openStartModal;
  $("#academyBtn").onclick = openAcademyModal;
}

function openStartModal() {
  const modal = $("#modal");
  modal.innerHTML = `<form class="modal-body" id="startForm"><h3>무엇을 공부할까요?</h3><div class="field"><label class="label">과목</label><select id="startSubject"><option>국어</option><option>영어</option><option selected>수학</option><option>과학</option><option>사회</option><option>기타</option></select></div><div class="field"><label class="label">문제집</label><select id="startBook"><option value="">문제집 없이 공부</option>${activeBooks().map((book) => `<option value="${book.id}">${escapeHTML(book.title)}</option>`).join("")}</select></div><div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">시작</button></div></form>`;
  modal.showModal();
  $("#startForm").onsubmit = (event) => {
    event.preventDefault();
    state.timer = { start: Date.now(), subject: $("#startSubject").value, bookId: $("#startBook").value || null };
    modal.close();
    screen = "study";
    render();
  };
}

function renderTimer() {
  const timer = state.timer;
  const book = timer.bookId ? bookById(timer.bookId) : null;
  $("#screen").innerHTML = `${userStrip()}<section class="panel timer"><div class="muted">${escapeHTML(timer.subject)}</div><h2>${book ? escapeHTML(book.title) : "문제집 없이 공부"}</h2><div class="timer-ring"><div class="time" id="timerTime">00:00:00</div></div><button class="danger" id="finishBtn">학습 종료</button></section>`;
  bindLogout();
  $("#finishBtn").onclick = openFinishModal;
  startTick();
}

function startTick() {
  clearInterval(tick);
  tick = setInterval(() => {
    if (!state?.timer) return;
    const sec = Math.floor((Date.now() - state.timer.start) / 1000);
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    const el = $("#timerTime");
    if (el) el.textContent = `${h}:${m}:${s}`;
  }, 500);
}

function openFinishModal() {
  const timer = state.timer;
  const startedAt = new Date(timer.start).toISOString();
  const endedAt = nowISO();
  const minutes = Math.max(1, Math.round((Date.now() - timer.start) / 60000));
  const modal = $("#modal");
  modal.innerHTML = `<form class="modal-body" id="finishForm"><h3>학습 종료</h3><p class="muted">${escapeHTML(timer.subject)} · ${minutes}분</p><div class="grid2"><div class="field"><label class="label">푼 문제</label><input id="solved" type="number" min="0" value="0"></div><div class="field"><label class="label">틀린 문제</label><input id="wrong" type="number" min="0" value="0"></div></div><div class="field"><label class="label">기억할 문제</label><input id="memory" placeholder="예: 148번, 조건 누락"></div><div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">저장</button></div></form>`;
  modal.showModal();

  $("#finishForm").onsubmit = async (event) => {
    event.preventDefault();
    const solved = Number($("#solved").value || 0);
    const wrong = Math.min(solved, Number($("#wrong").value || 0));

    try {
      const inserted = await sb("/rest/v1/study_sessions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: session.user.id, book_id: timer.bookId, subject: timer.subject, mode: "self", started_at: startedAt, ended_at: endedAt, minutes, solved_count: solved, wrong_count: wrong }) });

      if (timer.bookId) {
        const book = bookById(timer.bookId);
        await updateBookCounts(book, solved, wrong, minutes);
        const memo = $("#memory").value.trim();
        if (memo) {
          await sb("/rest/v1/memorable_mistakes", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: session.user.id, book_id: timer.bookId, study_session_id: Array.isArray(inserted) ? inserted[0]?.id : null, problem_label: memo, reason: "기억할 문제", memo, review_status: "needs_review" }) });
        }
      }

      state.timer = null;
      clearInterval(tick);
      await loadAll();
      modal.close();
      render();
    } catch (error) {
      alert("학습 기록 저장 실패: " + error.message);
    }
  };
}

async function updateBookCounts(book, solved, wrong, minutes) {
  if (!book) return;
  const total = Number(book.total_problems || 0);
  const nextSolved = Math.min(total, Number(book.solved_count || 0) + solved);
  const nextWrong = Number(book.wrong_count || 0) + wrong;
  const nextMinutes = Number(book.total_minutes || 0) + minutes;
  const nextStatus = total > 0 && nextSolved >= total ? "archived" : book.status || "active";

  await sb(`/rest/v1/books?id=eq.${book.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ solved_count: nextSolved, wrong_count: nextWrong, total_minutes: nextMinutes, status: nextStatus, archived_at: nextStatus === "archived" ? nowISO() : book.archived_at }) });
}

function openAcademyModal() {
  const modal = $("#modal");
  modal.innerHTML = `<form class="modal-body" id="academyForm"><h3>학원 숙제 기록</h3><div class="field"><label class="label">과목</label><select id="academySubject"><option>국어</option><option>영어</option><option selected>수학</option><option>과학</option><option>사회</option><option>기타</option></select></div><div class="field"><label class="label">문제집</label><select id="academyBook"><option value="">문제집 없음</option>${activeBooks().map((book) => `<option value="${book.id}">${escapeHTML(book.title)}</option>`).join("")}</select></div><div class="grid2"><div class="field"><label class="label">시간</label><input id="academyMinutes" type="number" min="0" value="50"></div><div class="field"><label class="label">푼 문제</label><input id="academySolved" type="number" min="0" value="0"></div></div><div class="field"><label class="label">틀린 문제</label><input id="academyWrong" type="number" min="0" value="0"></div><div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">저장</button></div></form>`;
  modal.showModal();

  $("#academyForm").onsubmit = async (event) => {
    event.preventDefault();
    const bookId = $("#academyBook").value || null;
    const minutes = Number($("#academyMinutes").value || 0);
    const solved = Number($("#academySolved").value || 0);
    const wrong = Math.min(solved, Number($("#academyWrong").value || 0));

    try {
      await sb("/rest/v1/study_sessions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: session.user.id, book_id: bookId, subject: $("#academySubject").value, mode: "academy", started_at: nowISO(), ended_at: nowISO(), minutes, solved_count: solved, wrong_count: wrong }) });
      if (bookId) await updateBookCounts(bookById(bookId), solved, wrong, minutes);
      await loadAll();
      modal.close();
      render();
    } catch (error) {
      alert("숙제 기록 저장 실패: " + error.message);
    }
  };
}

function renderBooks() {
  setHeader("문제집 행성", "Supabase DB에 저장됩니다.");
  const books = activeBooks();
  $("#screen").innerHTML = `${userStrip()}<div class="stack">${books.length ? books.map((book) => `<section class="panel light book" data-book="${book.id}">${coverHTML(book)}<div><div class="row"><div class="book-title">${escapeHTML(book.title)}</div><span class="pill">${progress(book)}%</span></div><div class="book-meta">${escapeHTML(book.publisher || "")} · ${escapeHTML(book.subject || "기타")}</div><div class="progress"><span style="width:${progress(book)}%"></span></div><div class="row book-meta"><span>${Number(book.solved_count || 0).toLocaleString()} / ${Number(book.total_problems || 0).toLocaleString()}문제</span><span>정답률 ${accuracy(book)}%</span></div></div></section>`).join("") : `<section class="panel light empty"><h2>등록된 문제집이 없습니다.</h2><p class="muted">도서 API 검색으로 첫 문제집을 추가하세요.</p></section>`}</div><button class="primary" id="addBookBtn" style="margin-top:14px">+ 문제집 검색 추가</button>`;
  bindLogout();
  document.querySelectorAll("[data-book]").forEach((el) => el.onclick = () => openBookDetail(el.dataset.book));
  $("#addBookBtn").onclick = openBookSearch;
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
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || data.error || data.detail || `HTTP ${response.status}`);
      if (!data.items?.length) {
        $("#searchResults").innerHTML = `<p class="muted">검색 결과가 없습니다.</p>`;
        return;
      }
      $("#searchResults").innerHTML = data.items.map((book, index) => `<div class="search-result" data-api-result="${index}">${coverHTML(book)}<div><strong>${escapeHTML(book.title)}</strong><br><small>${escapeHTML(book.publisher || "출판사 정보 없음")} · ${escapeHTML((book.authors || []).join(", ") || "저자 정보 없음")}</small></div></div>`).join("");
      document.querySelectorAll("[data-api-result]").forEach((el) => el.onclick = () => openRegisterBookModal(data.items[Number(el.dataset.apiResult)]));
    } catch (error) {
      $("#searchResults").innerHTML = `<p class="muted" style="color:#64748b">검색 실패: ${escapeHTML(error.message)}</p>`;
    }
  };

  $("#searchBtn").onclick = doSearch;
  doSearch();
}

function openRegisterBookModal(book) {
  const modal = $("#modal");
  modal.innerHTML = `<form class="modal-body" id="registerBookForm"><h3>문제집 등록</h3><div class="book" style="margin-bottom:14px">${coverHTML(book)}<div><strong>${escapeHTML(book.title)}</strong><p class="muted">${escapeHTML(book.publisher || "출판사 정보 없음")}<br>${escapeHTML(book.isbn || "ISBN 정보 없음")}</p></div></div><div class="field"><label class="label">과목</label><select id="registerSubject">${["국어", "영어", "수학", "과학", "사회", "기타"].map((subject) => `<option ${subject === book.subject ? "selected" : ""}>${subject}</option>`).join("")}</select></div><div class="field"><label class="label">전체 문제 수</label><input id="registerTotal" type="number" min="1" value="500"></div><div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">내 ORBIT에 추가</button></div></form>`;
  modal.showModal();

  $("#registerBookForm").onsubmit = async (event) => {
    event.preventDefault();
    try {
      await sb("/rest/v1/books", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: session.user.id, title: book.title, authors: book.authors || [], publisher: book.publisher || "", isbn: book.isbn || "", thumbnail_url: book.thumbnail || book.cover || "", source_url: book.url || "", subject: $("#registerSubject").value, total_problems: Number($("#registerTotal").value || 1), solved_count: 0, wrong_count: 0, total_minutes: 0, status: "active" }) });
      await loadAll();
      modal.close();
      renderBooks();
    } catch (error) {
      alert("문제집 등록 실패: " + error.message);
    }
  };
}

function openBookDetail(id) {
  const book = bookById(id);
  if (!book) return;
  const recent = state.sessions.filter((item) => item.book_id === id).slice(0, 5);
  const memoryCount = state.mistakes.filter((item) => item.book_id === id).length;
  const modal = $("#modal");
  modal.innerHTML = `<div class="modal-body"><div class="book">${coverHTML(book)}<div><h3 style="margin:0">${escapeHTML(book.title)}</h3><p class="muted">${escapeHTML(book.publisher || "")} · ${escapeHTML(book.subject || "기타")}<br>${escapeHTML(book.isbn || "")}</p></div></div><div class="progress"><span style="width:${progress(book)}%"></span></div><div class="statgrid"><div class="stat"><b>${Number(book.solved_count || 0).toLocaleString()}</b><small>풀이 문제</small></div><div class="stat"><b>${accuracy(book)}%</b><small>누적 정답률</small></div><div class="stat"><b>${Number(book.wrong_count || 0).toLocaleString()}</b><small>누적 오답</small></div><div class="stat"><b>${memoryCount}</b><small>기억할 문제</small></div></div><h4>최근 기록</h4>${recent.length ? recent.map((item) => `<p>${escapeHTML((item.started_at || "").slice(5, 10))} · ${Number(item.solved_count || 0)}문제 · ${Number(item.wrong_count || 0)}오답 · ${Number(item.minutes || 0)}분</p>`).join("") : `<p class="muted">아직 기록이 없습니다.</p>`}<div class="modal-actions"><button class="secondary" onclick="document.querySelector('#modal').close()">닫기</button><button class="danger" id="deleteBookBtn">문제집 삭제</button></div></div>`;
  modal.showModal();

  $("#deleteBookBtn").onclick = async () => {
    if (!confirm(`"${book.title}" 문제집과 연결 기록을 삭제할까요?`)) return;
    try {
      await sb(`/rest/v1/books?id=eq.${book.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await loadAll();
      modal.close();
      renderBooks();
    } catch (error) {
      alert("문제집 삭제 실패: " + error.message);
    }
  };
}

function renderReport() {
  setHeader("리포트", "웹 DB 기준으로 계산합니다.");
  const total = state.sessions.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
  const self = state.sessions.filter((item) => item.mode === "self").reduce((sum, item) => sum + Number(item.minutes || 0), 0);
  const solved = state.sessions.reduce((sum, item) => sum + Number(item.solved_count || 0), 0);
  const wrong = state.sessions.reduce((sum, item) => sum + Number(item.wrong_count || 0), 0);

  $("#screen").innerHTML = `${userStrip()}<section class="panel light"><div class="statgrid"><div class="stat"><b>${fmtMin(total)}</b><small>총 학습</small></div><div class="stat"><b>${total ? Math.round((self / total) * 100) : 0}%</b><small>자기주도</small></div><div class="stat"><b>${solved.toLocaleString()}</b><small>풀이 문제</small></div><div class="stat"><b>${solved ? (((solved - wrong) / solved) * 100).toFixed(1) : "0.0"}%</b><small>정답률</small></div></div></section><p class="note">현재 로그인 사용자의 Supabase 데이터만 계산합니다.</p>`;
  bindLogout();
}

function renderArchive() {
  setHeader("기록관", "끝낸 문제집은 웹 DB에 남습니다.");
  const books = archivedBooks();
  $("#screen").innerHTML = `${userStrip()}${books.length ? books.map((book) => `<section class="panel light book">${coverHTML(book)}<div><h3>${escapeHTML(book.title)}</h3><p class="muted">${Number(book.total_problems || 0).toLocaleString()}문제 · 정답률 ${accuracy(book)}%</p></div></section>`).join("") : `<section class="panel empty"><h2>아직 완주한 행성이 없습니다.</h2><p class="muted">한 권을 끝내면 이곳에 보관됩니다.</p></section>`}`;
  bindLogout();
}
