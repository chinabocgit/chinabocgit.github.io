// "My collection": stars, chests, pets and equipment, certificates. Every change goes through a server function;
// the page only shows what the server says (balance, ownership, results of opening a chest).
import { el } from "./dom.js?v=a1f40c48";
import { rpc, ApiError } from "./api.js?v=a1f40c48";
import { requireStudent } from "./session.js?v=a1f40c48";
import { applyTheme } from "./theme.js?v=a1f40c48";
import { petSvg, EQUIP_EMOJI, SLOT_LABEL } from "./pet.js?v=a1f40c48";
import { isMuted, setMuted, playChestShake, playChestOpen, playFanfare } from "./sound.js?v=a1f40c48";

const app = document.getElementById("app");
const me = await requireStudent();
document.getElementById("who").textContent = me.nickname;
const put = (parent, ...kids) => parent.replaceChildren(...kids.flat().filter(Boolean));   // replaceChildren(null) would print "null"

let S = null;              // loaded data
let ui = { collectibleName: "收藏" };
let viewPet = null;        // pet shown in the dressing area
let flash = null;          // { cls, text }
let reveal = null;         // result of the last opened chest
let busy = false;

async function load() {
  const [rewards, pets, catalog, chests, certs, theme] = await Promise.all([
    rpc("rpc_my_rewards"), rpc("rpc_my_pets"), rpc("rpc_catalog"), rpc("rpc_my_chests"), rpc("rpc_my_certificates"), rpc("rpc_my_theme")]);
  S = { rewards, pets, catalog, chests, certs };
  ui = applyTheme(theme);
  if (!viewPet || !pets.pets.some(p => p.id === viewPet)) viewPet = pets.active_pet_id || (pets.pets[0] && pets.pets[0].id) || null;
}

async function act(fn, okText) {
  if (busy) return;
  busy = true;
  try {
    const r = await fn();
    flash = okText ? { cls: "ok", text: typeof okText === "function" ? okText(r) : okText } : null;
  } catch (e) {
    if (e instanceof ApiError && e.code === "session_invalid") return;
    flash = { cls: "err", text: e.friendly || "操作沒成功，請稍後再試。" };
  }
  busy = false;
  await load();
  render();
}

const equipName = id => (S.catalog.equipment.find(e => e.id === id) || {}).name || id;
const petName = id => (S.catalog.pets.find(p => p.id === id) || {}).name || id;
const owns = id => S.pets.equipment.some(e => e.id === id);

function render() {
  const rw = S.rewards;
  const muteBtn = el("button", { class: "ghost", "aria-pressed": String(isMuted()), onclick: () => { setMuted(!isMuted()); render(); } }, isMuted() ? "🔇 音效關閉" : "🔊 音效開啟");
  put(app,
    flash ? el("div", { class: "msg toast " + flash.cls, role: "status" }, flash.text) : null,
    el("div", { class: "card" },
      el("h2", null, "⭐ 我的星星"),
      el("div", { class: "stat-row" },
        el("span", { class: "stat" }, "⭐ " + S.pets.stars + " 顆星星"),
        el("span", { class: "stat" }, "🏅 " + ui.collectibleName + " " + rw.collectibles),
        el("span", { class: "stat" }, "🥇 金色 " + rw.gold)),
      el("div", { class: "row" }, muteBtn)),
    chestCard(), petCard(), shopCard(), certCard());
}

/* ---------- chests ---------- */
function chestCard() {
  const ch = S.chests;
  return el("div", { class: "card" },
    el("h2", null, "🎁 寶箱（" + ch.unopened + "）"),
    reveal ? revealBox(reveal) : null,
    ch.chests.length
      ? [el("div", { class: "chests" }, ch.chests.map(c => el("button", { class: "chest-btn", "aria-label": "打開寶箱", disabled: busy, onclick: ev => openChest(c.id, ev.currentTarget) }, "🎁"))),
         el("p", { class: "muted" }, "點一下寶箱打開它。")]
      : el("p", { class: "muted" }, "目前沒有寶箱。練習過關時有機會掉出寶箱（今天已掉 " + ch.today_dropped + "／" + ch.daily_max + " 個）。"));
}

function revealBox(r) {
  const eq = r.kind === "equipment";
  const emoji = eq ? (EQUIP_EMOJI[r.reward_id] || "🎀") : "⭐";
  return el("div", { class: "reveal pop", role: "status" },
    el("div", { class: "big" }, emoji + " " + (eq && !r.converted ? "得到 " + equipName(r.reward_id) + "！" : eq ? "又拿到 " + equipName(r.reward_id) : "得到 " + r.amount + " 顆星星！")),
    r.converted ? el("p", null, "你已經有這件了，換成 " + r.amount + " 顆星星。") : null);
}

async function openChest(id, btn) {
  if (busy) return;
  busy = true;
  btn.classList.add("shake"); btn.disabled = true;
  playChestShake();
  let r, err = null;
  try { r = await rpc("rpc_open_chest", { p_chest_id: id }); } catch (e) { err = e; }
  await new Promise(res => setTimeout(res, 550));          // let the shake play
  busy = false;
  if (err) {
    if (err instanceof ApiError && err.code === "session_invalid") return;
    flash = { cls: "err", text: err.friendly || "寶箱沒打開，請稍後再試。" };
  } else {
    reveal = r; flash = null;
    playChestOpen(); if (r.kind === "equipment" && !r.converted) setTimeout(playFanfare, 350);
  }
  await load(); render();
}

/* ---------- pets and equipment ---------- */
function petCard() {
  const owned = S.pets.pets;
  const unowned = S.catalog.pets.filter(p => !owned.some(o => o.id === p.id));
  const cur = owned.find(p => p.id === viewPet);
  const kids = [el("h2", null, "🐾 我的夥伴")];
  if (!owned.length) kids.push(el("p", { class: "muted" }, "你還沒有夥伴，先領一隻吧！"));
  if (cur) {
    kids.push(el("div", { class: "pet-stage" }, petSvg(cur.id, cur.outfit, 150),
      el("b", null, cur.name), el("span", { class: "muted" }, "陪你闖過 " + cur.levels_cleared + " 關" + (S.pets.active_pet_id === cur.id ? "・正帶著牠闖關" : ""))));
    kids.push(slotArea(cur));
  }
  if (owned.length) kids.push(el("div", { class: "pet-list" }, owned.map(p =>
    el("div", { class: "pet-card", "data-active": String(p.id === viewPet) }, petSvg(p.id, p.outfit, 70), el("b", null, p.name),
      el("button", { class: "ghost", onclick: () => { viewPet = p.id; render(); } }, "看看牠"),
      S.pets.active_pet_id === p.id ? el("span", { class: "muted" }, "✔ 帶著") :
        el("button", { disabled: busy, onclick: () => act(() => rpc("rpc_set_active_pet", { p_pet_id: p.id }), p.name + " 跟你一起闖關！") }, "帶著闖關")))));
  if (unowned.length) kids.push(el("div", null, el("h3", null, "領養新夥伴"),
    el("div", { class: "pet-list" }, unowned.map(p =>
      el("div", { class: "pet-card" }, petSvg(p.id, {}, 70), el("b", null, p.name), el("span", { class: "muted" }, p.description || ""),
        el("button", { disabled: busy || (p.unlock_stars > S.pets.stars),
          onclick: () => act(() => rpc("rpc_unlock_pet", { p_pet_id: p.id }), "歡迎 " + p.name + "！") },
          p.unlock_stars ? "⭐ " + p.unlock_stars + " 領養" : "免費領養"))))));
  return el("div", { class: "card" }, kids);
}

function slotArea(pet) {
  const mine = S.pets.equipment;
  const items = mine.map(e => {
    const worn = pet.outfit[e.slot] === e.id;
    const wrong = e.pet_id && e.pet_id !== pet.id;
    return el("div", { class: "equip" },
      el("span", { class: "em", "aria-hidden": "true" }, EQUIP_EMOJI[e.id] || "🎀"),
      el("span", { class: "grow" }, el("b", null, e.name), el("div", { class: "muted" }, SLOT_LABEL[e.slot] + (e.pet_id ? "・" + petName(e.pet_id) + "專屬" : ""))),
      worn ? el("button", { class: "ghost", disabled: busy, onclick: () => act(() => rpc("rpc_unwear", { p_pet_id: pet.id, p_slot: e.slot }), "已脫下 " + e.name) }, "脫下")
           : el("button", { disabled: busy || wrong, title: wrong ? "這是別隻萌寵的專屬裝備" : "",
               onclick: () => act(() => rpc("rpc_wear", { p_pet_id: pet.id, p_equipment_id: e.id }), pet.name + " 穿上了 " + e.name) }, wrong ? "不能穿" : "穿上"));
  });
  return el("div", null, el("h3", null, "裝備"), items.length ? el("div", { class: "equip-list" }, items) : el("p", { class: "muted" }, "還沒有裝備。開寶箱或用星星兌換看看！"));
}

function shopCard() {
  const sale = S.catalog.equipment.filter(e => e.star_price && !owns(e.id));
  return el("div", { class: "card" }, el("h2", null, "🛍️ 星星商店"),
    sale.length ? el("div", { class: "equip-list" }, sale.map(e =>
      el("div", { class: "equip" },
        el("span", { class: "em", "aria-hidden": "true" }, EQUIP_EMOJI[e.id] || "🎀"),
        el("span", { class: "grow" }, el("b", null, e.name), el("div", { class: "muted" }, SLOT_LABEL[e.slot] + (e.pet_id ? "・" + petName(e.pet_id) + "專屬" : ""))),
        el("button", { disabled: busy || e.star_price > S.pets.stars,
          onclick: () => act(() => rpc("rpc_exchange_equipment", { p_equipment_id: e.id }), "兌換了 " + e.name + "！") }, "⭐ " + e.star_price + " 兌換"))))
      : el("p", { class: "muted" }, "目前沒有可以兌換的裝備。"));
}

/* ---------- certificates ---------- */
function certCard() {
  const units = S.certs.units;
  return el("div", { class: "card" }, el("h2", null, "📜 單元證書"),
    units.length ? units.map(u => el("div", { class: "cert-row" },
      el("span", { class: "grow" }, el("b", null, u.title), el("div", { class: "muted" }, "已過關 " + u.cleared + " / " + u.total + " 關")),
      u.certified ? el("a", { class: "btn", href: "certificate.html?unit=" + encodeURIComponent(u.unit_id) }, "看證書")
                  : el("span", { class: "muted" }, "全部過關就會拿到證書")))
      : el("p", { class: "muted" }, "還沒有單元。"));
}

try { await load(); render(); }
catch (e) { if (!(e instanceof ApiError && e.code === "session_invalid")) put(app, el("div", { class: "card empty" }, el("p", { class: "msg err" }, "載入失敗：" + (e.friendly || "請稍後再試")), el("button", { onclick: () => location.reload() }, "重新載入"))); }
