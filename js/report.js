// "This question has a problem" report. Anyone signed in (a child or an adult) can report a question.
// It only records the report; an administrator checks the question and the answer later.
import { rpc } from "./api.js?v=cbc19fbd";
import { validateReport } from "./report-check.js?v=cbc19fbd";

export { validateReport, REPORT_MAX } from "./report-check.js?v=cbc19fbd";

// Sends the report. questionCode is the question's code from the question pool. Throws ApiError on failure.
export async function sendReport(questionCode, text) {
  const v = validateReport(text);
  if (!v.ok) return v;
  await rpc("rpc_report_question", { p_question_code: questionCode, p_reason: v.value });
  return { ok: true };
}
