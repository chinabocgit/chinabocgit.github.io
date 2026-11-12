// Read-aloud for questions, using the browser's built-in speech (no audio files are stored).
// The database gives only plain text and a language code; it is never inserted as markup.

const LANGS = ["zh-TW", "en-US"];
export const SPEAK_MAX_CHARS = 200;

// Pure checker: returns { ok: true, text, lang } or { ok: false, reason }. Testable without a browser.
export function validateSpeak(text, lang) {
  if (typeof text !== "string") return { ok: false, reason: "speak text" };
  const t = text.trim();
  if (t.length < 1 || t.length > SPEAK_MAX_CHARS) return { ok: false, reason: "speak length" };
  const l = lang === undefined ? "zh-TW" : lang;
  if (!LANGS.includes(l)) return { ok: false, reason: "speak language" };
  return { ok: true, text: t, lang: l };
}

// True only when this browser can speak. Pages still work without it; the button just says so.
export function canSpeak() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

// Speaks the checked text. Returns false when the browser cannot speak.
export function speak(text, lang) {
  if (!canSpeak()) return false;
  const v = validateSpeak(text, lang);
  if (!v.ok) return false;
  window.speechSynthesis.cancel();                 // stop any earlier reading first
  const u = new window.SpeechSynthesisUtterance(v.text);
  u.lang = v.lang;
  u.rate = 0.9;                                    // a little slower for young readers
  window.speechSynthesis.speak(u);
  return true;
}
