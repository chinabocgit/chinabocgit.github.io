// Shared pieces for the admin pages: the sign-in and admin-role check, the page output helpers, and the navigation bar.
import { el } from "../../js/dom.js?v=c9b988ea";
import { sb, select } from "../../teacher/js/tapi.js?v=c9b988ea";

export const app = document.getElementById("app");
export const put = (...kids) => app.replaceChildren(...kids.flat().filter(Boolean));
export const note = (cls, text) => el("div", { class: "msg " + cls, role: "status" }, text);

// Returns the admin's user id, or null after showing a message or redirecting to the shared sign-in page.
export async function gate() {
  const { data } = await sb.auth.getSession();
  if (!data.session) { location.replace("../teacher/index.html"); return null; }
  const me = data.session.user.id;
  const roles = await select(sb.from("user_roles").select("role").eq("user_id", me).eq("role", "admin"));
  if (!roles.length) { put(el("div", { class: "card" }, "只有管理者可以使用這個頁面。")); return null; }
  return me;
}

const PAGES = [["index.html", "平台設定與公告"], ["teachers.html", "老師申請"], ["reports.html", "題目回報"], ["stats.html", "使用統計"]];

// Navigation bar shown at the top of every admin page; the current page is marked.
export function navBar(current) {
  return el("nav", { class: "adminnav", "aria-label": "管理頁面" },
    PAGES.map(([href, text]) => el("a", { href, class: href === current ? "on" : "", "aria-current": href === current ? "page" : null }, text)));
}
