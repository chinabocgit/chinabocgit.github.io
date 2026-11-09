// Child session: login, restore, idle timeout, teacher-forced logout detection, logout.
import { sb, rpc, ApiError, setSessionInvalidHandler } from "./api.js?v=f32adc9d";
import { SB_KEY, LOGIN_FN, TOUCH_EVERY_MS, REVOKE_POLL_MS } from "./config.js?v=f32adc9d";

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
export function msLeft() { return expiresAt ? expiresAt - Date.now() : 0; }
// Called every second with ms left (for countdown displays).
export function onTick(fn) { listeners.add(fn); return () => listeners.delete(fn); }

async function localLogout(cls, text) {
  clearInterval(ticking); clearInterval(polling);
  try { await sb.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
  if (text) setLoginMessage(cls, text);
  goLogin();
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
    await localLogout("err", "連線有問題，請重新登入。");
    return new Promise(() => {});
  }
  expiresAt = new Date(me.expires_at);
  lastTouch = Date.now();

  ticking = setInterval(() => {
    const left = msLeft();
    listeners.forEach(fn => fn(left));
    if (left <= 0) localLogout("warn", "你太久沒有操作，已經自動登出，請重新登入。");
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
    expiresAt = new Date(data.expires_at);
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
