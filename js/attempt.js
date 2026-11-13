// One attempt, question by question: your answer, right or wrong, the correct answer and the explanation.
// For an assignment that is not finished yet we never show answers or explanations, even if the server would send them.
import { el } from "./dom.js?v=1404c8c6";
import { rpc, ApiError } from "./api.js?v=1404c8c6";
import { requireStudent } from "./session.js?v=1404c8c6";
import { setSafeHtml } from "./sanitize.js?v=1404c8c6";
import { describeAnswer, describeResponse } from "./grade.js?v=1404c8c6";

const app = document.getElementById("app");
const me = await requireStudent();
document.getElementById("who").textContent = me.nickname;
const id = new URLSearchParams(location.search).get("id");
const put = (parent, ...kids) => parent.replaceChildren(...kids.flat().filter(Boolean));
const html = (cls, content) => { const e = el("div", { class: cls }); setSafeHtml(e, content); return e; };

function fail(text) {
  put(app, el("div", { class: "card empty" }, el("p", { class: "msg warn" }, text), el("div", { class: "row" }, el("a", { class: "btn", href: "history.html" }, "回我的紀錄"))));
}

if (!id) fail("沒有指定要看的紀錄。");
else {
  try {
    const d = await rpc("rpc_attempt_detail", { p_attempt_id: id });
    const a = d.attempt;
    const isAsg = !!a.assignment;
    const finished = !!a.finished_at;
    const canReveal = !isAsg || finished;              // practice: always; assignment: only after handing in
    const qs = (d.questions || []).filter(q => q.answered || !isAsg);
    const right = qs.filter(q => q.is_correct).length;
    put(app,
      el("div", { class: "card" },
        el("h2", null, isAsg ? a.assignment.title : "練習紀錄"),
        el("p", { class: "muted" }, (a.finished_at ? new Date(a.finished_at).toLocaleString("zh-TW") : "還沒交卷") + (a.score != null ? "・" + a.score + " 分" : "")),
        el("p", { class: "big" }, right + " / " + qs.length + " 題答對"),
        isAsg && !finished ? el("p", { class: "msg warn" }, "這份作業還沒交完，交完後才能看每題的答案和詳解。") : null),
      qs.map((q, i) => el("div", { class: "card" },
        el("div", { class: "muted" }, "第 " + (i + 1) + " 題"),
        html("stem", q.stem),
        el("p", { class: "msg " + (q.is_correct ? "ok" : "err") }, (q.is_correct ? "✔ 答對" : "✘ 答錯") + "　你的答案：" + describeResponse(q.response)),
        canReveal && !q.is_correct && q.correct_answer ? el("p", { class: "msg ok" }, "正確答案：" + describeAnswer(q.qtype, q.correct_answer)) : null,
        canReveal && q.explanation ? html("explain", "📘 " + q.explanation) : null)));
  } catch (e) {
    if (!(e instanceof ApiError && e.code === "session_invalid")) fail(e.code === "not_found" ? "找不到這份紀錄。" : "載入失敗：" + (e.friendly || "請稍後再試"));
  }
}
