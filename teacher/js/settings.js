// Class settings: class code (regenerate), theme, and textbook version per subject. Homeroom teacher only (the database enforces it).
import { el } from "../../js/dom.js?v=858b6233";
import { sb, rpc, select, ApiError } from "./tapi.js?v=858b6233";
import { requireTeacher, signOut } from "./tsession.js?v=858b6233";

const app = document.getElementById("app");
const me = await requireTeacher();
document.getElementById("who").textContent = me.name || me.email;
document.getElementById("logout").addEventListener("click", signOut);
const classId = new URLSearchParams(location.search).get("class");
document.getElementById("back").href = "class.html?id=" + encodeURIComponent(classId || "");
const put = (parent, ...kids) => parent.replaceChildren(...kids.flat().filter(Boolean));

let S = null, flash = null, armed = null, armTimer = null;

async function load() {
  const [cls, roles, themes, versions, publishers, subjects] = await Promise.all([
    select(sb.from("classes").select("id,name,class_code,theme_id,status,join_mode").eq("id", classId)),
    select(sb.from("class_teachers").select("role").eq("class_id", classId).eq("teacher_id", me.id)),
    rpc("rpc_list_themes"),
    select(sb.from("class_subject_versions").select("subject_id,publisher_id").eq("class_id", classId)),
    select(sb.from("publishers").select("id,name").order("name")),
    select(sb.from("subjects").select("id,name,sort").order("sort"))]);
  if (!cls[0]) throw new ApiError("not_found", "找不到這個班級，或你不是這個班的老師。");
  S = { cls: cls[0], owner: roles[0] && roles[0].role === "homeroom", themes, versions: new Map(versions.map(v => [v.subject_id, v.publisher_id])), publishers, subjects };
}

async function act(fn, okText) {
  try { const r = await fn(); flash = { cls: "ok", text: typeof okText === "function" ? okText(r) : okText }; }
  catch (e) { if (e instanceof ApiError && e.code === "session_invalid") return; flash = { cls: "err", text: e.friendly || "操作沒成功，請稍後再試。" }; }
  await load(); render();
}

function confirmable(key, label, armedLabel, run) {
  const on = armed === key;
  return el("button", { class: on ? "danger" : "ghost", onclick: () => {
    if (armed === key) { armed = null; clearTimeout(armTimer); run(); return; }
    armed = key; render(); clearTimeout(armTimer); armTimer = setTimeout(() => { armed = null; render(); }, 5000);
  } }, on ? armedLabel : label);
}

function sel(id, options, value, onchange) {
  const s = el("select", { id, onchange: e => onchange(e.target.value) }, options.map(([v, t]) => el("option", { value: v }, t)));
  s.value = value; return s;
}

function render() {
  const c = S.cls;
  put(app,
    flash ? el("div", { class: "msg " + flash.cls, role: "status" }, flash.text) : null,
    !S.owner ? el("div", { class: "msg warn" }, "你是這個班的科任老師；班級設定只有導師可以修改。") : null,
    el("div", { class: "card" }, el("h2", null, "⚙️ " + c.name),
      el("h3", null, "班級代碼"),
      el("div", null, el("span", { class: "code" }, c.class_code || "—")),
      el("p", { class: "muted" }, "孩子或家長用這個代碼申請加入班級。換新代碼後，舊代碼立刻失效（已經加入的孩子不受影響）。"),
      S.owner ? el("div", { class: "row" }, confirmable("regen", "🔄 換新代碼", "再按一次：確定換新代碼", () => act(() => rpc("rpc_regenerate_class_code", { p_class_id: classId }), r => "新的班級代碼是 " + r.class_code))) : null),
    el("div", { class: "card" }, el("h3", null, "班級主題"),
      el("label", { for: "s-theme" }, "孩子地圖的主題（沒指定就用年級預設；孩子的家長也可以另外指定，家長的設定優先）"),
      sel("s-theme", [["", "（不指定）"], ...S.themes.map(t => [t.id, t.name])], c.theme_id || "", v => {
        if (!S.owner) return;
        act(() => rpc("rpc_set_class_theme", { p_class_id: classId, p_theme_id: v || null }), v ? "已設定班級主題。" : "已清除班級主題。");
      })),
    el("div", { class: "card" }, el("h3", null, "各科教科書版本"),
      S.subjects.map(s => [el("label", { for: "ver-" + s.id }, s.name),
        sel("ver-" + s.id, [["", "（不指定）"], ...S.publishers.map(p => [p.id, p.name])], S.versions.get(s.id) || "", v => {
          if (!S.owner || !v) return;
          act(() => rpc("rpc_set_class_subject_version", { p_class_id: classId, p_subject_id: s.id, p_publisher_id: v }), s.name + " 版本已更新。");
        })])));
  if (!S.owner) app.querySelectorAll("select, button").forEach(x => { if (x.id !== "logout") x.disabled = true; });
}

try { await load(); render(); }
catch (e) {
  if (!(e instanceof ApiError && e.code === "session_invalid"))
    put(app, el("div", { class: "card empty" }, el("p", { class: "msg err" }, e.friendly || "載入失敗，請稍後再試。"), el("a", { class: "btn", href: "classes.html" }, "回我的班級")));
}
