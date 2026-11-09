// Renders one question: data card, stem, answer controls (choice / tf / fill / order), 3-level hints, feedback.
// All database-provided text goes through setSafeHtml; the only plain-text inputs are the child's own typing.
import { el } from "./dom.js?v=cca6bca5";
import { setSafeHtml } from "./sanitize.js?v=cca6bca5";

function html(tag, cls, content) {
  const e = el(tag, cls ? { class: cls } : null);
  setSafeHtml(e, content);
  return e;
}

// After a new question is drawn, move keyboard / screen-reader focus to it instead of leaving it on a removed element.
export function focusQuestion(root) { root.tabIndex = -1; root.focus({ preventScroll: true }); window.scrollTo(0, 0); }

// q: question from the server. opts: { index, total, hints: string[] (may be empty), onSubmit(resp, hintsUsed, seconds) }
// Returns { root, showFeedback(fb), lock() }.
export function renderQuestion(q, opts) {
  const started = Date.now();
  let hintsUsed = 0;
  let response = null;                       // current response (null = nothing chosen yet)
  let locked = false;

  const submit = el("button", { class: "submit", disabled: true, onclick: send }, "送出答案");
  const feedback = el("div", { class: "feedback", "aria-live": "polite" });
  const controls = el("div", { class: "answer", "data-qtype": q.qtype });

  function setResponse(r) {
    response = r;
    submit.disabled = locked || r === null;
  }
  function send() {
    if (locked || response === null) return;
    const seconds = Math.min(3600, Math.round((Date.now() - started) / 1000));
    opts.onSubmit(response, hintsUsed, seconds);
  }

  /* ---- answer controls by type ---- */
  if (q.qtype === "choice") {
    const buttons = [];
    for (const opt of q.payload.options || []) {
      const b = el("button", { class: "opt", "aria-pressed": "false", onclick: () => {
        if (locked) return;
        buttons.forEach(x => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        setResponse(opt);
      } });
      setSafeHtml(b, opt);
      buttons.push(b);
    }
    controls.append(...buttons);
  } else if (q.qtype === "tf") {
    const mk = (label, val) => {
      const b = el("button", { class: "opt", "aria-pressed": "false", onclick: () => {
        if (locked) return;
        controls.querySelectorAll(".opt").forEach(x => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        setResponse(val);
      } }, label);
      return b;
    };
    controls.append(mk("⭕ 對", true), mk("❌ 錯", false));
  } else if (q.qtype === "fill") {
    const input = el("input", { type: "text", class: "fill", autocomplete: "off", "aria-label": "你的答案",
      oninput: () => setResponse(input.value.trim() === "" ? null : input.value),
      onkeydown: e => { if (e.key === "Enter") send(); } });
    controls.append(input);
  } else if (q.qtype === "order") {
    const items = q.payload.items || [];
    const picked = [];                                   // texts in chosen order
    const slots = el("div", { class: "order-picked", "aria-label": "你排的順序" });
    const pool = el("div", { class: "order-pool" });
    const redraw = () => {
      const hadFocus = controls.contains(document.activeElement);      // keep keyboard users in the widget
      slots.replaceChildren(...(picked.length ? picked.map((t, i) =>
        el("button", { class: "chip on", title: "點一下拿掉", onclick: () => { if (locked) return; picked.splice(i, 1); redraw(); } }, (i + 1) + ". " + t))
        : [el("span", { class: "muted" }, "依序點下面的選項")]));
      pool.replaceChildren(...items.map(t =>
        el("button", { class: "chip", disabled: picked.includes(t) || locked, onclick: () => { picked.push(t); redraw(); } }, t)));
      setResponse(picked.length === items.length ? picked.slice() : null);
      if (hadFocus) { const n = pool.querySelector("button:not(:disabled)") || slots.querySelector("button"); if (n) n.focus(); else submit.focus(); }
    };
    controls.append(slots, pool);
    redraw();
  } else {
    controls.append(el("p", { class: "msg warn" }, "這種題型還不能作答。"));
  }

  /* ---- hints (practice only) ---- */
  const hintBox = el("div", { class: "hints", "aria-live": "polite" });
  const hints = (opts.hints || []).filter(h => h);
  const hintBtn = hints.length
    ? el("button", { class: "ghost", onclick: () => {
        if (locked || hintsUsed >= hints.length) return;
        hintBox.append(html("p", "hint", "💡 提示 " + (hintsUsed + 1) + "：" + hints[hintsUsed]));
        hintsUsed++;
        hintBtn.textContent = hintsUsed >= hints.length ? "沒有更多提示了" : "💡 再給我一點提示（" + hintsUsed + "/" + hints.length + "）";
        hintBtn.disabled = hintsUsed >= hints.length;
      } }, "💡 給我一點提示")
    : null;

  /* ---- assemble ---- */
  const root = el("section", { class: "question card", "aria-label": "第 " + opts.index + " 題" },
    el("div", { class: "muted" }, "第 " + opts.index + " / " + opts.total + " 題" + (q.is_literacy ? "・素養題" : "")),
    q.group_content ? el("details", { class: "datacard", open: true },
      el("summary", null, q.group_title || "資料卡"), html("div", "datacard-body", q.group_content)) : null,
    html("div", "stem", q.stem),
    controls,
    hintBtn ? el("div", { class: "row" }, hintBtn) : null, hintBox,
    el("div", { class: "row" }, submit),
    feedback);

  return {
    root,
    // fb: { correct: boolean|null, answerText, explanation, mistake, note }
    showFeedback(fb) {
      locked = true;
      submit.disabled = true;
      controls.querySelectorAll("button, input").forEach(x => { x.disabled = true; });
      if (hintBtn) hintBtn.disabled = true;
      const head = fb.correct === true ? el("div", { class: "msg ok" }, "✔ 答對了！")
        : fb.correct === false ? el("div", { class: "msg err" }, "✘ 這題答錯了" + (fb.answerText ? "，正確答案：" + fb.answerText : ""))
        : el("div", { class: "msg warn" }, fb.note || "答案已記下。");
      // replaceChildren turns a null argument into the text "null", so only pass real nodes.
      feedback.replaceChildren(...[head,
        fb.explanation ? html("p", "explain", "📘 " + fb.explanation) : null,
        fb.correct === false && fb.mistake ? html("p", "explain", "⚠️ 常見錯誤：" + fb.mistake) : null].filter(Boolean));
    },
  };
}
