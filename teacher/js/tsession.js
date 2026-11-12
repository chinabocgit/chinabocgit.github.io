// Teacher session: email + password sign-in (Supabase Auth). Sessions refresh automatically; sign out is manual.
import { sb, setSessionInvalidHandler } from "./tapi.js?v=b291c9c9";

export const goLogin = () => location.replace("index.html");

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email: String(email).trim(), password });
  if (error) return { ok: false, text: "登入沒成功，請檢查信箱和密碼。" };
  markActive();          // a fresh sign-in is activity; otherwise a stale timestamp from an earlier session signs the user out at once
  return { ok: true };
}

export async function signOut() {
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
  return { id: u.id, email: u.email, name };
}
