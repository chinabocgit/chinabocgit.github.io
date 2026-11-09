// Synthesized sound effects (Web Audio). No audio files, so no copyright or download issues.
// The AudioContext is created lazily after a user gesture; sounds are skipped when muted.
const MUTE_KEY = "lg_mute";
let ctx = null;

export const isMuted = () => localStorage.getItem(MUTE_KEY) === "1";
export function setMuted(m) { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); }

function audio() {
  if (isMuted()) return null;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch { return null; }
}

// One short note with a quick attack/decay envelope so it never clicks.
function tone(a, freq, start, dur, type = "sine", peak = 0.12) {
  const o = a.createOscillator(), g = a.createGain();
  const t0 = a.currentTime + start;
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, A4: 440, D5: 587.33 };

export function playCorrect() { const a = audio(); if (!a) return; tone(a, NOTE.E5, 0, 0.15); tone(a, NOTE.G5, 0.1, 0.2); }
export function playWrong() { const a = audio(); if (!a) return; tone(a, 220, 0, 0.25, "triangle", 0.1); }
// n-th star pops with a rising pitch.
export function playStar(n) { const a = audio(); if (!a) return; tone(a, [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6][Math.min(n, 3)], 0, 0.3, "triangle", 0.14); }
export function playFanfare() {
  const a = audio(); if (!a) return;
  [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => tone(a, f, i * 0.12, 0.35, "triangle", 0.13));
  tone(a, NOTE.E6, 0.5, 0.6, "sine", 0.1);
}
export function playChestShake() { const a = audio(); if (!a) return; for (let i = 0; i < 6; i++) tone(a, 160 + (i % 2) * 40, i * 0.08, 0.07, "square", 0.05); }
export function playChestOpen() {
  const a = audio(); if (!a) return;
  [NOTE.G5, NOTE.C6, NOTE.E6].forEach((f, i) => tone(a, f, i * 0.09, 0.4, "triangle", 0.13));
}
