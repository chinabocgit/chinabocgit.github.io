// Question reports: list reports, mark them fixed or dismissed with an optional note. Fixing the question text itself is done through a new version (not here).
import { el } from "../../js/dom.js?v=858b6233";
import { rpc, ApiError } from "../../teacher/js/tapi.js?v=858b6233";
import { signOut } from "../../teacher/js/tsession.js?v=858b6233";
import { put, note, gate, navBar } from "./common.js?v=858b6233";
import { validateReportNote } from "./adminCheck.js?v=858b6233";

document.getElementById("logout").addEventListener("click", signOut);
let flash = null;

function card(r, reload) {
  const noteIn = el("input", { placeholder: "備註（可不填，最多 300 字）", maxlength: 300 });
  const act = async (status) => {
    const v = validateReportNote(noteIn.value);
    if (!v.ok) { flash = note("err", v.text); return reload(); }
    try {
      await rpc("rpc_admin_resolve_report", { p_id: r.id, p_status: status, p_note: v.value });
      flash = note("ok", status === "fixed" ? "已標記為已修正。" : "已駁回。");
    } catch (e) { flash = note("err", e instanceof ApiError ? e.friendly : "操作沒成功，請稍後再試。"); }
    reload();
  };
  const open = r.status === "open";
  return el("section", { class: "card" },
    el("p", { class: "muted" }, new Date(r.created_at).toLocaleString("zh-TW") + "　狀態：" + r.status + (r.reporter_email ? "　回報人：" + r.reporter_email : "")),
    el("p", null, "題目：" + (r.question_stem || "")),
    el("p", null, "回報原因：" + r.reason),
    r.admin_note ? el("p", { class: "muted" }, "管理者備註：" + r.admin_note) : null,
    open ? el("div", { class: "row" }, el("button", { onclick: () => act("fixed") }, "已修正"), noteIn, el("button", { class: "ghost", onclick: () => act("dismissed") }, "駁回")) : null);
}

async function main() {
  const me = await gate();
  if (!me) return;
  const status = new URLSearchParams(location.search).get("status") || "open";
  const reload = async () => {
    try {
      const rows = await rpc("rpc_admin_list_reports", { p_status: status });
      put(navBar("reports.html"), flash,
        el("div", { class: "row" }, ["open", "fixed", "dismissed", "all"].map(s =>
          el("a", { href: "reports.html?status=" + s, class: s === status ? "btn" : "" }, { open: "待處理", fixed: "已修正", dismissed: "已駁回", all: "全部" }[s]))),
        rows.length ? rows.map(r => card(r, reload)) : el("div", { class: "card" }, "目前沒有回報。"));
      flash = null;
    } catch (e) { put(navBar("reports.html"), note("err", e instanceof ApiError ? e.friendly : "讀取失敗，請稍後再試。")); }
  };
  reload();
}
main();
