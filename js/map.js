// Map home: subject tabs, units as blocks, levels as lamps, rewards summary, open-assignment banner.
import { el } from "./dom.js?v=551015e2";
import { ApiError } from "./api.js?v=551015e2";
import { requireStudent, onTick, logout } from "./session.js?v=551015e2";
import { loadMapData, buildMap, recommendNext } from "./data.js?v=551015e2";
import { applyTheme } from "./theme.js?v=551015e2";
import { renderMap } from "./mapview.js?v=551015e2";

const app = document.getElementById("app");
const me = await requireStudent();

function fmtLeft(ms) {
  if (ms <= 0) return "0 秒";
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return (h ? h + " 小時 " : "") + m + " 分 " + (s % 60) + " 秒";
}
const KIND = { quiz: "一般關卡", boss: "魔王關", interactive: "互動遊戲", exam: "月考" };
const starText = n => (n > 0 ? "⭐".repeat(Math.min(n, 3)) : "");

let state = { map: [], subjectIdx: 0, selected: null, ui: null, asg: [] };

async function start() {
  document.getElementById("who").textContent = me.nickname;
  let data;
  try {
    data = await loadMapData(me);
  } catch (e) {
    if (e instanceof ApiError && e.code === "session_invalid") return;   // the api layer is redirecting
    app.replaceChildren(el("div", { class: "card empty" },
      el("p", null, "地圖載入失敗：" + (e.friendly || "請稍後再試") ),
      el("button", { onclick: () => location.reload() }, "重新載入")));
    return;
  }
  state.ui = applyTheme(data.theme);
  state.map = buildMap(data);
  state.asg = data.asg.assignments || [];          // everything the teacher gave, so finished work stays visible
  state.rewards = data.rewards;
  state.chests = data.chests ? data.chests.unopened : 0;
  state.pet = data.pets && data.pets.active_pet_id ? (data.pets.pets.find(p => p.id === data.pets.active_pet_id) || null) : null;
  render();
}

function render() {
  const rw = state.rewards;
  const header = document.getElementById("who");
  header.replaceChildren(
    el("span", { class: "pills" },
      el("span", { class: "pill" }, "🧒 " + me.nickname),
      el("span", { class: "pill", title: "星星" }, "⭐ " + rw.stars),
      el("span", { class: "pill", title: state.ui.collectibleName }, "🏅 " + state.ui.collectibleName + " " + rw.collectibles),
      el("a", { class: "pill", href: "rewards.html", style: "text-decoration:none;color:inherit" },
        "🎒 我的收藏" + (state.chests ? "　🎁 " + state.chests : ""))));

  const parts = [state.map.length ? continueCard() : null, navRow()];
  if (state.asg.length) parts.push(assignmentBanner());
  if (!state.map.length) {
    parts.push(el("div", { class: "card empty" },
      el("p", { class: "big" }, "🗺️ 地圖還沒有內容"),
      el("p", { class: "muted" }, "你的年級和學期目前還沒有可玩的單元，請稍後再來看看。")));
  } else {
    if (state.map.length > 1) parts.push(subjectTabs());
    const cur = state.map[state.subjectIdx];
    parts.push(el("div", { class: "scene-wrap" }, renderMap({ units: cur.units, theme: state.ui.id || "town", pet: state.pet,
      selectedId: state.selected && state.selected.id, collectibleName: state.ui.collectibleName,
      onSelect: l => { state.selected = l; render(); } })));
    if (state.selected) parts.push(detail(state.selected));
  }
  parts.push(footer());
  app.replaceChildren(...parts.filter(Boolean));
  if (!state.scrolled) {                          // first render only: bring the current stop to the middle of the screen
    state.scrolled = true;
    const cur = document.querySelector(".stop.current");
    if (cur) requestAnimationFrame(() => cur.scrollIntoView({ block: "center", behavior: "auto" }));
  }
}

// The child can always keep going without a teacher: one big button for the next level to play.
function continueCard() {
  const rec = recommendNext(state.map, null);
  if (!rec.level) return el("div", { class: "card continue" }, el("b", { class: "big" }, "🏆 全部關卡都拿到金色了！"),
    el("p", { class: "muted" }, "太厲害了！可以到錯題本複習，或回頭再玩喜歡的關卡。"));
  return el("div", { class: "card continue" },
    el("div", { class: "muted" }, rec.kind === "new" ? "接下來玩" : "再挑戰一次，拿金色！"),
    el("b", { class: "big" }, rec.level.name),
    el("div", { class: "row" }, el("a", { class: "btn go", href: "play.html?level=" + encodeURIComponent(rec.level.id) }, "▶ 繼續闖關")));
}

function navRow() {
  return el("nav", { class: "row", "aria-label": "功能選單" },
    el("a", { class: "btn ghost", href: "wrongbook.html" }, "📒 錯題本"),
    el("a", { class: "btn ghost", href: "history.html" }, "📊 我的紀錄"));
}

function subjectTabs() {
  return el("div", { class: "subject-tabs" }, state.map.map((m, i) =>
    el("button", { "aria-pressed": String(i === state.subjectIdx), onclick: () => { state.subjectIdx = i; state.selected = null; render(); } },
      m.subject.name)));
}

// Teacher assignments. Finished work stays on the map with its score and a link to the details;
// ended / not-yet-started ones are shown too, so nothing the teacher gave ever just disappears.
function assignmentBanner() {
  const fmt = iso => new Date(iso).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const done = a => !!(a.attempt && a.attempt.finished);
  const todo = state.asg.filter(a => a.status === "open" && !done(a));
  const finished = state.asg.filter(done);
  const other = state.asg.filter(a => !done(a) && a.status !== "open");
  const row = a => {
    const isDone = done(a);
    const state_ = isDone ? "✅ 已完成，" + (a.attempt.score ?? "—") + " 分"
      : a.status === "upcoming" ? "⏳ 還沒開始（" + fmt(a.start_at) + "）"
      : a.status === "closed" ? "🔒 已結束，沒有交"
      : a.attempt ? "✏️ 做到一半（" + a.attempt.answered + "/" + a.total + "）" : "🆕 還沒做";
    return el("li", { class: "asg-row" },
      el("div", { class: "asg-main" }, el("b", null, a.title), el("div", { class: "muted" }, state_ + (a.due_at && !isDone && a.status === "open" ? "・截止 " + fmt(a.due_at) : ""))),
      isDone && a.attempt.id ? el("a", { class: "btn ghost", href: "attempt.html?id=" + encodeURIComponent(a.attempt.id) }, "看詳情")
        : a.status === "open" ? el("a", { class: "btn", href: "play.html?assignment=" + encodeURIComponent(a.id) }, a.attempt ? "繼續" : "開始") : null);
  };
  return el("div", { class: "banner asg-card", role: "status" },
    el("b", null, "📌 老師派的作業"),
    todo.length ? [el("div", { class: "muted" }, "還要完成（" + todo.length + "）"), el("ul", { class: "asg-list" }, todo.map(row))]
                : el("p", { class: "msg ok", style: "margin:6px 0" }, "🎉 目前沒有要完成的作業了！"),
    finished.length ? [el("div", { class: "muted" }, "已完成（" + finished.length + "）"), el("ul", { class: "asg-list" }, finished.map(row))] : null,
    other.length ? el("details", null, el("summary", null, "還沒開始或已結束（" + other.length + "）"), el("ul", { class: "asg-list" }, other.map(row))) : null);
}

function unitBlock({ unit, levels }) {
  return el("section", { class: "unit", "aria-label": "第 " + unit.no + " 單元" },
    el("h2", null, "第 " + unit.no + " 單元・" + unit.title),
    levels.length
      ? el("div", { class: "path" }, levels.map(lampButton))
      : el("p", { class: "muted" }, "這個單元的關卡還在準備中。"));
}

function lampButton(l) {
  const icon = l.state === "gold" ? "🥇" : l.state === "cleared" ? "✔" : l.lock ? "🔒" : !l.playable ? "🎮" : l.kind === "boss" ? "👑" : "💡";
  const sel = state.selected && state.selected.id === l.id;
  return el("button", {
      class: "lamp", "data-state": l.state, "data-kind": l.kind, "data-current": String(!!l.current),
      "data-locked": String(!!l.lock), "data-playable": String(l.playable), "aria-pressed": String(!!sel),
      "aria-label": l.name + "，" + KIND[l.kind] + (l.current ? "，目前關卡" : ""),
      onclick: () => { state.selected = l; render(); document.querySelector(".detail")?.scrollIntoView({ block: "nearest" }); },
    },
    el("span", { class: "dot", "aria-hidden": "true" }, icon),
    el("span", { class: "name" }, l.name),
    el("span", { class: "stars", "aria-hidden": "true" }, starText(l.stars)));
}

function detail(l) {
  const lines = [];
  lines.push(el("div", { class: "muted" }, KIND[l.kind] + "・每次 " + l.question_count + " 題"));
  if (l.state !== "new")
    lines.push(el("div", null, "目前成績：" + (starText(l.stars) || "已過關") + (l.state === "gold" ? "　" + state.ui.collectibleName + "：金色 🥇" : "　已拿到" + state.ui.collectibleName)));
  else lines.push(el("div", null, "還沒過關。通過後會得到星星和" + state.ui.collectibleName + "。"));
  if (l.lock)
    lines.push(el("div", { class: "msg warn" },
      "🔒 老師派了作業「" + l.lock.title + "」，作業結束前這一關要先留給作業，現在不能練習。"));
  if (!l.playable) lines.push(el("div", { class: "msg warn" }, "這種關卡之後才會開放。"));
  const can = l.playable && !l.lock;
  return el("aside", { class: "detail", "aria-live": "polite" },
    el("h3", null, l.name), lines,
    el("div", { class: "row" },
      can ? el("a", { class: "btn", href: "play.html?level=" + encodeURIComponent(l.id) }, "出發 ▶")
          : el("button", { disabled: true }, "現在不能玩"),
      el("button", { class: "ghost", onclick: () => { state.selected = null; render(); } }, "關閉")));
}

function footer() {
  const countdown = el("b", null, fmtLeft(me.expires_at ? new Date(me.expires_at) - Date.now() : 0));
  onTick(left => { countdown.textContent = fmtLeft(left); });
  return el("div", { class: "card row" },
    el("span", { class: "muted" }, me.is_home_device ? "🏠 這是家裡的裝置，不會自動登出" : "⏳ 離自動登出還有 "),
    me.is_home_device ? null : countdown,
    el("span", { style: "flex:1" }),
    el("button", { class: "danger", onclick: logout }, "登出"));
}

start();
