// Theme settings: choose the default theme per grade, and enable or disable themes. Admin only (the database enforces it).
import { el } from "../../js/dom.js?v=50bfb336";
import { rpc, ApiError } from "../../teacher/js/tapi.js?v=50bfb336";
import { signOut } from "../../teacher/js/tsession.js?v=50bfb336";
import { put, note, gate, navBar } from "./common.js?v=50bfb336";

document.getElementById("logout").addEventListener("click", signOut);
let flash = null;
const GRADE_NAME = ["", "一年級", "二年級", "三年級", "四年級", "五年級", "六年級"];

async function main() {
  if (!(await gate())) return;
  const reload = async () => {
    try {
      const data = await rpc("rpc_admin_theme_settings");
      const act = async (fn, okText) => {
        try { await fn(); flash = note("ok", okText); }
        catch (e) { flash = note("err", e instanceof ApiError ? e.friendly : "操作沒成功，請稍後再試。"); }
        reload();
      };
      const enabled = data.themes.filter(t => t.enabled);
      const options = [["", "（不指定，用平台預設）"], ...enabled.map(t => [t.id, t.name])];
      const gradeRows = data.grades.map(g => {
        const s = el("select", { "aria-label": GRADE_NAME[g.grade] + "預設主題",
          onchange: e => act(() => rpc("rpc_admin_set_grade_theme", { p_grade: g.grade, p_theme_id: e.target.value || null }),
            GRADE_NAME[g.grade] + "的預設主題已更新。") }, options.map(([v, t]) => el("option", { value: v }, t)));
        s.value = g.theme_id || "";
        return el("div", { class: "row" }, el("b", null, GRADE_NAME[g.grade]), s);
      });
      const themeRows = data.themes.map(t => el("div", { class: "row" },
        el("b", null, t.name), el("span", { class: "muted" }, "（" + t.id + "）收藏物：" + t.collectible_name + "　班級指定 " + t.class_count + " 班、家長指定 " + t.child_count + " 位"),
        el("span", { class: "sp" }),
        el("span", null, t.enabled ? "啟用中" : "已停用"),
        el("button", { class: t.enabled ? "ghost" : "", onclick: () => act(() => rpc("rpc_admin_set_theme_enabled", { p_theme_id: t.id, p_enabled: !t.enabled }),
          t.enabled ? "已停用「" + t.name + "」。" : "已啟用「" + t.name + "」。") }, t.enabled ? "停用" : "啟用")));
      put(navBar("themes.html"), flash,
        el("section", { class: "card" }, el("h2", null, "各年級預設主題"),
          el("p", { class: "muted" }, "孩子地圖的主題順序：家長指定 → 班級指定 → 這裡的年級預設 → 平台預設（第一個啟用的主題）。更改後孩子下次開啟地圖就會看到。"),
          gradeRows),
        el("section", { class: "card" }, el("h2", null, "主題清單"),
          el("p", { class: "muted" }, "停用前，要先把用到它的年級預設改掉；已指定它的班級或家長會自動改用下一順位。至少要保留一個啟用中的主題。目前只有「火花小鎮」有專屬樣式，其他主題先沿用中性外觀。"),
          themeRows));
      flash = null;
    } catch (e) { put(navBar("themes.html"), note("err", e instanceof ApiError ? e.friendly : "讀取失敗，請稍後再試。")); }
  };
  reload();
}
main();
