// One attempt, question by question. The correct answer is shown only when the server says "reveal" (teachers always get it).
import { el } from "../../js/dom.js?v=4337341a";
import { setSafeHtml } from "../../js/sanitize.js?v=4337341a";
import { describeAnswer, describeResponse } from "../../js/grade.js?v=4337341a";
import { rpc, ApiError } from "./tapi.js?v=4337341a";
import { requireTeacher, signOut } from "./tsession.js?v=4337341a";

const app = document.getElementById("app");
const me = await requireTeacher();
document.getElementById("who").textContent = me.name || me.email;
document.getElementById("logout").addEventListener("click", signOut);
const p = new URLSearchParams(location.search);
const id = p.get("id"), studentId = p.get("student"), classId = p.get("class");
document.getElementById("back").href = studentId ? "student.html?id=" + encodeURIComponent(studentId) + (classId ? "&class=" + encodeURIComponent(classId) : "") : "classes.html";
const put = (parent, ...kids) => parent.replaceChildren(...kids.flat().filter(Boolean));
const html = (cls, content) => { const e = el("div", { class: cls }); setSafeHtml(e, content); return e; };

try {
  const d = await rpc("rpc_attempt_detail", { p_attempt_id: id });
  const a = d.attempt, asg = !!a.assignment;
  const qs = d.questions || [];
  const right = qs.filter(x => x.is_correct).length, answered = qs.filter(x => x.answered).length;
  put(app,
    el("div", { class: "card" },
      el("h2", null, (a.nickname || "孩子") + "・" + (asg ? a.assignment.title : "練習")),
      el("div", { class: "muted" }, (a.finished_at ? "交卷 " + new Date(a.finished_at).toLocaleString("zh-TW") : "還沒交卷") + (a.score != null ? "・" + a.score + " 分" : "") + (a.source === "offline" ? "・離線補送" : "")),
      el("p", { class: "big" }, right + " / " + answered + " 題答對" + (asg && answered < qs.length ? "（共 " + qs.length + " 題，" + (qs.length - answered) + " 題沒作答）" : "")),
      !d.reveal ? el("p", { class: "msg warn" }, "正確答案目前隱藏（作業還沒關閉或截止）。") : null),
    qs.map((x, i) => el("div", { class: "card" },
      el("div", { class: "muted" }, "第 " + (i + 1) + " 題（" + x.qtype + "）" + (x.seconds != null ? "・用時 " + x.seconds + " 秒" : "")),
      html("stem", x.stem),
      !x.answered ? el("p", { class: "msg warn" }, "沒作答")
        : el("p", { class: "msg " + (x.is_correct ? "ok" : "err") }, (x.is_correct ? "✔ 答對" : "✘ 答錯") + "　孩子的答案：" + describeResponse(x.response)),
      d.reveal && x.correct_answer && !x.is_correct ? el("p", { class: "msg ok" }, "正確答案：" + describeAnswer(x.qtype, x.correct_answer)) : null,
      d.reveal && x.explanation ? html("explain", "📘 " + x.explanation) : null)));
} catch (e) {
  if (!(e instanceof ApiError && e.code === "session_invalid"))
    put(app, el("div", { class: "card empty" }, el("p", { class: "msg err" }, e.code === "not_found" ? "找不到這份作答，或你沒有權限看。" : (e.friendly || "載入失敗，請稍後再試。")), el("a", { class: "btn", href: "classes.html" }, "回我的班級")));
}
