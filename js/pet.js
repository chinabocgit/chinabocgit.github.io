// Self-drawn pet (SVG) with equipment shown as emoji around it. No external images.
// The shape of the pet depends on its type (可愛型／動物型／人偶型／文具型／文書型). Types must match _supabase/2E/031.
const NS = "http://www.w3.org/2000/svg";
const BODY = { sparky: "#ff7a2a", glow: "#7fd6a0", rail: "#7aa7e8", letter: "#f0cf7a", pencil: "#f2c94c" };

export const PET_TYPE = { sparky: "cute", glow: "animal", rail: "doll", letter: "document", pencil: "stationery" };
export const TYPE_LABEL = { cute: "可愛型", animal: "動物型", doll: "人偶型", stationery: "文具型", document: "文書型" };

export const SLOT_LABEL = { head: "頭", neck: "脖子", back: "背", hand: "手" };
export const EQUIP_EMOJI = {
  cap: "🧢", scarf: "🧣", bag: "🎒", wand: "🪄", glasses: "👓", bell: "🔔",
  spark_crown: "👑", glow_wings: "🦋", rail_whistle: "📯", spark_cape: "✨",
  bunny_ears: "🐰", hair_clip: "🎀", eraser_cap: "🧽", envelope_pin: "💌",
};
// Equipment that is drawn as shapes instead of an emoji: 🪽 is too new (Unicode 15) and many devices show nothing for it.
const DRAWN = new Set(["glow_wings"]);
// One pair of glowing wings. (cx, cy) is where the wings join the body; the left wing is drawn, the right one is its mirror.
function wings(parent, cx, cy, k = 1) {
  const g = svg("g", { transform: `translate(${cx} ${cy}) scale(${k})`, "aria-hidden": "true" });
  const half = (flip) => {
    const w = svg("g", flip ? { transform: "scale(-1 1)" } : {});
    w.append(
      svg("path", { d: "M-6 0 C-24 -4 -46 -20 -50 -42 C-32 -46 -10 -30 -4 -10 Z", fill: "#c8fbe6", "fill-opacity": 0.85, stroke: "#4fcf9a", "stroke-width": 2, "stroke-linejoin": "round" }),
      svg("path", { d: "M-6 6 C-20 10 -38 8 -42 -4 C-28 -6 -12 -2 -4 2 Z", fill: "#e6fff4", "fill-opacity": 0.85, stroke: "#4fcf9a", "stroke-width": 2, "stroke-linejoin": "round" }),
      svg("path", { d: "M-8 -4 C-24 -14 -36 -26 -42 -36", stroke: "#4fcf9a", "stroke-width": 1.2, fill: "none", "stroke-opacity": 0.7 }),
      svg("circle", { cx: -36, cy: -30, r: 2.2, fill: "#fffbe0" }), svg("circle", { cx: -24, cy: -12, r: 1.8, fill: "#fffbe0" }));
    return w;
  };
  g.append(half(false), half(true));
  parent.append(g);
}
// An icon node (or a plain emoji string) for lists such as the shop and the chest: drawn equipment gets a small SVG.
export function equipIcon(id) {
  if (!DRAWN.has(id)) return EQUIP_EMOJI[id] || "🎀";
  const root = svg("svg", { viewBox: "-60 -50 120 70", width: 44, height: 26, role: "img", "aria-label": "螢光翅膀" });
  wings(root, 0, 0, 1);
  return root;
}
// Where each slot is drawn (x, y) inside the 120x120 box.
const SLOT_POS = { head: [60, 22], neck: [60, 92], back: [100, 66], hand: [18, 78] };
// The doll type is drawn with a small head and body, so its head and neck slots sit higher than for the round types.
const SLOT_POS_BY_TYPE = { doll: { head: [60, 14], neck: [60, 62] } };

function svg(tag, attrs, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

// Eyes and smile, placed for each body shape.
function face(root, ex, ey, smileY) {
  root.append(
    svg("circle", { cx: ex - 6, cy: ey, r: 4.5, fill: "#333" }),
    svg("circle", { cx: ex + 6, cy: ey, r: 4.5, fill: "#333" }),
    svg("path", { d: `M${ex - 8} ${smileY} q8 8 16 0`, stroke: "#333", "stroke-width": 3, fill: "none", "stroke-linecap": "round" }));
}

// Draws the body for a pet type. Each type has its own silhouette.
function body(root, petId, type) {
  const c = BODY[petId] || "#c9b28a";
  if (petId === "sparky") {   // 小火花：依 icon/小火花.png 的特徵（圓滾的小火焰寶寶、頭頂火苗、大眼睛、小手小腳），以 SVG 重新繪製
    const defs = svg("defs", {});
    defs.append(svg("linearGradient", { id: "sparkyBody", x1: 0, y1: 0, x2: 0, y2: 1 }));
    const g = defs.firstChild;
    g.append(svg("stop", { offset: "0", "stop-color": "#ffd34d" }), svg("stop", { offset: "1", "stop-color": "#ff9a2a" }));
    root.append(defs,
      // 小腳
      svg("ellipse", { cx: 46, cy: 106, rx: 10, ry: 6, fill: "#ff9a2a" }), svg("ellipse", { cx: 74, cy: 106, rx: 10, ry: 6, fill: "#ff9a2a" }),
      // 圓滾的身體（漸層）
      svg("ellipse", { cx: 60, cy: 76, rx: 35, ry: 30, fill: "url(#sparkyBody)" }),
      // 小手
      svg("ellipse", { cx: 26, cy: 84, rx: 7, ry: 11, fill: "#ffb84d", transform: "rotate(25 26 84)" }),
      svg("ellipse", { cx: 94, cy: 84, rx: 7, ry: 11, fill: "#ffb84d", transform: "rotate(-25 94 84)" }),
      // 頭頂的火苗（會搖曳，這裡畫成靜態的三片火舌）
      svg("path", { id: "flame", d: "M60 12 C68 24 74 30 72 42 C68 38 64 38 62 46 C58 38 52 34 50 42 C46 30 52 22 60 12 Z", fill: "#ff8a2a" }),
      svg("path", { d: "M60 28 C64 34 66 38 65 44 C62 42 60 42 59 46 C56 40 56 36 60 28 Z", fill: "#ffd34d" }),
      // 臉頰
      svg("circle", { cx: 40, cy: 82, r: 4.5, fill: "#ff7a7a", "fill-opacity": 0.45 }),
      svg("circle", { cx: 80, cy: 82, r: 4.5, fill: "#ff7a7a", "fill-opacity": 0.45 }),
      // 大眼睛（有高光）
      svg("circle", { cx: 48, cy: 72, r: 6.5, fill: "#2b2b2b" }), svg("circle", { cx: 72, cy: 72, r: 6.5, fill: "#2b2b2b" }),
      svg("circle", { cx: 50, cy: 70, r: 2.2, fill: "#fff" }), svg("circle", { cx: 74, cy: 70, r: 2.2, fill: "#fff" }),
      // 微笑
      svg("path", { d: "M54 84 q6 5 12 0", stroke: "#2b2b2b", "stroke-width": 2.5, fill: "none", "stroke-linecap": "round" }));
    return;
  }
  switch (type) {
    case "animal":   // round body with two ears and a tail
      root.append(
        svg("circle", { cx: 36, cy: 36, r: 12, fill: c }), svg("circle", { cx: 84, cy: 36, r: 12, fill: c }),
        svg("circle", { cx: 36, cy: 38, r: 6, fill: "#fff8" }), svg("circle", { cx: 84, cy: 38, r: 6, fill: "#fff8" }),
        svg("circle", { cx: 60, cy: 66, r: 32, fill: c }),
        svg("path", { d: "M92 80 q16 -4 12 -18", stroke: c, "stroke-width": 7, fill: "none", "stroke-linecap": "round" }));
      face(root, 60, 62, 74);
      return;
    case "doll":     // human-like proportions: head, body, arms and legs
      root.append(
        svg("rect", { x: 52, y: 92, width: 7, height: 14, rx: 3, fill: "#444" }), svg("rect", { x: 61, y: 92, width: 7, height: 14, rx: 3, fill: "#444" }),
        svg("rect", { x: 38, y: 58, width: 44, height: 40, rx: 10, fill: c }),
        svg("rect", { x: 28, y: 60, width: 10, height: 26, rx: 5, fill: c }), svg("rect", { x: 82, y: 60, width: 10, height: 26, rx: 5, fill: c }),
        svg("circle", { cx: 60, cy: 40, r: 22, fill: "#ffd9b3" }),
        svg("path", { d: "M38 36 q22 -22 44 0", stroke: "#6b4f2a", "stroke-width": 6, fill: "none" }));
      face(root, 60, 42, 50);
      return;
    case "stationery": // a pencil: eraser on top, body, sharp tip at the bottom
      root.append(
        svg("rect", { x: 46, y: 22, width: 28, height: 10, rx: 4, fill: "#e77c7c" }),
        svg("rect", { x: 46, y: 32, width: 28, height: 56, rx: 6, fill: c }),
        svg("path", { d: "M46 88 L60 110 L74 88 Z", fill: "#f2d2a9", stroke: "#333", "stroke-width": 1.5 }));
      face(root, 60, 62, 74);
      return;
    case "document":   // an envelope: body with a flap
      root.append(
        svg("rect", { x: 30, y: 42, width: 60, height: 44, rx: 4, fill: c, stroke: "#333", "stroke-width": 1.5 }),
        svg("path", { d: "M30 42 L60 66 L90 42", stroke: "#333", "stroke-width": 1.5, fill: "none" }));
      face(root, 60, 78, 90);
      return;
    default:         // 可愛型：round and soft (the original face, unchanged)
      root.append(svg("circle", { cx: 60, cy: 64, r: 34, fill: c }),
        svg("circle", { cx: 48, cy: 58, r: 4.5, fill: "#333" }), svg("circle", { cx: 72, cy: 58, r: 4.5, fill: "#333" }),
        svg("path", { d: "M50 72 q10 9 20 0", stroke: "#333", "stroke-width": 3, fill: "none", "stroke-linecap": "round" }));
  }
}

// outfit: { slot: equipment_id }
export function petSvg(petId, outfit = {}, size = 140) {
  const root = svg("svg", { viewBox: "0 0 120 120", width: size, height: size, role: "img", "aria-label": "萌寵" });
  root.append(svg("ellipse", { cx: 60, cy: 108, rx: 30, ry: 6, fill: "#0002" }));
  // Wings go behind the body so they look attached to the back.
  if (Object.values(outfit).includes("glow_wings")) wings(root, 60, PET_TYPE[petId] === "doll" ? 66 : 62, 0.9);
  body(root, petId, PET_TYPE[petId] || "cute");
  for (const [slot, equipId] of Object.entries(outfit)) {
    const pos = (SLOT_POS_BY_TYPE[PET_TYPE[petId]] || {})[slot] || SLOT_POS[slot];
    if (!pos || !EQUIP_EMOJI[equipId] || DRAWN.has(equipId)) continue;
    root.append(svg("text", { x: pos[0], y: pos[1], "font-size": 26, "text-anchor": "middle", "dominant-baseline": "central" }, EQUIP_EMOJI[equipId]));
  }
  return root;
}
