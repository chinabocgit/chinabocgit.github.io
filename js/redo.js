// Fix wrong answers: re-practise the open wrong questions of one level. Instant client feedback (like practice);
// the run is sent to the server as a normal practice, and the server marks a question "fixed" when it is answered correctly.
import { el } from "./dom.js?v=6c9c2d82";
import { rpc, ApiError } from "./api.js?v=6c9c2d82";
import { requireStudent } from "./session.js?v=6c9c2d82";
import { gradeAnswer, describeAnswer } from "./grade.js?v=6c9c2d82";
import { enqueue, flush } from "./queue.js?v=6c9c2d82";
import { renderQuestion, focusQuestion } from "./qview.js?v=6c9c2d82";
import { playCorrect, playWrong } from "./sound.js?v=6c9c2d82";

const MAX_PER_RUN = 10;
const app = document.getElementById("app");
const me = await requireStudent();
const sid = me.student_id;
document.getElementById("who").textContent = me.nickname;
const levelId = new URLSearchParams(location.search).get("level");
const put = (parent, ...kids) => parent.replaceChildren(...kids.flat().filter(Boolean));
const shuffle = a => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

function message(cls, text, ...extra) {
  put(app, el("div", { class: "card empty" }, el("p", { class: "msg " + cls }, text), ...extra,
    el("div", { class: "row" }, el("a", { class: "btn", href: "wrongbook.html" }, "回錯題本"))));
}

function shufflePayload(q) {
  const p = JSON.parse(JSON.stringify(q.payload || {}));
  if (q.qtype === "choice" && p.shuffle !== false && Array.isArray(p.options)) p.options = shuffle(p.options);
  if (q.qtype === "order" && Array.isArray(p.items)) p.items = shuffle(p.items);
  return p;
}

let run = null;   // { attemptUuid, questions:[{...}], answers:{code:{...}}, wbBefore }

async function start() {
  if (!levelId) return message("warn", "沒有指定要訂正的關卡。");
  let wb, pool;
  try {
    [wb, pool] = await Promise.all([rpc("rpc_my_wrongbook", { p_only_open: true }), rpc("rpc_practice_pool", { p_level_id: levelId })]);
  } catch (e) {
    if (e instanceof ApiError && e.code === "session_invalid") return;
    return message("err", e.friendly || "載入失敗，請稍後再試。");
  }
  const open = new Set(wb.items.filter(i => !i.locked).map(i => i.question_code));
  // The pool carries data cards, hints and answers for questions that are not locked by an assignment.
  const qs = shuffle(pool.questions.filter(q => open.has(q.question_code) && !q.locked && q.answer)).slice(0, MAX_PER_RUN);
  if (!qs.length) return message("ok", "這一關沒有可以訂正的錯題了！");
  run = { attemptUuid: crypto.randomUUID(), questions: qs.map(q => ({ ...q, payload: shufflePayload(q) })), answers: {}, openBefore: wb.open };
  next();
}

function next() {
  const idx = run.questions.findIndex(q => !run.answers[q.question_code]);
  if (idx === -1) return finish();
  const q = run.questions[idx];
  const view = renderQuestion(q, {
    index: idx + 1, total: run.questions.length, hints: q.hints,
    onSubmit(resp, hintsUsed, seconds) {
      const correct = gradeAnswer(q.qtype, q.payload, q.answer, resp);
      run.answers[q.question_code] = { client_uuid: crypto.randomUUID(), resp, correct, hints: hintsUsed, seconds, answered_at: new Date().toISOString() };
      (correct ? playCorrect : playWrong)();
      view.showFeedback({ correct, answerText: describeAnswer(q.qtype, q.answer), explanation: q.explanation, mistake: q.common_mistake });
      const last = idx + 1 === run.questions.length;
      view.root.append(el("div", { class: "row" }, el("button", { onclick: next }, last ? "看結果 ▶" : "下一題 ▶")));
    },
  });
  put(app, el("div", { class: "card" }, el("b", null, "訂正錯題"),
    el("div", { class: "progress" }, el("div", { class: "bar", style: "width:" + Math.round(idx * 100 / run.questions.length) + "%" }))), view.root);
  focusQuestion(view.root);
}

async function finish() {
  put(app, el("div", { class: "card empty" }, el("p", null, "正在存起來…")));
  for (const q of run.questions) {
    const a = run.answers[q.question_code];
    enqueue(sid, { kind: "level", target: levelId, attemptUuid: run.attemptUuid,
      item: { client_uuid: a.client_uuid, question_code: q.question_code, response: a.resp, seconds: a.seconds, hints_used: a.hints, answered_at: a.answered_at } });
  }
  const r = await flush(sid, { kind: "level", target: levelId });
  if (!r.attempts["level|" + levelId]) {
    return message(r.errors.length ? "err" : "warn",
      r.errors.length ? r.errors[0].message : "網路好像不穩，你的答案已經存在這台裝置，連上網路後會自動補送。",
      el("div", { class: "row" }, el("button", { onclick: finish }, "再試一次送出")));
  }
  const wb = await rpc("rpc_my_wrongbook", { p_only_open: true }).catch(() => null);
  const fixedNow = run.questions.filter(q => run.answers[q.question_code].correct).length;
  const still = run.questions.length - fixedNow;
  put(app, el("div", { class: "card result" },
    el("h2", null, "訂正完成！"),
    el("p", { class: "big" }, "答對 " + fixedNow + " / " + run.questions.length + " 題"),
    fixedNow ? el("p", { class: "msg ok" }, "✔ 這 " + fixedNow + " 題已經從待訂正移到「已訂正」。") : null,
    still ? el("p", { class: "msg warn" }, "還有 " + still + " 題答錯，會留在錯題本，下次再挑戰。") : null,
    wb ? el("p", { class: "muted" }, "錯題本目前還有 " + wb.open + " 題待訂正。") : null,
    el("div", { class: "row" }, el("a", { class: "btn", href: "wrongbook.html" }, "回錯題本"), el("a", { class: "btn ghost", href: "map.html" }, "回地圖"))));
}

start();
