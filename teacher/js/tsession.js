// Teacher session: email + password sign-in (Supabase Auth). Sessions refresh automatically; sign out is manual.
import { sb, setSessionInvalidHandler, isAdmin } from "./tapi.js?v=df105d9d";

export const goLogin = () => location.replace("index.html");

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email: String(email).trim(), password });
  if (error) return { ok: false, text: "登入沒成功，請檢查信箱和密碼。" };
  markActive();          // a fresh sign-in is activity; otherwise a stale timestamp from an earlier session signs the user out at once
  return { ok: true };
}

export async function signOut() {
  sessionStorage.removeItem(ADMIN_CACHE);
  try { await sb.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
  goLogin();
}

export async function hasSession() {
  const { data } = await sb.auth.getSession();
  return !!data.session;
}

// Idle sign-out: shared computers are common in teachers' rooms. Any click / key / touch counts as activity;
// the last-activity time is kept in localStorage so every open teacher tab agrees.
export const IDLE_LIMIT_MS = 60 * 60 * 1000;      // 1 hour without activity
const ACT_KEY = "lg-teacher-last-active";
const markActive = () => localStorage.setItem(ACT_KEY, String(Date.now()));
export function idleMs() { return Date.now() - Number(localStorage.getItem(ACT_KEY) || Date.now()); }
function startIdleWatch() {
  markActive();
  let last = 0;
  const bump = () => { const t = Date.now(); if (t - last > 5000) { last = t; markActive(); } };     // write at most every 5 s
  for (const ev of ["click", "keydown", "touchstart"]) document.addEventListener(ev, bump, { passive: true });
  setInterval(() => { if (idleMs() >= IDLE_LIMIT_MS) { sessionStorage.setItem("lg-teacher-msg", "idle"); signOut(); } }, 15000);
}
export function takeLoginNote() { const m = sessionStorage.getItem("lg-teacher-msg"); sessionStorage.removeItem("lg-teacher-msg"); return m; }

// Every teacher page calls this first. Returns { id, email, name } or redirects to the login page.
export async function requireTeacher() {
  setSessionInvalidHandler(() => signOut());
  const { data } = await sb.auth.getSession();
  if (!data.session) { goLogin(); return new Promise(() => {}); }
  if (idleMs() >= IDLE_LIMIT_MS) { sessionStorage.setItem("lg-teacher-msg", "idle"); await signOut(); return new Promise(() => {}); }   // came back after a long break
  const u = data.session.user;
  let name = "";
  try {
    const { data: p } = await sb.from("profiles").select("display_name").eq("id", u.id).maybeSingle();
    name = (p && p.display_name) || "";
  } catch { /* the name is optional */ }
  startIdleWatch();
  addAdminLink(u.id);          // not awaited: the shortcut must never hold up the page
  return { id: u.id, email: u.email, name };
}

// Administrators see a link to the admin pages in the header and the label "老師・管理者". Everyone else sees nothing new.
// The admin pages check the role again, so this link is only a shortcut.
const ADMIN_CACHE = "lg-admin-shortcut";    // "<user id>:1" or ":0"; kept per tab so ordinary pages do not ask the server every time
async function adminShortcutAllowed(uid) {
  const c = sessionStorage.getItem(ADMIN_CACHE);
  if (c && c.startsWith(uid + ":")) return c.endsWith(":1");
  const ok = await isAdmin(uid);
  sessionStorage.setItem(ADMIN_CACHE, uid + ":" + (ok ? "1" : "0"));
  return ok;
}

async function addAdminLink(uid) {
  try {
    if (!(await adminShortcutAllowed(uid))) return;
    const header = document.querySelector("header.top");
    if (!header || document.getElementById("admin-link")) return;
    const label = document.getElementById("role-label");     // only pages that mark their role label are changed
    if (label) label.textContent = "老師・管理者";
    const a = document.createElement("a");
    a.id = "admin-link";
    a.className = "adminlink";
    a.href = "../admin/";
    a.textContent = "管理者頁面";
    header.insertBefore(a, document.getElementById("logout") || null);
  } catch (e) { console.warn("admin shortcut not shown:", e); }   // optional feature: report, do not break the page
}
