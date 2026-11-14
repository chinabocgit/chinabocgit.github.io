// Assignments for one class: list, create (level / unit / hand-picked questions), rename, change deadline, close / reopen, delete.
// Exams (月考): send a preset paper or auto-pick questions from chosen units, preview and swap questions, set a time limit.
// All rules (who may assign which subject, scope checks, "no deleting once a child answered") are enforced by the database;
// this page only collects input and shows the server's message when something is refused.
import { el } from "../../js/dom.js?v=9d63c7c7";
import { setSafeHtml } from "../../js/sanitize.js?v=9d63c7c7";
import { sb, rpc, select, ApiError } from "./tapi.js?v=9d63c7c7";
import { requireTeacher, signOut } from "./tsession.js?v=9d63c7c7";

const app = document.getElementById("app");
const me = await requireTeacher();
document.getElementById("who").textContent = me.name || me.email;
document.getElementById("logout").addEventListener("click", signOut);
const classId = new URLSearchParams(location.search).get("class");
document.getElementById("back").href = "class.html?id=" + encodeURIComponent(classId || "");
const put = (parent, ...kids) => parent.replaceChildren(...kids.flat().filter(Boolean));
const fmt = iso => iso ? new Date(iso).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const toIso = local => local ? new Date(local).toISOString() : null;
const STATUS = { open: ["開放中", "ok"], soon: ["還沒開始", "warn"], ended: ["已截止", "warn"], closed: ["已關閉", "err"] };
const KIND = { assignment: "作業", exam: "月考" };

let S = null;               // { cls, list, subjects, levels, units }
let flash = null;
let armed = null, armTimer = null;
let editing = null;         // assignment id being edited
let form = { title: "", kind: "assignment", subject: "", scope: "level", level: "", unit: "", start: "", due: "", picks: new Set(), pickUnit: "" };
let picker = [];            // questions of the chosen unit for hand-picking
let showForm = false;
let showExam = false;
// Exam form state. mode "paper" = a preset paper, "auto" = questions drawn from the chosen units. items = the questions on the paper (no answers).
let ex = { mode: "paper", subject: "", papers: [], paperId: "", items: [], units: new Set(), count: 20, title: "", start: "", due: "", limit: "40", unlimited: false, busy: false };
const QT = { choice: "選擇", tf: "是非", fill: "填答" };

async function load() {
  const [cls, list, subjects] = await Promise.all([
    select(sb.from("classes").select("id,name,grade,semester,status").eq("id", classId)),
    rpc("rpc_list_assignments", { p_class_id: classId, p_include_closed: true }),
    select(sb.from("subjects").select("id,name,sort").order("sort"))]);
  if (!cls[0]) throw new ApiError("not_found", "找不到這個班級，或你不是這個班的老師。");
  const books = await select(sb.from("books").select("id,subject_id").eq("grade", cls[0].grade).eq("semester", cls[0].semester));
  const units = books.length ? await select(sb.from("units").select("id,book_id,no,title").in("book_id", books.map(b => b.id)).order("no")) : [];
  const levels = units.length ? await select(sb.from("levels").select("id,unit_id,seq,name,kind").in("unit_id", units.map(u => u.id)).eq("is_open", true).order("seq")) : [];
  const subjOfUnit = new Map(units.map(u => [u.id, (books.find(b => b.id === u.book_id) || {}).subject_id]));
  S = { cls: cls[0], list, subjects: subjects.filter(s => books.some(b => b.subject_id === s.id)), units, levels, subjOfUnit };
  if (!form.subject && S.subjects[0]) form.subject = S.subjects[0].id;
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

const unitTitle = id => (S.units.find(u => u.id === id) || {}).title || id;
const levelName = id => (S.levels.find(l => l.id === id) || {}).name || id;
const scopeText = a => a.scope_type === "level" ? "關卡：" + levelName(a.level_id) : a.scope_type === "unit" ? "整個單元：" + unitTitle(a.unit_id) : "自選題";

function render() {
  put(app,
    flash ? el("div", { class: "msg " + flash.cls, role: "status" }, flash.text) : null,
    el("div", { class: "card" },
      el("h2", null, "📋 " + S.cls.name + " 的作業"),
      el("div", { class: "row" },
        el("button", { onclick: () => { showForm = !showForm; render(); } }, showForm ? "收起" : "＋ 派新作業"),
        el("button", { onclick: toggleExam }, showExam ? "收起月考" : "📝 派月考")),
      showForm ? createForm() : null,
      showExam ? examForm() : null),
    S.list.length ? S.list.map(card) : el("div", { class: "card empty" }, el("p", { class: "muted" }, "這個班還沒有作業。")));
}

function field(label, input, id) { return [el("label", { for: id }, label), input]; }
function select_(id, options, value, onchange) {
  const s = el("select", { id, onchange: e => onchange(e.target.value) }, options.map(([v, t]) => el("option", { value: v }, t)));
  s.value = value; return s;
}

function createForm() {
  const unitsForSubject = S.units.filter(u => S.subjOfUnit.get(u.id) === form.subject);
  const levelsForSubject = S.levels.filter(l => unitsForSubject.some(u => u.id === l.unit_id));
  if (!form.level || !levelsForSubject.some(l => l.id === form.level)) form.level = (levelsForSubject[0] || {}).id || "";
  if (!form.unit || !unitsForSubject.some(u => u.id === form.unit)) form.unit = (unitsForSubject[0] || {}).id || "";
  return el("div", { class: "card" },
    field("標題（1～60 字）", el("input", { id: "f-title", type: "text", maxlength: 60, value: form.title, oninput: e => { form.title = e.target.value; } }), "f-title"),
    field("種類", select_("f-kind", [["assignment", "作業"], ["exam", "月考"]], form.kind, v => { form.kind = v; }), "f-kind"),
    field("科目", select_("f-subject", S.subjects.map(s => [s.id, s.name]), form.subject, async v => { form.subject = v; form.picks = new Set(); form.pickUnit = ""; if (form.scope === "custom") await ensurePicker(); render(); }), "f-subject"),
    el("fieldset", { class: "row" }, el("legend", null, "範圍"),
      [["level", "單一關卡"], ["unit", "整個單元"], ["custom", "自選題目"]].map(([k, t]) =>
        el("label", { class: "row" }, el("input", { type: "radio", name: "scope", checked: form.scope === k, onchange: async () => { form.scope = k; if (k === "custom") await ensurePicker(); render(); } }), t))),
    form.scope === "level" ? field("關卡", select_("f-level", levelsForSubject.map(l => [l.id, unitTitle(l.unit_id) + "・" + l.name]), form.level, v => { form.level = v; }), "f-level") : null,
    form.scope === "unit" ? field("單元", select_("f-unit", unitsForSubject.map(u => [u.id, "第 " + u.no + " 單元・" + u.title]), form.unit, v => { form.unit = v; }), "f-unit") : null,
    form.scope === "custom" ? pickerArea(unitsForSubject) : null,
    field("開始時間（不填＝現在）", el("input", { id: "f-start", type: "datetime-local", value: form.start, oninput: e => { form.start = e.target.value; } }), "f-start"),
    field("截止時間（不填＝不截止）", el("input", { id: "f-due", type: "datetime-local", value: form.due, oninput: e => { form.due = e.target.value; } }), "f-due"),
    el("div", { class: "row" }, el("button", { onclick: create }, "建立作業")));
}

function pickerArea(units) {
  if (!form.pickUnit || !units.some(u => u.id === form.pickUnit)) form.pickUnit = (units[0] || {}).id || "";
  return el("div", null,
    field("從哪個單元挑題", select_("f-pickunit", units.map(u => [u.id, "第 " + u.no + " 單元・" + u.title]), form.pickUnit, async v => { form.pickUnit = v; form.picks = new Set(); await loadPicker(); render(); }), "f-pickunit"),
    el("p", { class: "muted" }, "已選 " + form.picks.size + " 題（最多 50 題）"),
    picker.length ? el("div", { class: "pick-list" }, picker.map(q => {
      const lab = el("label", { class: "row pick" },
        el("input", { type: "checkbox", checked: form.picks.has(q.code), onchange: e => { e.target.checked ? form.picks.add(q.code) : form.picks.delete(q.code); render(); } }));
      const span = el("span", null); setSafeHtml(span, q.stem);
      lab.append(span, el("span", { class: "muted" }, " （" + q.qtype + (q.is_literacy ? "・素養" : "") + "）"));
      return lab;
    })) : el("p", { class: "muted" }, "這個單元沒有可挑的題目。"));
}

// Choose a default unit for hand-picking (first unit of the chosen subject) and load its questions.
async function ensurePicker() {
  const units = S.units.filter(u => S.subjOfUnit.get(u.id) === form.subject);
  if (!form.pickUnit || !units.some(u => u.id === form.pickUnit)) { form.pickUnit = (units[0] || {}).id || ""; form.picks = new Set(); }
  await loadPicker();
}

async function loadPicker() {
  picker = [];
  if (!form.pickUnit) return;
  const qu = await select(sb.from("question_units").select("question_id").eq("unit_id", form.pickUnit));
  const ids = qu.map(x => x.question_id);
  if (!ids.length) return;
  const qs = await select(sb.from("questions").select("id,code,current_version_id").in("id", ids).order("code"));
  const vs = await select(sb.from("question_versions").select("id,qtype,stem,is_literacy").in("id", qs.map(q => q.current_version_id)));
  const byId = new Map(vs.map(v => [v.id, v]));
  picker = qs.map(q => ({ code: q.code, ...(byId.get(q.current_version_id) || { qtype: "?", stem: q.code }) }));
}

async function create() {
  const args = { p_class_id: classId, p_subject_id: form.subject, p_title: form.title, p_kind: form.kind, p_scope_type: form.scope };
  if (form.scope === "level") args.p_level_id = form.level;
  if (form.scope === "unit") args.p_unit_id = form.unit;
  if (form.scope === "custom") args.p_question_codes = [...form.picks];
  if (form.start) args.p_start_at = toIso(form.start);
  if (form.due) args.p_due_at = toIso(form.due);
  const ok = await (async () => {
    try { const r = await rpc("rpc_create_assignment", args); flash = { cls: "ok", text: "已建立作業，共 " + r.total + " 題。" }; return true; }
    catch (e) { if (e instanceof ApiError && e.code === "session_invalid") return false; flash = { cls: "err", text: e.friendly || "建立沒成功。" }; return false; }
  })();
  if (ok) { form = { ...form, title: "", start: "", due: "", picks: new Set() }; showForm = false; }
  await load(); render();
}

// ---------- 派月考 ----------
const defaultMinutes = subject => (subject === "math" || subject === "chinese") ? "40" : "30";

// Runs a server call; a refused call shows the server's message and returns undefined.
async function guard(fn) {
  try { return await fn(); }
  catch (e) { if (e instanceof ApiError && e.code === "session_invalid") return undefined; flash = { cls: "err", text: e.friendly || "操作沒成功，請稍後再試。" }; return undefined; }
}

async function toggleExam() {
  showExam = !showExam;
  if (showExam) { if (!ex.subject || !S.subjects.some(s => s.id === ex.subject)) ex.subject = (S.subjects[0] || {}).id || ""; await loadExamPapers(); }
  render();
}

// Loads the papers of the chosen subject; picks the first one and previews it.
async function loadExamPapers() {
  ex.items = []; ex.paperId = ""; ex.units = new Set();
  const papers = await guard(() => rpc("rpc_list_exam_papers", { p_subject_id: ex.subject }));
  ex.papers = papers || [];
  ex.limit = defaultMinutes(ex.subject);
  if (ex.mode === "paper" && ex.papers[0]) await choosePaper(ex.papers[0].id);
}

async function choosePaper(id) {
  ex.paperId = id; ex.items = [];
  const paper = ex.papers.find(p => p.id === id);
  if (!paper) return;
  ex.title = paper.title;
  if (paper.suggested_minutes) ex.limit = String(paper.suggested_minutes);
  ex.items = (await guard(() => rpc("rpc_exam_paper_questions", { p_paper_id: id }))) || [];
}

async function composeExam() {
  ex.busy = true; render();
  const items = await guard(() => rpc("rpc_compose_exam", { p_subject_id: ex.subject, p_unit_ids: [...ex.units], p_count: Number(ex.count) }));
  ex.busy = false;
  if (items) { ex.items = items; if (!ex.title) ex.title = (S.subjects.find(s => s.id === ex.subject) || {}).name + "月考"; }
  render();
}

async function swapExamItem(i) {
  const q = ex.items[i];
  const r = await guard(() => rpc("rpc_swap_exam_question", { p_subject_id: ex.subject, p_unit_id: q.unit_id, p_difficulty: q.difficulty, p_exclude_codes: ex.items.map(x => x.code) }));
  if (r) ex.items = ex.items.map((x, k) => k === i ? r : x);
  render();
}

async function createExam() {
  if (!ex.items.length) { flash = { cls: "err", text: ex.mode === "paper" ? "請先選一份月考卷。" : "請先按「抽題」。" }; render(); return; }
  const args = { p_class_id: classId, p_subject_id: ex.subject, p_title: ex.title };
  if (ex.mode === "paper") args.p_paper_id = ex.paperId; else args.p_question_codes = ex.items.map(q => q.code);
  if (!ex.unlimited && ex.limit !== "") args.p_time_limit_min = Number(ex.limit);
  if (ex.start) args.p_start_at = toIso(ex.start);
  if (ex.due) args.p_due_at = toIso(ex.due);
  const r = await guard(() => rpc("rpc_create_exam", args));
  if (r) {
    flash = { cls: "ok", text: "已派出月考，共 " + r.total + " 題" + (r.time_limit_min ? "，限時 " + r.time_limit_min + " 分鐘。" : "，不限時。") };
    ex = { ...ex, items: [], paperId: "", title: "", start: "", due: "", units: new Set() }; showExam = false;
  }
  await load(); render();
}

function examItems(swappable) {
  if (!ex.items.length) return el("p", { class: "muted" }, ex.mode === "paper" ? "這一科還沒有可用的月考卷。" : "選好單元與題數後，按「抽題」。");
  const diff = d => ex.items.filter(q => q.difficulty === d).length;
  return el("div", null,
    el("p", { class: "muted" }, "共 " + ex.items.length + " 題・易 " + diff("易") + "／中 " + diff("中") + "／難 " + diff("難") + "（預覽不顯示答案）"),
    el("ol", { class: "pick-list" }, ex.items.map((q, i) => {
      const stem = el("span", null); setSafeHtml(stem, q.stem);
      return el("li", { class: "pick" }, stem,
        el("span", { class: "muted" }, " （第 " + q.unit_no + " 單元・" + (q.difficulty || "?") + "・" + (QT[q.qtype] || q.qtype) + (q.is_literacy ? "・資料卡" : "") + (q.has_figure ? "・看圖" : "") + "）"),
        swappable ? el("button", { class: "ghost", onclick: () => swapExamItem(i) }, "換題") : null);
    })));
}

function examForm() {
  const unitsForSubject = S.units.filter(u => S.subjOfUnit.get(u.id) === ex.subject);
  return el("div", { class: "card" },
    el("h3", null, "📝 派月考"),
    field("科目", select_("x-subject", S.subjects.map(s => [s.id, s.name]), ex.subject, async v => { ex.subject = v; await loadExamPapers(); render(); }), "x-subject"),
    el("fieldset", { class: "row" }, el("legend", null, "題目來源"),
      [["paper", "系統預設卷"], ["auto", "自動抽題"]].map(([k, t]) =>
        el("label", { class: "row" }, el("input", { type: "radio", name: "exmode", checked: ex.mode === k, onchange: async () => { ex.mode = k; ex.items = []; if (k === "paper" && ex.papers[0]) await choosePaper(ex.papers[0].id); render(); } }), t))),
    ex.mode === "paper"
      ? [field("月考卷", select_("x-paper", ex.papers.map(p => [p.id, p.title + "（" + p.total + " 題）"]), ex.paperId, async v => { await choosePaper(v); render(); }), "x-paper"), examItems(false)]
      : [el("fieldset", null, el("legend", null, "要考的單元（可複選）"),
          unitsForSubject.map(u => el("label", { class: "row" }, el("input", { type: "checkbox", checked: ex.units.has(u.id), onchange: e => { e.target.checked ? ex.units.add(u.id) : ex.units.delete(u.id); render(); } }), "第 " + u.no + " 單元・" + u.title))),
         field("題數（5～40）", el("input", { id: "x-count", type: "number", min: 5, max: 40, value: ex.count, oninput: e => { ex.count = e.target.value; } }), "x-count"),
         el("div", { class: "row" },
           el("button", { disabled: ex.busy || !ex.units.size, onclick: composeExam }, ex.items.length ? "🎲 重新抽題" : "🎲 抽題"),
           el("span", { class: "muted" }, "題目只抽選擇、是非、填答題；難度約 易 30%／中 50%／難 20%。")),
         examItems(true)],
    field("標題（1～60 字）", el("input", { id: "x-title", type: "text", maxlength: 60, value: ex.title, oninput: e => { ex.title = e.target.value; } }), "x-title"),
    field("開始時間（不填＝現在）", el("input", { id: "x-start", type: "datetime-local", value: ex.start, oninput: e => { ex.start = e.target.value; } }), "x-start"),
    field("截止時間（不填＝不截止）", el("input", { id: "x-due", type: "datetime-local", value: ex.due, oninput: e => { ex.due = e.target.value; } }), "x-due"),
    el("div", { class: "row" },
      el("label", { for: "x-limit" }, "限時（分鐘，5～180）"),
      el("input", { id: "x-limit", type: "number", min: 5, max: 180, value: ex.limit, disabled: ex.unlimited, oninput: e => { ex.limit = e.target.value; } }),
      el("label", { class: "row" }, el("input", { type: "checkbox", checked: ex.unlimited, onchange: e => { ex.unlimited = e.target.checked; render(); } }), "不限時")),
    el("div", { class: "row" }, el("button", { disabled: ex.busy || !ex.items.length, onclick: createExam }, "派出月考")));
}

function card(a) {
  const [stText, stCls] = STATUS[a.status] || [a.status, ""];
  const isEditing = editing === a.id;
  const kids = [
    el("div", { class: "row" }, el("h2", { style: "margin:0" }, a.title), el("span", { class: "msg " + stCls, style: "margin:0;padding:2px 10px" }, stText),
      el("span", { class: "muted" }, KIND[a.kind] || a.kind)),
    el("div", { class: "muted" }, scopeText(a) + "・" + a.total + " 題" + (a.time_limit_min ? "・限時 " + a.time_limit_min + " 分鐘" : "")),
    el("div", { class: "muted" }, "開始 " + fmt(a.start_at) + "　截止 " + (a.due_at ? fmt(a.due_at) : "不截止")),
    el("div", null, "完成 " + a.finished + " / " + a.members + " 人（開始作答 " + a.started + " 人）"),
  ];
  if (isEditing) kids.push(editBox(a));
  kids.push(el("div", { class: "t-actions" },
    el("a", { class: "btn", href: "report.html?id=" + encodeURIComponent(a.id) + "&class=" + encodeURIComponent(classId) }, "📊 成績"),
    a.is_open ? confirmable("close:" + a.id, "⏸ 關閉", "再按一次：關閉", () => act(() => rpc("rpc_update_assignment", { p_assignment_id: a.id, p_is_open: false }), "已關閉。孩子不能再作答，答案也會開放給家長看。"))
              : el("button", { class: "ghost", onclick: () => act(() => rpc("rpc_update_assignment", { p_assignment_id: a.id, p_is_open: true }), "已重新開放。") }, "▶ 重開"),
    el("button", { class: "ghost", onclick: () => { editing = isEditing ? null : a.id; render(); } }, isEditing ? "收起" : "✏️ 改名／截止時間"),
    confirmable("del:" + a.id, "🗑 刪除", "再按一次：確定刪除", () => act(() => rpc("rpc_delete_assignment", { p_assignment_id: a.id }), "已刪除。"))));
  return el("div", { class: "card class-card" }, kids);
}

function editBox(a) {
  const st = { title: a.title, due: a.due_at ? new Date(a.due_at).toISOString().slice(0, 16) : "" };
  // datetime-local wants local time, not UTC
  if (a.due_at) { const d = new Date(a.due_at); const p = n => String(n).padStart(2, "0"); st.due = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()); }
  const title = el("input", { id: "e-title-" + a.id, type: "text", maxlength: 60, value: st.title, oninput: e => { st.title = e.target.value; } });
  const due = el("input", { id: "e-due-" + a.id, type: "datetime-local", value: st.due, oninput: e => { st.due = e.target.value; } });
  return el("div", { class: "card" },
    el("label", { for: "e-title-" + a.id }, "標題"), title,
    el("label", { for: "e-due-" + a.id }, "截止時間"), due,
    el("div", { class: "row" },
      el("button", { onclick: () => { editing = null; return act(() => {
        const args = { p_assignment_id: a.id };
        if (st.title !== a.title) args.p_title = st.title;
        if (st.due) { if (!a.due_at || toIso(st.due) !== new Date(a.due_at).toISOString()) args.p_due_at = toIso(st.due); }
        else if (a.due_at) args.p_clear_due = true;
        return rpc("rpc_update_assignment", args);
      }, "已儲存。"); } }, "儲存"),
      el("button", { class: "ghost", onclick: () => { editing = null; render(); } }, "取消")));
}

try { await load(); render(); }
catch (e) {
  if (!(e instanceof ApiError && e.code === "session_invalid"))
    put(app, el("div", { class: "card empty" }, el("p", { class: "msg err" }, e.friendly || "載入失敗，請稍後再試。"), el("a", { class: "btn", href: "classes.html" }, "回我的班級")));
}
