// Child session: login, restore, idle timeout, teacher-forced logout detection, logout.
import { sb, rpc, ApiError, setSessionInvalidHandler } from "./api.js?v=1404c8c6";
import { el } from "./dom.js?v=1404c8c6";
import { SB_KEY, LOGIN_FN, TOUCH_EVERY_MS, REVOKE_POLL_MS } from "./config.js?v=1404c8c6";

const MSG_KEY = "lg_login_msg";

export function deviceId() {
  let d = localStorage.getItem("lg_device_id");
  if (!d) { d = "dev-" + crypto.randomUUID(); localStorage.setItem("lg_device_id", d); }
  return d;
}

// A message to show on the login page after being sent back (expired, logged out by teacher, …).
export function takeLoginMessage() {
  const m = sessionStorage.getItem(MSG_KEY);
  sessionStorage.removeItem(MSG_KEY);
  return m ? JSON.parse(m) : null;
}
function setLoginMessage(cls, text) { sessionStorage.setItem(MSG_KEY, JSON.stringify({ cls, text })); }

export function goLogin() { location.replace("login.html"); }

/* ---------- Login ---------- */
// body: { kind, code, nickname, picture, device_id, home_device }. Returns { ok: true } or { ok: false, cls, text }.
export async function login(body) {
  let r;
  try {
    const res = await fetch(LOGIN_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_KEY },
      body: JSON.stringify(body),
    });
    r = await res.json();
  } catch {
    return { ok: false, cls: "err", text: "連不上伺服器，請稍後再試。" };
  }
  if (r.ok) {
    const { error } = await sb.auth.setSession({
      access_token: r.session.access_token, refresh_token: r.session.refresh_token,
    });
    if (error) return { ok: false, cls: "err", text: "登入資料載入失敗，請再試一次。" };
    return { ok: true };
  }
  if (r.error === "login_locked")
    return { ok: false, cls: "warn", text: "嘗試太多次了，請等 " + (r.retry_minutes || 15) + " 分鐘再試，或請老師、家長幫你。" };
  if (r.error === "try_again") return { ok: false, cls: "warn", text: "請再按一次登入。" };
  if (r.error === "login_failed") return { ok: false, cls: "err", text: "登入沒成功，請檢查代碼、暱稱和圖卡順序。" };
  return { ok: false, cls: "err", text: "系統忙碌，請稍後再試。" };
}

/* ---------- Logged-in pages ---------- */
let me = null;
let expiresAt = null;
let lastTouch = 0;
let ticking = null;
let polling = null;
const listeners = new Set();

export function getMe() { return me; }
// A home device has no expiry (expires_at is null): it never times out, so report "infinite" instead of "already over".
export function msLeft() { return expiresAt ? expiresAt - Date.now() : Infinity; }
// Called every second with ms left (for countdown displays).
export function onTick(fn) { listeners.add(fn); return () => listeners.delete(fn); }

let leaving = false;
async function localLogout(cls, text) {
  if (leaving) return;                               // several timers can ask at once; leave only once
  leaving = true;
  clearInterval(ticking); clearInterval(polling);
  try { await sb.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
  // signOut() keeps the session when its own network call fails. If the token survived, the login page would
  // send the child straight back to the map and the two pages would bounce forever, so remove it by hand.
  for (const k of Object.keys(localStorage)) if (k === "lg-student" || k.startsWith("lg-student-")) localStorage.removeItem(k);
  if (text) setLoginMessage(cls, text);
  goLogin();
}

// A bad connection must not log the child out: show a retry card instead.
function showConnectionProblem() {
  const target = document.getElementById("app") || document.body;
  target.replaceChildren(el("div", { class: "card empty" },
    el("p", { class: "msg warn" }, "網路好像不穩，連不上伺服器。你的進度都還在，請再試一次。"),
    el("div", { class: "row" },
      el("button", { onclick: () => location.reload() }, "重新試試"),
      el("button", { class: "ghost", onclick: () => localLogout("ok", "你已登出。") }, "登出"))));
}

// Every logged-in page calls this first. Resolves with the child profile, or redirects to the login page.
export async function requireStudent() {
  setSessionInvalidHandler(() => localLogout("warn", "登入已失效（可能被老師登出或太久沒操作），請重新登入。"));
  const { data } = await sb.auth.getSession();
  if (!data.session) { goLogin(); return new Promise(() => {}); }   // never resolves; page is leaving
  try {
    me = await rpc("rpc_student_me");
  } catch (e) {
    if (e instanceof ApiError && e.code === "session_invalid") return new Promise(() => {});   // handler redirects
    showConnectionProblem();                                   // network / server trouble: keep the login
    return new Promise(() => {});
  }
  expiresAt = me.expires_at ? new Date(me.expires_at) : null;
  lastTouch = Date.now();

  ticking = setInterval(() => {
    const left = msLeft();
    listeners.forEach(fn => fn(left));
    if (expiresAt && left <= 0) localLogout("warn", "你太久沒有操作，已經自動登出，請重新登入。");
  }, 1000);

  // Read-only poll: notice that a teacher logged everyone out without waiting for the child to click.
  polling = setInterval(() => { rpc("rpc_student_me").catch(() => {}); }, REVOKE_POLL_MS);

  for (const ev of ["click", "keydown", "touchstart"]) document.addEventListener(ev, activity, { passive: true });
  return me;
}

// Activity extends the idle limit, but the server is called at most once per TOUCH_EVERY_MS.
async function activity() {
  if (!me || me.is_home_device || Date.now() - lastTouch < TOUCH_EVERY_MS) return;
  lastTouch = Date.now();
  try {
    const data = await rpc("rpc_student_touch");
    expiresAt = data.expires_at ? new Date(data.expires_at) : null;
  } catch { /* session_invalid is handled by the api layer; other errors: try again later */ }
}

export async function logout() {
  try { await rpc("rpc_student_logout"); } catch { /* still log out locally */ }
  await localLogout("ok", "你已登出。");
}

// Used by index.html to choose a destination without loading the full profile.
export async function hasSavedSession() {
  const { data } = await sb.auth.getSession();
  return !!data.session;
}
