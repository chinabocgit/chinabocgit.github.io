// Play page: practice (?level=ID) and assignment (?assignment=ID).
//  - Practice: instant client-side feedback; every answer is re-graded by the server when the run is sent at the end.
//  - Assignment: the server grades each answer (the page never receives answers before submitting).
// Both paths save answers locally first (queue.js), so a dropped connection never loses work.
import { el } from "./dom.js?v=27c00f96";
import { sb, rpc, ApiError } from "./api.js?v=27c00f96";
import { requireStudent } from "./session.js?v=27c00f96";
import { select, loadMapData, buildMap, recommendNext } from "./data.js?v=27c00f96";
import { gradeAnswer, describeAnswer } from "./grade.js?v=27c00f96";
import { enqueue, flush, pendingCodes } from "./queue.js?v=27c00f96";
import { renderQuestion, focusQuestion } from "./qview.js?v=27c00f96";
import { setSafeHtml } from "./sanitize.js?v=27c00f96";
import { playCorrect, playWrong, playStar, playFanfare } from "./sound.js?v=27c00f96";

const params = new URLSearchParams(location.search);
const levelId = params.get("level");
const asgId = params.get("assignment");
const app = document.getElementById("app");
const me = await requireStudent();
const sid = me.student_id;
document.getElementById("who").textContent = me.nickname;

const shuffle = a => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const kind = levelId ? "level" : "assignment";
const target = levelId || asgId;
const runKey = "lg2-run-" + sid + "-" + kind + "-" + target;
const loadRun = () => { try { return JSON.parse(localStorage.getItem(runKey)); } catch { return null; } };
const saveRun = r => localStorage.setItem(runKey, JSON.stringify(r));
const clearRun = () => localStorage.removeItem(runKey);

function message(cls, text, ...extra) {
  app.replaceChildren(el("div", { class: "card empty" }, el("p", { class: "msg " + cls }, text), ...extra,
    el("div", { class: "row" }, el("a", { class: "btn", href: "map.html" }, "回地圖"))));
}
function progressBar(done, total) {
  return el("div", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(done) },
    el("div", { class: "bar", style: "width:" + Math.round(done * 100 / Math.max(total, 1)) + "%" }));
}
function html(cls, content) { const e = el("div", { class: cls }); setSafeHtml(e, content); return e; }

if (!levelId && !asgId) message("warn", "沒有指定要玩的關卡。");
else if (levelId) await startPractice();
else await startAssignment();

// After a result page: suggest the next level so the child never hits a dead end (no teacher needed).
async function addNextButton(afterLevelId) {
  try {
    const rec = recommendNext(buildMap(await loadMapData(me)), afterLevelId);
    const row = app.querySelector(".result .row");
    if (!row) return;
    if (rec.level) row.prepend(el("a", { class: "btn go", href: "play.html?level=" + encodeURIComponent(rec.level.id) },
      "▶ 下一關：" + rec.level.name + (rec.kind === "gold" ? "（挑戰金色）" : "")));
    else row.before(el("p", { class: "msg ok" }, "🏆 全部關卡都拿到金色了！"));
  } catch { /* the buttons we already show are enough */ }
}

/* ===================== Practice ===================== */
async function startPractice() {
  let lv, pool;
  try {
    [lv] = await select(sb.from("levels").select("id,name,kind,question_count,literacy_count").eq("id", levelId).eq("is_open", true));
    if (!lv) throw new ApiError("not_found", "level");
    pool = await rpc("rpc_practice_pool", { p_level_id: levelId });
  } catch (e) {
    if (e instanceof ApiError && e.code === "session_invalid") return;
    message("err", e.friendly || "載入失敗，請回地圖再試。");
    return;
  }
  const all = pool.questions || [];
  const playable = all.filter(q => !q.locked && q.answer);
  if (!playable.length) { message("warn", "🔒 這一關的題目現在都留給老師的作業，作業結束後才能練習。"); return; }
  const want = Math.min(lv.question_count, all.length);
  const byCode = new Map(playable.map(q => [q.question_code, q]));

  let run = loadRun();
  if (run && run.done && !params.get("result")) { clearRun(); run = null; }       // coming from the map: fresh run
  if (!run) {
    const rewardsBefore = await rpc("rpc_my_rewards").catch(() => null);
    const chestsBefore = await rpc("rpc_my_chests").catch(() => null);
    const certsBefore = await rpc("rpc_my_certificates").catch(() => null);
    const lit = shuffle(playable.filter(q => q.is_literacy));
    const norm = shuffle(playable.filter(q => !q.is_literacy));
    const litTake = lit.slice(0, Math.min(lv.literacy_count, lit.length, want));
    const normTake = norm.slice(0, Math.max(want - litTake.length, 0));
    // not enough ordinary questions: top up with the remaining literacy questions
    const extra = lit.slice(litTake.length, litTake.length + Math.max(want - litTake.length - normTake.length, 0));
    const picked = [...normTake, ...litTake, ...extra];
    run = {
      attemptUuid: crypto.randomUUID(), codes: picked.map(q => q.question_code), answers: {}, done: false,
      payloads: Object.fromEntries(picked.map(q => [q.question_code, shufflePayload(q)])),
      before: rewardsBefore ? { stars: rewardsBefore.stars, level: (rewardsBefore.levels || []).find(l => l.level_id === levelId) || null,
        chests: chestsBefore ? chestsBefore.unopened : null, certs: certsBefore ? certsBefore.certificates.length : null } : null,
      lockedNote: all.length > playable.length,
    };
    saveRun(run);
  }
  if (run.done) return showPracticeResult(lv, run, byCode);
  nextPracticeQuestion(lv, run, byCode);
}

function shufflePayload(q) {
  const p = JSON.parse(JSON.stringify(q.payload || {}));
  if (q.qtype === "choice" && p.shuffle !== false && Array.isArray(p.options)) p.options = shuffle(p.options);
  if (q.qtype === "order" && Array.isArray(p.items)) p.items = shuffle(p.items);
  return p;
}

function nextPracticeQuestion(lv, run, byCode) {
  const idx = run.codes.findIndex(c => !run.answers[c]);
  if (idx === -1) return finishPractice(lv, run, byCode);
  const code = run.codes[idx];
  const q = { ...byCode.get(code), payload: run.payloads[code] };
  const view = renderQuestion(q, {
    index: idx + 1, total: run.codes.length, hints: q.hints,
    onSubmit(resp, hintsUsed, seconds) {
      let correct;
      try { correct = gradeAnswer(q.qtype, q.payload, q.answer, resp); }
      catch { message("err", "這一題的答案格式有問題，請告訴老師。"); return; }
      run.answers[code] = { client_uuid: crypto.randomUUID(), resp, correct, hints: hintsUsed, seconds, answered_at: new Date().toISOString() };
      saveRun(run);
      (correct ? playCorrect : playWrong)();
      view.showFeedback({ correct, answerText: describeAnswer(q.qtype, q.answer), explanation: q.explanation, mistake: q.common_mistake });
      const last = idx + 1 === run.codes.length;
      view.root.append(el("div", { class: "row" },
        el("button", { onclick: () => nextPracticeQuestion(lv, run, byCode) }, last ? "看結果 ▶" : "下一題 ▶")));
    },
  });
  app.replaceChildren(
    el("div", { class: "card" }, el("b", null, lv.name), progressBar(idx, run.codes.length)),
    view.root);
  focusQuestion(view.root);
}

async function finishPractice(lv, run, byCode) {
  app.replaceChildren(el("div", { class: "card empty" }, el("p", null, "正在算成績…")));
  // Always (re-)queue: enqueue() skips items already queued, and the server de-duplicates by client_uuid.
  for (const code of run.codes) {
    const a = run.answers[code];
    enqueue(sid, { kind: "level", target: levelId, attemptUuid: run.attemptUuid,
      item: { client_uuid: a.client_uuid, question_code: code, response: a.resp, seconds: a.seconds, hints_used: a.hints, answered_at: a.answered_at } });
  }
  const r = await flush(sid, { kind: "level", target: levelId });
  const att = r.attempts["level|" + levelId];
  if (r.errors.length) { run.sendError = r.errors[0].message; }
  if (!att) {
    // Could not reach the server (or it refused): answers stay queued and are resent automatically.
    saveRun(run);
    return message(r.errors.length ? "err" : "warn",
      r.errors.length ? r.errors[0].message : "網路好像不穩，你的答案已經存在這台裝置，連上網路後會自動補送。",
      el("div", { class: "row" }, el("button", { onclick: () => finishPractice(lv, run, byCode) }, "再試一次送出")));
  }
  // The server is the judge: compare with what the child saw and keep any difference for debugging.
  run.mismatches = run.codes.filter(c => r.results[run.answers[c].client_uuid] && r.results[run.answers[c].client_uuid].is_correct !== run.answers[c].correct);
  if (run.mismatches.length) console.warn("client/server grading mismatch:", run.mismatches);
  const rewards = await rpc("rpc_my_rewards").catch(() => null);
  const chestsNow = await rpc("rpc_my_chests").catch(() => null);
  const certsNow = await rpc("rpc_my_certificates").catch(() => null);
  run.summary = { attemptId: att.id, chests: chestsNow ? chestsNow.unopened : null, certs: certsNow ? certsNow.certificates.length : null, score: att.score, total: att.total, correct: att.correct, stars: rewards ? rewards.stars : null,
    level: rewards ? (rewards.levels || []).find(l => l.level_id === levelId) || null : null, collectibles: rewards ? rewards.collectibles : null };
  run.done = true; saveRun(run);
  history.replaceState(null, "", "play.html?level=" + encodeURIComponent(levelId) + "&result=1");
  showPracticeResult(lv, run, byCode, true);
}

function showPracticeResult(lv, run, byCode, fresh = false) {
  const s = run.summary || { score: Math.round(100 * run.codes.filter(c => run.answers[c].correct).length / run.codes.length), total: run.codes.length, correct: run.codes.filter(c => run.answers[c].correct).length };
  const beforeStars = run.before && run.before.level ? run.before.level.best_stars : 0;
  const nowStars = s.level ? s.level.best_stars : null;
  const gained = nowStars != null ? Math.max(nowStars - beforeStars, 0) : null;
  const wasCollected = run.before && run.before.level && run.before.level.collectible;
  const lines = [];
  if (nowStars != null) {
    // Stars pop in one by one (animation + a rising note each); on a reloaded result page they just appear.
    const row = el("div", { class: "star-row", "aria-label": nowStars + " 顆星星" });
    for (let i = 0; i < nowStars; i++) {
      row.append(el("span", { class: fresh ? "star-pop" : "", style: "animation-delay:" + (i * 0.35) + "s" }, "⭐"));
      if (fresh) setTimeout(() => playStar(i), i * 350);
    }
    lines.push(nowStars ? row : el("p", { class: "big" }, "這次沒有拿到星星，再試一次吧！"));
  }
  if (gained) lines.push(el("p", { class: "msg ok" }, "這次新增 " + gained + " 顆星星！"));
  else if (nowStars != null && nowStars > 0) lines.push(el("p", { class: "muted" }, "星星只會在變多的時候增加，這關你最高是 " + nowStars + " 顆。"));
  if (s.level && s.level.collectible && !wasCollected) lines.push(el("p", { class: "msg ok" }, "🏅 得到新的收集品！" + (s.level.collectible === "gold" ? "而且是金色的 🥇" : "")));
  else if (s.level && s.level.collectible === "gold" && wasCollected !== "gold") lines.push(el("p", { class: "msg ok" }, "🥇 收集品升級成金色了！"));
  const newChests = run.summary && run.before && run.summary.chests != null && run.before.chests != null ? run.summary.chests - run.before.chests : 0;
  if (newChests > 0) lines.push(el("p", { class: "msg ok" }, "🎁 掉出了寶箱！ ", el("a", { href: "rewards.html" }, "去打開它")));
  const newCerts = run.summary && run.before && run.summary.certs != null && run.before.certs != null ? run.summary.certs - run.before.certs : 0;
  if (newCerts > 0) lines.push(el("p", { class: "msg ok" }, "📜 你拿到單元證書了！ ", el("a", { href: "rewards.html" }, "去看證書")));
  if (fresh && (gained || newChests > 0 || newCerts > 0 || (s.level && s.level.collectible && !wasCollected))) setTimeout(playFanfare, Math.max(nowStars || 0, 1) * 350 + 200);
  if (run.lockedNote) lines.push(el("p", { class: "msg warn" }, "有些題目現在留給老師的作業，這次的練習題數比較少。"));
  if (run.sendError) lines.push(el("p", { class: "msg warn" }, run.sendError));

  const wrongs = run.codes.filter(c => !run.answers[c].correct);
  app.replaceChildren(
    el("div", { class: "card result" },
      el("h2", null, lv.name + "：完成！"),
      el("p", { class: "big" }, s.correct + " / " + s.total + " 題答對（" + s.score + " 分）"),
      ...lines,
      el("div", { class: "row" },
        el("a", { class: "btn", href: "map.html" }, "回地圖"),
        el("a", { class: "btn ghost", href: "play.html?level=" + encodeURIComponent(levelId) }, "再練一次"),
        wrongs.length ? el("a", { class: "btn ghost", href: "wrongbook.html" }, "📒 去錯題本訂正") : null,
        run.summary && run.summary.attemptId ? el("a", { class: "btn ghost", href: "attempt.html?id=" + encodeURIComponent(run.summary.attemptId) }, "🧾 每題詳情") : null)),
    wrongs.length ? el("div", { class: "card" }, el("h2", null, "答錯的題目（" + wrongs.length + "）"),
      ...wrongs.map(c => wrongItem(byCode.get(c), run.answers[c], run.payloads[c]))) : el("div", { class: "card" }, el("p", null, "🎉 全部答對！")));  addNextButton(levelId);
}

function wrongItem(q, a, payload) {
  if (!q) return el("p", { class: "muted" }, "（這一題已經不在題庫中）");
  return el("div", { class: "wrong" },
    html("stem", q.stem),
    el("p", { class: "msg err" }, "正確答案：" + describeAnswer(q.qtype, q.answer)),
    q.explanation ? html("explain", "📘 " + q.explanation) : null);
}

/* ===================== Assignment ===================== */
// Answers saved while offline have no result yet. When a later send gets graded, write the result back.
function applyLateResults(run, flushed) {
  for (const [, r] of Object.entries(run.results)) {
    const res = r.queued && flushed.results[r.cu];
    if (res && (res.status === "graded" || res.status === "duplicate")) {
      Object.assign(r, { is_correct: res.is_correct, correct_answer: res.correct_answer, explanation: res.explanation, common_mistake: res.common_mistake, queued: false });
    } else if (res && res.status === "rejected") {
      Object.assign(r, { is_correct: null, rejected: res.reason, queued: false });
    }
  }
}

async function startAssignment() {
  const pending = await flush(sid, { kind: "assignment", target: asgId });     // resend anything saved while offline
  let data;
  try {
    data = await rpc("rpc_assignment_questions", { p_assignment_id: asgId });
  } catch (e) {
    if (e instanceof ApiError && e.code === "session_invalid") return;
    const run = loadRun();
    if (e.code === "assignment_closed" && run && run.attempt) return showAssignmentResult(null, run);
    message("err", e.friendly || "載入失敗，請回地圖再試。");
    return;
  }
  let run = loadRun() || { attemptUuid: crypto.randomUUID(), results: {}, attempt: null };
  if (pending.attempts["assignment|" + asgId]) run.attempt = pending.attempts["assignment|" + asgId];
  applyLateResults(run, pending);
  if (data.attempt && data.attempt.finished) {
    run.attempt = run.attempt || { finished: true, total: data.total };
    saveRun(run);
    return showAssignmentResult(data, run);
  }
  saveRun(run);
  nextAssignmentQuestion(data, run);
}

function nextAssignmentQuestion(data, run) {
  const answered = new Set([...(data.attempt ? data.attempt.answered : []), ...Object.keys(run.results), ...pendingCodes(sid, "assignment", asgId)]);
  const qs = data.questions;
  const idx = qs.findIndex(q => !answered.has(q.question_code));
  if (idx === -1) return finishAssignment(data, run);
  const q = qs[idx];
  const view = renderQuestion(q, {
    index: answered.size + 1, total: data.total, hints: [],
    async onSubmit(resp, _hints, seconds) {
      const cu = crypto.randomUUID();
      enqueue(sid, { kind: "assignment", target: asgId, attemptUuid: run.attemptUuid,
        item: { client_uuid: cu, question_code: q.question_code, response: resp, seconds, answered_at: new Date().toISOString() } });
      view.showFeedback({ correct: null, note: "送出中…" });
      const r = await flush(sid, { kind: "assignment", target: asgId });
      if (r.attempts["assignment|" + asgId]) run.attempt = r.attempts["assignment|" + asgId];
      applyLateResults(run, r);                      // this send may also have delivered earlier offline answers
      const res = r.results[cu];
      let fb;
      if (res && (res.status === "graded" || res.status === "duplicate")) {
        run.results[q.question_code] = { is_correct: res.is_correct, correct_answer: res.correct_answer, explanation: res.explanation,
          common_mistake: res.common_mistake, qtype: q.qtype, stem: q.stem };
        fb = { correct: res.is_correct, answerText: describeAnswer(q.qtype, res.correct_answer), explanation: res.explanation, mistake: res.common_mistake };
      } else if (res && res.status === "rejected") {
        run.results[q.question_code] = { is_correct: null, qtype: q.qtype, stem: q.stem, rejected: res.reason };
        fb = { correct: null, note: res.reason === "late" ? "這題超過截止時間，沒有計分。" : "這題沒有被收進去（" + res.reason + "）。" };
      } else if (r.errors.length) {
        fb = { correct: null, note: r.errors[0].message };
      } else {
        fb = { correct: null, note: "網路好像不穩，答案已經存在這台裝置，連上網路後會自動補送判分。" };
        run.results[q.question_code] = { is_correct: null, qtype: q.qtype, stem: q.stem, queued: true, cu };
      }
      saveRun(run);
      view.showFeedback(fb);
      const left = qs.filter(x => !answeredNow(x.question_code)).length;
      view.root.append(el("div", { class: "row" },
        el("button", { onclick: () => nextAssignmentQuestion(data, run) }, left ? "下一題 ▶" : "看結果 ▶")));
    },
  });
  function answeredNow(code) { return code === q.question_code || answered.has(code); }
  app.replaceChildren(
    el("div", { class: "card" }, el("b", null, data.assignment.title), progressBar(answered.size, data.total)),
    view.root);
  focusQuestion(view.root);
}

async function finishAssignment(data, run) {
  const r = await flush(sid, { kind: "assignment", target: asgId });
  if (r.attempts["assignment|" + asgId]) run.attempt = r.attempts["assignment|" + asgId];
  applyLateResults(run, r);
  saveRun(run);
  showAssignmentResult(data, run);
}

function showAssignmentResult(data, run) {
  const att = run.attempt;
  const queued = pendingCodes(sid, "assignment", asgId).length;
  const title = data ? data.assignment.title : "作業";
  const wrongs = Object.entries(run.results).filter(([, r]) => r.is_correct === false);
  const unknown = Object.values(run.results).filter(r => r.is_correct === null).length;
  // replaceChildren turns a null argument into the text "null", so filter before passing.
  app.replaceChildren(...[
    el("div", { class: "card result" },
      el("h2", null, title + (att && att.finished ? "：交卷完成！" : "")),
      att && att.finished
        ? el("p", { class: "big" }, att.correct + " / " + att.total + " 題答對（" + att.score + " 分）")
        : el("p", { class: "msg warn" }, queued ? "還有 " + queued + " 題的答案存在這台裝置，連上網路後會自動補送。" : "作業還沒全部交完。"),
      unknown && att && att.finished ? el("p", { class: "muted" }, "有 " + unknown + " 題沒有收進成績。") : null,
      queued ? el("button", { onclick: async () => { await flush(sid, { kind: "assignment", target: asgId }); location.reload(); } }, "現在補送") : null,
      el("div", { class: "row" }, el("a", { class: "btn", href: "map.html" }, "回地圖"),
        att && att.finished && att.id ? el("a", { class: "btn ghost", href: "attempt.html?id=" + encodeURIComponent(att.id) }, "🧾 每題詳情") : null)),
    wrongs.length ? el("div", { class: "card" }, el("h2", null, "答錯的題目（" + wrongs.length + "）"),
      ...wrongs.map(([, r]) => el("div", { class: "wrong" }, html("stem", r.stem),
        el("p", { class: "msg err" }, "正確答案：" + describeAnswer(r.qtype, r.correct_answer)),
        r.explanation ? html("explain", "📘 " + r.explanation) : null)))
      : (att && att.finished && !unknown ? el("div", { class: "card" }, el("p", null, "🎉 全部答對！")) : null),
  ].filter(Boolean));
  addNextButton(null);
}
