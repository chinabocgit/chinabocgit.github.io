// Illustrated learning map (self-drawn SVG, no external images).
// One scene per subject: units are districts, levels are stops along a winding road, the pet walks next to the current stop.
// Themes only change palette and decoration; the logic (states, selection, keyboard) is shared.
import { petSvg } from "./pet.js?v=551015e2";

const NS = "http://www.w3.org/2000/svg";
const W = 360;
const XS = [88, 196, 282, 196];            // zig-zag x positions of consecutive stops
const STEP = 112;                           // vertical distance between stops

const PALETTES = {
  town: { sky: ["#bfe3ff", "#fff3dc"], ground: "#f6ecd2", road: "#ead7a8", edge: "#cfb77a", line: "#ffffff", glow: "#ffd166", banner: "#fff1e6", bannerInk: "#b7410e",
          ink: "#3b3226", decor: "town", roadStyle: "path", stopName: "路燈", dim: "#e9e1cf", dimEdge: "#b8a787" },
  forest: { sky: ["#244c5c", "#4f8a68"], ground: "#2f6a47", road: "#8a7350", edge: "#5d4a30", line: "#a99466", glow: "#d6ff7a", banner: "#eaf6d9", bannerInk: "#2d5a3d",
          ink: "#f3f7e8", decor: "forest", roadStyle: "path", stopName: "螢火", dim: "#cfd9c4", dimEdge: "#8da086" },
  rail: { sky: ["#8fc7ff", "#eaf5ff"], ground: "#d8e2e8", road: "#b4c0c8", edge: "#8b99a3", line: "#6d5a45", glow: "#ffe08a", banner: "#e8f1fb", bannerInk: "#2a4d7a",
          ink: "#24384f", decor: "rail", roadStyle: "rail", stopName: "車站", dim: "#dfe6ea", dimEdge: "#9aa8b2" },
};

function s(tag, attrs, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) e.setAttribute(k, v);
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(typeof c === "string" ? document.createTextNode(c) : c);
  return e;
}
const hash = str => { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0); };

// Smooth path through points (Catmull-Rom converted to cubic Beziers).
function smooth(pts) {
  let d = "M" + pts[0].x + " " + pts[0].y;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += " C" + (p1.x + (p2.x - p0.x) / 6).toFixed(1) + " " + (p1.y + (p2.y - p0.y) / 6).toFixed(1) + " " +
         (p2.x - (p3.x - p1.x) / 6).toFixed(1) + " " + (p2.y - (p3.y - p1.y) / 6).toFixed(1) + " " + p2.x + " " + p2.y;
  }
  return d;
}

/* ---------- decorations ---------- */
const HOUSE = ["#f2a65a", "#7aa7e8", "#e57f84", "#8fd19e"];
function house(x, y, k) {
  const c = HOUSE[k % HOUSE.length];
  return s("g", { transform: `translate(${x} ${y})` },
    s("rect", { x: -17, y: -16, width: 34, height: 28, rx: 3, fill: "#fffaf0", stroke: "#c9b28a", "stroke-width": 2 }),
    s("path", { d: "M-22 -14 L0 -34 L22 -14 Z", fill: c, stroke: "#c9b28a", "stroke-width": 2, "stroke-linejoin": "round" }),
    s("rect", { x: -5, y: -2, width: 10, height: 14, rx: 2, fill: "#b07a4a" }),
    s("rect", { x: 8, y: -10, width: 7, height: 7, rx: 1, fill: "#bfe3ff" }));
}
function bush(x, y, fill) { return s("g", { transform: `translate(${x} ${y})` }, s("circle", { cx: -8, cy: 0, r: 9, fill }), s("circle", { cx: 6, cy: -3, r: 11, fill }), s("circle", { cx: 0, cy: 4, r: 8, fill })); }
function pine(x, y, k) {
  const g = k % 2 ? "#1f5a3a" : "#2a7a4d";
  return s("g", { transform: `translate(${x} ${y})` },
    s("rect", { x: -3, y: 8, width: 6, height: 10, fill: "#5d4330" }),
    s("path", { d: "M0 -34 L16 -8 L-16 -8 Z", fill: g }), s("path", { d: "M0 -22 L20 6 L-20 6 Z", fill: g }));
}
function mushroom(x, y) {
  return s("g", { transform: `translate(${x} ${y})` }, s("rect", { x: -3, y: 0, width: 6, height: 9, rx: 2, fill: "#f5ecd8" }),
    s("path", { d: "M-12 2 A12 11 0 0 1 12 2 Z", fill: "#e8605a" }), s("circle", { cx: -4, cy: -3, r: 2, fill: "#fff" }), s("circle", { cx: 4, cy: -1, r: 1.6, fill: "#fff" }));
}
function signal(x, y) {
  return s("g", { transform: `translate(${x} ${y})` }, s("rect", { x: -2, y: -26, width: 4, height: 38, fill: "#5f6b75" }),
    s("rect", { x: -8, y: -36, width: 16, height: 18, rx: 4, fill: "#2e3a45" }), s("circle", { cx: 0, cy: -31, r: 3.4, fill: "#ff6b6b", class: "blink" }), s("circle", { cx: 0, cy: -23, r: 3.4, fill: "#62d26f" }));
}
function station(x, y, k) {
  const c = ["#e57f84", "#7aa7e8", "#f2c14e"][k % 3];
  return s("g", { transform: `translate(${x} ${y})` }, s("rect", { x: -26, y: -18, width: 52, height: 28, rx: 4, fill: "#fff", stroke: "#8b99a3", "stroke-width": 2 }),
    s("rect", { x: -30, y: -26, width: 60, height: 10, rx: 3, fill: c }), s("rect", { x: -18, y: -8, width: 10, height: 14, fill: "#8fb7df" }), s("rect", { x: 4, y: -8, width: 14, height: 18, fill: "#b07a4a" }));
}
function decor(kind, x, y, k) {
  if (kind === "town") return k % 3 === 0 ? bush(x, y, "#8bc779") : house(x, y, k);
  if (kind === "forest") return k % 4 === 0 ? mushroom(x, y + 6) : pine(x, y, k);
  return k % 2 ? signal(x, y) : station(x, y, k);
}
function cloud(x, y, scale, delay) {
  return s("g", { class: "cloud", transform: `translate(${x} ${y}) scale(${scale})`, style: `animation-delay:${delay}s` },
    s("ellipse", { cx: 0, cy: 0, rx: 28, ry: 11, fill: "#fff", opacity: ".85" }), s("ellipse", { cx: -14, cy: -8, rx: 15, ry: 10, fill: "#fff", opacity: ".85" }), s("ellipse", { cx: 10, cy: -10, rx: 17, ry: 11, fill: "#fff", opacity: ".85" }));
}

/* ---------- a stop on the road ---------- */
function wrapName(name) { const t = String(name); return t.length <= 6 ? [t] : [t.slice(0, 6), t.slice(6, 12) + (t.length > 12 ? "…" : "")]; }
function lockIcon() { return s("g", { transform: "translate(0 1)" }, s("rect", { x: -7, y: -3, width: 14, height: 11, rx: 2, fill: "#6b6a78" }), s("path", { d: "M-4 -3 V-7 A4 4 0 0 1 4 -7 V-3", fill: "none", stroke: "#6b6a78", "stroke-width": 2.4 })); }
function castle(fill, edge) {
  return s("g", null, s("rect", { x: -15, y: -12, width: 30, height: 24, rx: 2, fill, stroke: edge, "stroke-width": 2.5 }),
    s("path", { d: "M-15 -12 v-7 h6 v4 h4 v-4 h6 v4 h4 v-4 h6 v7", fill, stroke: edge, "stroke-width": 2.5, "stroke-linejoin": "round" }),
    s("rect", { x: -4, y: 0, width: 8, height: 12, rx: 3, fill: edge }), s("path", { d: "M0 -19 V-30 L10 -26 L0 -22", fill: "#e8605a" }));
}
function stop(P, l, pos, sel, onSelect, collectibleName) {
  const cls = ["stop"];
  const st = l.state, current = !!l.current, locked = !!l.lock;
  if (current) cls.push("current"); if (st === "gold") cls.push("gold"); if (locked) cls.push("locked"); if (sel) cls.push("selected");
  const lit = st === "cleared" || st === "gold";
  const fill = st === "gold" ? "#ffe08a" : lit ? "#ffb703" : current ? "#ffffff" : P.dim;
  const edge = st === "gold" ? "#e0a800" : lit ? "#e08a00" : current ? "#f08a24" : P.dimEdge;
  const label = l.name + "，" + ({ quiz: "一般關卡", boss: "魔王關", interactive: "互動遊戲", exam: "月考" }[l.kind] || "")
    + (st === "gold" ? "，金色" + collectibleName : lit ? "，已過關" : "") + (locked ? "，被作業鎖住" : "") + (l.pin ? (l.pin.state === "done" ? "，老師派的作業，已完成" : "，老師派的作業") : "") + (current ? "，目前關卡" : "");
  const g = s("g", { class: cls.join(" "), transform: `translate(${pos.x} ${pos.y})`, role: "button", tabindex: "0", "aria-label": label, "aria-pressed": String(!!sel) });
  g.append(...[
    lit || current ? s("circle", { class: "halo", r: 34, fill: P.glow, opacity: lit ? ".5" : ".35" }) : null,
    s("circle", { class: "hit", r: 38, fill: "transparent" }),
    sel ? s("circle", { r: 33, fill: "none", stroke: "#fff", "stroke-width": 3, "stroke-dasharray": "6 5", class: "selring" }) : null,
    s("rect", { x: -3, y: 6, width: 6, height: 26, rx: 2, fill: "#6b5a45" }),                       // lamp post / pole
    l.kind === "boss" ? castle(fill, edge) : s("circle", { r: 18, fill, stroke: edge, "stroke-width": 3.5 }),
    l.kind === "boss" ? null : lit ? s("path", { d: "M-7 0 L-2 5 L8 -5", fill: "none", stroke: "#fff", "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round" })
      : locked ? lockIcon() : current ? s("path", { d: "M-5 -8 L9 0 L-5 8 Z", fill: "#f08a24" }) : l.playable ? s("circle", { r: 5, fill: "#fff", opacity: ".8" }) : s("text", { "text-anchor": "middle", y: 6, "font-size": 16 }, "🎮"),
    locked && l.kind === "boss" ? s("g", { transform: "translate(0 4)" }, lockIcon()) : null,
    st === "gold" ? s("text", { class: "sparkle", x: 18, y: -16, "font-size": 15 }, "✨") : null,
    l.pin ? s("g", { class: "pin " + l.pin.state, transform: "translate(-22 -22)" },
      s("circle", { r: 11, fill: l.pin.state === "done" ? "#2e9e5b" : "#e8605a", stroke: "#fff", "stroke-width": 2.5 }),
      l.pin.state === "done" ? s("path", { d: "M-4.5 0 L-1 3.5 L5 -3.5", fill: "none", stroke: "#fff", "stroke-width": 2.6, "stroke-linecap": "round", "stroke-linejoin": "round" })
                             : s("text", { x: 0, y: 4.5, "text-anchor": "middle", "font-size": 13, "font-weight": 800, fill: "#fff" }, "!")) : null,
    wrapName(l.name).map((t, i) => s("text", { x: 0, y: 48 + i * 15, "text-anchor": "middle", class: "stop-name", "font-size": 13, fill: P.ink }, t)),
    l.stars ? s("text", { x: 0, y: 48 + wrapName(l.name).length * 15 + 2, "text-anchor": "middle", "font-size": 13 }, "⭐".repeat(Math.min(l.stars, 3))) : null,
  ].flat(Infinity).filter(Boolean));          // DOM append() would turn arrays and null into text, so flatten first
  const go = () => onSelect(l);
  g.addEventListener("click", go);
  g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  return g;
}

/* ---------- the whole scene ---------- */
// units: [{ unit, levels:[{ id, name, kind, state, stars, lock, playable, current }] }]
export function renderMap({ units, theme, pet, selectedId, onSelect, collectibleName = "收藏" }) {
  const P = PALETTES[theme] || PALETTES.town;
  const layers = { back: [], road: [], decor: [], ui: [] };
  const points = [];
  const stops = [];
  let y = 24, cloudY = 90, idx = 0;

  for (const { unit, levels } of units) {
    const lit = levels.filter(l => l.state === "cleared" || l.state === "gold").length;
    layers.ui.push(s("g", { transform: `translate(${W / 2} ${y + 22})`, class: "banner" },
      s("rect", { x: -150, y: -22, width: 300, height: 44, rx: 22, fill: P.banner, stroke: P.edge, "stroke-width": 3 }),
      s("text", { x: 0, y: -2, "text-anchor": "middle", "font-size": 16, "font-weight": 800, fill: P.bannerInk }, "第 " + unit.no + " 單元・" + (unit.title.length > 11 ? unit.title.slice(0, 11) + "…" : unit.title)),
      s("text", { x: 0, y: 15, "text-anchor": "middle", "font-size": 12, fill: P.bannerInk, opacity: ".8" }, "已點亮 " + lit + " / " + levels.length)));
    const first = y + 96;
    if (!points.length) points.push({ x: W / 2, y: y + 56 });
    levels.forEach((l, i) => {
      const pos = { x: XS[(idx + i) % XS.length], y: first + i * STEP };
      points.push(pos); stops.push({ l, pos });
      const k = hash(unit.id + l.id);
      if (k % 5 !== 0) {                                           // decoration on the side away from the road
        const dx = pos.x < W / 2 ? 252 + (k % 40) : 60 - (k % 30);
        layers.decor.push(decor(P.decor, Math.max(34, Math.min(W - 34, dx)), pos.y - 6 + ((k >> 3) % 24), k >> 5));
      }
      if (i % 2 === 0) layers.decor.push(decor(P.decor, pos.x < W / 2 ? 330 : 30, pos.y + 52, (k >> 7) + 1));
    });
    idx += levels.length;
    y = first + levels.length * STEP + 20;
    if (!levels.length) y += 40;
  }
  const H = y + 40;
  for (let cy = cloudY; cy < H - 100; cy += 300) layers.back.push(cloud(60 + (cy % 220), cy, 1 + (cy % 3) * 0.15, (cy % 7) * -1.3));

  // sky, rolling ground, road
  const defs = s("defs", null, s("linearGradient", { id: "sky-" + theme, x1: 0, y1: 0, x2: 0, y2: 1 },
    s("stop", { offset: "0", "stop-color": P.sky[0] }), s("stop", { offset: "1", "stop-color": P.sky[1] })));
  const ground = s("path", { d: `M0 ${Math.min(160, H * 0.2)} Q90 ${Math.min(130, H * 0.16)} 180 ${Math.min(165, H * 0.2)} T360 ${Math.min(150, H * 0.19)} V${H} H0 Z`, fill: P.ground });
  const roadD = points.length > 1 ? smooth(points) : null;
  if (roadD) {
    layers.road.push(s("path", { d: roadD, fill: "none", stroke: P.edge, "stroke-width": 42, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    layers.road.push(s("path", { d: roadD, fill: "none", stroke: P.road, "stroke-width": 34, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    layers.road.push(P.roadStyle === "rail"
      ? [s("path", { d: roadD, fill: "none", stroke: P.line, "stroke-width": 26, "stroke-dasharray": "3 11", "stroke-linecap": "butt" }),
         s("path", { d: roadD, fill: "none", stroke: "#8b99a3", "stroke-width": 3 })]
      : s("path", { d: roadD, fill: "none", stroke: P.line, "stroke-width": 3, "stroke-dasharray": "10 10", opacity: ".9" }));
  }
  // fireflies for the forest theme
  const flies = P.decor === "forest" ? Array.from({ length: Math.floor(H / 90) }, (_, i) => s("circle", { class: "firefly", cx: 20 + (hash("f" + i) % 320), cy: 120 + ((hash("g" + i) % Math.max(H - 200, 100))), r: 2.6, fill: P.glow, style: `animation-delay:${(i % 6) * -0.9}s` })) : [];

  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "scene", role: "group", "aria-label": "學習地圖：沿著小路一關一關往前走", "data-theme": theme, preserveAspectRatio: "xMidYMin meet" },
    defs, s("rect", { width: W, height: H, fill: `url(#sky-${theme})` }), layers.back, ground, flies, layers.road, layers.decor);
  for (const { l, pos } of stops) svg.append(stop(P, l, pos, selectedId === l.id, onSelect, collectibleName));
  // the pet walks next to the current stop
  const cur = stops.find(x => x.l.current);
  if (pet && cur) {
    const p = petSvg(pet.id, pet.outfit || {}, 52);
    p.setAttribute("x", cur.pos.x + (cur.pos.x > W / 2 ? -74 : 24)); p.setAttribute("y", cur.pos.y - 34);
    p.removeAttribute("width"); p.removeAttribute("height"); p.setAttribute("width", 52); p.setAttribute("height", 52);
    const g = s("g", { class: "pet-walker", "aria-hidden": "true" }); g.append(p); svg.append(g);
  }
  svg.append(...layers.ui);
  return svg;
}
