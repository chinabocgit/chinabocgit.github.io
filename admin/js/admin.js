// Admin page: platform name, sponsor link, announcements. Only users with the admin role see the forms (the database enforces it too).
import { el } from "../../js/dom.js?v=a1f40c48";
import { sb, rpc, select, ApiError } from "../../teacher/js/tapi.js?v=a1f40c48";
import { signOut } from "../../teacher/js/tsession.js?v=a1f40c48";
import { validateSetting, validateAnnouncement, audienceText, AUDIENCES } from "./adminCheck.js?v=a1f40c48";

const app = document.getElementById("app");
const put = (...kids) => app.replaceChildren(...kids.flat().filter(Boolean));
const note = (cls, text) => el("div", { class: "msg " + cls, role: "status" }, text);
document.getElementById("logout").addEventListener("click", signOut);

let flash = null;

async function gate() {
  const { data } = await sb.auth.getSession();
  if (!data.session) { location.replace("../teacher/index.html"); return null; }
  const me = data.session.user.id;
  const roles = await select(sb.from("user_roles").select("role").eq("user_id", me).eq("role", "admin"));
  if (!roles.length) { put(el("div", { class: "card" }, "只有管理者可以使用這個頁面。")); return null; }
  return me;
}

async function loadAll(me) {
  const [settings, anns] = await Promise.all([
    select(sb.from("platform_settings").select("key,value").in("key", ["platform_name", "sponsor_url"])),
    select(sb.from("announcements").select("id,title,body,audience,start_at,end_at").order("start_at", { ascending: false })),
  ]);
  const map = Object.fromEntries(settings.map(s => [s.key, typeof s.value === "string" ? s.value : String(s.value ?? "")]));
  return { me, name: map.platform_name || "", sponsor: map.sponsor_url || "", anns };
}

function settingForm(S, reload) {
  const nameIn = el("input", { id: "pname", value: S.name, maxlength: 60 });
  const urlIn = el("input", { id: "surl", value: S.sponsor, placeholder: "https://…（留空＝尚未開放）" });
  const save = (key, input) => async () => {
    const v = validateSetting(key, input.value);
    if (!v.ok) { flash = note("err", v.text); return reload(); }
    try { await rpc("rpc_admin_save_setting", { p_key: key, p_value: v.value }); flash = note("ok", "已儲存。"); }
    catch (e) { flash = note("err", e instanceof ApiError ? e.friendly : "儲存沒成功，請稍後再試。"); }
    reload();
  };
  return el("section", { class: "card" },
    el("h2", null, "平台設定"),
    el("label", null, "平台名稱", nameIn), el("button", { onclick: save("platform_name", nameIn) }, "儲存名稱"),
    el("label", null, "贊助連結", urlIn), el("button", { onclick: save("sponsor_url", urlIn) }, "儲存連結"));
}

function announcementForm(reload, me) {
  const title = el("input", { id: "atitle", maxlength: 60 });
  const body = el("textarea", { id: "abody", rows: 3, maxlength: 500 });
  const audience = el("select", { id: "aaud" }, AUDIENCES.map(a => el("option", { value: a }, audienceText(a))));
  const endAt = el("input", { id: "aend", type: "datetime-local" });
  const add = async () => {
    const v = validateAnnouncement({ title: title.value, body: body.value, audience: audience.value, endAt: endAt.value });
    if (!v.ok) { flash = note("err", v.text); return reload(); }
    try {
      const { error } = await sb.from("announcements").insert({ title: v.value.title, body: v.value.body, audience: v.value.audience, end_at: v.value.endAt, created_by: me });
      if (error) throw error;
      flash = note("ok", "公告已新增。");
    } catch { flash = note("err", "新增沒成功，請稍後再試。"); }
    reload();
  };
  return el("section", { class: "card" },
    el("h2", null, "新增公告"),
    el("label", null, "標題", title), el("label", null, "內容", body),
    el("label", null, "對象", audience), el("label", null, "結束時間（可不填）", endAt),
    el("button", { onclick: add }, "新增公告"));
}

function announcementList(anns, reload) {
  const end = async a => {
    try {
      const { error } = await sb.from("announcements").update({ end_at: new Date().toISOString() }).eq("id", a.id);
      if (error) throw error;
      flash = note("ok", "公告已結束。");
    } catch { flash = note("err", "結束沒成功，請稍後再試。"); }
    reload();
  };
  return el("section", { class: "card" }, el("h2", null, "所有公告"),
    anns.length ? anns.map(a => el("div", { class: "row" },
      el("b", null, a.title), " ", el("span", { class: "muted" }, audienceText(a.audience)), " ",
      a.end_at ? el("span", { class: "muted" }, "（結束於 " + new Date(a.end_at).toLocaleString("zh-TW") + "）") : el("span", { class: "muted" }, "（長期有效）"),
      el("p", null, a.body),
      a.end_at && new Date(a.end_at) <= new Date() ? null : el("button", { class: "ghost", onclick: () => end(a) }, "立即結束")))
      : el("p", { class: "muted" }, "目前沒有公告。"));
}

async function main() {
  const me = await gate();
  if (!me) return;
  const reload = async () => {
    try {
      const S = await loadAll(me);
      put(flash, settingForm(S, reload), announcementForm(reload, me), announcementList(S.anns, reload));
      flash = null;
    } catch (e) {
      put(note("err", e instanceof ApiError ? e.friendly : "讀取失敗，請稍後再試。"));
    }
  };
  reload();
}
main();
