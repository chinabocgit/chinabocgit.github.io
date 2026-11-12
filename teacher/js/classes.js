// My classes: every class where I am a teacher (homeroom or subject teacher), plus "create a class".
import { el } from "../../js/dom.js?v=27c00f96";
import { sb, rpc, select, ApiError } from "./tapi.js?v=27c00f96";
import { requireTeacher, signOut } from "./tsession.js?v=27c00f96";

const app = document.getElementById("app");
const me = await requireTeacher();
document.getElementById("who").textContent = me.name || me.email;
document.getElementById("logout").addEventListener("click", signOut);
const put = (parent, ...kids) => parent.replaceChildren(...kids.flat().filter(Boolean));
const ROLE = { homeroom: "導師", subject: "科任" };
const MODE = [["both", "名單建立＋班級代碼申請（建議）"], ["roster", "只用名單建立"], ["code", "只用班級代碼申請"]];

let rows = [], schools = [], publishers = [], subjects = [];
let flash = null, showForm = false;
const thisYear = (() => { const d = new Date(); return d.getFullYear() - 1911 - (d.getMonth() < 7 ? 1 : 0); })();   // school year starts in August
let form = { school: "", year: thisYear, grade: 3, semester: "上", name: "", mode: "both", versions: {} };

async function load() {
  [rows, schools, publishers, subjects] = await Promise.all([
    select(sb.from("class_teachers").select("role, subjects, classes!inner(id,name,grade,semester,school_year,class_code,status,theme_id)").eq("teacher_id", me.id)),
    select(sb.from("schools").select("id,name").eq("active", true).order("name")),
    select(sb.from("publishers").select("id,name").order("name")),
    select(sb.from("subjects").select("id,name,sort").order("sort"))]);
  if (!form.school && schools[0]) form.school = schools[0].id;
}

function card(r) {
  const c = r.classes;
  return el("div", { class: "card class-card" },
    el("h2", null, c.name),
    el("div", { class: "muted" }, c.school_year + " 學年・" + c.grade + " 年級" + (c.semester ? "・" + c.semester + "學期" : "") + "・" + (ROLE[r.role] || r.role)
      + (r.role === "subject" && r.subjects && r.subjects.length ? "（" + r.subjects.join("、") + "）" : "")),
    c.class_code ? el("div", null, "班級代碼：", el("span", { class: "code" }, c.class_code)) : null,
    el("div", { class: "row" }, el("a", { class: "btn", href: "class.html?id=" + encodeURIComponent(c.id) }, "進入班級")));
}

function sel(id, options, value, onchange) {
  const s = el("select", { id, onchange: e => onchange(e.target.value) }, options.map(([v, t]) => el("option", { value: v }, t)));
  s.value = value; return s;
}

function createForm() {
  return el("div", { class: "card" },
    el("label", { for: "c-school" }, "學校"), sel("c-school", schools.map(s => [s.id, s.name]), form.school, v => { form.school = v; }),
    el("label", { for: "c-year" }, "學年度（例如 115）"), el("input", { id: "c-year", type: "text", inputmode: "numeric", value: String(form.year), oninput: e => { form.year = e.target.value; } }),
    el("label", { for: "c-grade" }, "年級"), sel("c-grade", [1, 2, 3, 4, 5, 6].map(n => [String(n), n + " 年級"]), String(form.grade), v => { form.grade = Number(v); }),
    el("label", { for: "c-sem" }, "學期"), sel("c-sem", [["上", "上學期"], ["下", "下學期"]], form.semester, v => { form.semester = v; }),
    el("label", { for: "c-name" }, "班名（1～30 字）"), el("input", { id: "c-name", type: "text", maxlength: 30, value: form.name, oninput: e => { form.name = e.target.value; } }),
    el("label", { for: "c-mode" }, "孩子怎麼加入"), sel("c-mode", MODE, form.mode, v => { form.mode = v; }),
    el("details", null, el("summary", null, "各科教科書版本（選填，之後也可以在班級設定改）"),
      subjects.map(s => [el("label", { for: "v-" + s.id }, s.name),
        sel("v-" + s.id, [["", "（不指定）"], ...publishers.map(p => [p.id, p.name])], form.versions[s.id] || "", v => { form.versions[s.id] = v; })])),
    el("div", { class: "row" }, el("button", { onclick: create }, "建立班級")));
}

async function create() {
  const versions = Object.entries(form.versions).filter(([, p]) => p).map(([subject_id, publisher_id]) => ({ subject_id, publisher_id }));
  try {
    const r = await rpc("rpc_create_class", { p_school_id: form.school, p_school_year: Number(form.year), p_grade: form.grade, p_semester: form.semester,
      p_name: form.name, p_join_mode: form.mode, p_subject_versions: versions });
    location.href = "class.html?id=" + encodeURIComponent(r.class_id);
  } catch (e) { if (e instanceof ApiError && e.code === "session_invalid") return; flash = { cls: "err", text: e.friendly || "建立沒成功。" }; render(); }
}

function render() {
  const active = rows.filter(r => r.classes.status === "active").sort((a, b) => b.classes.school_year - a.classes.school_year || a.classes.grade - b.classes.grade);
  const done = rows.filter(r => r.classes.status !== "active");
  put(app,
    flash ? el("div", { class: "msg " + flash.cls, role: "status" }, flash.text) : null,
    el("div", { class: "card" }, el("div", { class: "row" }, el("button", { onclick: () => { showForm = !showForm; render(); } }, showForm ? "收起" : "＋ 建立新班級")), showForm ? createForm() : null),
    !rows.length ? el("div", { class: "card empty" }, el("p", { class: "big" }, "還沒有班級"), el("p", { class: "muted" }, "按上面的「建立新班級」開始；如果按了被拒絕，表示你還沒被管理者核准為老師。")) : null,
    active.map(card),
    done.length ? el("details", { class: "card" }, el("summary", null, "已結業的班級（" + done.length + "）"), done.map(card)) : null);
}

try { await load(); render(); }
catch (e) {
  if (!(e instanceof ApiError && e.code === "session_invalid"))
    put(app, el("div", { class: "card empty" }, el("p", { class: "msg err" }, "載入失敗：" + (e.friendly || "請稍後再試")), el("button", { onclick: () => location.reload() }, "重新載入")));
}
