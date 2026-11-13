// Parent home: agree to the trial notice, add children, and manage their picture passwords.
// All writes go through existing server functions (rpc_register_parent, rpc_create_child,
// rpc_reset_picture_password, rpc_unlock_student); this page only reads the parent's own family.
import { el } from "../../js/dom.js?v=858b6233";
import { PICS } from "../../js/config.js?v=858b6233";
import { sb, rpc, select } from "../../teacher/js/tapi.js?v=858b6233";
import { requireTeacher as requireSignedIn, signOut } from "../../teacher/js/tsession.js?v=858b6233";

const DOC_VERSION = "trial-2026-11";       // version of the notice shown below; stored with the consent
const app = document.getElementById("app");
const me = await requireSignedIn();        // any signed-in adult; redirects to the sign-in page otherwise
document.getElementById("who").replaceChildren(me.email + "　",
  el("button", { class: "ghost", onclick: signOut }, "登出"));

const state = {
  ready: false,            // has the parent role and has agreed to the notice
  family: null,            // { id, family_code }
  kids: [],
  reveal: null,            // one-time login details: { title, nickname, family_code, picture_password }
  confirmReset: null,      // student id waiting for a second click
  busy: false, msg: null, agree: false,
  form: { nickname: "", grade: 3, semester: "上" },
};

const friendly = e => (e && e.friendly) || "系統忙碌或網路不穩，請稍後再試。";
const picsOf = pw => String(pw).split("-").map(n => PICS[parseInt(n, 10) - 1] || "?").join(" ");

async function load() {
  const [roles, consents] = await Promise.all([
    select(sb.from("user_roles").select("role").eq("user_id", me.id)),
    select(sb.from("consents").select("kind").eq("user_id", me.id).eq("kind", "privacy")),
  ]);
  state.ready = roles.some(r => r.role === "parent") && consents.length > 0;
  state.family = null; state.kids = [];
  if (!state.ready) return;
  const fp = await select(sb.from("family_parents").select("family_id").eq("parent_id", me.id));
  if (!fp.length) return;                  // the family is created together with the first child
  const fid = fp[0].family_id;
  const [fam, kids] = await Promise.all([
    select(sb.from("families").select("id,family_code").eq("id", fid)),
    select(sb.from("students").select("id,nickname,grade,semester,personal_code,status").eq("family_id", fid).order("created_at")),
  ]);
  state.family = fam[0] || null;
  state.kids = kids;
}

async function run(fn) {
  if (state.busy) return;
  state.busy = true; state.msg = null; render();
  try { await fn(); } catch (e) { state.msg = { cls: "err", text: friendly(e) }; }
  state.busy = false; render();
}

const agree = () => run(async () => {
  await rpc("rpc_register_parent", { p_doc_version: DOC_VERSION });
  await load();
});

const addChild = () => run(async () => {
  const nick = state.form.nickname.trim();
  if (!nick) { state.msg = { cls: "warn", text: "請先輸入孩子的暱稱。" }; return; }
  const r = await rpc("rpc_create_child", { p_nickname: nick, p_grade: Number(state.form.grade), p_semester: state.form.semester });
  state.reveal = { title: "「" + r.nickname + "」的登入資料", nickname: r.nickname, family_code: r.family_code, picture_password: r.picture_password };
  state.form.nickname = "";
  await load();
});

const resetPw = kid => run(async () => {
  state.confirmReset = null;
  const r = await rpc("rpc_reset_picture_password", { p_student_id: kid.id });
  state.reveal = { title: "「" + kid.nickname + "」的新圖卡密碼", nickname: kid.nickname, family_code: state.family.family_code, picture_password: r.picture_password };
});

const unlock = kid => run(async () => {
  await rpc("rpc_unlock_student", { p_student_id: kid.id });
  state.msg = { cls: "ok", text: "已經幫「" + kid.nickname + "」解除鎖定，可以再登入了。" };
});

function noticeCard() {
  const box = el("input", { type: "checkbox", onchange: e => { state.agree = e.target.checked; render(); } });
  box.checked = state.agree;
  return el("div", { class: "card" },
    el("h2", null, "開始之前：試用說明"),
    el("p", null, "微小星火目前是親友試用階段，請先看過下面的說明："),
    el("ul", null,
      el("li", null, "孩子只用暱稱登入，不需要提供真實姓名、電子信箱或電話。"),
      el("li", null, "平台會記錄孩子的年級與學期、作答內容與成績，以及得到的星星和獎勵，用來顯示學習進度。"),
      el("li", null, "資料存放在雲端的測試環境。正式的隱私說明還在準備中。"),
      el("li", null, "想刪除孩子的資料，可以隨時聯絡平台管理者。")),
    el("label", { class: "row" }, box, " 我已閱讀並同意以上說明"),
    el("div", { class: "row" }, el("button", { disabled: state.busy || !state.agree, onclick: agree }, state.busy ? "處理中…" : "同意並開始")));
}

function revealCard() {
  const r = state.reveal;
  return el("div", { class: "card", role: "status" },
    el("h2", null, r.title + "（只顯示這一次）"),
    el("div", { class: "pw-box" },
      el("p", null, "家庭代碼：", el("span", { class: "code" }, r.family_code)),
      el("p", null, "暱稱：", el("b", null, r.nickname)),
      el("p", null, "圖卡密碼（照順序點）："),
      el("div", { class: "pics-line" }, picsOf(r.picture_password)),
      el("p", { class: "muted" }, "圖卡編號：" + r.picture_password)),
    el("p", null, "孩子登入的方法：打開「孩子登入」→ 選「家庭代碼」→ 輸入家庭代碼和暱稱 → 照順序點這 4 張圖卡。"),
    el("p", { class: "muted" }, "這個畫面關閉後不會再顯示圖卡密碼，請現在記下來。忘記時可以按「重設圖卡密碼」。"),
    el("div", { class: "row" },
      el("a", { href: "../login.html", target: "_blank", rel: "noopener" }, "打開孩子登入頁"),
      el("button", { class: "ghost", onclick: () => { state.reveal = null; render(); } }, "我記下來了，關閉")));
}

function kidsCard() {
  const rows = state.kids.map(k => el("tr", null,
    el("td", { "data-label": "暱稱" }, el("b", null, k.nickname), k.status === "pending_delete" ? el("span", { class: "muted" }, "（已申請刪除）") : null),
    el("td", { "data-label": "年級" }, k.grade + " 年級" + k.semester + "學期"),
    el("td", { "data-label": "個人代碼" }, k.personal_code),
    el("td", null, el("div", { class: "t-actions" },
      state.confirmReset === k.id
        ? [el("span", null, "舊的圖卡密碼會失效，確定嗎？"),
           el("button", { disabled: state.busy, onclick: () => resetPw(k) }, "確定重設"),
           el("button", { class: "ghost", disabled: state.busy, onclick: () => { state.confirmReset = null; render(); } }, "取消")]
        : [el("button", { class: "ghost", disabled: state.busy, onclick: () => { state.confirmReset = k.id; render(); } }, "🔑 重設圖卡密碼"),
           el("button", { class: "ghost", disabled: state.busy, onclick: () => unlock(k) }, "🔓 解除鎖定")]))));
  return el("div", { class: "card" },
    el("h2", null, "我的孩子"),
    state.family ? el("p", null, "家庭代碼：", el("span", { class: "code" }, state.family.family_code),
      el("span", { class: "muted" }, "　全家的孩子共用這一組代碼，再用暱稱分辨。")) : null,
    state.kids.length
      ? el("table", { class: "t-table" },
          el("thead", null, el("tr", null, el("th", null, "暱稱"), el("th", null, "年級"), el("th", null, "個人代碼"), el("th", null, "管理"))),
          el("tbody", null, rows))
      : el("p", { class: "muted" }, "還沒有孩子。請用下面的表單幫孩子開帳號。"));
}

function addCard() {
  const f = state.form;
  const nick = el("input", { id: "c-nick", type: "text", maxlength: 20, autocomplete: "off", value: f.nickname, placeholder: "例如：小安",
    oninput: e => { f.nickname = e.target.value; }, onkeydown: e => { if (e.key === "Enter") addChild(); } });
  const grade = el("select", { id: "c-grade", onchange: e => { f.grade = Number(e.target.value); } },
    [1, 2, 3, 4, 5, 6].map(g => el("option", { value: g, selected: g === f.grade }, g + " 年級")));
  const sem = el("select", { id: "c-sem", onchange: e => { f.semester = e.target.value; } },
    ["上", "下"].map(s => el("option", { value: s, selected: s === f.semester }, s + "學期")));
  return el("div", { class: "card" },
    el("h2", null, "＋ 幫孩子開帳號"),
    el("label", { for: "c-nick" }, "孩子的暱稱（不要用真實姓名，最多 20 個字）"), nick,
    el("div", { class: "row" },
      el("label", { for: "c-grade" }, "年級"), grade,
      el("label", { for: "c-sem" }, "學期"), sem),
    el("p", { class: "muted" }, "目前只有三年級上學期有題目；選其他年級或學期，孩子登入後會看不到關卡。"),
    el("div", { class: "row" }, el("button", { disabled: state.busy, onclick: addChild }, state.busy ? "建立中…" : "建立帳號並產生登入資料")));
}

function render() {
  const prev = document.activeElement;
  const focusId = prev && prev.id && app.contains(prev) ? prev.id : null;
  const parts = [];
  if (!state.ready) parts.push(noticeCard());
  else {
    if (state.reveal) parts.push(revealCard());
    parts.push(kidsCard(), addCard());
  }
  if (state.msg) parts.push(el("div", { class: "msg " + state.msg.cls, role: "status" }, state.msg.text));
  app.replaceChildren(...parts);
  const f = focusId && document.getElementById(focusId);
  if (f && !f.disabled) f.focus();
}

try { await load(); } catch (e) { state.msg = { cls: "err", text: friendly(e) }; }
render();
