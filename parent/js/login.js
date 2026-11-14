// Parent sign-in. Adult accounts share one Supabase Auth session (same storage key as the teacher pages),
// so a person who is both a teacher and a parent signs in once.
import { el } from "../../js/dom.js?v=9d63c7c7";
import { signIn, hasSession, takeLoginNote } from "../../teacher/js/tsession.js?v=9d63c7c7";

const app = document.getElementById("app");
let busy = false, msg = takeLoginNote() === "idle" ? { cls: "warn", text: "你超過 1 小時沒有操作，為了安全已自動登出，請重新登入。" } : null;
const form = { email: "", password: "" };

let focusId = null;       // field to focus after a re-render (keyboard users keep their place)

function render() {
  const prev = document.activeElement;
  if (prev && prev.id && app.contains(prev)) focusId = prev.id;
  const email = el("input", { id: "p-email", type: "email", autocomplete: "username", value: form.email, oninput: e => { form.email = e.target.value; } });
  const pw = el("input", { id: "p-pw", type: "password", autocomplete: "current-password",
    oninput: e => { form.password = e.target.value; }, onkeydown: e => { if (e.key === "Enter") go(); } });
  app.replaceChildren(el("div", { class: "card" },
    el("h2", null, "家長登入"),
    el("label", { for: "p-email" }, "電子信箱"), email,
    el("label", { for: "p-pw" }, "密碼"), pw,
    el("div", { class: "row" }, el("button", { disabled: busy, onclick: go }, busy ? "登入中…" : "登入")),
    msg ? el("div", { class: "msg " + msg.cls, role: "status" }, msg.text) : null,
    el("p", { class: "muted" }, "家長帳號由平台管理者建立。忘記密碼請洽管理者。"),
    el("p", { class: "muted" }, "孩子要玩：", el("a", { href: "../login.html" }, "孩子登入"))));
  const f = focusId && document.getElementById(focusId);
  if (f && !f.disabled) f.focus();
}

async function go() {
  if (busy || !form.email || !form.password) return;
  busy = true; msg = null; render();
  const r = await signIn(form.email, form.password);
  form.password = "";                       // never keep the password around after an attempt
  if (r.ok) { location.replace("home.html"); return; }
  busy = false; msg = { cls: "err", text: r.text }; focusId = "p-pw"; render();
}

if (await hasSession()) location.replace("home.html"); else render();
