// Input checks for the admin pages. They mirror the database rules in _supabase/014 so mistakes are shown before saving.
// Pure functions: no browser APIs, so the test page can run them directly.

export const AUDIENCES = ["all", "teacher", "parent"];
const AUDIENCE_TEXT = { all: "所有大人", teacher: "只給老師", parent: "只給家長" };
export const audienceText = a => AUDIENCE_TEXT[a] || "";

// Platform settings: only two keys can be changed.
export function validateSetting(key, value) {
  const v = typeof value === "string" ? value.trim() : "";
  if (key === "platform_name") {
    const n = Array.from(v).length;
    return n >= 1 && n <= 30 ? { ok: true, value: v } : { ok: false, text: "平台名稱請填 1 到 30 個字。" };
  }
  if (key === "sponsor_url") {
    if (v === "") return { ok: true, value: "" };
    return /^https:\/\/[^\s]+$/.test(v) ? { ok: true, value: v } : { ok: false, text: "贊助連結必須是 https:// 開頭的網址，或留空。" };
  }
  return { ok: false, text: "不能改這個設定。" };
}

// Announcement: title 1–60 characters, body 1–500, audience in the list, optional end time after now.
export function validateAnnouncement(input, now = new Date()) {
  const title = String(input.title || "").trim();
  const body = String(input.body || "").trim();
  const tn = Array.from(title).length, bn = Array.from(body).length;
  if (tn < 1 || tn > 60) return { ok: false, text: "標題請填 1 到 60 個字。" };
  if (bn < 1 || bn > 500) return { ok: false, text: "內容請填 1 到 500 個字。" };
  if (!AUDIENCES.includes(input.audience)) return { ok: false, text: "請選擇對象。" };
  let endAt = null;
  if (input.endAt) {
    const d = new Date(input.endAt);
    if (Number.isNaN(d.getTime())) return { ok: false, text: "結束時間的格式不對。" };
    if (d <= now) return { ok: false, text: "結束時間要在現在之後。" };
    endAt = d.toISOString();
  }
  return { ok: true, value: { title, body, audience: input.audience, endAt } };
}
