// Client-side grading for PRACTICE only (instant feedback). Mirrors the server's _grade_answer in 015_判分函式.sql.
// The server re-grades every submitted practice answer; assignments are graded only by the server.

// Same normalization as _norm_fill: full-width -> half-width (NFKC), drop spaces and commas, lower-case.
export function normFill(t) {
  return String(t ?? "").normalize("NFKC").replace(/[\s,，、]/g, "").toLowerCase();
}

// Returns true/false. Throws when the response has the wrong shape (a programming error, not a wrong answer).
export function gradeAnswer(qtype, payload, answer, resp) {
  if (qtype === "choice") {
    if (typeof resp !== "string") throw new Error("choice response must be a string");
    return resp === answer.correct && Array.isArray(payload.options) && payload.options.includes(resp);
  }
  if (qtype === "tf") {
    if (typeof resp !== "boolean") throw new Error("tf response must be a boolean");
    return resp === answer.value;
  }
  if (qtype === "fill") {
    if (typeof resp !== "string") throw new Error("fill response must be a string");
    if (normFill(resp) === "") return false;                    // blank counts as wrong
    return (answer.accept || []).some(a => normFill(a) === normFill(resp));
  }
  if (qtype === "order") {
    if (!Array.isArray(resp) || resp.some(x => typeof x !== "string")) throw new Error("order response must be a string array");
    const seq = answer.sequence || [];
    return resp.length === seq.length && resp.every((x, i) => x === seq[i]);
  }
  throw new Error("unsupported question type: " + qtype);
}

// Human-readable correct answer for feedback.
export function describeAnswer(qtype, answer) {
  if (!answer) return "";
  if (qtype === "choice") return String(answer.correct ?? "");
  if (qtype === "tf") return answer.value ? "對" : "錯";
  if (qtype === "fill") return String((answer.accept || [])[0] ?? "");
  if (qtype === "order") return (answer.sequence || []).join(" → ");
  return "";
}

// How a stored response (string / boolean / string[]) is shown to the child.
export function describeResponse(resp) {
  if (resp === null || resp === undefined) return "（沒作答）";
  if (typeof resp === "boolean") return resp ? "對" : "錯";
  if (Array.isArray(resp)) return resp.join(" → ");
  return String(resp);
}
