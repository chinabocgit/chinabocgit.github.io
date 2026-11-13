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
  if (petId === "sparky") {   // 小火花 is a little flame (still the cute type)
    root.append(
      svg("path", { id: "flame", d: "M60 20 C70 38 92 50 92 78 C92 98 78 106 60 106 C42 106 28 98 28 78 C28 62 38 54 46 42 C48 54 52 58 58 60 C56 46 56 32 60 20 Z", fill: c }),
      svg("path", { d: "M60 58 C68 68 74 74 74 84 C74 96 66 100 60 100 C54 100 46 96 46 84 C46 76 52 70 60 58 Z", fill: "#ffd23f" }));
    face(root, 60, 80, 92);
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
