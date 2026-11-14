// Exam page (?assignment=ID): intro -> timed answering -> one hand-in -> score and right/wrong per question.
//  - The clock starts on the server when the child presses start (rpc_start_exam); the server also refuses late hand-ins.
//  - Answers stay on this device while the child works (so a refresh keeps them) and can be changed freely;
//    they are sent together at the end (rpc_submit_exam). No answers, hints or feedback are shown during the exam.
//  - Right answers and explanations open after the due date (attempt.html), decided by the server.
import { el } from "./dom.js?v=9d63c7c7";
import { rpc, ApiError } from "./api.js?v=9d63c7c7";
import { requireStudent } from "./session.js?v=9d63c7c7";
import { renderQuestion, focusQuestion } from "./qview.js?v=9d63c7c7";
import { clockOffset, remainingSeconds, formatClock, lowTime, buildItems } from "./examtime.js?v=9d63c7c7";

const asgId = new URLSearchParams(location.search).get("assignment");
const app = document.getElementById("app");
const me = await requireStudent();
const sid = me.student_id;
document.getElementById("who").textContent = me.nickname;

const key = "lg2-exam-" + sid + "-" + asgId;
const load = () => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
const save = s => localStorage.setItem(key, JSON.stringify(s));
let store = load();                              // { attemptUuid, attemptId, questions, deadline, offset, answers }
if (!store.attemptUuid) { store.attemptUuid = crypto.randomUUID(); store.answers = {}; save(store); }

const put = (...kids) => app.replaceChildren(...kids.flat().filter(Boolean));
const fmt = iso => new Date(iso).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const back = () => el("div", { class: "row" }, el("a", { class: "btn", href: "map.html" }, "回地圖"));
const note = (cls, text) => el("p", { class: "msg " + cls }, text);
function fail(e) {
  if (e instanceof ApiError && e.code === "session_invalid") return;
  put(el("div", { class: "card empty" }, note("warn", (e && e.friendly) || "載入失敗，請稍後再試。"), back()));
}

if (!asgId) fail(new ApiError("not_found", "not_found"));
else {
  try { await intro(); } catch (e) { fail(e); }
}

/* ---------- intro ---------- */
async function intro() {
  const info = await rpc("rpc_exam_info", { p_assignment_id: asgId });
  const a = info.assignment;
  if (info.attempt && info.attempt.finished) return showFinishedFromServer(info.attempt);
  const resume = !!info.attempt;
  const can = resume || a.open_now;
  put(el("div", { class: "card" },
    el("h2", null, "📝 " + a.title),
    el("ul", { class: "rules" },
      el("li", null, "共 " + info.total + " 題"),
      el("li", null, a.time_limit_min ? "限時 " + a.time_limit_min + " 分鐘；按下開始就開始計時，不能暫停" : "不限時"),
      a.due_at ? el("li", null, "截止時間：" + fmt(a.due_at)) : null,
      el("li", null, "答完可以回前面的題目修改；按「交卷」才會送出，交卷後不能再改"),
      el("li", null, "交卷後只會看到分數和每題對錯，正確答案和詳解要等月考截止後才開放"),
      el("li", null, "請保持網路連線，時間到會自動交卷")),
    resume ? note("warn", "你已經開始這份月考了，計時沒有停。按「繼續作答」回到考卷。") : null,
    !can ? note("warn", info.assignment.is_open ? "這份月考還沒開始或已經截止。" : "這份月考已經關閉。") : null,
    el("div", { class: "row" }, el("button", { disabled: !can, onclick: start }, resume ? "繼續作答" : "開始月考"), el("a", { class: "btn ghost", href: "map.html" }, "回地圖"))));
}

/* ---------- start / resume ---------- */
async function start() {
  try {
    const sentAt = Date.now();
    const data = await rpc("rpc_start_exam", { p_assignment_id: asgId, p_attempt_client_uuid: store.attemptUuid, p_device: navigator.userAgent.slice(0, 60) });
    if (data.finished) return showFinishedFromServer(data.attempt, data.expired);
    // Keep the question order the child first saw (the server shuffles the options on every request).
    if (store.attemptId !== data.attempt.id || !store.questions) { store.questions = data.questions; store.answers = {}; }
    store.attemptId = data.attempt.id;
    store.deadline = data.attempt.deadline;
    store.offset = clockOffset(data.server_now, Math.round((sentAt + Date.now()) / 2));
    save(store);
    run(data.assignment.title);
  } catch (e) { fail(e); }
}

/* ---------- answering ---------- */
function run(title) {
  const qs = store.questions;
  let idx = 0, timer = null, handing = false, confirmBox = false, retryNote = "", nextRetryAt = 0;
  const answers = store.answers;

  const left = () => remainingSeconds(store.deadline, store.offset, Date.now());
  const answeredCount = () => qs.filter(q => answers[q.question_code] != null && answers[q.question_code] !== "").length;

  const clock = el("span", { class: "exam-clock", role: "timer" });
  function tick() {
    const s = left();
    if (s === null) { clock.textContent = "不限時"; return; }
    clock.textContent = "⏱ " + formatClock(s);
    clock.classList.toggle("low", lowTime(s));
    if (s <= 0 && !handing && Date.now() >= nextRetryAt) handIn(true);   // after a failed hand-in, retry every 8 seconds
  }

  function render() {
    const q = qs[idx];
    const view = renderQuestion(q, {
      index: idx + 1, total: qs.length, hints: [], noSubmit: true, noReport: true, initial: answers[q.question_code],
      onChange: r => { if (r === null) delete answers[q.question_code]; else answers[q.question_code] = r; save(store); nav(); },
    });
    const prev = el("button", { class: "ghost", disabled: idx === 0, onclick: () => { idx--; render(); } }, "← 上一題");
    const next = el("button", { class: "ghost", disabled: idx === qs.length - 1, onclick: () => { idx++; render(); } }, "下一題 →");
    put(
      el("div", { class: "card exam-head" }, el("b", null, title), clock, el("span", { class: "muted", id: "exam-count" })),
      navBox(),
      view.root,
      el("div", { class: "row exam-nav" }, prev, next, el("button", { class: "go", disabled: handing, onclick: () => { confirmBox = true; render(); } }, "交卷")),
      confirmBox ? handBox() : null,
      retryNote ? note("warn", retryNote) : null);
    nav(); tick();
    focusQuestion(view.root);
  }

  // Question numbers: answered ones are filled, the current one has an outline.
  function navBox() {
    return el("div", { class: "qnav", role: "group", "aria-label": "題號" }, qs.map((q, i) =>
      el("button", { class: "qn" + (answers[q.question_code] != null && answers[q.question_code] !== "" ? " done" : "") + (i === idx ? " cur" : ""),
        "aria-label": "第 " + (i + 1) + " 題" + (answers[q.question_code] != null && answers[q.question_code] !== "" ? "（已作答）" : "（還沒作答）"),
        onclick: () => { idx = i; render(); } }, String(i + 1))));
  }
  function nav() {
    const c = document.getElementById("exam-count");
    if (c) c.textContent = "已作答 " + answeredCount() + " / " + qs.length;
    document.querySelectorAll(".qn").forEach((b, i) => b.classList.toggle("done", answers[qs[i].question_code] != null && answers[qs[i].question_code] !== ""));
  }

  function handBox() {
    const blank = qs.length - answeredCount();
    return el("div", { class: "card" },
      el("p", { class: blank ? "msg warn" : "msg ok" }, blank ? "還有 " + blank + " 題沒有作答，沒答的題目算答錯。確定要交卷嗎？" : "全部都答了。確定要交卷嗎？交卷後不能再改。"),
      el("div", { class: "row" },
        el("button", { class: "go", onclick: () => handIn(false) }, "確定交卷"),
        el("button", { class: "ghost", onclick: () => { confirmBox = false; render(); } }, "回去檢查")));
  }

  async function handIn(auto) {
    if (handing) return;
    handing = true; confirmBox = false;
    retryNote = auto ? "時間到了，正在交卷…" : "正在交卷…";
    render();
    try {
      const r = await rpc("rpc_submit_exam", { p_assignment_id: asgId, p_items: buildItems(qs, answers) });
      clearInterval(timer);
      localStorage.removeItem(key);
      if (r.ok === false) showResult(r.attempt, null, "時間已經過了，這次的答案沒有收到。");
      else showResult(r.attempt, r.results, auto ? "時間到，已自動交卷。" : "已交卷。");
    } catch (e) {
      if (e instanceof ApiError && e.code === "session_invalid") return;
      handing = false; nextRetryAt = Date.now() + 8000;
      retryNote = "交卷沒有成功（" + ((e && e.friendly) || "網路不穩") + "）。你的答案還在，請確認網路後再按「交卷」；越快越好，太晚伺服器就不收了。";
      render();
    }
  }

  timer = setInterval(tick, 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  render();
}

/* ---------- results ---------- */
function showResult(attempt, results, headline) {
  put(el("div", { class: "card" },
    el("h2", null, "📝 月考結果"),
    note(results ? "ok" : "warn", headline),
    el("p", { class: "big" }, (attempt.score ?? 0) + " 分"),
    el("p", { class: "muted" }, attempt.correct + " / " + attempt.total + " 題答對"),
    results ? el("div", { class: "qnav", role: "list", "aria-label": "每題對錯" }, results.map((r, i) =>
      el("span", { class: "qn " + (r.is_correct ? "right" : "wrong"), role: "listitem", title: r.answered ? "" : "沒有作答" }, (i + 1) + (r.is_correct ? "✔" : "✘")))) : null,
    el("p", { class: "muted" }, "正確答案和詳解會在月考截止後開放，到時候可以從「看詳情」查看。"),
    el("div", { class: "row" },
      attempt.id ? el("a", { class: "btn", href: "attempt.html?id=" + encodeURIComponent(attempt.id) }, "看詳情") : null,
      el("a", { class: "btn ghost", href: "map.html" }, "回地圖"))));
}

function showFinishedFromServer(attempt, expired) {
  localStorage.removeItem(key);
  put(el("div", { class: "card" },
    el("h2", null, "📝 月考已交卷"),
    expired ? note("warn", "時間已經過了，這份月考已經結算。") : null,
    el("p", { class: "big" }, (attempt.score ?? 0) + " 分"),
    attempt.total != null ? el("p", { class: "muted" }, attempt.correct + " / " + attempt.total + " 題答對") : null,
    el("div", { class: "row" },
      attempt.id ? el("a", { class: "btn", href: "attempt.html?id=" + encodeURIComponent(attempt.id) }, "看詳情") : null,
      el("a", { class: "btn ghost", href: "map.html" }, "回地圖"))));
}
