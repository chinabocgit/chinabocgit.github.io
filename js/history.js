// My records: assignment results and practice history. Details open on attempt.html (works on any device).
import { el } from "./dom.js?v=27c00f96";
import { rpc, ApiError } from "./api.js?v=27c00f96";
import { requireStudent } from "./session.js?v=27c00f96";

const app = document.getElementById("app");
const me = await requireStudent();
document.getElementById("who").textContent = me.nickname;
const put = (parent, ...kids) => parent.replaceChildren(...kids.flat().filter(Boolean));
const when = iso => new Date(iso).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const STATUS = { finished: "已交卷", in_progress: "做到一半", not_started: "還沒做", missed: "沒交" };

try {
  const [prog, hist] = await Promise.all([rpc("rpc_child_progress", { p_student_id: me.student_id }), rpc("rpc_my_practice_history", { p_limit: 30 })]);
  const asg = prog.assignments || [];
  put(app,
    el("div", { class: "card" }, el("h2", null, "📋 老師派的作業"),
      asg.length ? asg.map(a => el("div", { class: "cert-row" },
        el("span", { class: "grow" }, el("b", null, a.title),
          el("div", { class: "muted" }, (STATUS[a.status] || a.status) + "・開始 " + when(a.start_at))),
        a.status === "finished" ? el("span", { class: "muted" }, a.correct + "/" + a.total + " 題・" + a.score + " 分") : null,
        a.attempt_id && a.status === "finished" ? el("a", { class: "btn", href: "attempt.html?id=" + encodeURIComponent(a.attempt_id) }, "看詳情") : null))
        : el("p", { class: "muted" }, "目前沒有作業。")),
    el("div", { class: "card" }, el("h2", null, "🎯 我的練習（最近 30 次）"),
      hist.items.length ? hist.items.map(h => el("div", { class: "cert-row" },
        el("span", { class: "grow" }, el("b", null, h.level_name || "練習"),
          el("div", { class: "muted" }, when(h.finished_at) + "・" + h.correct + "/" + h.total + " 題・" + h.score + " 分"
            + (h.stars ? "・" + "⭐".repeat(h.stars) : "") + (h.collectible === "gold" ? "・🥇" : h.collectible === "normal" ? "・🏅" : ""))),
        el("a", { class: "btn ghost", href: "attempt.html?id=" + encodeURIComponent(h.attempt_id) }, "看詳情")))
        : el("p", { class: "muted" }, "還沒有練習紀錄，去地圖玩一關吧！")));
} catch (e) {
  if (!(e instanceof ApiError && e.code === "session_invalid"))
    put(app, el("div", { class: "card empty" }, el("p", { class: "msg err" }, "載入失敗：" + (e.friendly || "請稍後再試")), el("button", { onclick: () => location.reload() }, "重新載入")));
}
