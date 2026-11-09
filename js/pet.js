// Self-drawn pet (SVG) with equipment shown as emoji around it. No external images.
const NS = "http://www.w3.org/2000/svg";
const BODY = { sparky: "#f7a440", glow: "#7fd6a0", rail: "#7aa7e8" };

export const SLOT_LABEL = { head: "頭", neck: "脖子", back: "背", hand: "手" };
export const EQUIP_EMOJI = {
  cap: "🧢", scarf: "🧣", bag: "🎒", wand: "🪄", glasses: "👓", bell: "🔔",
  spark_crown: "👑", glow_wings: "🪽", rail_whistle: "📯", spark_cape: "✨",
};
// Where each slot is drawn (x, y) inside the 120x120 box.
const SLOT_POS = { head: [60, 22], neck: [60, 92], back: [100, 66], hand: [18, 78] };

function svg(tag, attrs, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

// outfit: { slot: equipment_id }
export function petSvg(petId, outfit = {}, size = 140) {
  const root = svg("svg", { viewBox: "0 0 120 120", width: size, height: size, role: "img", "aria-label": "萌寵" });
  root.append(
    svg("ellipse", { cx: 60, cy: 108, rx: 30, ry: 6, fill: "#0002" }),
    svg("circle", { cx: 60, cy: 64, r: 34, fill: BODY[petId] || "#c9b28a" }),
    svg("circle", { cx: 48, cy: 58, r: 4.5, fill: "#333" }),
    svg("circle", { cx: 72, cy: 58, r: 4.5, fill: "#333" }),
    svg("path", { d: "M50 72 q10 9 20 0", stroke: "#333", "stroke-width": 3, fill: "none", "stroke-linecap": "round" }));
  for (const [slot, equipId] of Object.entries(outfit)) {
    const pos = SLOT_POS[slot];
    if (!pos || !EQUIP_EMOJI[equipId]) continue;
    root.append(svg("text", { x: pos[0], y: pos[1], "font-size": 26, "text-anchor": "middle", "dominant-baseline": "central" }, EQUIP_EMOJI[equipId]));
  }
  return root;
}
