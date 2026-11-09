// One child: assignment progress (with links to question-by-question detail), rewards summary, and the wrong-answer notebook.
import { el } from "../../js/dom.js?v=8cb5e7bc";
import { setSafeHtml } from "../../js/sanitize.js?v=8cb5e7bc";
import { describeAnswer, describeResponse } from "../../js/grade.js?v=8cb5e7bc";
import { rpc, ApiError } from "./tapi.js?v=8cb5e7bc";
import { requireTeacher, signOut } from "./tsession.js?v=8cb5e7bc";

const app = document.getElementById("app");
const me = await requireTeacher();
document.getElementById("who").textContent = me.name || me.email;
document.getElementById("logout").addEventListener("click", signOut);
const p = new URLSearchParams(location.search);
const sid = p.get("id"), classId = p.get("class");
document.getElementById("back").href = classId ? "class.html?id=" + encodeURIComponent(classId) : "classes.html";
const put = (parent, ...kids) => parent.replaceChildren(...kids.flat().filter(Boolean));
const html = (cls, content) => { const e = el("div", { class: cls }); setSafeHtml(e, content); return e; };
const ST = { finished: "已完成", in_progress: "進行中", not_started: "未開始", missed: "錯過" };
const when = iso => iso ? new Date(iso).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
let showFixed = false;

function wrongItem(it) {
  const s = el("summary", null); setSafeHtml(s, it.stem);
  return el("details", { class: "wb-item" }, s,
    el("p", { class: "muted" }, "錯 " + it.wrong_count + " 次・最近 " + when(it.last_wrong_at) + (it.fixed ? "・已訂正" : "")),
    el("p", null, "最近的回答：", el("b", null, describeResponse(it.last_response))),
    it.locked ? el("p", { class: "msg warn" }, "🔒 作業進行中，不顯示答案。")
      : el("div", null, el("p", { class: "msg ok" }, "正確答案：" + describeAnswer(it.qtype, it.answer)), it.explanation ? html("explain", "📘 " + it.explanation) : null));
}

async function render() {
  const [prog, rewards, certs, wb] = await Promise.all([
    rpc("rpc_child_progress", { p_student_id: sid }), rpc("rpc_child_rewards", { p_student_id: sid }),
    rpc("rpc_child_certificates", { p_student_id: sid }), rpc("rpc_child_wrongbook", { p_student_id: sid, p_only_open: false })]);
  const st = prog.student;
  const items = wb.items.filter(i => showFixed ? i.fixed : !i.fixed);
  put(app,
    el("div", { class: "card" },
      el("h2", null, "🧒 " + st.nickname),
      el("div", { class: "muted" }, (st.grade ? st.grade + " 年級・" : "") + prog.classes.map(c => c.name).join("、")),
      el("div", { class: "stat-row" },
        el("span", { class: "stat" }, "⭐ 星星 " + rewards.stars),
        el("span", { class: "stat" }, "🏅 收集品 " + rewards.collectibles + "（金色 " + rewards.gold + "）"),
        el("span", { class: "stat" }, "📜 證書 " + certs.certificates.length))),
    el("div", { class: "card" }, el("h2", null, "作業與月考"),
      prog.assignments.length ? prog.assignments.map(a => el("div", { class: "cert-row" },
        el("span", { class: "grow" }, el("b", null, a.title), el("div", { class: "muted" }, (a.kind === "exam" ? "月考" : "作業") + "・開始 " + when(a.start_at) + "・截止 " + (a.due_at ? when(a.due_at) : "不截止"))),
        el("span", { class: "chip-st " + a.status }, ST[a.status] || a.status),
        el("span", { class: "muted" }, a.answered + "／" + a.total + " 題・對 " + a.correct + (a.score != null ? "・" + a.score + " 分" : "")),
        a.attempt_id ? el("a", { class: "btn ghost", href: "attempt.html?id=" + encodeURIComponent(a.attempt_id) + "&student=" + encodeURIComponent(sid) + (classId ? "&class=" + encodeURIComponent(classId) : "") }, "逐題明細") : null))
        : el("p", { class: "muted" }, "目前沒有作業。")),
    el("div", { class: "card" }, el("h2", null, "📒 錯題本"),
      el("div", { class: "row" },
        el("button", { class: showFixed ? "ghost" : "", onclick: () => { showFixed = false; render(); } }, "待訂正（" + wb.open + "）"),
        el("button", { class: showFixed ? "" : "ghost", onclick: () => { showFixed = true; render(); } }, "已訂正（" + wb.fixed + "）")),
      items.length ? items.map(wrongItem) : el("p", { class: "muted" }, showFixed ? "還沒有訂正過的題目。" : "沒有待訂正的題目。")));
}

try { await render(); }
catch (e) {
  if (!(e instanceof ApiError && e.code === "session_invalid"))
    put(app, el("div", { class: "card empty" }, el("p", { class: "msg err" }, e.code === "not_found" ? "找不到這位孩子，或你沒有權限看。" : (e.friendly || "載入失敗，請稍後再試。")), el("a", { class: "btn", href: "classes.html" }, "回我的班級")));
}
