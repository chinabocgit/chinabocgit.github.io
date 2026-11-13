// Pure check for report text (no database code), so it can be tested on its own.
export const REPORT_MAX = 300;

// 1 to 300 characters after trimming.
export function validateReport(text) {
  const t = String(text == null ? "" : text).trim();
  const n = Array.from(t).length;
  return n >= 1 && n <= REPORT_MAX ? { ok: true, value: t } : { ok: false, text: "請寫一點說明（1 到 300 個字）。" };
}
