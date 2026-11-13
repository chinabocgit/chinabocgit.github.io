// Teacher client: separate storage key from the child app, so both can be open in one browser.
// Server messages already read like "code: Chinese text"; we keep the code and show the Chinese text.
import { SB_URL, SB_KEY } from "../../js/config.js?v=1404c8c6";

export const sb = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "lg-teacher" },
});

export class ApiError extends Error {
  constructor(code, text) { super(text); this.code = code; this.friendly = text; }
}

function toApiError(error) {
  const raw = String(error.message || error);
  const m = /^([a-z_]+):\s*(.*)$/s.exec(raw);
  if (m) return new ApiError(m[1], m[2]);
  if (/JWT|expired|not authenticated/i.test(raw)) return new ApiError("session_invalid", "登入已過期，請重新登入。");
  return new ApiError("network_or_server", "系統忙碌或網路不穩，請稍後再試。");
}

let onSessionInvalid = null;
export function setSessionInvalidHandler(fn) { onSessionInvalid = fn; }

export async function rpc(name, args) {
  let res;
  try { res = await sb.rpc(name, args || {}); } catch (e) { throw new ApiError("network_or_server", "網路不穩，請稍後再試。"); }
  if (res.error) {
    const err = toApiError(res.error);
    if (err.code === "session_invalid" && onSessionInvalid) onSessionInvalid(err);
    throw err;
  }
  return res.data;
}

export async function select(query) {
  const { data, error } = await query;
  if (error) throw toApiError(error);
  return data;
}

// True when the user has the admin role. The only place that decides this: the header shortcut and the admin pages both call it.
export async function isAdmin(uid) {
  const rows = await select(sb.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin"));
  return rows.length > 0;
}
