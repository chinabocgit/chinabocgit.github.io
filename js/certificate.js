// Certificate page: shows one unit certificate and prints on A4 landscape. All text is set with textContent (no HTML).
import { el } from "./dom.js?v=551015e2";
import { rpc, ApiError } from "./api.js?v=551015e2";
import { requireStudent } from "./session.js?v=551015e2";

const app = document.getElementById("app");
const me = await requireStudent();
document.getElementById("who").textContent = me.nickname;
const unitId = new URLSearchParams(location.search).get("unit");

function fail(text) {
  app.replaceChildren(el("div", { class: "card empty" }, el("p", { class: "msg warn" }, text),
    el("div", { class: "row" }, el("a", { class: "btn", href: "rewards.html" }, "回我的收藏"))));
}

try {
  const data = await rpc("rpc_my_certificates");
  const c = data.certificates.find(x => x.unit_id === unitId);
  if (!c) fail("這個單元還沒有證書。全部關卡都過關就會拿到！");
  else {
    const date = new Date(c.issued_at).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
    app.replaceChildren(el("div", { class: "cert-wrap" },
      el("article", { class: "cert", "aria-label": "學習證書" },
        el("div", { class: "org" }, "✨ 微小星火 ✨"),
        el("h1", null, "學習證書"),
        el("div", null, el("span", { class: "name" }, me.nickname)),
        el("p", { class: "body" }, "完成了「" + c.unit_title + "」單元的所有關卡，", el("br"), "認真學習，值得鼓勵！"),
        el("div", { class: "seal", "aria-hidden": "true" }, "🏅"),
        el("div", { class: "foot" }, el("span", null, date), c.teacher_name ? el("span", null, "導師：" + c.teacher_name) : null)),
      el("div", { class: "row actions" },
        el("button", { onclick: () => window.print() }, "🖨️ 列印證書"),
        el("a", { class: "btn ghost", href: "rewards.html" }, "回我的收藏"))));
  }
} catch (e) {
  if (!(e instanceof ApiError && e.code === "session_invalid")) fail("載入失敗：" + (e.friendly || "請稍後再試"));
}
