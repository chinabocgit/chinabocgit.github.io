// Supabase client and RPC wrapper. Expects the supabase-js UMD script to be loaded before any module.
import { SB_URL, SB_KEY } from "./config.js?v=406474cb";

// Separate storage key so the child session never mixes with adult sessions on the same origin.
export const sb = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "lg-student" },
});

// Database errors look like "code: message". Keep the code for logic and map it to child-friendly text.
const FRIENDLY = {
  session_invalid: "登入已失效，請重新登入。",
  not_found: "找不到這個項目。",
  assignment_closed: "這份作業現在沒有開放。",
  config_error: "這份作業還沒設定好，請告訴老師。",
  invalid_input: "送出的資料有問題，請再試一次。",
  insufficient_stars: "星星不夠喔，再多練習幾關吧！",
  already_owned: "你已經有這個了。",
  already_opened: "這個寶箱已經開過了。",
  not_owned: "你還沒有這個。",
  wrong_pet: "這是別隻萌寵的專屬裝備。",
  not_for_sale: "這個不能用星星兌換。",
};

export class ApiError extends Error {
  constructor(code, raw) {
    super(raw);
    this.code = code;
    this.friendly = FRIENDLY[code] || "系統忙碌或網路不穩，請稍後再試。";
  }
}

let onSessionInvalid = null;
export function setSessionInvalidHandler(fn) { onSessionInvalid = fn; }

function toApiError(error) {
  const raw = String(error.message || error);
  const m = /^([a-z_]+):/.exec(raw);
  return new ApiError(m ? m[1] : "network_or_server", raw);
}

export async function rpc(name, args) {
  let res;
  try {
    res = await sb.rpc(name, args || {});
  } catch (e) {
    throw new ApiError("network_or_server", String(e));
  }
  if (res.error) {
    const err = toApiError(res.error);
    if (err.code === "session_invalid" && onSessionInvalid) onSessionInvalid(err);
    throw err;
  }
  return res.data;
}
