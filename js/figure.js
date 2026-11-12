// Figures for questions. The database stores only numeric parameters (payload.figure); this file draws them.
// Nothing from the database is ever inserted as markup: every SVG element is created with createElementNS,
// every label is a text node, and every number is checked against a range before it is used.
// Shapes are fixed: number_line, angle, rect, circle, fraction_bar, ruler. Anything else is refused.

const SVG_NS = "http://www.w3.org/2000/svg";
const num = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const int = (v, lo, hi) => num(v, lo, hi) && Number.isInteger(v);

// Pure checker: returns { ok: true, fig } or { ok: false, reason }. Testable without a browser.
export function validateFigure(f) {
  if (!f || typeof f !== "object") return { ok: false, reason: "no figure" };
  switch (f.type) {
    case "number_line": {
      // Accepts the names used by the stored unit-1 figures (from / to / mark / arrow / labels) as well as min / max / marks.
      const min = f.min !== undefined ? f.min : f.from, max = f.max !== undefined ? f.max : f.to;
      if (!num(min, -100000, 100000) || !num(max, -100000, 100000) || max - min <= 0) return { ok: false, reason: "number_line range" };
      const marks = f.marks !== undefined ? f.marks : [f.mark, f.arrow].filter(v => v !== undefined);
      if (!Array.isArray(marks) || marks.length > 6 || !marks.every(m => num(m, min, max))) return { ok: false, reason: "number_line marks" };
      const step = f.step;
      if (step !== undefined && !(num(step, 0.01, max - min))) return { ok: false, reason: "number_line step" };
      if ((max - min) / (step !== undefined ? step : (max - min) / 10) > 50) return { ok: false, reason: "number_line too many ticks" };
      const labels = Array.isArray(f.labels) && f.labels.every(v => num(v, min, max)) ? f.labels.slice() : null;
      return { ok: true, fig: { type: f.type, min, max, marks: marks.slice(), step, labels } };
    }
    case "angle": {
      if (!int(f.deg, 1, 179)) return { ok: false, reason: "angle degree" };
      return { ok: true, fig: { type: f.type, deg: f.deg } };
    }
    case "rect": {
      if (!int(f.w, 1, 20) || !int(f.h, 1, 20)) return { ok: false, reason: "rect size" };
      if (f.unit !== undefined && f.unit !== "格" && f.unit !== "公分") return { ok: false, reason: "rect unit" };
      return { ok: true, fig: { type: f.type, w: f.w, h: f.h, square: f.w === f.h, unit: f.unit || "格" } };
    }
    case "circle": {
      if (!int(f.r, 1, 10)) return { ok: false, reason: "circle radius" };
      return { ok: true, fig: { type: f.type, r: f.r, showRadius: f.showRadius === true, showDiameter: f.showDiameter === true } };
    }
    case "fraction_bar": {
      if (!int(f.den, 2, 12) || !int(f.num, 0, f.den)) return { ok: false, reason: "fraction" };
      if (f.shape !== undefined && f.shape !== "bar" && f.shape !== "circle") return { ok: false, reason: "fraction shape" };
      return { ok: true, fig: { type: f.type, den: f.den, num: f.num, shape: f.shape || "bar" } };
    }
    case "ruler": {
      if (!int(f.cm, 1, 15)) return { ok: false, reason: "ruler length" };
      if (f.item_mm !== undefined && !int(f.item_mm, 0, f.cm * 10)) return { ok: false, reason: "ruler item" };
      return { ok: true, fig: { type: f.type, cm: f.cm, item_mm: f.item_mm } };
    }
    default:
      return { ok: false, reason: "unknown type" };
  }
}

function svgEl(tag, attrs, text) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
  if (text != null) e.textContent = String(text);
  return e;
}

// Draws a validated figure. Returns a <figure> element, or a plain text note if the data is refused.
export function renderFigure(raw, caption) {
  const v = validateFigure(raw);
  const wrap = document.createElement("figure");
  wrap.className = "qfig";
  if (!v.ok) {
    wrap.append(document.createTextNode("（此題圖形暫時無法顯示，請看題幹文字。）"));
    return wrap;
  }
  const f = v.fig;
  const W = 360, H = 120;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", width: "100%", style: "max-width:360px", "aria-label": caption || "題目圖形" });
  const g = svgEl("g", { fill: "none", stroke: "#3b3a4a", "stroke-width": 2 });
  svg.append(g);
  if (f.type === "number_line") drawNumberLine(g, svg, f);
  if (f.type === "angle") drawAngle(g, svg, f);
  if (f.type === "rect") drawRect(g, svg, f);
  if (f.type === "circle") drawCircle(g, svg, f);
  if (f.type === "fraction_bar") drawFraction(g, svg, f);
  if (f.type === "ruler") drawRuler(g, svg, f);
  wrap.append(svg);
  if (caption) wrap.append(el1("figcaption", caption));
  return wrap;
}

function el1(tag, text) { const e = document.createElement(tag); e.textContent = text; return e; }

function drawNumberLine(g, svg, f) {
  const x0 = 20, x1 = 340, y = 70, span = f.max - f.min;
  const px = v => x0 + ((v - f.min) / span) * (x1 - x0);
  g.append(svgEl("line", { x1: x0, y1: y, x2: x1, y2: y }));
  const step = f.step || (span <= 10 ? 1 : span / 10);
  const shown = f.labels ? new Set(f.labels.map(v => +v.toFixed(2))) : null;   // labels given: only those numbers are written
  for (let v = f.min; v <= f.max + 1e-9; v += step) {
    const x = px(v);
    g.append(svgEl("line", { x1: x, y1: y - 6, x2: x, y2: y + 6 }));
    if (!shown || shown.has(+v.toFixed(2)))
      svg.append(svgEl("text", { x, y: y + 22, "text-anchor": "middle", "font-size": 13, fill: "#3b3a4a", stroke: "none" }, +v.toFixed(2)));
  }
  for (const m of f.marks) {
    svg.append(svgEl("circle", { cx: px(m), cy: y - 18, r: 5, fill: "#ff7a00", stroke: "none" }));
  }
}

function drawAngle(g, svg, f) {
  const vx = 60, vy = 100, len = 90, rad = (f.deg * Math.PI) / 180;
  g.append(svgEl("line", { x1: vx, y1: vy, x2: vx + len, y2: vy }));
  g.append(svgEl("line", { x1: vx, y1: vy, x2: vx + len * Math.cos(rad), y2: vy - len * Math.sin(rad) }));
  const arc = 26;
  g.append(svgEl("path", { d: `M ${vx + arc} ${vy} A ${arc} ${arc} 0 0 0 ${vx + arc * Math.cos(rad)} ${vy - arc * Math.sin(rad)}` }));
  if (f.deg === 90) g.append(svgEl("path", { d: `M ${vx + 12} ${vy} L ${vx + 12} ${vy - 12} L ${vx} ${vy - 12}` }));
}

function drawRect(g, svg, f) {
  const W = 360, H = 120, maxW = 260, maxH = 90, s = Math.min(maxW / f.w, maxH / f.h);
  const w = f.w * s, h = f.h * s, x = (W - w) / 2, y = (H - h) / 2;
  g.append(svgEl("rect", { x, y, width: w, height: h }));
  svg.append(svgEl("text", { x: x + w / 2, y: y + h + 16, "text-anchor": "middle", "font-size": 13, fill: "#3b3a4a", stroke: "none" }, f.w + f.unit));
  svg.append(svgEl("text", { x: x - 8, y: y + h / 2 + 4, "text-anchor": "end", "font-size": 13, fill: "#3b3a4a", stroke: "none" }, f.h + f.unit));
}

function drawCircle(g, svg, f) {
  const cx = 180, cy = 60;
  const rr = Math.min(50, 5 * f.r + 10);   // drawn size only; the number f.r is shown in the text, not by pixels
  g.append(svgEl("circle", { cx, cy, r: rr }));
  g.append(svgEl("circle", { cx, cy, r: 2.5, fill: "#3b3a4a", stroke: "none" }));
  if (f.showRadius) {
    g.append(svgEl("line", { x1: cx, y1: cy, x2: cx + rr, y2: cy }));
    svg.append(svgEl("text", { x: cx + rr / 2, y: cy - 6, "text-anchor": "middle", "font-size": 13, fill: "#3b3a4a", stroke: "none" }, "半徑"));
  }
  if (f.showDiameter) {
    g.append(svgEl("line", { x1: cx - rr, y1: cy, x2: cx + rr, y2: cy, "stroke-dasharray": "4 3" }));
    svg.append(svgEl("text", { x: cx, y: cy - 6, "text-anchor": "middle", "font-size": 13, fill: "#3b3a4a", stroke: "none" }, "直徑"));
  }
}

function drawFraction(g, svg, f) {
  if (f.shape === "circle") {
    const cx = 180, cy = 60, r = 50;
    g.append(svgEl("circle", { cx, cy, r }));
    for (let i = 0; i < f.den; i++) {
      const a = (2 * Math.PI * i) / f.den - Math.PI / 2;
      g.append(svgEl("line", { x1: cx, y1: cy, x2: cx + r * Math.cos(a), y2: cy + r * Math.sin(a) }));
    }
    for (let i = 0; i < f.num; i++) {
      const a0 = (2 * Math.PI * i) / f.den - Math.PI / 2, a1 = (2 * Math.PI * (i + 1)) / f.den - Math.PI / 2;
      svg.append(svgEl("path", { d: `M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`, fill: "#ffb703", stroke: "none", opacity: 0.85 }));
    }
    return;
  }
  const x = 40, y = 40, w = 280, h = 40, cell = w / f.den;
  for (let i = 0; i < f.den; i++) {
    if (i < f.num) svg.append(svgEl("rect", { x: x + i * cell, y, width: cell, height: h, fill: "#ffb703", stroke: "none", opacity: 0.85 }));
  }
  g.append(svgEl("rect", { x, y, width: w, height: h }));
  for (let i = 1; i < f.den; i++) g.append(svgEl("line", { x1: x + i * cell, y1: y, x2: x + i * cell, y2: y + h }));
}

function drawRuler(g, svg, f) {
  const x0 = 20, pxPerMm = 320 / (f.cm * 10), y = 60;
  g.append(svgEl("line", { x1: x0, y1: y, x2: x0 + f.cm * 10 * pxPerMm, y2: y }));
  for (let mm = 0; mm <= f.cm * 10; mm++) {
    const x = x0 + mm * pxPerMm, long = mm % 10 === 0, mid = mm % 5 === 0;
    g.append(svgEl("line", { x1: x, y1: y, x2: x, y2: y - (long ? 16 : mid ? 10 : 5) }));
    if (long) svg.append(svgEl("text", { x, y: y + 18, "text-anchor": "middle", "font-size": 13, fill: "#3b3a4a", stroke: "none" }, mm / 10));
  }
  if (f.item_mm) {
    svg.append(svgEl("line", { x1: x0, y1: y + 30, x2: x0 + f.item_mm * pxPerMm, y2: y + 30, stroke: "#ff7a00", "stroke-width": 6 }));
  }
}
