// Teacher applications: list pending requests, approve, or reject with a reason.
import { el } from "../../js/dom.js?v=86bf2cc1";
import { sb, rpc, select, ApiError } from "../../teacher/js/tapi.js?v=86bf2cc1";
import { signOut } from "../../teacher/js/tsession.js?v=86bf2cc1";
import { put, note, gate, navBar } from "./common.js?v=86bf2cc1";
import { validateReject } from "./adminCheck.js?v=86bf2cc1";

document.getElementById("logout").addEventListener("click", signOut);
let flash = null;

async function load(status) {
  const [apps, subjects] = await Promise.all([
    rpc("rpc_admin_list_teacher_applications", { p_status: status }),
    select(sb.from("subjects").select("id,name")),
  ]);
  const subjectName = Object.fromEntries(subjects.map(s => [s.id, s.name]));
  return { apps, subjectName };
}

function card(a, subjectName, reload) {
  const reason = el("input", { placeholder: "退回原因（1 到 200 字）", maxlength: 200 });
  const act = async (approve) => {
    const v = approve ? { ok: true } : validateReject(reason.value);
    if (!v.ok) { flash = note("err", v.text); return reload(); }
    try {
      await rpc("rpc_admin_review_teacher", { p_id: a.id, p_approve: approve, p_reason: approve ? "" : reason.value.trim() });
      flash = note("ok", approve ? "已通過，對方會收到通知。" : "已退回，對方會收到通知與原因。");
    } catch (e) { flash = note("err", e instanceof ApiError ? e.friendly : "操作沒成功，請稍後再試。"); }
    reload();
  };
  const pending = a.status === "pending";
  return el("section", { class: "card" },
    el("h2", null, a.display_name + "（" + (a.email || "無信箱") + "）"),
    el("p", null, "學校：" + (a.school_name || "未填") + (a.school_county ? "（" + a.school_county + "）" : "")),
    el("p", null, "任教科目：" + (a.subjects || []).map(s => subjectName[s] || s).join("、")),
    el("p", null, ".edu.tw 信箱：" + (a.email_is_edu ? "是" : "否")),
    el("p", { class: "muted" }, "申請時間：" + new Date(a.created_at).toLocaleString("zh-TW") + "　狀態：" + a.status + (a.reject_reason ? "　原因：" + a.reject_reason : "")),
    pending ? el("div", { class: "row" }, el("button", { onclick: () => act(true) }, "通過"), reason, el("button", { class: "danger", onclick: () => act(false) }, "退回")) : null);
}

async function main() {
  const me = await gate();
  if (!me) return;
  const status = new URLSearchParams(location.search).get("status") || "pending";
  const reload = async () => {
    try {
      const { apps, subjectName } = await load(status);
      put(navBar("teachers.html"), flash,
        el("div", { class: "row" }, ["pending", "approved", "rejected", "all"].map(s =>
          el("a", { href: "teachers.html?status=" + s, class: s === status ? "btn" : "" }, { pending: "待審", approved: "已通過", rejected: "已退回", all: "全部" }[s]))),
        apps.length ? apps.map(a => card(a, subjectName, reload)) : el("div", { class: "card" }, "目前沒有這類申請。"));
      flash = null;
    } catch (e) { put(navBar("teachers.html"), note("err", e instanceof ApiError ? e.friendly : "讀取失敗，請稍後再試。")); }
  };
  reload();
}
main();
