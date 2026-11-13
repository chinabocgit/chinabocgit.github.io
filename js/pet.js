// Self-drawn pet (SVG) with equipment shown as emoji around it. No external images.
// The shape of the pet depends on its type (可愛型／動物型／人偶型／文具型／文書型). Types must match _supabase/2E/031.
const NS = "http://www.w3.org/2000/svg";
const BODY = { sparky: "#ff7a2a", glow: "#7fd6a0", rail: "#7aa7e8", letter: "#f5e6b8", pencil: "#f2c94c" };

export const PET_TYPE = { sparky: "cute", glow: "animal", rail: "doll", letter: "document", pencil: "stationery" };
export const TYPE_LABEL = { cute: "可愛型", animal: "動物型", doll: "人偶型", stationery: "文具型", document: "文書型" };

export const SLOT_LABEL = { head: "頭", neck: "脖子", back: "背", hand: "手" };
export const EQUIP_EMOJI = {
  cap: "🧢", scarf: "🧣", bag: "🎒", wand: "🪄", glasses: "👓", bell: "🔔",
  spark_crown: "👑", glow_wings: "🪽", rail_whistle: "📯", spark_cape: "✨",
  bunny_ears: "🐰", hair_clip: "🎀", eraser_cap: "🧽", envelope_pin: "💌",
};
// Where each slot is drawn (x, y) inside the 120x120 box.
const SLOT_POS = { head: [60, 22], neck: [60, 92], back: [100, 66], hand: [18, 78] };

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
  if (petId === "sparky") {   // 小火花：精靈版（半透明的火焰身體，金黃核心，頭頂火苗，周圍閃光）
    root.append(
      // 半透明的外焰
      svg("path", { id: "flame", d: "M60 14 C70 34 94 48 94 78 C94 100 80 108 60 108 C40 108 26 100 26 78 C26 60 40 48 50 34 C52 46 54 52 58 56 C58 42 58 28 60 14 Z", fill: "#ff7a2a", "fill-opacity": 0.82 }),
      // 頭頂的小火苗
      svg("path", { d: "M44 40 C40 32 46 26 44 18 C52 26 52 34 50 40 Z", fill: "#ff9a4a", "fill-opacity": 0.8 }),
      svg("path", { d: "M76 40 C80 32 74 26 76 18 C68 26 68 34 70 40 Z", fill: "#ff9a4a", "fill-opacity": 0.8 }),
      // 金黃色核心
      svg("path", { d: "M60 50 C68 62 74 70 74 82 C74 94 66 98 60 98 C54 98 46 94 46 82 C46 70 52 62 60 50 Z", fill: "#ffd23f" }),
      svg("path", { d: "M60 66 C63 72 65 76 65 82 C65 88 62 90 60 90 C58 90 55 88 55 82 C55 76 57 72 60 66 Z", fill: "#fff3b0" }));
    // 靈動的眼睛（有高光）
    root.append(
      svg("circle", { cx: 52, cy: 82, r: 4.5, fill: "#333" }), svg("circle", { cx: 68, cy: 82, r: 4.5, fill: "#333" }),
      svg("circle", { cx: 53.5, cy: 80.5, r: 1.4, fill: "#fff" }), svg("circle", { cx: 69.5, cy: 80.5, r: 1.4, fill: "#fff" }),
      svg("path", { d: "M54 94 q6 5 12 0", stroke: "#333", "stroke-width": 2.5, fill: "none", "stroke-linecap": "round" }));
    // 周圍的細小閃光
    for (const [x, y, r] of [[18, 36, 4], [102, 52, 3.5], [16, 92, 3], [104, 96, 3.5], [60, 6, 2.5]]) {
      root.append(svg("path", { d: `M${x} ${y - r} L${x + r * 0.35} ${y - r * 0.35} L${x + r} ${y} L${x + r * 0.35} ${y + r * 0.35} L${x} ${y + r} L${x - r * 0.35} ${y + r * 0.35} L${x - r} ${y} L${x - r * 0.35} ${y - r * 0.35} Z`, fill: "#fff3b0" }));
    }
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
  body(root, petId, PET_TYPE[petId] || "cute");
  for (const [slot, equipId] of Object.entries(outfit)) {
    const pos = SLOT_POS[slot];
    if (!pos || !EQUIP_EMOJI[equipId]) continue;
    root.append(svg("text", { x: pos[0], y: pos[1], "font-size": 26, "text-anchor": "middle", "dominant-baseline": "central" }, EQUIP_EMOJI[equipId]));
  }
  return root;
}
