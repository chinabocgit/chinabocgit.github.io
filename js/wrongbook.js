// Wrong-answer notebook: open items first, grouped by level; fixed items on a second tab.
// An item becomes "fixed" on the server when the child answers it correctly in a practice (see redo.html).
import { el } from "./dom.js?v=4337341a";
import { sb, rpc, ApiError } from "./api.js?v=4337341a";
import { requireStudent } from "./session.js?v=4337341a";
import { select } from "./data.js?v=4337341a";
import { setSafeHtml } from "./sanitize.js?v=4337341a";
import { describeAnswer, describeResponse } from "./grade.js?v=4337341a";

const app = document.getElementById("app");
const me = await requireStudent();
document.getElementById("who").textContent = me.nickname;
const put = (parent, ...kids) => parent.replaceChildren(...kids.flat().filter(Boolean));
const html = (cls, content) => { const e = el("div", { class: cls }); setSafeHtml(e, content); return e; };

let tab = "open";          // open | fixed
let data = null;           // { wb, levelOf: Map(code -> {id,name}) }

async function load() {
  const wb = await rpc("rpc_my_wrongbook", { p_only_open: false });
  const codes = wb.items.map(i => i.question_code);
  const levelOf = new Map();
  if (codes.length) {
    const rows = await select(sb.from("level_questions").select("level_id, questions!inner(code)").in("questions.code", codes));
    const levelIds = [...new Set(rows.map(r => r.level_id))];
    const levels = levelIds.length ? await select(sb.from("levels").select("id,name,seq,unit_id").in("id", levelIds)) : [];
    const byId = new Map(levels.map(l => [l.id, l]));
    for (const r of rows) if (!levelOf.has(r.questions.code) && byId.has(r.level_id)) levelOf.set(r.questions.code, byId.get(r.level_id));
  }
  data = { wb, levelOf };
}

function render() {
  const { wb, levelOf } = data;
  const shown = wb.items.filter(i => (tab === "open" ? !i.fixed : i.fixed));
  const groups = new Map();
  for (const it of shown) {
    const lv = levelOf.get(it.question_code) || { id: "?", name: "其他題目", seq: 999 };
    if (!groups.has(lv.id)) groups.set(lv.id, { lv, items: [] });
    groups.get(lv.id).items.push(it);
  }
  const tabBtn = (k, label) => el("button", { class: k === tab ? "" : "ghost", "aria-pressed": String(k === tab), onclick: () => { tab = k; render(); } }, label);
  put(app,
    el("div", { class: "card" }, el("h2", null, "📒 我的錯題本"),
      el("div", { class: "row" }, tabBtn("open", "待訂正（" + wb.open + "）"), tabBtn("fixed", "已訂正（" + wb.fixed + "）")),
      tab === "open" && wb.open === 0 ? el("p", { class: "msg ok" }, "🎉 目前沒有待訂正的錯題，太棒了！") : null,
      tab === "fixed" && wb.fixed === 0 ? el("p", { class: "muted" }, "還沒有訂正過的題目。") : null,
      wb.items.length >= 200 ? el("p", { class: "muted" }, "只顯示最近的 200 題。") : null),
    [...groups.values()].sort((a, b) => (a.lv.seq || 0) - (b.lv.seq || 0)).map(g => groupCard(g)));
}

function groupCard({ lv, items }) {
  const redoable = tab === "open" && lv.id !== "?" && items.some(i => !i.locked);
  return el("div", { class: "card" },
    el("h2", null, lv.name + "（" + items.length + " 題）"),
    redoable ? el("div", { class: "row" }, el("a", { class: "btn", href: "redo.html?level=" + encodeURIComponent(lv.id) }, "✏️ 訂正這一關的錯題")) : null,
    items.map(itemView));
}

function itemView(it) {
  const body = [];
  body.push(el("p", { class: "muted" }, "答錯 " + it.wrong_count + " 次" + (it.fixed ? "・已訂正" : "")));
  body.push(el("p", null, "你上次的答案：", el("b", null, describeResponse(it.last_response))));
  if (it.locked) body.push(el("p", { class: "msg warn" }, "🔒 這題現在留給老師的作業，作業結束後才能看答案和訂正。"));
  else {
    body.push(el("p", { class: "msg ok" }, "正確答案：" + describeAnswer(it.qtype, it.answer)));
    if (it.explanation) body.push(html("explain", "📘 " + it.explanation));
    if (it.common_mistake) body.push(html("explain", "⚠️ 常見錯誤：" + it.common_mistake));
  }
  const summary = el("summary", null);
  setSafeHtml(summary, it.stem);
  return el("details", { class: "wb-item" }, summary, ...body);
}

try { await load(); render(); }
catch (e) {
  if (!(e instanceof ApiError && e.code === "session_invalid"))
    put(app, el("div", { class: "card empty" }, el("p", { class: "msg err" }, "載入失敗：" + (e.friendly || "請稍後再試")), el("button", { onclick: () => location.reload() }, "重新載入")));
}
