// Assignment report: who finished, score distribution, and per-question correct rate with the common wrong answers.
// Teachers see the correct answers (the database allows it); nothing here is shown to children.
import { el } from "../../js/dom.js?v=df105d9d";
import { setSafeHtml } from "../../js/sanitize.js?v=df105d9d";
import { describeAnswer } from "../../js/grade.js?v=df105d9d";
import { rpc, ApiError } from "./tapi.js?v=df105d9d";
import { requireTeacher, signOut } from "./tsession.js?v=df105d9d";

const app = document.getElementById("app");
const me = await requireTeacher();
document.getElementById("who").textContent = me.name || me.email;
document.getElementById("logout").addEventListener("click", signOut);
const q = new URLSearchParams(location.search);
const asgId = q.get("id"), classId = q.get("class");
document.getElementById("back").href = classId ? "assignments.html?class=" + encodeURIComponent(classId) : "classes.html";
const put = (parent, ...kids) => parent.replaceChildren(...kids.flat().filter(Boolean));
const ST = { finished: "已完成", in_progress: "進行中", not_started: "未開始", missed: "錯過" };
const STATE = { open: "開放中", closed: "已關閉", ended: "已截止", soon: "還沒開始" };
const mmss = s => { s = Math.round(s || 0); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const html = (tag, cls, content) => { const e = el(tag, cls ? { class: cls } : null); setSafeHtml(e, content); return e; };

function bar(label, n, max, cls) {
  return el("div", { class: "bar-row" }, el("span", null, label),
    el("div", { class: "bar-track" }, el("div", { class: "bar-fill " + (cls || ""), style: "width:" + (max ? Math.round(n * 100 / max) : 0) + "%" })),
    el("span", { class: "num" }, String(n)));
}

function questionRow(x, i) {
  const rate = x.correct_rate;
  const kids = [
    el("div", { class: "row" }, el("b", null, (i + 1) + "."), html("span", "", x.stem),
      el("span", { class: "muted" }, "（" + x.qtype + "）")),
    el("div", null, "作答 " + x.answered + " 人・答對 " + x.correct + " 人・答對率 ", el("b", null, rate == null ? "—" : rate + "%")),
    bar("答對率", rate == null ? 0 : rate, 100, rate != null && rate >= 80 ? "good" : rate != null && rate < 50 ? "low" : ""),
    el("div", { class: "ok-text" }, "正確答案：" + describeAnswer(x.qtype, x.correct_answer)),
  ];
  if (x.choices && Object.keys(x.choices).length) {
    const max = Math.max(...Object.values(x.choices), 1);
    kids.push(el("div", { class: "bars" }, Object.entries(x.choices).map(([opt, n]) => bar(opt.length > 8 ? opt.slice(0, 8) + "…" : opt, n, max, opt === (x.correct_answer || {}).correct ? "good" : ""))));
  }
  if (x.top_wrong && x.top_wrong.length)
    kids.push(el("div", { class: "muted" }, "常見錯誤答案：" + x.top_wrong.map(w => "「" + w.text + "」×" + w.count).join("、")));
  return el("div", { class: "qrow" }, kids);
}

try {
  const r = await rpc("rpc_assignment_report", { p_assignment_id: asgId });
  const a = r.assignment, s = r.summary, b = s.score_buckets;
  const maxB = Math.max(b.lt60, b.b60_69, b.b70_79, b.b80_89, b.b90_100, 1);
  put(app,
    el("div", { class: "card" },
      el("h2", null, a.title),
      el("div", { class: "muted" }, (a.kind === "exam" ? "月考" : "作業") + "・" + (STATE[a.state] || a.state) + "・" + a.total + " 題"),
      el("div", { class: "stat-row" },
        el("span", { class: "stat" }, "在班 " + s.members + " 人"),
        el("span", { class: "stat" }, "已完成 " + s.finished),
        el("span", { class: "stat" }, "進行中 " + s.in_progress),
        el("span", { class: "stat" }, "未開始 " + s.not_started),
        s.missed ? el("span", { class: "stat" }, "錯過 " + s.missed) : null,
        el("span", { class: "stat" }, "平均 " + (s.avg_score == null ? "—" : s.avg_score + " 分"))),
      s.left_with_attempts ? el("p", { class: "muted" }, "另有 " + s.left_with_attempts + " 位已離班、但有作答的孩子（列在下表）。") : null),
    el("div", { class: "card" }, el("h2", null, "分數分布（已完成 " + s.finished_all + " 人）"),
      el("div", { class: "bars" }, [["60 分以下", b.lt60], ["60～69", b.b60_69], ["70～79", b.b70_79], ["80～89", b.b80_89], ["90 以上", b.b90_100]].map(([l, n]) => bar(l, n, maxB)))),
    el("div", { class: "card" }, el("h2", null, "每位孩子"),
      r.students.length ? el("table", { class: "t-table" },
        el("thead", null, el("tr", null, ["座號", "暱稱", "狀態", "答／對", "分數", "用時", ""].map((h, i) => el("th", { class: i >= 3 && i <= 5 ? "num" : "" }, h)))),
        el("tbody", null, r.students.map(x => el("tr", null,
          el("td", { "data-label": "座號" }, x.seat_no == null ? "—" : String(x.seat_no)),
          el("td", { "data-label": "暱稱" }, el("b", null, x.nickname), x.left_class ? el("span", { class: "muted" }, "（已離班）") : null),
          el("td", { "data-label": "狀態" }, el("span", { class: "chip-st " + x.status }, ST[x.status] || x.status)),
          el("td", { class: "num", "data-label": "答／對" }, x.answered + "／" + x.correct),
          el("td", { class: "num", "data-label": "分數" }, x.score == null ? "—" : String(x.score)),
          el("td", { class: "num", "data-label": "用時" }, x.answered ? mmss(x.seconds) : "—"),
          el("td", null, el("a", { class: "btn ghost", href: "student.html?id=" + encodeURIComponent(x.student_id) + (classId ? "&class=" + encodeURIComponent(classId) : "") }, "看這位")))))) : el("p", { class: "muted" }, "沒有學生。")),
    el("div", { class: "card" }, el("h2", null, "每一題"), r.questions.map(questionRow)));
} catch (e) {
  if (!(e instanceof ApiError && e.code === "session_invalid"))
    put(app, el("div", { class: "card empty" }, el("p", { class: "msg err" }, e.friendly || "載入失敗，請稍後再試。"), el("a", { class: "btn", href: "classes.html" }, "回我的班級")));
}
