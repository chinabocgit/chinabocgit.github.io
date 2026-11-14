import { el } from "./dom.js?v=406474cb";
import { PICS, PIC_LEN } from "./config.js?v=406474cb";
import { login, deviceId, takeLoginMessage, hasSavedSession } from "./session.js?v=406474cb";

const app = document.getElementById("app");
const pad2 = n => String(n).padStart(2, "0");

let kind = "class";            // class | family | personal
let picked = [];               // picture numbers 1..12
let busy = false;
let msg = takeLoginMessage();  // { cls, text } left by the page that sent us here
const form = { code: "", nick: "", home: false };

const LABEL = { class: "班級代碼", family: "家庭代碼", personal: "個人代碼" };

function render() {
  // Re-rendering replaces the DOM; remember what had focus so keyboard users do not lose their place.
  const prev = document.activeElement;
  const focusKey = prev && prev !== document.body && prev.closest && prev.closest("#app")
    ? (prev.id ? "#" + prev.id : prev.getAttribute("aria-label") ? '[aria-label="' + prev.getAttribute("aria-label") + '"]' : null) : null;
  const codeIn = el("input", {
    id: "f-code", type: "text", value: form.code, placeholder: "老師或家長給你的代碼", autocomplete: "off",
    autocapitalize: "characters", maxlength: 20, oninput: e => { form.code = e.target.value; },
  });
  const nickIn = el("input", {
    id: "f-nick", type: "text", value: form.nick, placeholder: "你的暱稱", autocomplete: "off", maxlength: 50,
    oninput: e => { form.nick = e.target.value; },
  });
  const homeIn = el("input", { type: "checkbox", onchange: e => { form.home = e.target.checked; } });
  homeIn.checked = form.home;

  const tabs = el("div", { class: "row tabs" }, Object.entries(LABEL).map(([k, t]) =>
    el("button", { class: k === kind ? "on" : "", onclick: () => { kind = k; render(); } }, t)));

  const grid = el("div", { class: "pics" }, PICS.map((p, i) =>
    el("button", {
      "aria-label": "圖卡 " + (i + 1), disabled: picked.includes(i + 1) || picked.length >= PIC_LEN || busy,
      onclick: () => { picked.push(i + 1); render(); },
    }, p)));

  app.replaceChildren(el("div", { class: "card" },
    el("h2", null, "我要登入"),
    tabs,
    el("label", { for: "f-code" }, LABEL[kind]), codeIn,
    kind !== "personal" ? [el("label", { for: "f-nick" }, "暱稱"), nickIn] : null,
    el("label", null, "圖卡密碼：依序點 " + PIC_LEN + " 張"),
    el("div", { class: picked.length ? "picked" : "picked none", "aria-live": "polite" }, picked.map(n => PICS[n - 1]).join(" ") || "（還沒選）"),
    grid,
    el("div", { class: "row" },
      el("button", { class: "ghost", disabled: !picked.length || busy, onclick: () => { picked.pop(); render(); } }, "退一格"),
      el("button", { class: "ghost", disabled: !picked.length || busy, onclick: () => { picked = []; render(); } }, "清除")),
    el("label", null, homeIn, " 這是我家的裝置（需要已有家長綁定才算數）"),
    el("div", { class: "row" },
      el("button", { disabled: busy || picked.length !== PIC_LEN, onclick: doLogin }, busy ? "登入中…" : "登入")),
    msg ? el("div", { class: "msg " + msg.cls, role: "status" }, msg.text) : null,
    el("p", { class: "muted" }, "我是老師：", el("a", { href: "teacher/index.html" }, "老師登入"),
      "　我是家長：", el("a", { href: "parent/index.html" }, "家長登入"))));
  if (focusKey) {
    let n = app.querySelector(focusKey);
    if (!n || n.disabled) n = app.querySelector(".pics button:not(:disabled)") || app.querySelector("button:not(:disabled)");
    if (n) n.focus();
  }
}

async function doLogin() {
  busy = true; msg = null; render();
  const r = await login({
    kind, code: form.code, nickname: kind === "personal" ? "" : form.nick,
    picture: picked.map(pad2).join("-"), device_id: deviceId(), home_device: form.home,
  });
  busy = false; picked = [];            // never keep the picture password after an attempt
  if (r.ok) { location.replace("map.html"); return; }
  msg = { cls: r.cls, text: r.text };
  render();
}

// Already logged in? Go straight to the map; the map page re-checks the session with the database.
// Arriving here with a message means we were just sent back (logged out): show it and never auto-forward,
// otherwise login <-> map could bounce forever and hide the reason.
if (!msg && await hasSavedSession()) location.replace("map.html");
else render();
