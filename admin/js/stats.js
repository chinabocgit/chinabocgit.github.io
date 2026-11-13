// Usage statistics: daily activity, practice by subject, and the questions children find hardest. Only totals; no names.
import { el } from "../../js/dom.js?v=df105d9d";
import { rpc, ApiError } from "../../teacher/js/tapi.js?v=df105d9d";
import { signOut } from "../../teacher/js/tsession.js?v=df105d9d";
import { put, note, gate, navBar } from "./common.js?v=df105d9d";

document.getElementById("logout").addEventListener("click", signOut);

function table(headers, rows) {
  return el("table", null,
    el("thead", null, el("tr", null, headers.map(h => el("th", null, h)))),
    el("tbody", null, rows.length ? rows.map(r => el("tr", null, r.map(c => el("td", null, String(c))))) : el("tr", null, el("td", { colspan: headers.length }, "沒有資料"))));
}

async function main() {
  const me = await gate();
  if (!me) return;
  const days = Number(new URLSearchParams(location.search).get("days")) || 14;
  try {
    const s = await rpc("rpc_admin_usage_stats", { p_days: days });
    put(navBar("stats.html"),
      el("div", { class: "row" }, [7, 14, 30].map(d => el("a", { href: "stats.html?days=" + d, class: d === days ? "btn" : "" }, "最近 " + d + " 天"))),
      el("section", { class: "card" }, el("h2", null, "每日使用"), table(["日期", "使用的孩子人數", "作答次數"], s.daily.map(d => [d.day, d.students, d.attempts]))),
      el("section", { class: "card" }, el("h2", null, "各科作答次數"), table(["科目代碼", "作答次數"], s.by_subject.map(x => [x.subject_id, x.attempts]))),
      el("section", { class: "card" }, el("h2", null, "最難的題目（答對率低、至少 10 人作答）"),
        table(["題目", "作答人次", "答對率（%）"], s.hardest_questions.map(h => [h.stem, h.answered, h.accuracy]))));
  } catch (e) {
    put(navBar("stats.html"), note("err", e instanceof ApiError ? e.friendly : "讀取失敗，請稍後再試。"));
  }
}
main();
