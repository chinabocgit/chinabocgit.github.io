// Class overview: roster with progress summary, unlock a child, reset a picture password (shown once), sign the whole class out.
import { el } from "../../js/dom.js?v=bbee0d67";
import { PICS } from "../../js/config.js?v=bbee0d67";
import { sb, rpc, select, ApiError } from "./tapi.js?v=bbee0d67";
import { requireTeacher, signOut } from "./tsession.js?v=bbee0d67";

const app = document.getElementById("app");
const me = await requireTeacher();
document.getElementById("who").textContent = me.name || me.email;
document.getElementById("logout").addEventListener("click", signOut);
const classId = new URLSearchParams(location.search).get("id");
const put = (parent, ...kids) => parent.replaceChildren(...kids.flat().filter(Boolean));
const when = iso => iso ? new Date(iso).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

let data = null;          // { cls, myRole, students }
let flash = null;         // { cls, text }
let secret = null;        // { name, picture }  shown once
let armed = null;         // key of the button waiting for a second press
let armTimer = null;

async function load() {
  const [cls, roles, students] = await Promise.all([
    select(sb.from("classes").select("id,name,grade,semester,school_year,class_code,status,owner_id").eq("id", classId)),
    select(sb.from("class_teachers").select("role,subjects").eq("class_id", classId).eq("teacher_id", me.id)),
    rpc("rpc_class_student_summary", { p_class_id: classId })]);
  if (!cls[0]) throw new ApiError("not_found", "找不到這個班級，或你不是這個班的老師。");
  data = { cls: cls[0], myRole: roles[0] ? roles[0].role : null, students };
}

// Two-step confirmation without browser dialogs: the first press arms the button, a second press within 5 s runs it.
function confirmable(key, label, armedLabel, run, cls = "ghost") {
  const on = armed === key;
  return el("button", { class: on ? "danger" : cls, onclick: () => {
    if (armed === key) { armed = null; clearTimeout(armTimer); run(); return; }
    armed = key; render(); clearTimeout(armTimer); armTimer = setTimeout(() => { armed = null; render(); }, 5000);
  } }, on ? armedLabel : label);
}

async function act(fn, okText) {
  try { const r = await fn(); flash = { cls: "ok", text: typeof okText === "function" ? okText(r) : okText }; }
  catch (e) { if (e instanceof ApiError && e.code === "session_invalid") return; flash = { cls: "err", text: e.friendly || "操作沒成功，請稍後再試。" }; }
  await load(); render();
}

function render() {
  const c = data.cls, s = data.students;
  put(app,
    flash ? el("div", { class: "msg " + flash.cls, role: "status" }, flash.text) : null,
    secret ? el("div", { class: "pw-box", role: "status" },
      el("b", null, secret.name + " 的新圖卡密碼（只顯示這一次，請當面告訴孩子）"),
      el("div", { class: "pics-line", "aria-label": "圖卡密碼" }, secret.picture.split("-").map(n => PICS[parseInt(n, 10) - 1] || "?").join(" ")),
      el("div", { class: "muted" }, "圖卡編號：" + secret.picture),
      el("div", { class: "row" }, el("button", { class: "ghost", onclick: () => { secret = null; render(); } }, "我記下來了，關閉"))) : null,
    el("div", { class: "card class-card" },
      el("h2", null, c.name),
      el("div", { class: "muted" }, c.school_year + " 學年・" + c.grade + " 年級" + (c.semester ? "・" + c.semester + "學期" : "") + "・" + (data.myRole === "homeroom" ? "導師" : data.myRole === "subject" ? "科任" : "")),
      c.class_code ? el("div", null, "班級代碼：", el("span", { class: "code" }, c.class_code)) : null,
      el("div", { class: "row" },
        el("a", { class: "btn", href: "assignments.html?class=" + encodeURIComponent(classId) }, "📋 作業"),
        el("a", { class: "btn ghost", href: "roster.html?class=" + encodeURIComponent(classId) }, "👥 名單管理"),
        el("a", { class: "btn ghost", href: "settings.html?class=" + encodeURIComponent(classId) }, "⚙️ 班級設定"),
        confirmable("revoke", "🚪 登出全班", "再按一次：確定登出全班", () => act(() => rpc("rpc_revoke_class_sessions", { p_class_id: classId }), r => "已登出全班（" + r.revoked + " 個登入）。")))),
    el("div", { class: "card" },
      el("h2", null, "學生（" + s.length + "）"),
      s.length ? table(s) : el("p", { class: "muted" }, "這個班還沒有學生。")));
}

function table(s) {
  return el("table", { class: "t-table" },
    el("thead", null, el("tr", null, ["座號", "暱稱", "派", "開始", "完成", "平均", "最近作答", ""].map((h, i) => el("th", { class: i >= 2 && i <= 5 ? "num" : "" }, h)))),
    el("tbody", null, s.map(x => el("tr", null,
      el("td", { "data-label": "座號" }, x.seat_no == null ? "—" : String(x.seat_no)),
      el("td", { "data-label": "暱稱" }, el("a", { href: "student.html?id=" + encodeURIComponent(x.student_id) + "&class=" + encodeURIComponent(classId) }, el("b", null, x.nickname))),
      el("td", { class: "num", "data-label": "派" }, String(x.assigned)),
      el("td", { class: "num", "data-label": "開始" }, String(x.started)),
      el("td", { class: "num", "data-label": "完成" }, String(x.finished)),
      el("td", { class: "num", "data-label": "平均" }, x.avg_score == null ? "—" : String(x.avg_score)),
      el("td", { "data-label": "最近作答" }, when(x.last_active)),
      el("td", null, el("div", { class: "t-actions" },
        confirmable("unlock:" + x.student_id, "🔓 解鎖", "再按一次解鎖", () => act(() => rpc("rpc_unlock_student", { p_student_id: x.student_id }), x.nickname + " 已解鎖。")),
        confirmable("pw:" + x.student_id, "🔑 重設圖卡密碼", "再按一次：重設", async () => {
          try { const r = await rpc("rpc_reset_picture_password", { p_student_id: x.student_id }); secret = { name: x.nickname, picture: r.picture_password }; flash = null; }
          catch (e) { if (e instanceof ApiError && e.code === "session_invalid") return; flash = { cls: "err", text: e.friendly || "重設沒成功。" }; }
          render();
        })))))));
}

try { await load(); render(); }
catch (e) {
  if (!(e instanceof ApiError && e.code === "session_invalid"))
    put(app, el("div", { class: "card empty" }, el("p", { class: "msg err" }, e.friendly || "載入失敗，請稍後再試。"), el("a", { class: "btn", href: "classes.html" }, "回我的班級")));
}
