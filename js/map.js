// Map home: subject tabs, units as blocks, levels as lamps, rewards summary, open-assignment banner.
import { el } from "./dom.js?v=4037fd25";
import { ApiError } from "./api.js?v=4037fd25";
import { requireStudent, onTick, logout } from "./session.js?v=4037fd25";
import { loadMapData, buildMap } from "./data.js?v=4037fd25";
import { applyTheme } from "./theme.js?v=4037fd25";

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
  state.asg = (data.asg.assignments || []).filter(a => a.status === "open");
  state.rewards = data.rewards;
  state.chests = data.chests ? data.chests.unopened : 0;
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

  const parts = [navRow()];
  if (state.asg.length) parts.push(assignmentBanner());
  if (!state.map.length) {
    parts.push(el("div", { class: "card empty" },
      el("p", { class: "big" }, "🗺️ 地圖還沒有內容"),
      el("p", { class: "muted" }, "你的年級和學期目前還沒有可玩的單元，請稍後再來看看。")));
  } else {
    if (state.map.length > 1) parts.push(subjectTabs());
    const cur = state.map[state.subjectIdx];
    for (const u of cur.units) parts.push(unitBlock(u));
    if (state.selected) parts.push(detail(state.selected));
  }
  parts.push(footer());
  app.replaceChildren(...parts);
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

function assignmentBanner() {
  return el("div", { class: "banner", role: "status" },
    el("b", null, "📌 老師派的作業（" + state.asg.length + "）"),
    el("ul", null, state.asg.map(a => {
      const t = a.attempt && a.attempt.finished ? "（已交，" + (a.attempt.score ?? "—") + " 分）"
              : a.attempt ? "（做到一半）" : "（還沒做）";
      const due = a.due_at ? "　截止 " + new Date(a.due_at).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
      const done = a.attempt && a.attempt.finished;
      return el("li", null, a.title + t + due + "　",
        done ? null : el("a", { class: "btn", href: "play.html?assignment=" + encodeURIComponent(a.id) }, a.attempt ? "繼續" : "開始"));
    })));
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
