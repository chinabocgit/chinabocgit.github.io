// Countdown helpers for the exam page. The server decides the deadline and refuses late hand-ins;
// the device clock only drives the display, corrected by the difference to the server clock measured when the exam was fetched.

// serverNowIso: the server's time in the response; deviceNowMs: Date.now() when that response arrived.
export function clockOffset(serverNowIso, deviceNowMs) {
  return new Date(serverNowIso).getTime() - deviceNowMs;
}

// Whole seconds left (never below 0); null when the exam has no deadline.
export function remainingSeconds(deadlineIso, offsetMs, deviceNowMs) {
  if (!deadlineIso) return null;
  return Math.max(0, Math.ceil((new Date(deadlineIso).getTime() - (deviceNowMs + offsetMs)) / 1000));
}

// 65 -> "01:05"; 3600 -> "60:00"
export function formatClock(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

// The last five minutes are shown in a warning colour.
export const lowTime = sec => sec != null && sec <= 300;

// Answers the child gave, in question order, ready for rpc_submit_exam (unanswered questions are left out).
export function buildItems(questions, answers) {
  return questions.filter(q => answers[q.question_code] != null && answers[q.question_code] !== "")
    .map(q => ({ question_code: q.question_code, response: answers[q.question_code] }));
}
