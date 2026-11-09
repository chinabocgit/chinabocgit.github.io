// Loads everything the map page needs in one go (curriculum is public read; rewards, theme and assignments are RPCs).
import { sb, rpc, ApiError } from "./api.js?v=cca6bca5";

export async function select(query) {
  const { data, error } = await query;
  if (error) throw new ApiError("network_or_server", String(error.message || error));
  return data;
}

export async function loadMapData(me) {
  const [rewards, theme, asg, subjects, books, chests, pets] = await Promise.all([
    rpc("rpc_my_rewards"),
    rpc("rpc_my_theme"),
    rpc("rpc_my_assignments"),
    select(sb.from("subjects").select("id,name,sort").order("sort")),
    me.grade && me.semester
      ? select(sb.from("books").select("id,subject_id,grade,semester").eq("grade", me.grade).eq("semester", me.semester))
      : Promise.resolve([]),
    rpc("rpc_my_chests"),
    rpc("rpc_my_pets").catch(() => null),          // the map still works without the pet
  ]);
  const bookIds = books.map(b => b.id);
  const units = bookIds.length
    ? await select(sb.from("units").select("id,book_id,no,title").in("book_id", bookIds).order("no"))
    : [];
  const unitIds = units.map(u => u.id);
  const levels = unitIds.length
    ? await select(sb.from("levels").select("id,unit_id,seq,name,kind,question_count,is_open").in("unit_id", unitIds).eq("is_open", true).order("seq"))
    : [];
  return { rewards, theme, asg, subjects, books, units, levels, chests, pets };
}

// Merge curriculum, rewards and assignments into: [{subject, units:[{unit, levels:[{...level, state, stars, lockedBy}]}]}]
export function buildMap(d) {
  const byLevel = new Map((d.rewards.levels || []).map(l => [l.level_id, l]));
  // A level is locked for practice while a level-scoped assignment on it is open (server rule, shown here only to explain).
  const lockedBy = new Map();
  for (const a of d.asg.assignments || []) {
    if (a.status === "open" && a.scope_type === "level" && a.level_id) lockedBy.set(a.level_id, a);
  }
  // A level the teacher assigned shows a pin: to do / in progress while the assignment is open, "done" once handed in.
  const pinOf = new Map();
  for (const a of d.asg.assignments || []) {
    if (a.scope_type !== "level" || !a.level_id) continue;
    const finished = !!(a.attempt && a.attempt.finished);
    if (finished) pinOf.set(a.level_id, { state: "done", title: a.title });
    else if (a.status === "open" && !pinOf.has(a.level_id)) pinOf.set(a.level_id, { state: "todo", title: a.title });
  }
  const subjects = d.subjects
    .map(s => ({ subject: s, books: d.books.filter(b => b.subject_id === s.id) }))
    .filter(x => x.books.length);
  let currentMarked = false;
  const out = subjects.map(({ subject, books }) => {
    const bookIds = new Set(books.map(b => b.id));
    const units = d.units.filter(u => bookIds.has(u.book_id)).map(unit => {
      const levels = d.levels.filter(l => l.unit_id === unit.id).map(l => {
        const r = byLevel.get(l.id);
        const lock = lockedBy.get(l.id) || null;
        let state = "new";
        if (r && r.collectible === "gold") state = "gold";
        else if (r && r.collectible) state = "cleared";
        return { ...l, state, stars: r ? r.best_stars : 0, lock, pin: pinOf.get(l.id) || null };
      });
      return { unit, levels };
    });
    // "Current" = first playable level that is not cleared yet (one per subject).
    let cur = false;
    for (const u of units) for (const l of u.levels) {
      l.playable = l.kind === "quiz" || l.kind === "boss";
      l.current = !cur && l.state === "new" && l.playable && !l.lock;
      if (l.current) cur = true;
    }
    return { subject, units };
  });
  return out;
}
