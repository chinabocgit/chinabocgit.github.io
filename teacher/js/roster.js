// Roster management: add students in a batch (login cards shown ONCE), approve join requests, edit nickname / seat,
// remove a student from the class, give an equipment item. All rules live in the database; this page only collects input.
import { el } from "../../js/dom.js?v=4e265fbc";
import { PICS } from "../../js/config.js?v=4e265fbc";
import { sb, rpc, select, ApiError } from "./tapi.js?v=4e265fbc";
import { requireTeacher, signOut } from "./tsession.js?v=4e265fbc";

const app = document.getElementById("app");
const me = await requireTeacher();
document.getElementById("who").textContent = me.name || me.email;
document.getElementById("logout").addEventListener("click", signOut);
const classId = new URLSearchParams(location.search).get("class");
document.getElementById("back").href = "class.html?id=" + encodeURIComponent(classId || "");
const put = (parent, ...kids) => parent.replaceChildren(...kids.flat().filter(Boolean));
const when = iso => iso ? new Date(iso).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

let S = null, flash = null, armed = null, armTimer = null;
let batch = { text: "", informed: false };
let cards = null;               // login cards from the last batch: shown once, kept only in memory
let giftPick = {};              // student_id -> equipment id
let owner = false;

async function load() {
  const [cls, roles, students, pending, catalog] = await Promise.all([
    select(sb.from("classes").select("id,name,status").eq("id", classId)),
    select(sb.from("class_teachers").select("role").eq("class_id", classId).eq("teacher_id", me.id)),
    rpc("rpc_class_student_summary", { p_class_id: classId }),
    select(sb.from("class_memberships").select("id,joined_at,seat_no,students(nickname)").eq("class_id", classId).eq("status", "pending")),
    rpc("rpc_catalog")]);
  if (!cls[0]) throw new ApiError("not_found", "找不到這個班級，或你不是這個班的老師。");
  owner = !!(roles[0] && roles[0].role === "homeroom");
  S = { cls: cls[0], students, pending, gifts: catalog.equipment.filter(e => e.teacher_giftable) };
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

/* ---------- add students ---------- */
// One student per line: "座號 暱稱" (e.g. "3 小明") or just "暱稱".
function parseBatch(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = /^(\d{1,2})[\s,，、.]+(.+)$/.exec(l);
    return m ? { seat_no: Number(m[1]), nickname: m[2].trim() } : { nickname: l };
  });
}

async function addBatch() {
  const items = parseBatch(batch.text);
  if (!items.length) { flash = { cls: "err", text: "請先輸入學生名單，一行一位。" }; return render(); }
  try {
    const r = await rpc("rpc_roster_add_students", { p_class_id: classId, p_informed: batch.informed, p_items: items });
    cards = r.students || r.items || r;          // keep the list of created students in memory only
    batch = { text: "", informed: batch.informed };
    flash = { cls: "ok", text: "已建立 " + cards.length + " 位學生。登入資料只顯示這一次，請現在記下或列印。" };
  } catch (e) { if (e instanceof ApiError && e.code === "session_invalid") return; flash = { cls: "err", text: e.friendly || "建立沒成功。" }; }
  await load(); render();
}

function cardsBox() {
  const text = cards.map(c => c.nickname + "｜個人代碼 " + c.personal_code + "｜圖卡 " + c.picture_password + "｜家長綁定碼 " + c.binding_code).join("\n");
  return el("div", { class: "pw-box", role: "status" },
    el("b", null, "登入資料（只顯示這一次）"),
    el("p", { class: "muted" }, "這些登入資料關閉後不會再顯示（圖卡密碼忘記時，可在班級頁用「重設圖卡密碼」）。請當面交給孩子，或複製後發給家長。"),
    el("table", { class: "t-table" },
      el("thead", null, el("tr", null, ["座號", "暱稱", "個人代碼", "圖卡密碼", "家長綁定碼"].map(h => el("th", null, h)))),
      el("tbody", null, cards.map(c => el("tr", null,
        el("td", { "data-label": "座號" }, c.seat_no == null ? "—" : String(c.seat_no)),
        el("td", { "data-label": "暱稱" }, el("b", null, c.nickname)),
        el("td", { "data-label": "個人代碼" }, el("span", { class: "code", style: "font-size:16px" }, c.personal_code)),
        el("td", { "data-label": "圖卡密碼" }, el("span", { style: "font-size:28px" }, c.picture_password.split("-").map(n => PICS[parseInt(n, 10) - 1] || "?").join(" ")), el("div", { class: "muted" }, c.picture_password)),
        el("td", { "data-label": "家長綁定碼" }, el("span", { class: "code", style: "font-size:16px" }, c.binding_code)))))),
    el("div", { class: "row" },
      el("button", { class: "ghost", onclick: async () => { try { await navigator.clipboard.writeText(text); flash = { cls: "ok", text: "已複製到剪貼簿。" }; } catch { flash = { cls: "warn", text: "這個瀏覽器不允許複製，請手動選取。" }; } render(); } }, "📋 複製全部"),
      el("button", { onclick: () => { cards = null; flash = null; render(); } }, "我記下來了，關閉")));
}

/* ---------- render ---------- */
function render() {
  const s = S.students;
  put(app,
    flash ? el("div", { class: "msg " + flash.cls, role: "status" }, flash.text) : null,
    cards ? cardsBox() : null,
    owner ? el("div", { class: "card" }, el("h2", null, "＋ 新增學生"),
      el("label", { for: "b-text" }, "一行一位。格式：「座號 暱稱」，例如「3 小明」；不寫座號也可以（暱稱 1～20 字，不要用真名）"),
      el("textarea", { id: "b-text", rows: 6, style: "width:100%;font:inherit;padding:10px;border:2px solid var(--line);border-radius:12px", oninput: e => { batch.text = e.target.value; } }, batch.text),
      el("label", { class: "row" }, el("input", { type: "checkbox", checked: batch.informed, onchange: e => { batch.informed = e.target.checked; } }), "我已告知本班家長會使用本平台（必填）"),
      el("div", { class: "row" }, el("button", { onclick: addBatch }, "建立學生並產生登入資料"))) : null,
    S.pending.length ? el("div", { class: "card" }, el("h2", null, "入班申請（" + S.pending.length + "）"),
      S.pending.map(p => el("div", { class: "cert-row" },
        el("span", { class: "grow" }, el("b", null, (p.students && p.students.nickname) || "（未命名）"), el("div", { class: "muted" }, "申請時間 " + when(p.joined_at))),
        el("button", { disabled: !owner, onclick: () => act(() => rpc("rpc_review_join_request", { p_membership_id: p.id, p_approve: true }), "已同意入班。") }, "同意"),
        confirmable("rej:" + p.id, "拒絕", "再按一次：確定拒絕", () => act(() => rpc("rpc_review_join_request", { p_membership_id: p.id, p_approve: false }), "已拒絕。"))))) : null,
    el("div", { class: "card" }, el("h2", null, "學生（" + s.length + "）"),
      !owner ? el("p", { class: "muted" }, "你是科任老師；名單與贈送裝備只有導師可以操作。") : null,
      s.length ? s.map(studentRow) : el("p", { class: "muted" }, "這個班還沒有學生。")));
}

function studentRow(x) {
  const st = { nick: x.nickname, seat: x.seat_no == null ? "" : String(x.seat_no) };
  const gift = giftPick[x.student_id] || (S.gifts[0] && S.gifts[0].id) || "";
  return el("div", { class: "card" },
    el("div", { class: "row" },
      el("b", null, x.nickname), el("span", { class: "muted" }, "座號 " + (x.seat_no == null ? "—" : x.seat_no))),
    owner ? el("div", { class: "row" },
      el("label", { for: "n-" + x.student_id, class: "sr-only" }, "暱稱"),
      el("input", { id: "n-" + x.student_id, type: "text", maxlength: 20, value: st.nick, style: "max-width:200px", oninput: e => { st.nick = e.target.value; } }),
      el("button", { class: "ghost", onclick: () => act(() => rpc("rpc_update_nickname", { p_student_id: x.student_id, p_nickname: st.nick }), "暱稱已更新。") }, "改暱稱"),
      el("label", { for: "s-" + x.student_id, class: "sr-only" }, "座號"),
      el("input", { id: "s-" + x.student_id, type: "text", inputmode: "numeric", value: st.seat, style: "max-width:80px", oninput: e => { st.seat = e.target.value; } }),
      el("button", { class: "ghost", onclick: () => act(() => rpc("rpc_set_seat_no", { p_student_id: x.student_id, p_seat_no: Number(st.seat) }), "座號已更新。") }, "改座號")) : null,
    owner ? el("div", { class: "row" },
      S.gifts.length ? [
        el("label", { for: "g-" + x.student_id, class: "sr-only" }, "贈送裝備"),
        (() => { const s = el("select", { id: "g-" + x.student_id, onchange: e => { giftPick[x.student_id] = e.target.value; } }, S.gifts.map(g => el("option", { value: g.id }, g.name))); s.value = gift; return s; })(),
        el("button", { class: "ghost", onclick: () => act(() => rpc("rpc_gift_equipment", { p_student_id: x.student_id, p_equipment_id: giftPick[x.student_id] || gift }), "已贈送裝備給 " + x.nickname + "。") }, "🎁 贈送裝備")] : null,
      confirmable("rm:" + x.student_id, "移出班", "再按一次：確定移出", () => act(() => rpc("rpc_remove_student_from_class", { p_student_id: x.student_id }), x.nickname + " 已移出班級。"))) : null);
}

try { await load(); render(); }
catch (e) {
  if (!(e instanceof ApiError && e.code === "session_invalid"))
    put(app, el("div", { class: "card empty" }, el("p", { class: "msg err" }, e.friendly || "載入失敗，請稍後再試。"), el("a", { class: "btn", href: "classes.html" }, "回我的班級")));
}
