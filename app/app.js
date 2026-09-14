
const STORAGE_KEY = "study-orbit-v02";
const $ = (s) => document.querySelector(s);
const today = () => new Date().toISOString().slice(0, 10);
const fmtMin = (min) => `${Math.floor(min / 60)}시간 ${min % 60}분`;

const mockBooks = [
  { title:"최상위 수학 6-2", publisher:"디딤돌", subject:"수학", total:1240, cover:"#math" },
  { title:"블랙라벨 중학 수학 1-1", publisher:"진학사", subject:"수학", total:980, cover:"#black" },
  { title:"오투 중등 과학 1-1", publisher:"비상교육", subject:"과학", total:760, cover:"#science" },
  { title:"쎈 중등 수학 1-1", publisher:"좋은책신사고", subject:"수학", total:1120, cover:"#ssen" },
  { title:"자이스토리 영어 독해", publisher:"수경출판사", subject:"영어", total:420, cover:"#english" }
];

const seed = {
  goals:[
    {id:"g1",subject:"수학",title:"최상위 수학 6-2",amount:"30문제",done:false},
    {id:"g2",subject:"과학",title:"오투 중등 과학",amount:"20문제",done:false},
    {id:"g3",subject:"영어",title:"단어",amount:"100개",done:false}
  ],
  books:[
    {id:"b1",title:"최상위 수학 6-2",publisher:"디딤돌",subject:"수학",total:1240,solved:842,wrong:73,minutes:1274,memorable:8,archived:false,cover:"#math"},
    {id:"b2",title:"오투 중등 과학 1-1",publisher:"비상교육",subject:"과학",total:760,solved:312,wrong:38,minutes:620,memorable:2,archived:false,cover:"#science"}
  ],
  sessions:[
    {date:today(),subject:"수학",bookId:"b1",minutes:62,solved:28,wrong:3,mode:"self"},
    {date:today(),subject:"과학",bookId:"b2",minutes:40,solved:20,wrong:2,mode:"academy"}
  ],
  notes:[],
  timer:null
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || seed;
let screen = "today";
let tick = null;

function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function setHeader(title, sub="기록은 짧게, 학습은 깊게.") {
  $("#screenTitle").textContent = title;
  $("#screenSub").textContent = sub;
}
function activeBooks(){ return state.books.filter(b => !b.archived); }
function archivedBooks(){ return state.books.filter(b => b.archived); }
function bookById(id){ return state.books.find(b => b.id === id); }
function progress(b){ return Math.min(100, Math.round((b.solved / b.total) * 100)); }
function accuracy(b){ return b.solved ? (((b.solved - b.wrong) / b.solved) * 100).toFixed(1) : "0.0"; }
function todaySessions(){ return state.sessions.filter(s => s.date === today()); }
function subjectClass(subject){
  if(subject === "수학") return "math";
  if(subject === "과학") return "science";
  if(subject === "영어") return "eng";
  return "etc";
}
function coverStyle(key){
  const map = {
    "#math":"linear-gradient(145deg,#2563eb,#7c3aed)",
    "#black":"linear-gradient(145deg,#020617,#334155)",
    "#science":"linear-gradient(145deg,#059669,#22c55e)",
    "#ssen":"linear-gradient(145deg,#dc2626,#f97316)",
    "#english":"linear-gradient(145deg,#f59e0b,#ec4899)"
  };
  return map[key] || "linear-gradient(145deg,#1d4ed8,#7c3aed)";
}
function coverHTML(b){
  if((b.cover || "").startsWith("http")) return `<div class="cover"><img src="${b.cover}" alt="${b.title} 표지"></div>`;
  return `<div class="cover" style="background:${coverStyle(b.cover)}">${b.subject}<br>${b.title}</div>`;
}

function render(){
  document.querySelectorAll(".tabbar button").forEach(b => b.classList.toggle("active", b.dataset.screen === screen));
  if(screen === "today") renderToday();
  if(screen === "study") renderStudy();
  if(screen === "books") renderBooks();
  if(screen === "report") renderReport();
  if(screen === "archive") renderArchive();
}

function renderToday(){
  setHeader("오늘의 궤도", "공부 전 5초, 공부 후 20초.");
  const selfMin = todaySessions().filter(s => s.mode === "self").reduce((a,s)=>a+s.minutes,0);
  $("#screen").innerHTML = `
    <section class="panel">
      <div class="row">
        <div>
          <div class="muted">${new Intl.DateTimeFormat("ko-KR",{month:"long",day:"numeric",weekday:"long"}).format(new Date())}</div>
          <h2 style="margin:5px 0 0">오늘 지나갈 행성</h2>
        </div>
        <span class="pill">${state.goals.filter(g=>g.done).length}/${state.goals.length}</span>
      </div>
      <div class="stack" style="margin-top:14px">
        ${state.goals.map(g => `
          <div class="orbit-card" data-goal="${g.id}">
            <div class="planet ${subjectClass(g.subject)}"></div>
            <div><strong>${g.subject} · ${g.title}</strong><small>${g.amount}</small></div>
            <div class="check ${g.done ? "done" : ""}">${g.done ? "✓" : ""}</div>
          </div>
        `).join("")}
      </div>
    </section>
    <section class="panel light">
      <div class="row">
        <div>
          <div class="muted">오늘 개인공부</div>
          <div style="font-size:30px;font-weight:950">${fmtMin(selfMin)}</div>
        </div>
        <span class="pill">${todaySessions().length}회 기록</span>
      </div>
    </section>
    <button class="primary big" id="startBtn">학습 궤도 진입</button>
    <p class="note">ORBIT는 공부 중간에 말을 걸지 않습니다. 시작과 끝만 단정하게 정리합니다.</p>
  `;
  document.querySelectorAll("[data-goal]").forEach(el => {
    el.onclick = () => {
      const g = state.goals.find(x => x.id === el.dataset.goal);
      g.done = !g.done;
      save(); renderToday();
    };
  });
  $("#startBtn").onclick = () => openStartModal();
}

function renderStudy(){
  setHeader("학습", "타이머를 켜고 화면은 닫아도 됩니다.");
  if(state.timer) return renderTimer();
  $("#screen").innerHTML = `
    <section class="panel">
      <h2>개인공부</h2>
      <p class="muted">시작 시간만 남기고, 공부는 책 위에서 계속됩니다.</p>
      <button class="primary" id="selfBtn">타이머 시작</button>
    </section>
    <section class="panel light">
      <h2>학원 숙제</h2>
      <p class="muted">이미 끝낸 숙제는 시간과 학습량만 남깁니다.</p>
      <button class="secondary" id="academyBtn">숙제 기록</button>
    </section>`;
  $("#selfBtn").onclick = () => openStartModal();
  $("#academyBtn").onclick = () => openAcademyModal();
}

function openStartModal(){
  const modal = $("#modal");
  modal.innerHTML = `
    <form class="modal-body" id="startForm">
      <h3>무엇을 공부할까요?</h3>
      <div class="field"><label class="label">과목</label>
        <select id="startSubject"><option>국어</option><option>영어</option><option selected>수학</option><option>과학</option><option>사회</option><option>기타</option></select>
      </div>
      <div class="field"><label class="label">문제집</label>
        <select id="startBook"><option value="">문제집 없이 공부</option>${activeBooks().map(b=>`<option value="${b.id}">${b.title}</option>`).join("")}</select>
      </div>
      <div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">시작</button></div>
    </form>`;
  modal.showModal();
  $("#startForm").onsubmit = e => {
    e.preventDefault();
    state.timer = { start:Date.now(), subject:$("#startSubject").value, bookId:$("#startBook").value || null };
    save(); modal.close(); screen = "study"; render();
  };
}

function renderTimer(){
  const t = state.timer;
  const book = t.bookId ? bookById(t.bookId) : null;
  $("#screen").innerHTML = `
    <section class="panel timer">
      <div class="muted">${t.subject}</div>
      <h2>${book ? book.title : "문제집 없이 공부"}</h2>
      <div class="timer-ring"><div class="time" id="timerTime">00:00:00</div></div>
      <button class="danger" id="finishBtn">학습 종료</button>
    </section>`;
  $("#finishBtn").onclick = openFinishModal;
  startTick();
}
function startTick(){
  clearInterval(tick);
  tick = setInterval(() => {
    if(!state.timer) return;
    const sec = Math.floor((Date.now() - state.timer.start) / 1000);
    const h = String(Math.floor(sec / 3600)).padStart(2,"0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2,"0");
    const s = String(sec % 60).padStart(2,"0");
    const el = $("#timerTime");
    if(el) el.textContent = `${h}:${m}:${s}`;
  }, 500);
}

function openFinishModal(){
  const t = state.timer;
  const min = Math.max(1, Math.round((Date.now() - t.start) / 60000));
  const modal = $("#modal");
  modal.innerHTML = `
    <form class="modal-body" id="finishForm">
      <h3>학습 종료</h3>
      <p class="muted">${t.subject} · ${min}분</p>
      <div class="grid2">
        <div class="field"><label class="label">푼 문제</label><input id="solved" type="number" min="0" value="0"></div>
        <div class="field"><label class="label">틀린 문제</label><input id="wrong" type="number" min="0" value="0"></div>
      </div>
      <div class="field"><label class="label">기억할 문제 선택 기록</label><input id="memory" placeholder="예: 148번, 조건 누락"></div>
      <div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">저장</button></div>
    </form>`;
  modal.showModal();
  $("#finishForm").onsubmit = e => {
    e.preventDefault();
    const solved = Number($("#solved").value || 0);
    const wrong = Math.min(solved, Number($("#wrong").value || 0));
    state.sessions.push({date:today(), subject:t.subject, bookId:t.bookId, minutes:min, solved, wrong, mode:"self"});
    if(t.bookId){
      const b = bookById(t.bookId);
      b.solved = Math.min(b.total, b.solved + solved);
      b.wrong += wrong; b.minutes += min;
      const memo = $("#memory").value.trim();
      if(memo){ b.memorable++; state.notes.push({bookId:b.id,date:today(),memo}); }
      if(b.solved >= b.total) b.archived = true;
    }
    state.timer = null; save(); clearInterval(tick); modal.close(); render();
  };
}

function openAcademyModal(){
  const modal = $("#modal");
  modal.innerHTML = `
    <form class="modal-body" id="academyForm">
      <h3>학원 숙제 기록</h3>
      <div class="field"><label class="label">과목</label><select id="aSubject"><option>국어</option><option>영어</option><option selected>수학</option><option>과학</option><option>사회</option><option>기타</option></select></div>
      <div class="field"><label class="label">문제집</label><select id="aBook"><option value="">문제집 없음</option>${activeBooks().map(b=>`<option value="${b.id}">${b.title}</option>`).join("")}</select></div>
      <div class="grid2">
        <div class="field"><label class="label">시간</label><input id="aMin" type="number" min="0" value="50"></div>
        <div class="field"><label class="label">푼 문제</label><input id="aSolved" type="number" min="0" value="0"></div>
      </div>
      <div class="field"><label class="label">틀린 문제</label><input id="aWrong" type="number" min="0" value="0"></div>
      <div class="modal-actions"><button type="button" class="secondary" onclick="document.querySelector('#modal').close()">취소</button><button class="primary">저장</button></div>
    </form>`;
  modal.showModal();
  $("#academyForm").onsubmit = e => {
    e.preventDefault();
    const bookId = $("#aBook").value || null;
    const minutes = Number($("#aMin").value || 0);
    const solved = Number($("#aSolved").value || 0);
    const wrong = Math.min(solved, Number($("#aWrong").value || 0));
    state.sessions.push({date:today(), subject:$("#aSubject").value, bookId, minutes, solved, wrong, mode:"academy"});
    if(bookId){
      const b = bookById(bookId);
      b.solved = Math.min(b.total, b.solved + solved);
      b.wrong += wrong; b.minutes += minutes;
      if(b.solved >= b.total) b.archived = true;
    }
    save(); modal.close(); render();
  };
}

function renderBooks(){
  setHeader("문제집 행성", "표지와 진도가 같이 보이게.");
  const books = activeBooks();
  $("#screen").innerHTML = `
    <div class="stack">
      ${books.map(b => `
        <section class="panel light book" data-book="${b.id}">
          ${coverHTML(b)}
          <div>
            <div class="row"><div class="book-title">${b.title}</div><span class="pill">${progress(b)}%</span></div>
            <div class="book-meta">${b.publisher || ""} · ${b.subject}</div>
            <div class="progress"><span style="width:${progress(b)}%"></span></div>
            <div class="row book-meta"><span>${b.solved.toLocaleString()} / ${b.total.toLocaleString()}문제</span><span>정답률 ${accuracy(b)}%</span></div>
          </div>
        </section>
      `).join("")}
    </div>
    <button class="primary" id="addBookBtn" style="margin-top:14px">+ 문제집 검색 추가</button>
  `;
  document.querySelectorAll("[data-book]").forEach(el => el.onclick = () => openBookDetail(el.dataset.book));
  $("#addBookBtn").onclick = openBookSearch;
}

function openBookSearch(){
  const modal = $("#modal");
  modal.innerHTML = `
    <div class="modal-body">
      <h3>문제집 검색</h3>
      <div class="field"><label class="label">검색어</label><input id="bookQuery" value="최상위 수학 6-2"></div>
      <button class="primary" id="searchBtn">표지 검색</button>
      <div id="searchResults"></div>
      <p class="note" style="color:#64748b;background:#f8fafc;border-color:#e2e8f0;margin-top:12px">
        v0.3은 로컬 프록시를 통해 카카오 이미지 검색을 호출합니다. API 오류 시 mock 결과로 자동 전환합니다.
      </p>
      <button class="secondary" style="margin-top:10px" onclick="document.querySelector('#modal').close()">닫기</button>
    </div>`;
  modal.showModal();

  const doSearch = async () => {
    const q = $("#bookQuery").value.trim();
    $("#searchResults").innerHTML = `<p class="muted">표지를 찾는 중입니다...</p>`;

    try {
      const response = await fetch(`/api/book-cover?q=${encodeURIComponent(q)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        throw new Error("NO_RESULTS");
      }

      $("#searchResults").innerHTML = data.items.map((b, i) => `
        <div class="search-result" data-api-result="${i}">
          ${coverHTML({title:b.title, subject:b.subject || "기타", cover:b.cover})}
          <div>
            <strong>${b.title}</strong><br>
            <small>${b.source || "Kakao"} · ${b.subject || "기타"} · 표지 후보</small>
          </div>
        </div>
      `).join("");

      document.querySelectorAll("[data-api-result]").forEach(el => {
        el.onclick = () => registerSearchedBook(data.items[Number(el.dataset.apiResult)]);
      });
    } catch (error) {
      const result = mockBooks.filter(b => !q || b.title.includes(q) || b.subject.includes(q)).slice(0,5);
      $("#searchResults").innerHTML = `
        <p class="muted" style="color:#64748b">API 검색이 되지 않아 mock 결과를 보여줍니다.</p>
        ${result.map((b,i) => `
          <div class="search-result" data-result="${i}">
            ${coverHTML(b)}
            <div><strong>${b.title}</strong><br><small>${b.publisher} · ${b.subject} · 예상 ${b.total}문제</small></div>
          </div>
        `).join("") || `<p class="muted">검색 결과가 없습니다.</p>`}
      `;
      document.querySelectorAll("[data-result]").forEach(el => el.onclick = () => registerMockBook(result[Number(el.dataset.result)]));
    }
  };

  $("#searchBtn").onclick = doSearch;
  doSearch();
}

function registerSearchedBook(book){
  const total = prompt("전체 문제 수를 입력해 주세요. 표지 검색으로는 문제 수를 정확히 알 수 없어 직접 확인합니다.", "500");
  if(!total) return;
  state.books.push({
    id:"b"+Date.now(),
    title:book.title,
    publisher:book.source || "Kakao Image Search",
    subject:book.subject || "기타",
    total:Number(total),
    solved:0,
    wrong:0,
    minutes:0,
    memorable:0,
    archived:false,
    cover:book.cover
  });
  save(); $("#modal").close(); renderBooks();
}

function registerMockBook(book){
  const total = prompt("전체 문제 수를 확인해 주세요.", String(book.total));
  if(!total) return;
  state.books.push({
    id:"b"+Date.now(),
    title:book.title,
    publisher:book.publisher,
    subject:book.subject,
    total:Number(total),
    solved:0, wrong:0, minutes:0, memorable:0, archived:false, cover:book.cover
  });
  save(); $("#modal").close(); renderBooks();
}

function openBookDetail(id){
  const b = bookById(id);
  const modal = $("#modal");
  const recent = state.sessions.filter(s => s.bookId === id).slice(-5).reverse();
  modal.innerHTML = `
    <div class="modal-body">
      <div class="book">${coverHTML(b)}<div><h3 style="margin:0">${b.title}</h3><p class="muted">${b.publisher || ""} · ${b.subject}</p></div></div>
      <div class="progress"><span style="width:${progress(b)}%"></span></div>
      <div class="statgrid">
        <div class="stat"><b>${b.solved}</b><small>풀이 문제</small></div>
        <div class="stat"><b>${accuracy(b)}%</b><small>누적 정답률</small></div>
        <div class="stat"><b>${b.wrong}</b><small>누적 오답</small></div>
        <div class="stat"><b>${b.memorable}</b><small>기억할 문제</small></div>
      </div>
      <h4>최근 기록</h4>
      ${recent.map(s => `<p>${s.date.slice(5)} · ${s.solved}문제 · ${s.wrong}오답 · ${s.minutes}분</p>`).join("") || "<p class='muted'>아직 기록이 없습니다.</p>"}
      <div class="modal-actions">
        <button class="secondary" onclick="document.querySelector('#modal').close()">닫기</button>
        <button class="danger" id="deleteBookBtn">문제집 삭제</button>
      </div>
    </div>`;
  modal.showModal();
  $("#deleteBookBtn").onclick = () => deleteBook(id);
}


function deleteBook(id){
  const book = bookById(id);
  if(!book) return;

  const hasSessions = state.sessions.some(s => s.bookId === id);
  const message = hasSessions
    ? `"${book.title}" 문제집과 연결된 학습 기록도 함께 삭제됩니다.\n\n정말 삭제할까요?`
    : `"${book.title}" 문제집을 삭제할까요?`;

  if(!confirm(message)) return;

  state.books = state.books.filter(b => b.id !== id);
  state.sessions = state.sessions.filter(s => s.bookId !== id);
  state.notes = state.notes.filter(n => n.bookId !== id);

  save();
  document.querySelector("#modal").close();
  renderBooks();
}

function renderReport(){
  setHeader("리포트", "매일 감시하지 않고, 주간에 돌아보기.");
  const data = state.sessions.slice(-21);
  const total = data.reduce((a,s)=>a+s.minutes,0);
  const self = data.filter(s=>s.mode==="self").reduce((a,s)=>a+s.minutes,0);
  const solved = data.reduce((a,s)=>a+s.solved,0);
  const wrong = data.reduce((a,s)=>a+s.wrong,0);
  $("#screen").innerHTML = `
    <section class="panel light">
      <div class="statgrid">
        <div class="stat"><b>${fmtMin(total)}</b><small>총 학습</small></div>
        <div class="stat"><b>${total ? Math.round(self/total*100) : 0}%</b><small>자기주도</small></div>
        <div class="stat"><b>${solved}</b><small>풀이 문제</small></div>
        <div class="stat"><b>${solved ? (((solved-wrong)/solved)*100).toFixed(1) : 0}%</b><small>정답률</small></div>
      </div>
    </section>
    <p class="note">v0.2 리포트는 최소 통계만 유지합니다. 공부를 더 보게 만드는 그래프는 아직 넣지 않습니다.</p>`;
}

function renderArchive(){
  setHeader("기록관", "끝낸 문제집은 나의 학습 역사로 남습니다.");
  const books = archivedBooks();
  $("#screen").innerHTML = books.length ? books.map(b => `
    <section class="panel light book">${coverHTML(b)}<div><h3>${b.title}</h3><p class="muted">${b.total}문제 · 정답률 ${accuracy(b)}% · 기억할 문제 ${b.memorable}개</p></div></section>
  `).join("") : `<section class="panel empty"><h2>아직 완주한 행성이 없습니다.</h2><p class="muted">한 권을 끝내면 이곳에 보관됩니다.</p></section>`;
}

document.querySelectorAll(".tabbar button").forEach(btn => {
  btn.onclick = () => { screen = btn.dataset.screen; render(); };
});
render();
